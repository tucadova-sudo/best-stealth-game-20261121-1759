// The game's rules and state, with no drawing and no browser in it: Wren the thief, three
// patrolling guards with vision cones, cover that blocks sight, three relics and the
// service door. step() advances one fixed step and returns what happened as bit flags,
// so the caller can react without the world knowing about screens or sound.
//
// Detection: a guard sees Wren when she is inside its cone, in range, and no wall or
// crate stands between them. Being seen fills that guard's suspicion; at 0.6 it leaves
// patrol to investigate the last seen spot, at 1.0 it gives chase, and touching Wren
// while chasing catches her: a life lost, back to the entrance, guards reset.

import {
  CRATES,
  EXIT,
  FIELD,
  GUARD,
  GUARDS,
  LEVEL,
  LIVES,
  PLAYER,
  PLAYER_START,
  RELIC_POINTS,
  RELICS,
  WALLS,
  WIN_BONUS_PER_SECOND,
  WIN_BONUS_START,
} from './config.js';

export const EVENT_CAUGHT = 1;
export const EVENT_RELIC = 2;
export const EVENT_OVER = 4;
export const EVENT_WIN = 8;
export const EVENT_SPOTTED = 16;

const MODE_PATROL = 'patrol';
const MODE_INVESTIGATE = 'investigate';
const MODE_CHASE = 'chase';

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** True when the segment (x1,y1)-(x2,y2) touches the rectangle. */
function segmentHitsRect(x1, y1, x2, y2, rect) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;
  if (dx === 0) {
    if (x1 < rect.x || x1 > rect.x + rect.w) return false;
  } else {
    let t1 = (rect.x - x1) / dx;
    let t2 = (rect.x + rect.w - x1) / dx;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (dy === 0) {
    if (y1 < rect.y || y1 > rect.y + rect.h) return false;
  } else {
    let t1 = (rect.y - y1) / dy;
    let t2 = (rect.y + rect.h - y1) / dy;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

/** True when any wall or crate stands between (x1,y1) and (x2,y2). */
export function sightBlocked(state, x1, y1, x2, y2) {
  for (let i = 0; i < state.walls.length; i += 1) {
    if (segmentHitsRect(x1, y1, x2, y2, state.walls[i])) return true;
  }
  for (let i = 0; i < state.crates.length; i += 1) {
    if (segmentHitsRect(x1, y1, x2, y2, state.crates[i])) return true;
  }
  return false;
}

/** True when a guard at (gx,gy) facing `dir` can see the point (tx,ty). */
export function canSee(state, gx, gy, dir, tx, ty) {
  const dx = tx - gx;
  const dy = ty - gy;
  const dist = Math.hypot(dx, dy);
  if (dist > GUARD.sightRange) return false;
  if (dist > 1 && Math.abs(angleDiff(Math.atan2(dy, dx), dir)) > GUARD.sightHalfAngle) return false;
  return !sightBlocked(state, gx, gy, tx, ty);
}

/** True when a circle at (x,y) with radius r overlaps any wall or crate. */
export function blockedAt(state, x, y, r) {
  const solids = state.walls;
  for (let i = 0; i < solids.length; i += 1) {
    const s = solids[i];
    const cx = clamp(x, s.x, s.x + s.w);
    const cy = clamp(y, s.y, s.y + s.h);
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return true;
  }
  for (let i = 0; i < state.crates.length; i += 1) {
    const s = state.crates[i];
    const cx = clamp(x, s.x, s.x + s.w);
    const cy = clamp(y, s.y, s.y + s.h);
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return true;
  }
  return false;
}

/** Move a circle axis by axis, sliding along anything solid. Returns the new position. */
function moveCircle(state, x, y, r, dx, dy) {
  let nx = x + dx;
  if (!blockedAt(state, nx, y, r)) x = nx;
  let ny = y + dy;
  if (!blockedAt(state, x, ny, r)) y = ny;
  return { x, y };
}

export function createWorld(random) {
  const player = {
    x: PLAYER_START.x,
    y: PLAYER_START.y,
    r: PLAYER.radius,
    invulnerable: 0,
    moving: false,
  };
  const guards = GUARDS.map((def) => ({
    name: def.name,
    waypoints: def.waypoints,
    x: def.waypoints[0].x,
    y: def.waypoints[0].y,
    dir: 0,
    target: 1,
    mode: MODE_PATROL,
    suspicion: 0,
    lastSeenX: 0,
    lastSeenY: 0,
    chaseTimer: 0,
    waitTimer: 0,
    scanDir: 0,
  }));
  const relics = RELICS.map((def) => ({ ...def, taken: false }));
  const state = {
    player,
    guards,
    relics,
    walls: WALLS,
    crates: CRATES,
    score: 0,
    lives: LIVES,
    level: 1,
    elapsed: 0,
    relicsGot: 0,
    exitOpen: false,
    won: false,
    over: false,
    maxSuspicion: 0,
  };

  function resetGuards() {
    for (let i = 0; i < guards.length; i += 1) {
      const g = guards[i];
      const start = g.waypoints[0];
      g.x = start.x;
      g.y = start.y;
      g.target = 1;
      g.mode = MODE_PATROL;
      g.suspicion = 0;
      g.chaseTimer = 0;
      g.waitTimer = 0;
      const next = g.waypoints[1];
      g.dir = Math.atan2(next.y - start.y, next.x - start.x);
    }
  }

  function reset() {
    player.x = PLAYER_START.x;
    player.y = PLAYER_START.y;
    player.invulnerable = 0;
    player.moving = false;
    for (let i = 0; i < relics.length; i += 1) relics[i].taken = false;
    state.score = 0;
    state.lives = LIVES;
    state.level = 1;
    state.elapsed = 0;
    state.relicsGot = 0;
    state.exitOpen = false;
    state.won = false;
    state.over = false;
    state.maxSuspicion = 0;
    resetGuards();
    // A seeded nudge so each seed's patrol starts a little differently, but the same
    // seed always gives the same game.
    for (let i = 0; i < guards.length; i += 1) {
      guards[i].x += random() * 8;
      guards[i].y += random() * 8;
    }
  }

  function respawnAfterCaught() {
    player.x = PLAYER_START.x;
    player.y = PLAYER_START.y;
    player.invulnerable = PLAYER.invulnerable;
    player.moving = false;
    resetGuards();
    state.maxSuspicion = 0;
  }

  function turnToward(guard, targetAngle, dt) {
    const diff = angleDiff(targetAngle, guard.dir);
    const maxTurn = 6 * dt;
    guard.dir += clamp(diff, -maxTurn, maxTurn);
  }

  function moveGuard(guard, tx, ty, speed, dt) {
    const dx = tx - guard.x;
    const dy = ty - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) return 0;
    const stepLen = Math.min(dist, speed * dt);
    const nx = guard.x + (dx / dist) * stepLen;
    const ny = guard.y + (dy / dist) * stepLen;
    const moved = moveCircle(state, guard.x, guard.y, GUARD.radius, nx - guard.x, ny - guard.y);
    const movedDist = Math.hypot(moved.x - guard.x, moved.y - guard.y);
    guard.x = moved.x;
    guard.y = moved.y;
    if (movedDist > 0.001) turnToward(guard, Math.atan2(dy, dx), dt);
    return movedDist;
  }

  function updateGuard(guard, dt, harmless) {
    const p = player;
    const seen = !harmless && p.invulnerable === 0 && canSee(state, guard.x, guard.y, guard.dir, p.x, p.y);
    if (seen) {
      guard.lastSeenX = p.x;
      guard.lastSeenY = p.y;
      const dist = Math.hypot(p.x - guard.x, p.y - guard.y);
      const rate = (1.5 - dist / GUARD.sightRange) * (p.moving ? 1.25 : 0.8);
      const before = guard.suspicion;
      guard.suspicion = clamp(guard.suspicion + rate * dt, 0, 1);
      if (before < GUARD.alertAt && guard.suspicion >= GUARD.alertAt) {
        guard.mode = MODE_CHASE;
        guard.chaseTimer = GUARD.chaseMemory;
      } else if (before < GUARD.suspiciousAt && guard.suspicion >= GUARD.suspiciousAt && guard.mode === MODE_PATROL) {
        guard.mode = MODE_INVESTIGATE;
      }
    } else {
      guard.suspicion = clamp(guard.suspicion - 0.4 * dt, 0, 1);
    }
    if (guard.suspicion > state.maxSuspicion) state.maxSuspicion = guard.suspicion;

    if (guard.mode === MODE_CHASE) {
      if (seen) guard.chaseTimer = GUARD.chaseMemory;
      else guard.chaseTimer -= dt;
      const tx = seen ? p.x : guard.lastSeenX;
      const ty = seen ? p.y : guard.lastSeenY;
      moveGuard(guard, tx, ty, GUARD.chaseSpeed, dt);
      if (guard.chaseTimer <= 0) {
        guard.mode = MODE_INVESTIGATE;
        guard.waitTimer = 0;
      }
      return seen;
    }
    if (guard.mode === MODE_INVESTIGATE) {
      const arrived = Math.hypot(guard.lastSeenX - guard.x, guard.lastSeenY - guard.y) < 10;
      if (!arrived) {
        moveGuard(guard, guard.lastSeenX, guard.lastSeenY, GUARD.investigateSpeed, dt);
      } else {
        guard.waitTimer += dt;
        // Scan the room while waiting at the spot.
        guard.dir += 1.4 * dt;
        if (guard.waitTimer >= GUARD.investigateWait || guard.suspicion < GUARD.suspiciousAt * 0.5) {
          guard.mode = MODE_PATROL;
          guard.waitTimer = 0;
        }
      }
      return seen;
    }
    // Patrol: walk the loop.
    const wp = guard.waypoints[guard.target];
    const arrived = Math.hypot(wp.x - guard.x, wp.y - guard.y) < 8;
    if (arrived) {
      guard.target = (guard.target + 1) % guard.waypoints.length;
    } else {
      moveGuard(guard, wp.x, wp.y, GUARD.patrolSpeed, dt);
    }
    return seen;
  }

  /**
   * One fixed step. `move` is the player's steering vector {x, y}. With `harmless` set
   * (the title screen's backdrop) the guards patrol but nothing sees, scores or catches.
   */
  function step(dt, move, harmless) {
    let events = 0;
    if (state.won || state.over) return events;
    state.elapsed += dt;
    state.level = Math.min(LEVEL.max, 1 + Math.floor(state.elapsed / LEVEL.seconds));

    const moving = move.x !== 0 || move.y !== 0;
    player.moving = moving;
    if (moving && !harmless) {
      const moved = moveCircle(
        state,
        player.x,
        player.y,
        player.r,
        move.x * PLAYER.speed * dt,
        move.y * PLAYER.speed * dt,
      );
      player.x = moved.x;
      player.y = moved.y;
    }
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);

    let anySpotted = false;
    for (let i = 0; i < guards.length; i += 1) {
      const before = guards[i].suspicion;
      const seen = updateGuard(guards[i], dt, harmless);
      if (seen && before < GUARD.suspiciousAt && guards[i].suspicion >= GUARD.suspiciousAt) anySpotted = true;
    }
    if (anySpotted) events |= EVENT_SPOTTED;

    if (!harmless) {
      // Relics: touch one to pocket it.
      for (let i = 0; i < relics.length; i += 1) {
        const relic = relics[i];
        if (relic.taken) continue;
        if (Math.hypot(relic.x - player.x, relic.y - player.y) < player.r + 16) {
          relic.taken = true;
          state.relicsGot += 1;
          state.score += RELIC_POINTS;
          events |= EVENT_RELIC;
        }
      }
      state.exitOpen = state.relicsGot === relics.length;

      // Caught: a chasing guard that reaches Wren.
      for (let i = 0; i < guards.length; i += 1) {
        const g = guards[i];
        if (g.mode !== MODE_CHASE) continue;
        if (player.invulnerable > 0) continue;
        if (Math.hypot(g.x - player.x, g.y - player.y) < GUARD.catchRadius + player.r) {
          state.lives -= 1;
          events |= EVENT_CAUGHT;
          if (state.lives <= 0) {
            state.over = true;
            events |= EVENT_OVER;
          } else {
            respawnAfterCaught();
          }
          break;
        }
      }

      // The win: all three relics, then the service door.
      if (!state.over && state.exitOpen) {
        const inExit =
          player.x > EXIT.x - 6 &&
          player.x < EXIT.x + EXIT.w + 6 &&
          player.y > EXIT.y - 6 &&
          player.y < EXIT.y + EXIT.h + 14;
        if (inExit) {
          state.won = true;
          state.score += Math.max(0, Math.round(WIN_BONUS_START - state.elapsed * WIN_BONUS_PER_SECOND));
          events |= EVENT_WIN;
        }
      }
    }
    return events;
  }

  reset();
  return { state, reset, step };
}
