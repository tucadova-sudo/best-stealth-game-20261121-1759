// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. Flat shapes and canvas text: floor tiles, walls with gold trim, crates, pedestal
// glows, guards with their vision cones, Wren, the relics, the service door, and the HUD.
import { CRATES, EXIT, FIELD, FONT, GUARD, LIVES, PALETTE, RELICS, WALLS } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** The panel's width; its height grows with its lines: room for the title, the lines and the prompt. */
const PANEL = { width: 640, top: 134, line: 34, bottom: 70 };

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('Score ');
  const timeLabel = cachedLabel('');
  const finalLabel = cachedLabel('Score ');
  const bestLabel = cachedLabel('Best ');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function drawFloor() {
    const tile = 80;
    for (let ty = 0; ty < FIELD.height / tile; ty += 1) {
      for (let tx = 0; tx < FIELD.width / tile; tx += 1) {
        context.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
        context.fillRect(tx * tile, ty * tile, tile, tile);
      }
    }
    // Warm pools of light where the relics sit.
    for (let i = 0; i < RELICS.length; i += 1) {
      const relic = RELICS[i];
      const glow = context.createRadialGradient(relic.x, relic.y, 4, relic.x, relic.y, 90);
      glow.addColorStop(0, 'rgba(242, 201, 76, 0.20)');
      glow.addColorStop(1, 'rgba(242, 201, 76, 0)');
      context.fillStyle = glow;
      context.fillRect(relic.x - 90, relic.y - 90, 180, 180);
    }
  }

  function drawWallsAndCover(state) {
    for (let i = 0; i < WALLS.length; i += 1) {
      const w = WALLS[i];
      context.fillStyle = PALETTE.wall;
      context.fillRect(w.x, w.y, w.w, w.h);
      context.fillStyle = PALETTE.wallTrim;
      if (w.w >= w.h) context.fillRect(w.x, w.y + w.h - 3, w.w, 3);
      else context.fillRect(w.x + w.w - 3, w.y, 3, w.h);
    }
    for (let i = 0; i < state.crates.length; i += 1) {
      const c = state.crates[i];
      context.fillStyle = PALETTE.crate;
      context.fillRect(c.x, c.y, c.w, c.h);
      context.fillStyle = PALETTE.crateTop;
      context.fillRect(c.x + 4, c.y + 4, c.w - 8, c.h - 8);
      context.strokeStyle = 'rgba(0,0,0,0.35)';
      context.strokeRect(c.x + 4.5, c.y + 4.5, c.w - 9, c.h - 9);
    }
    // Pedestals under the relics that are still there.
    for (let i = 0; i < state.relics.length; i += 1) {
      const relic = state.relics[i];
      if (relic.taken) continue;
      context.fillStyle = PALETTE.pedestal;
      context.fillRect(relic.x - 18, relic.y - 14, 36, 28);
      context.fillStyle = PALETTE.wallTrim;
      context.fillRect(relic.x - 18, relic.y - 14, 36, 3);
    }
  }

  function drawCone(guard) {
    const range = GUARD.sightRange;
    const half = GUARD.sightHalfAngle;
    const a0 = guard.dir - half;
    const a1 = guard.dir + half;
    context.beginPath();
    context.moveTo(guard.x, guard.y);
    context.arc(guard.x, guard.y, range, a0, a1);
    context.closePath();
    if (guard.mode === 'chase') context.fillStyle = PALETTE.coneAlert;
    else if (guard.suspicion >= 0.6) context.fillStyle = PALETTE.coneSuspicious;
    else context.fillStyle = PALETTE.coneCalm;
    context.fill();
  }

  function drawGuard(guard) {
    drawCone(guard);
    context.fillStyle = guard.mode === 'chase' ? PALETTE.guardAlert : PALETTE.guard;
    context.beginPath();
    context.arc(guard.x, guard.y, GUARD.radius, 0, Math.PI * 2);
    context.fill();
    // Facing tick and a cap brim.
    context.strokeStyle = '#11141b';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(guard.x, guard.y);
    context.lineTo(guard.x + Math.cos(guard.dir) * (GUARD.radius + 6), guard.y + Math.sin(guard.dir) * (GUARD.radius + 6));
    context.stroke();
    // Suspicion ring: grows with the meter, red as it fills.
    if (guard.suspicion > 0.02) {
      context.strokeStyle = guard.suspicion >= 0.6 ? '#e5534b' : '#f2c94c';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(guard.x, guard.y, GUARD.radius + 7, -Math.PI / 2, -Math.PI / 2 + guard.suspicion * Math.PI * 2);
      context.stroke();
    }
    text(guard.name, guard.x, guard.y - GUARD.radius - 12, 13, PALETTE.muted, 'center');
  }

  function drawRelics(state) {
    for (let i = 0; i < state.relics.length; i += 1) {
      const relic = state.relics[i];
      if (relic.taken) continue;
      const pulse = 10 + Math.sin(state.elapsed * 3 + i * 2) * 2;
      context.fillStyle = relic.color;
      context.beginPath();
      // A cut gem: a diamond.
      context.moveTo(relic.x, relic.y - pulse - 4);
      context.lineTo(relic.x + pulse, relic.y);
      context.lineTo(relic.x, relic.y + pulse + 4);
      context.lineTo(relic.x - pulse, relic.y);
      context.closePath();
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.75)';
      context.beginPath();
      context.arc(relic.x - 3, relic.y - 4, 2.5, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawExit(state) {
    const open = state.exitOpen;
    context.fillStyle = open ? PALETTE.exit : PALETTE.exitLocked;
    context.fillRect(EXIT.x, EXIT.y, EXIT.w, EXIT.h);
    context.fillStyle = '#0b0e14';
    context.fillRect(EXIT.x + 6, EXIT.y + 6, EXIT.w - 12, EXIT.h - 12);
    text(open ? 'EXIT' : 'LOCKED', EXIT.x + EXIT.w / 2, EXIT.y + EXIT.h + 22, 15, open ? PALETTE.exit : PALETTE.muted, 'center');
    if (open) {
      context.strokeStyle = PALETTE.exit;
      context.lineWidth = 2;
      context.strokeRect(EXIT.x + 2.5, EXIT.y + 2.5, EXIT.w - 5, EXIT.h - 5);
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    // Blink while invulnerable after being caught: hidden on every other tenth of a second.
    if (p.invulnerable === 0 || Math.floor(p.invulnerable * 10) % 2 === 1) {
      context.fillStyle = PALETTE.playerDark;
      context.beginPath();
      context.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      context.fill();
      // Hood point: which way Wren faces is where she is headed.
      context.fillStyle = '#0b0e14';
      context.beginPath();
      context.arc(p.x - 4, p.y - 2, 2.2, 0, Math.PI * 2);
      context.arc(p.x + 4, p.y - 2, 2.2, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawField(state) {
    drawFloor();
    drawExit(state);
    drawWallsAndCover(state);
    drawRelics(state);
    for (let i = 0; i < state.guards.length; i += 1) drawGuard(state.guards[i]);
    drawPlayer(state);
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function drawHud(state) {
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 20, 28, PALETTE.text, 'left');
    text(timeLabel(formatTime(state.elapsed)), FIELD.width / 2, 20, 28, PALETTE.text, 'center');
    // Relics: three diamonds, filled as they are pocketed.
    const rx = FIELD.width - 24;
    for (let i = 0; i < 3; i += 1) {
      const cx = rx - i * 34;
      const got = i < state.relicsGot;
      context.fillStyle = got ? RELICS[i].color : PALETTE.exitLocked;
      context.beginPath();
      context.moveTo(cx, 20);
      context.lineTo(cx + 11, 32);
      context.lineTo(cx, 44);
      context.lineTo(cx - 11, 32);
      context.closePath();
      context.fill();
    }
    text('Relics', rx - 3 * 34 - 16, 20, 28, PALETTE.text, 'right');
    // Lives: small hearts under the relic row.
    for (let life = 0; life < LIVES; life += 1) {
      context.fillStyle = life < state.lives ? PALETTE.player : PALETTE.exitLocked;
      context.beginPath();
      context.arc(FIELD.width - 24 - life * 28 - 6, 62, 7, 0, Math.PI * 2);
      context.fill();
    }
    text('Lives', FIELD.width - 24 - LIVES * 28 - 16, 52, 20, PALETTE.text, 'right');
    // The hottest guard's suspicion, as a bar under the timer.
    const sus = state.maxSuspicion;
    if (sus > 0.02) {
      const bw = 220;
      const bx = FIELD.width / 2 - bw / 2;
      context.fillStyle = '#11141b';
      context.fillRect(bx, 52, bw, 10);
      context.fillStyle = sus >= 0.6 ? '#e5534b' : '#f2c94c';
      context.fillRect(bx, 52, bw * sus, 10);
      text(sus >= 1 ? 'SEEN!' : sus >= 0.6 ? 'Suspicious…' : 'Hiding?', FIELD.width / 2, 66, 16, sus >= 0.6 ? '#e5534b' : PALETTE.muted, 'center');
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 48, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 22, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 40, 24, '#f2c94c', 'center');
  }

  const TITLE_LINES = [
    'Three relics. Three guards. One way out.',
    'Stay out of the yellow cones. Crates block their sight.',
    'Move with WASD or the arrow keys.  Pause with P.',
    '',
  ];
  const PAUSED_LINES = ['The guards will wait for you.'];
  const OVER_LINES = ['', ''];
  const WIN_LINES = ['', ''];

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawField(state);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[3] = bestLabel(best);
      drawPanel('The Night Gallery', TITLE_LINES, 'Press Space or click to start');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = finalLabel(state.score);
      OVER_LINES[1] = bestLabel(best);
      drawPanel('Caught!', OVER_LINES, 'Press Space or click to try again');
    } else if (screen === SCREEN_WIN) {
      WIN_LINES[0] = finalLabel(state.score);
      WIN_LINES[1] = bestLabel(best);
      drawPanel('Clean getaway!', WIN_LINES, 'Press Space or click to play again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
