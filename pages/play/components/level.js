// Backlog - level 1 "The Queue". Original layout, world units in px.
// Ground line is y = 440. Player is 26x56. Jump apex ~87px, run 260px/s.

export const GROUND = 440;
export const WORLD_W = 4300;
export const VIEW_W = 960;
export const VIEW_H = 540;

export function buildLevel() {
  return {
    // Static solids [x, y, w, h]
    solids: [
      [-260, -400, 60, 1240], // left world wall
      [-200, GROUND, 1200, 400], // start floor
      [560, 330, 340, 510], // server-rack wall, too high without the crate
      [1130, GROUND, 2140, 400], // floor: lever, gate, conveyor, chase start
      [1450, 404, 70, 36], // low step before the gate
      [3060, 380, 60, 60], // hop during the chase
      [3380, GROUND, 330, 400], // chase floor 2
      [3840, GROUND, 700, 400], // final floor
      [4500, -400, 60, 1240] // right world wall
    ],
    // Pushable ticket crate
    crates: [{x: 380, y: GROUND - 70, w: 70, h: 70, vy: 0, x0: 380}],
    // Instant death zones [x, y, w, h]
    spikes: [
      [1000, 500, 130, 80], // tangled cable pit
      [3270, 500, 110, 80],
      [3710, 500, 130, 80]
    ],
    lever: {x: 1300, pulled: false, anim: 0},
    gate: {x: 1660, w: 34, top: 200, height: 240, openFor: 2.3, timer: 0, open: 0},
    conveyor: {x: 1800, x2: 2440, speed: -115},
    crushers: [
      {x: 1960, w: 80, period: 2.2, offset: 0.0, wasDown: false},
      {x: 2140, w: 80, period: 2.2, offset: 0.75, wasDown: false},
      {x: 2320, w: 80, period: 2.2, offset: 1.5, wasDown: false}
    ],
    chase: {trigger: 2560, startX: 2380, speed: 250, active: false, x: 0},
    checkpoints: [80, 1180, 1730, 2480],
    exit: {x: 4040, y: GROUND - 120, w: 70, h: 120},
    signs: [
      {x: 120, y: 250, key: 'INC0000001 - still open'},
      {x: 600, y: 200, key: 'Queue: 9,999+'},
      {x: 1230, y: 290, key: 'Approval required'},
      {x: 1880, y: 110, key: 'Workflow in progress'},
      {x: 2700, y: 230, key: 'SLA breach imminent'},
      {x: 3990, y: 250, key: 'Resolved'}
    ]
  };
}
