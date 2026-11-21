// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot,
// so the frame is what a short game really looks like and the same seed always gives the
// same frame.
//
// The autopilot looks at the eight ways it could move (and standing still), scores each
// by how much closer it gets to the current objective minus how dangerous the spot is
// (inside a guard's cone and line of sight), and takes the best. The play scene's pilot
// is cautious; the end scene's is hurried, so it is caught out once the guards close in,
// as a hurried player is.
import { EXIT, FIELD, GUARD, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN, blockedAt, canSee } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const END_LIMIT_SECONDS = 600;
const SAMPLE = 1 / 30;
const LOOKAHEAD = 0.4;
/** Pixels a second the autopilot steers at (a little under the player's top speed). */
const PILOT_SPEED = 200;

const DIRECTIONS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 0.7071, y: 0.7071 },
  { x: -0.7071, y: 0.7071 },
  { x: 0.7071, y: -0.7071 },
  { x: -0.7071, y: -0.7071 },
];

/** Where the autopilot is headed: the nearest relic still there, else the service door. */
function currentTarget(state) {
  let best = null;
  let bestDist = Infinity;
  for (let i = 0; i < state.relics.length; i += 1) {
    const relic = state.relics[i];
    if (relic.taken) continue;
    const d = Math.hypot(relic.x - state.player.x, relic.y - state.player.y);
    if (d < bestDist) {
      bestDist = d;
      best = relic;
    }
  }
  if (best !== null) return { x: best.x, y: best.y };
  return { x: EXIT.x + EXIT.w / 2, y: EXIT.y + EXIT.h / 2 + 30 };
}

/** How dangerous it is to stand at (x, y): 0 when no guard can see the spot. */
function dangerAt(state, x, y, caution) {
  let danger = 0;
  for (let i = 0; i < state.guards.length; i += 1) {
    const g = state.guards[i];
    if (canSee(state, g.x, g.y, g.dir, x, y)) {
      const dist = Math.hypot(x - g.x, y - g.y);
      danger += (1.6 - dist / GUARD.sightRange) * caution;
    }
    // A chasing guard nearby is dangerous even outside its cone.
    if (g.mode === 'chase') {
      const dist = Math.hypot(x - g.x, y - g.y);
      if (dist < 160) danger += (160 - dist) / 160;
    }
  }
  return danger;
}

/** The steering vector the autopilot wants this step. */
function autopilot(state, caution) {
  const target = currentTarget(state);
  const p = state.player;
  let best = DIRECTIONS[0];
  let bestScore = -Infinity;
  for (let i = 0; i < DIRECTIONS.length; i += 1) {
    const d = DIRECTIONS[i];
    const x = p.x + d.x * PILOT_SPEED * LOOKAHEAD;
    const y = p.y + d.y * PILOT_SPEED * LOOKAHEAD;
    if (x < 24 || x > FIELD.width - 24 || y < 24 || y > FIELD.height - 24) continue;
    if (blockedAt(state, x, y, p.r)) continue;
    const dist = Math.hypot(target.x - x, target.y - y);
    const score = -dist - dangerAt(state, x, y, caution) * 420 - (d.x === 0 && d.y === 0 ? 6 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return
 * the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, { x: 0, y: 0 }, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  const caution = name === 'end' ? 0.35 : 1.0;
  let events = 0;
  for (let index = 0; index < limit / STEP; index += 1) {
    events = world.step(STEP, autopilot(world.state, caution), false);
    if (events & (EVENT_OVER | EVENT_WIN)) break;
  }
  const state = world.state;
  if (state.won) return { screen: SCREEN_WIN, best: state.score };
  if (state.over) return { screen: SCREEN_OVER, best: state.score };
  return { screen: SCREEN_PLAY, best: state.score };
}
