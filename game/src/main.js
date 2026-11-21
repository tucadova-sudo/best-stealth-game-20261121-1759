// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, caught and escaped.
//
// ?seed=N fixes the patrol nudges. ?shot=start|play|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot. ?selftest=1 runs the scripted rules check and writes its verdict to the
// document title.
import { BEST_KEY, LIVES, STEP } from './config.js';
import { createRandom } from './random.js';
import { EVENT_CAUGHT, EVENT_OVER, EVENT_RELIC, EVENT_SPOTTED, EVENT_WIN, createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN, createRenderer } from './render.js';
import { stageShot } from './shots.js';
import { runSelfTest } from './selftest.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

// A read-only hook for the playtest script: where Wren is and how the run stands.
window.__debug = () => ({
  px: world.state.player.x,
  py: world.state.player.y,
  score: world.state.score,
  lives: world.state.lives,
  relics: world.state.relicsGot,
  suspicion: world.state.maxSuspicion,
});

/** Tiny WebAudio blips: a pickup chime, a spotted sting, a caught thud, a getaway arp. */
let audio = null;
function blip(freq, seconds, type, when) {
  try {
    audio = audio ?? new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, audio.currentTime + when);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + when + seconds);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(audio.currentTime + when);
    osc.stop(audio.currentTime + when + seconds);
  } catch {
    // No audio in this browser: the game plays on silently.
  }
}
function sound(name) {
  if (name === 'relic') {
    blip(660, 0.12, 'sine', 0);
    blip(990, 0.18, 'sine', 0.09);
  } else if (name === 'spotted') {
    blip(180, 0.25, 'sawtooth', 0);
  } else if (name === 'caught') {
    blip(90, 0.4, 'triangle', 0);
  } else if (name === 'win') {
    blip(523, 0.14, 'sine', 0);
    blip(659, 0.14, 'sine', 0.12);
    blip(784, 0.22, 'sine', 0.24);
  }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Playing. ${LIVES} lives. Steal all 3 relics, then reach the exit.`);
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (won) {
      sound('win');
      announce(`Clean getaway. Score ${world.state.score}. Best ${best}.`);
    } else {
      announce(`Caught. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, true);
      return;
    }
    const events = world.step(STEP, input.vector(), false);
    if (events & EVENT_RELIC) {
      sound('relic');
      announce(`Relic ${world.state.relicsGot} of 3 pocketed.`);
    }
    if (events & EVENT_SPOTTED) {
      sound('spotted');
      announce('A guard is suspicious. Break line of sight.');
    }
    if (events & EVENT_CAUGHT) sound('caught');
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_OVER) endGame(false);
    else if (events & EVENT_CAUGHT) {
      announce(world.state.lives === 1 ? 'Caught. 1 life left.' : `Caught. ${world.state.lives} lives left.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('The Night Gallery. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (params.get('selftest') === '1') runSelfTest();
else if (shot) runShot(shot);
else runGame();
