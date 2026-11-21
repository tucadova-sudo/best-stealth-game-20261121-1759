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
import { EVENT_OVER, EVENT_WIN, blockedAt, canSee, sightBlocked } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
/**
 * The play scene's length. Short on purpose: the autopilot plays near-perfectly and
 * clears the gallery in about eight seconds, so a longer play scene would only show
 * the win panel again — the same frame as the end scene.
 */
const PLAY_SECONDS = 7;
const END_LIMIT_SECONDS = 600;
const SAMPLE = 1 / 30;
/**
 * How far ahead, in seconds, the autopilot scores each way it could move. Short on
 * purpose: a long lookahead steps clean past a relic 30 px away, so every move looks
 * worse than standing still and the pilot parks outside pickup range forever.
 */
const LOOKAHEAD = 0.12;
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

// A waypoint graph over the gallery: room centres and door mouths, joined where the
// straight line between them crosses no wall. A greedy pilot cannot get around a wall
// on its own — it parks in the wall's corner forever — so the pilot routes through
// these waypoints and only steers at the objective once the direct line is clear.
const NODES = [
  { x: 90, y: 630 }, // 0 entry
  { x: 220, y: 600 }, // 1 entry hall
  { x: 220, y: 342 }, // 2 west door
  { x: 220, y: 180 }, // 3 west gallery
  { x: 432, y: 180 }, // 4 upper west door
  { x: 432, y: 510 }, // 5 lower west door
  { x: 520, y: 150 }, // 6 central north-west
  { x: 780, y: 150 }, // 7 central north-east
  { x: 520, y: 360 }, // 8 central mid-west
  { x: 780, y: 360 }, // 9 central mid-east
  { x: 520, y: 580 }, // 10 central south-west
  { x: 780, y: 580 }, // 11 central south-east
  { x: 872, y: 330 }, // 12 upper east door
  { x: 872, y: 590 }, // 13 lower east door
  { x: 1070, y: 400 }, // 14 east gallery
  { x: 1060, y: 192 }, // 15 vault door
  { x: 1180, y: 100 }, // 16 vault
];
const EDGES = [
  [0, 1], [1, 2], [1, 5], [2, 3], [2, 4], [3, 4], [4, 6], [5, 10],
  [6, 7], [6, 8], [7, 9], [8, 10], [9, 11], [9, 12], [10, 11],
  [11, 13], [12, 14], [13, 14], [14, 15], [15, 16],
];
const ADJ = NODES.map(() => []);
for (const [a, b] of EDGES) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}

function nearestNode(x, y) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < NODES.length; i += 1) {
    const d = Math.hypot(NODES[i].x - x, NODES[i].y - y);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Breadth-first route from node `from` to node `to`, as a list of nodes to visit. */
function route(from, to) {
  if (from === to) return [];
  const prev = new Array(NODES.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const next of ADJ[cur]) {
      if (prev[next] !== -1) continue;
      prev[next] = cur;
      if (next === to) {
        const path = [to];
        let node = to;
        while (node !== from) {
          node = prev[node];
          path.unshift(node);
        }
        return path.slice(1);
      }
      queue.push(next);
    }
  }
  return [];
}

/**
 * The point the pilot steers at this step: the objective itself when the direct line
 * is clear of walls and cover, else the farthest waypoint on the route there whose
 * direct line is clear — never a waypoint across a wall from where Wren stands, or
 * she parks in the wall's corner waiting for a line that never opens.
 */
function steerPoint(state) {
  const target = currentTarget(state);
  const p = state.player;
  if (!sightBlocked(state, p.x, p.y, target.x, target.y)) return target;
  const from = nearestNode(p.x, p.y);
  const path = route(from, nearestNode(target.x, target.y));
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const node = NODES[path[i]];
    if (!sightBlocked(state, p.x, p.y, node.x, node.y)) return node;
  }
  if (path.length === 0) return target;
  // No waypoint on the route is directly reachable: head for the nearest node
  // itself — the door mouth the route starts from.
  return NODES[from];
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
  const target = steerPoint(state);
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
    // Commit to the grab: when a step would land on the objective, take it even
    // through a cone's edge, instead of hovering outside pickup range forever.
    const grab = dist < 32 ? 600 : 0;
    const score = -dist * 2 - dangerAt(state, x, y, caution) * 420 + grab - (d.x === 0 && d.y === 0 ? 6 : 0);
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
