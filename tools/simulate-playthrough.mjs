// Headless playthrough bot for the Backlog engine.
// Runs the real engine without a browser (canvas and audio are stubbed) and
// checks that level 1 can be finished.
//
// Usage: node tools/simulate-playthrough.mjs

const noop = () => {};
const ctxStub = new Proxy(
  {},
  {
    get: (_t, k) =>
      k === 'createLinearGradient' || k === 'createRadialGradient'
        ? () => ({addColorStop: noop})
        : k === 'createImageData'
          ? (w, h) => ({data: new Uint8ClampedArray(w * h * 4)})
          : noop,
    set: () => true
  }
);
globalThis.document = {createElement: () => ({getContext: () => ctxStub})};

const {BacklogEngine} = await import(
  new URL('../pages/play/components/engine.js', import.meta.url)
);

const sound = new Proxy({}, {get: () => noop});
let won = null;
const e = new BacklogEngine({getContext: () => ctxStub}, sound, {}, {onWin: s => (won = s)});

const STEP = 1 / 120;
const MAX_STEPS = 120 * 120; // two minutes of game time
const L = e.L;
const log = [];
let lastCheckpoint = -1;
let jumpedLastStep = false;

// Is there floor under x, within 120px below the player's feet?
const groundAt = x =>
  e.solidRects.some(
    s => x >= s.x && x <= s.x + s.w && s.y >= e.p.y + e.p.h - 2 && s.y < e.p.y + e.p.h + 120
  );

for (let i = 0; i < MAX_STEPS && !won; i++) {
  const p = e.p;
  e.keys.clear();

  if (e.state === 'play') {
    let right = true;
    let jump = false;
    let useLever = false;
    const front = p.x + p.w;

    // Pull the lever once, standing next to it.
    if (!L.lever.pulled && Math.abs(p.x + p.w / 2 - L.lever.x) < 30) {
      useLever = true;
      right = false;
    }

    // Wait before a press unless it is about to stay open long enough.
    for (const c of L.crushers) {
      if (front > c.x - 60 && front < c.x - 2) {
        const phase = ((e.t + c.offset) % c.period) / c.period;
        if (!(phase > 0.9 || phase < 0.12)) right = false;
      }
    }

    // Jump when a wall or step is right ahead (the first crate is pushed, not jumped).
    const blockedAhead = e
      ._staticBlockers()
      .filter(
        s =>
          !s.isGate &&
          !(L.crates.includes(s) && s.x < 485) &&
          s.x >= front - 2 &&
          s.x < front + 14 &&
          s.y < p.y + p.h - 1 &&
          s.y > p.y - 60
      );
    if (p.onGround && blockedAhead.length) jump = true;
    // ...or when the floor ends.
    if (p.onGround && !groundAt(front + 20)) jump = true;

    if (right) e.key('ArrowRight', true);
    // Release the jump key between jumps: the engine needs a fresh press.
    if (jump && !jumpedLastStep) e.key('Space', true);
    jumpedLastStep = jump && !jumpedLastStep;
    if (useLever) e.key('KeyE', true);
  }

  e._update(STEP);

  if (e.cp !== lastCheckpoint) {
    log.push(`t=${e.elapsed.toFixed(1)} checkpoint ${e.cp} deaths=${e.deaths}`);
    lastCheckpoint = e.cp;
  }
  if (e.state === 'dying' && e.dyingT < STEP * 1.5) {
    log.push(`t=${e.elapsed.toFixed(1)} DIED at x=${e.p.x.toFixed(0)} y=${e.p.y.toFixed(0)}`);
  }
}

console.log(log.slice(0, 40).join('\n'));
console.log('WON:', JSON.stringify(won), 'final x', e.p.x.toFixed(0));
process.exit(won ? 0 : 1);
