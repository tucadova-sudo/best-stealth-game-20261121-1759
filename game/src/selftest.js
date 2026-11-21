// A scripted self-test against the real rules, run in the browser behind ?selftest=1.
// It writes SELFTEST PASS n/n (or the failing check) into the document title so a
// playtest script can read the verdict without touching the game.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { EVENT_CAUGHT, EVENT_OVER, EVENT_RELIC, EVENT_WIN, canSee, createWorld, sightBlocked } from './world.js';

function snapshot(state) {
  const round = (n) => Math.round(n * 1000) / 1000;
  return JSON.stringify({
    p: [round(state.player.x), round(state.player.y)],
    g: state.guards.map((g) => [round(g.x), round(g.y), round(g.dir), round(g.suspicion)]),
    score: state.score,
    lives: state.lives,
    relics: state.relicsGot,
  });
}

export function runSelfTest() {
  const results = [];
  function check(name, ok) {
    results.push(`${ok ? 'ok' : 'FAIL'}:${name}`);
    return ok;
  }

  // 1. Determinism: the same seed and the same inputs give the same world.
  {
    const a = createWorld(createRandom(1));
    const b = createWorld(createRandom(1));
    const input = { x: 0.7071, y: 0.7071 };
    for (let i = 0; i < 600; i += 1) {
      a.step(STEP, input, false);
      b.step(STEP, input, false);
    }
    check('determinism', snapshot(a.state) === snapshot(b.state));
  }

  // 2. Patrol: a guard walks its loop and stays inside the field.
  {
    const w = createWorld(createRandom(1));
    const g0 = { x: w.state.guards[1].x, y: w.state.guards[1].y };
    for (let i = 0; i < 600; i += 1) w.step(STEP, { x: 0, y: 0 }, true);
    const g1 = w.state.guards[1];
    check(
      'patrol-moves',
      Math.hypot(g1.x - g0.x, g1.y - g0.y) > 50 && g1.x > 24 && g1.x < 1256 && g1.y > 24 && g1.y < 696,
    );
  }

  // 3. Detection: standing in a guard's cone, in the open, fills suspicion.
  // (The guard will catch the standing player mid-test; the peak suspicion is the proof.)
  {
    const w = createWorld(createRandom(1));
    const g = w.state.guards[0];
    // Mara starts at (90,90) facing her first waypoint; put Wren 100px ahead of her.
    w.state.player.x = g.x + Math.cos(g.dir) * 100;
    w.state.player.y = g.y + Math.sin(g.dir) * 100;
    let peak = 0;
    for (let i = 0; i < 120; i += 1) {
      w.step(STEP, { x: 0, y: 0 }, false);
      if (g.suspicion > peak) peak = g.suspicion;
    }
    check('detection-rises', peak > 0.5);
  }

  // 4. Cover blocks sight: the central display case between guard and Wren keeps
  // suspicion at zero, and the geometry helpers agree.
  {
    const w = createWorld(createRandom(1));
    const g = w.state.guards[1];
    // Ivo at (650,240), north of the display case, facing north-east; Wren due south
    // of the case at (650,480). The case (600..700, 300..420) stands between them.
    check('cover-geometry-blocked', sightBlocked(w.state, 650, 240, 650, 480));
    check('cover-geometry-unseen', !canSee(w.state, 650, 240, -Math.PI / 4, 650, 480));
    g.x = 650;
    g.y = 240;
    g.dir = -Math.PI / 4;
    g.target = 1;
    w.state.player.x = 650;
    w.state.player.y = 480;
    for (let i = 0; i < 120; i += 1) w.step(STEP, { x: 0, y: 0 }, false);
    check('cover-blocks-sight', g.suspicion === 0);
  }

  // 5. Relic pickup: touching a relic pockets it and scores 1000.
  {
    const w = createWorld(createRandom(1));
    const relic = w.state.relics[0];
    w.state.player.x = relic.x;
    w.state.player.y = relic.y;
    const events = w.step(STEP, { x: 0, y: 0 }, false);
    check('relic-pickup', (events & EVENT_RELIC) !== 0 && w.state.relicsGot === 1 && w.state.score === 1000);
  }

  // 6. Win: all three relics, then the service door.
  {
    const w = createWorld(createRandom(1));
    for (let i = 0; i < w.state.relics.length; i += 1) {
      const relic = w.state.relics[i];
      w.state.player.x = relic.x;
      w.state.player.y = relic.y;
      w.step(STEP, { x: 0, y: 0 }, false);
    }
    w.state.player.x = 1180;
    w.state.player.y = 55;
    const events = w.step(STEP, { x: 0, y: 0 }, false);
    check('win-at-exit', (events & EVENT_WIN) !== 0 && w.state.won && w.state.score > 3000);
  }

  // 7. Caught: a chasing guard that reaches Wren costs a life and respawns her.
  {
    const w = createWorld(createRandom(1));
    const g = w.state.guards[0];
    g.mode = 'chase';
    g.suspicion = 1;
    g.x = w.state.player.x + 20;
    g.y = w.state.player.y;
    const events = w.step(STEP, { x: 0, y: 0 }, false);
    check(
      'caught-costs-life',
      (events & EVENT_CAUGHT) !== 0 && w.state.lives === 2 && w.state.player.x === 90 && w.state.player.y === 630,
    );
  }

  // 8. Game over: the third catch ends the game.
  {
    const w = createWorld(createRandom(1));
    let events = 0;
    for (let c = 0; c < 3; c += 1) {
      const g = w.state.guards[0];
      // A respawn leaves Wren briefly invulnerable; clear it so the next catch lands.
      w.state.player.invulnerable = 0;
      g.mode = 'chase';
      g.suspicion = 1;
      g.chaseTimer = 4;
      g.lastSeenX = w.state.player.x;
      g.lastSeenY = w.state.player.y;
      g.x = w.state.player.x + 20;
      g.y = w.state.player.y;
      events = w.step(STEP, { x: 0, y: 0 }, false);
    }
    check('game-over', (events & EVENT_OVER) !== 0 && w.state.over && w.state.lives === 0);
  }

  const failed = results.filter((r) => r.startsWith('FAIL'));
  const passed = results.length - failed.length;
  document.title = failed.length === 0 ? `SELFTEST PASS ${passed}/${results.length}` : `SELFTEST FAIL ${failed.join(' ')}`;
  window.__selftest = results.join('\n');
  return failed.length === 0;
}
