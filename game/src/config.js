// Every tuning number, colour and the gallery layout in one place. The playfield is a
// fixed 1280x720 logical area; the renderer scales it to the window, so no rule below
// depends on the screen size.
//
// The Night Gallery: one floor, five rooms. Wren slips in through the entry hall
// (bottom left), steals three relics and leaves through the service door (top right).
// Walls are rectangles {x, y, w, h}; crates are low cover that blocks both movement and
// a guard's line of sight. Guards patrol fixed waypoint loops.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  speed: 232,
  invulnerable: 2.0,
};

export const LIVES = 3;

export const GUARD = {
  radius: 14,
  patrolSpeed: 96,
  investigateSpeed: 132,
  chaseSpeed: 152,
  /** How far a guard can see, in pixels. */
  sightRange: 245,
  /** Half of the vision cone's angle, in radians. */
  sightHalfAngle: 0.62,
  /** Suspicion at which a guard leaves patrol to investigate the last seen spot. */
  suspiciousAt: 0.6,
  /** Suspicion at which a guard gives chase. */
  alertAt: 1.0,
  /** Seconds a chasing guard keeps hunting after losing sight. */
  chaseMemory: 4.0,
  /** Seconds an investigating guard waits at the spot before going back to patrol. */
  investigateWait: 2.5,
  /** Distance at which a chasing guard catches Wren. */
  catchRadius: 27,
};

export const RELIC_POINTS = 1000;
/** Win bonus: starts at this and falls by 8 a second. */
export const WIN_BONUS_START = 3000;
export const WIN_BONUS_PER_SECOND = 8;

/** Seconds of play per "level" shown in the HUD; a single floor, so the level never rises. */
export const LEVEL = { seconds: 60, max: 1 };

export const PALETTE = {
  backdrop: '#0b0e14',
  floorA: '#1d212b',
  floorB: '#1a1e27',
  wall: '#3a4152',
  wallTrim: '#8a6d2f',
  crate: '#4a3823',
  crateTop: '#5d4a2e',
  pedestal: '#2c3140',
  player: '#2fd4c4',
  playerDark: '#0f7d72',
  guard: '#e8b13c',
  guardAlert: '#e5534b',
  coneCalm: 'rgba(232, 177, 60, 0.20)',
  coneSuspicious: 'rgba(232, 120, 60, 0.32)',
  coneAlert: 'rgba(229, 83, 75, 0.38)',
  relicFox: '#7fe08a',
  relicDisk: '#f2c94c',
  relicPearl: '#c9a7ff',
  exit: '#3ddc74',
  exitLocked: '#5a6478',
  panel: '#222634',
  text: '#eef1f5',
  muted: '#9aa1b1',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'night-gallery.best';

/** The gallery's walls: the outer shell plus the room dividers, each with its door gaps. */
export const WALLS = [
  // Outer shell (24 thick).
  { x: 0, y: 0, w: 1280, h: 24 },
  { x: 0, y: 696, w: 1280, h: 24 },
  { x: 0, y: 0, w: 24, h: 720 },
  { x: 1256, y: 0, w: 24, h: 720 },
  // West / central divider (x 420..444), doors at y 150..210 and y 480..540.
  { x: 420, y: 24, w: 24, h: 126 },
  { x: 420, y: 210, w: 24, h: 270 },
  { x: 420, y: 540, w: 24, h: 156 },
  // West rooms divider (y 330..354), door at x 180..260.
  { x: 24, y: 330, w: 156, h: 24 },
  { x: 260, y: 330, w: 160, h: 24 },
  // Central / east divider (x 860..884), doors at y 300..360 and y 560..620.
  { x: 860, y: 204, w: 24, h: 96 },
  { x: 860, y: 360, w: 24, h: 200 },
  { x: 860, y: 620, w: 24, h: 76 },
  // East rooms divider (y 180..204), door at x 1020..1100.
  { x: 884, y: 180, w: 136, h: 24 },
  { x: 1100, y: 180, w: 156, h: 24 },
  // Central display case: a long low block in the middle of the central hall.
  { x: 600, y: 300, w: 100, h: 120 },
];

/** Low cover: blocks movement and a guard's line of sight, but Wren can hide behind it. */
export const CRATES = [
  { x: 250, y: 130, w: 64, h: 48 },
  { x: 120, y: 180, w: 56, h: 56 },
  { x: 300, y: 560, w: 72, h: 48 },
  { x: 560, y: 120, w: 72, h: 48 },
  { x: 700, y: 540, w: 64, h: 64 },
  { x: 950, y: 300, w: 56, h: 56 },
  { x: 1050, y: 600, w: 72, h: 48 },
  { x: 960, y: 90, w: 56, h: 56 },
];

/** The three relics: name, spot, glow colour. */
export const RELICS = [
  { name: 'Jade Fox', x: 220, y: 160, color: '#7fe08a' },
  { name: 'Sun Disk', x: 650, y: 90, color: '#f2c94c' },
  { name: 'Moon Pearl', x: 1070, y: 480, color: '#c9a7ff' },
];

/** Wren's way in, bottom left of the entry hall. */
export const PLAYER_START = { x: 90, y: 630 };

/** The service door, top wall of the vault room. Reach it with all three relics to win. */
export const EXIT = { x: 1140, y: 24, w: 80, h: 46 };

/** The guards: name, patrol loop, and where they start on it. */
export const GUARDS = [
  {
    name: 'Mara',
    waypoints: [
      { x: 90, y: 90 },
      { x: 360, y: 90 },
      { x: 360, y: 270 },
      { x: 90, y: 270 },
    ],
  },
  {
    name: 'Ivo',
    waypoints: [
      { x: 500, y: 90 },
      { x: 800, y: 90 },
      { x: 800, y: 620 },
      { x: 500, y: 620 },
    ],
  },
  {
    name: 'Sana',
    waypoints: [
      { x: 950, y: 260 },
      { x: 1200, y: 260 },
      { x: 1200, y: 560 },
      { x: 950, y: 560 },
    ],
  },
];
