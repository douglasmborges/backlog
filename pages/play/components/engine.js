// Backlog game engine: physics, level logic and rendering on a 2D canvas.
// Pure browser code - only instantiated from firstUpdated() on the client.

import {buildLevel, GROUND, WORLD_W, VIEW_W, VIEW_H} from './level.js';

const GRAV = 1800;
const RUN = 260;
const PUSH_RUN = 120;
const JUMP_V = -560;
const PW = 26;
const PH = 56;
const STEP = 1 / 120;

const overlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const R = ([x, y, w, h]) => ({x, y, w, h});

export class BacklogEngine {
  constructor(canvas, sound, labels, hooks) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.sound = sound;
    this.labels = labels; // translated strings keyed by english source
    this.hooks = hooks; // {onWin(stats), onDeath(count)}
    this.keys = new Set();
    this.raf = 0;
    this.last = 0;
    this.acc = 0;
    this.t = 0;
    this._makeGrain();
    this._makeBackdrop();
    this.reset();
  }

  reset() {
    this.L = buildLevel();
    this.solidRects = this.L.solids.map(R);
    this.spikeRects = this.L.spikes.map(R);
    this.cp = 0;
    this.deaths = 0;
    this.elapsed = 0;
    this.state = 'play'; // play | dying | won
    this.fade = 1; // fade-in from black
    this.dyingT = 0;
    this.particles = [];
    this._spawn();
  }

  _spawn() {
    const x = this.L.checkpoints[this.cp];
    this.p = {x, y: GROUND - PH, w: PW, h: PH, vx: 0, vy: 0, onGround: true, face: 1, run: 0, stepAcc: 0, pushing: false};
    const L = this.L;
    L.lever.pulled = false;
    L.lever.anim = 0;
    L.gate.timer = 0;
    L.gate.open = 0;
    L.chase.active = false;
    if (this.cp === 0) {
      for (const c of L.crates) {
        c.x = c.x0;
        c.y = GROUND - c.h;
        c.vy = 0;
      }
    }
    this.cam = Math.max(-200, x - 360);
  }

  // ---------- loop ----------
  run() {
    const frame = now => {
      this.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
      this.last = now;
      this.acc += dt;
      while (this.acc >= STEP) {
        this._update(STEP);
        this.acc -= STEP;
      }
      this._draw();
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  key(code, down) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  _down(...codes) {
    return codes.some(c => this.keys.has(c));
  }

  // ---------- geometry helpers ----------
  _gateRect() {
    const g = this.L.gate;
    const h = g.height * (1 - g.open);
    return {x: g.x, y: g.top, w: g.w, h: Math.max(0, h), isGate: true};
  }

  _crusherRect(c) {
    const ph = (((this.t + c.offset) % c.period) + c.period) % c.period / c.period;
    const up = 250;
    const down = GROUND;
    let b;
    if (ph < 0.45) b = up;
    else if (ph < 0.52) b = up + ((ph - 0.45) / 0.07) * (down - up);
    else if (ph < 0.75) b = down;
    else b = down - ((ph - 0.75) / 0.25) * (down - up);
    return {x: c.x, y: -300, w: c.w, h: b + 300, falling: ph >= 0.45 && ph < 0.52, down: ph >= 0.52 && ph < 0.75};
  }

  _staticBlockers(exclude) {
    const list = [...this.solidRects, this._gateRect()];
    for (const c of this.L.crushers) list.push(this._crusherRect(c));
    for (const c of this.L.crates) if (c !== exclude) list.push(c);
    return list;
  }

  // ---------- update ----------
  _update(dt) {
    this.t += dt;
    const L = this.L;
    if (this.fade > 0 && this.state === 'play') this.fade = Math.max(0, this.fade - dt * 1.6);

    // gate
    const g = L.gate;
    if (g.timer > 0) {
      g.timer -= dt;
      g.open = Math.min(1, g.open + dt * 3.5);
      if (g.timer <= 0) this.sound.gate();
    } else {
      g.open = Math.max(0, g.open - dt * 1.4);
    }
    if (L.lever.anim > 0) L.lever.anim = Math.max(0, L.lever.anim - dt * 0.4);

    // crusher slam sound when near the camera
    for (const c of L.crushers) {
      const r = this._crusherRect(c);
      if (r.down && !c.wasDown && Math.abs(c.x - (this.cam + VIEW_W / 2)) < 700) {
        this.sound.slam();
        this._dust(c.x + c.w / 2, GROUND, 10);
      }
      c.wasDown = r.down;
    }

    // crates fall
    for (const c of L.crates) {
      c.vy += GRAV * dt;
      c.y += c.vy * dt;
      for (const s of this._staticBlockers(c)) {
        if (overlap(c, s) && c.vy > 0) {
          c.y = s.y - c.h;
          c.vy = 0;
        }
      }
    }

    // particles
    this.particles = this.particles.filter(pt => (pt.life -= dt) > 0);
    for (const pt of this.particles) {
      pt.vy += 600 * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }

    if (this.state === 'dying') {
      this.dyingT += dt;
      this.fade = Math.min(1, this.dyingT / 0.9);
      if (this.dyingT > 1.1) {
        this.state = 'play';
        this._spawn();
      }
      return;
    }
    if (this.state !== 'play') return;

    this.elapsed += dt;
    const p = this.p;

    // input
    const left = this._down('ArrowLeft', 'KeyA');
    const right = this._down('ArrowRight', 'KeyD');
    const jump = this._down('ArrowUp', 'KeyW', 'Space');
    const use = this._down('KeyE', 'ShiftLeft', 'ShiftRight', 'ArrowDown', 'KeyS');

    let dir = (right ? 1 : 0) - (left ? 1 : 0);
    if (dir) p.face = dir;
    const speed = p.pushing ? PUSH_RUN : RUN;
    p.vx = dir * speed;

    // conveyor
    const cv = L.conveyor;
    if (p.onGround && p.x + p.w > cv.x && p.x < cv.x2 && Math.abs(p.y + p.h - GROUND) < 1) p.vx += cv.speed;

    if (jump && p.onGround && !this._jumpHeld) {
      p.vy = JUMP_V;
      p.onGround = false;
      this.sound.jump();
    }
    this._jumpHeld = jump;

    // lever
    if (use && !this._useHeld && Math.abs(p.x + p.w / 2 - L.lever.x) < 46 && p.onGround) {
      L.lever.pulled = true;
      L.lever.anim = 1;
      g.timer = g.openFor;
      this.sound.lever();
      this.sound.gate();
    }
    this._useHeld = use;

    // horizontal move
    p.pushing = false;
    p.x += p.vx * dt;
    for (const c of L.crates) {
      if (overlap(p, c)) {
        // try to push the crate
        const push = p.vx > 0 ? p.x + p.w - c.x : p.x - (c.x + c.w);
        const ox = c.x;
        c.x += push;
        const blocked = this._staticBlockers(c).some(s => overlap(c, s));
        if (blocked || !p.onGround) {
          c.x = ox;
          p.x = p.vx > 0 ? c.x - p.w : c.x + c.w;
        } else {
          p.pushing = true;
          if (Math.random() < 0.04) this.sound.push();
        }
      }
    }
    for (const s of this._staticBlockers()) {
      if (L.crates.includes(s)) continue;
      if (overlap(p, s)) {
        if (s.falling !== undefined && s.falling) return this._die();
        const fromLeft = p.x + p.w / 2 < s.x + s.w / 2;
        p.x = fromLeft ? s.x - p.w : s.x + s.w;
      }
    }

    // vertical move
    const wasGround = p.onGround;
    p.vy += GRAV * dt;
    p.y += p.vy * dt;
    p.onGround = false;
    for (const s of this._staticBlockers()) {
      if (s.isGate || !overlap(p, s)) continue;
      if (s.falling) return this._die();
      if (p.vy > 0) {
        p.y = s.y - p.h;
        p.vy = 0;
        p.onGround = true;
      } else if (p.vy < 0) {
        p.y = s.y + s.h;
        p.vy = 0;
      } else {
        // something closed on top of us (gate)
        return this._die();
      }
    }
    // gate closing on the player
    const gr = this._gateRect();
    if (gr.h > 0 && overlap(p, gr)) return this._die();

    if (p.onGround && !wasGround) {
      this.sound.land();
      this._dust(p.x + p.w / 2, p.y + p.h, 5);
    }

    // footsteps
    if (p.onGround && dir) {
      p.run += dt * 9;
      p.stepAcc += dt;
      if (p.stepAcc > 0.27) {
        p.stepAcc = 0;
        this.sound.step();
      }
    } else p.run = 0;

    // hazards
    if (this.spikeRects.some(s => overlap(p, s)) || p.y > 640) return this._die();

    // checkpoints
    for (let i = this.cp + 1; i < L.checkpoints.length; i++) {
      if (p.x > L.checkpoints[i]) {
        this.cp = i;
        this.sound.checkpoint();
      }
    }

    // chase
    const ch = L.chase;
    if (!ch.active && p.x > ch.trigger) {
      ch.active = true;
      ch.x = ch.startX;
      this._tickAcc = 0;
    }
    if (ch.active) {
      ch.x += ch.speed * dt;
      this._tickAcc = (this._tickAcc || 0) + dt;
      if (this._tickAcc > 0.5) {
        this._tickAcc = 0;
        this.sound.tick();
      }
      if (ch.x > p.x + 4) return this._die();
    }

    // exit
    if (overlap(p, L.exit)) {
      this.state = 'won';
      this.sound.win();
      this.hooks.onWin?.({timeMs: Math.round(this.elapsed * 1000), deaths: this.deaths});
    }

    // camera
    const target = Math.min(WORLD_W - VIEW_W, Math.max(-200, p.x - 380));
    this.cam += (target - this.cam) * Math.min(1, dt * 6);
  }

  _die() {
    if (this.state !== 'play') return;
    this.state = 'dying';
    this.dyingT = 0;
    this.deaths++;
    this.sound.death();
    this._dust(this.p.x + PW / 2, this.p.y + PH / 2, 24);
    this.hooks.onDeath?.(this.deaths);
  }

  _dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.particles.push({x, y, vx: (Math.random() - 0.5) * 220, vy: -Math.random() * 260, life: 0.4 + Math.random() * 0.5});
    }
  }

  // ---------- art ----------
  _makeGrain() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 26;
    }
    g.putImageData(img, 0, 0);
    this.grain = c;
  }

  _makeBackdrop() {
    // deterministic pseudo-random racks and cables
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    this.racks = [];
    for (let x = -300; x < WORLD_W; x += 70 + rnd() * 90) {
      this.racks.push({x, w: 40 + rnd() * 50, h: 160 + rnd() * 200, lights: Math.floor(3 + rnd() * 8), seed: rnd() * 10});
    }
    this.cables = [];
    for (let x = -300; x < WORLD_W; x += 90 + rnd() * 160) {
      this.cables.push({x, span: 80 + rnd() * 200, sag: 30 + rnd() * 90, y: -10 + rnd() * 40});
    }
  }

  _draw() {
    const g = this.g;
    const W = VIEW_W;
    const H = VIEW_H;
    const cam = this.cam;

    // sky / room haze
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#dcdcd6');
    bg.addColorStop(0.55, '#b4b4ae');
    bg.addColorStop(1, '#7c7c78');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // far racks (parallax 0.35)
    g.save();
    g.translate(-cam * 0.35, 0);
    for (const r of this.racks) {
      const sx = r.x;
      if (sx - cam * 0.35 > W + 100 || sx + r.w - cam * 0.35 < -100) continue;
      g.fillStyle = '#9d9d98';
      g.fillRect(sx, GROUND - r.h + 40, r.w, r.h);
      for (let i = 0; i < r.lights; i++) {
        const on = Math.sin(this.t * (1 + (i % 3)) + r.seed + i) > 0.6;
        g.fillStyle = on ? '#e6e6e0' : '#8c8c87';
        g.fillRect(sx + 6, GROUND - r.h + 52 + i * 14, 3, 3);
      }
    }
    g.restore();

    // mid cables (parallax 0.7)
    g.save();
    g.translate(-cam * 0.7, 0);
    g.strokeStyle = '#5f5f5b';
    g.lineWidth = 3;
    for (const c of this.cables) {
      if (c.x - cam * 0.7 > W + 300 || c.x + c.span - cam * 0.7 < -300) continue;
      g.beginPath();
      g.moveTo(c.x, c.y);
      g.quadraticCurveTo(c.x + c.span / 2, c.y + c.sag * 2 + Math.sin(this.t * 0.6 + c.x) * 3, c.x + c.span, c.y);
      g.stroke();
    }
    g.restore();

    // fog band
    const fog = g.createLinearGradient(0, H * 0.45, 0, H);
    fog.addColorStop(0, 'rgba(230,230,224,0)');
    fog.addColorStop(0.6, 'rgba(230,230,224,0.35)');
    fog.addColorStop(1, 'rgba(230,230,224,0)');
    g.fillStyle = fog;
    g.fillRect(0, 0, W, H);

    // ---- world space ----
    g.save();
    g.translate(-Math.round(cam), 0);
    const L = this.L;

    // signs
    g.font = '600 15px ui-monospace, Menlo, monospace';
    g.fillStyle = 'rgba(40,40,38,0.45)';
    for (const s of L.signs) g.fillText(this.labels[s.key] ?? s.key, s.x, s.y);

    // conveyor rollers
    const cv = L.conveyor;
    g.fillStyle = '#1a1a19';
    g.fillRect(cv.x, GROUND - 6, cv.x2 - cv.x, 6);
    g.fillStyle = '#3d3d3a';
    const off = ((this.t * -cv.speed) % 30 + 30) % 30;
    for (let x = cv.x - off; x < cv.x2; x += 30) if (x > cv.x) g.fillRect(x, GROUND - 5, 12, 2);

    // solids
    g.fillStyle = '#0c0c0c';
    for (const s of this.solidRects) g.fillRect(s.x, s.y, s.w, s.h);
    // rack wall detail
    g.fillStyle = '#1d1d1c';
    for (let y = 345; y < GROUND; y += 18) g.fillRect(575, y, 310, 2);

    // spikes: tangled cables
    g.strokeStyle = '#0c0c0c';
    g.lineWidth = 2;
    for (const s of this.spikeRects) {
      g.fillStyle = '#0c0c0c';
      g.fillRect(s.x, s.y + 40, s.w, 60);
      for (let x = s.x + 4; x < s.x + s.w; x += 9) {
        g.beginPath();
        g.moveTo(x, s.y + 42);
        g.lineTo(x + 4, s.y + 6 + ((x * 13) % 18));
        g.lineTo(x + 8, s.y + 42);
        g.fill();
      }
    }

    // crates
    for (const c of L.crates) {
      g.fillStyle = '#111110';
      g.fillRect(c.x, c.y, c.w, c.h);
      g.strokeStyle = '#2b2b29';
      g.lineWidth = 2;
      g.strokeRect(c.x + 6, c.y + 6, c.w - 12, c.h - 12);
      g.beginPath();
      g.moveTo(c.x + 6, c.y + 6);
      g.lineTo(c.x + c.w - 6, c.y + c.h - 6);
      g.stroke();
    }

    // lever
    const lv = L.lever;
    g.fillStyle = '#0c0c0c';
    g.fillRect(lv.x - 12, GROUND - 14, 24, 14);
    g.save();
    g.translate(lv.x, GROUND - 10);
    g.rotate(lv.anim > 0 ? 0.6 : -0.6);
    g.fillRect(-2, -38, 4, 38);
    g.beginPath();
    g.arc(0, -40, 6, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // gate
    const gr = this._gateRect();
    g.fillStyle = '#0c0c0c';
    g.fillRect(gr.x - 10, gr.y - 40, gr.w + 20, 40);
    g.fillRect(gr.x, gr.y, gr.w, gr.h);
    g.fillStyle = '#262624';
    for (let y = gr.y + 10; y < gr.y + gr.h; y += 22) g.fillRect(gr.x + 4, y, gr.w - 8, 3);

    // crushers
    for (const c of L.crushers) {
      const r = this._crusherRect(c);
      g.fillStyle = '#0c0c0c';
      g.fillRect(r.x + r.w / 2 - 8, -10, 16, r.y + r.h - 40);
      g.fillRect(r.x, r.y + r.h - 46, r.w, 46);
      g.fillStyle = '#2a2a28';
      g.fillRect(r.x + 6, r.y + r.h - 8, r.w - 12, 3);
    }

    // exit door with light
    const ex = L.exit;
    const glow = g.createRadialGradient(ex.x + ex.w / 2, ex.y + 50, 5, ex.x + ex.w / 2, ex.y + 50, 220);
    glow.addColorStop(0, 'rgba(255,255,250,0.75)');
    glow.addColorStop(1, 'rgba(255,255,250,0)');
    g.fillStyle = glow;
    g.fillRect(ex.x - 220, ex.y - 180, ex.w + 440, 420);
    g.fillStyle = '#fbfbf6';
    g.fillRect(ex.x, ex.y, ex.w, ex.h);
    g.fillStyle = '#0c0c0c';
    g.fillRect(ex.x - 8, ex.y - 8, ex.w + 16, 8);
    g.fillRect(ex.x - 8, ex.y, 8, ex.h);
    g.fillRect(ex.x + ex.w, ex.y, 8, ex.h);

    // player
    if (this.state !== 'dying') this._drawPlayer();

    // particles
    g.fillStyle = '#0c0c0c';
    for (const pt of this.particles) g.fillRect(pt.x, pt.y, 3, 3);

    // chaser
    if (L.chase.active) this._drawChaser(L.chase.x);

    g.restore();

    // grain, vignette
    g.globalCompositeOperation = 'multiply';
    g.drawImage(this.grain, -Math.random() * 128, -Math.random() * 128, W + 256, H + 256);
    g.globalCompositeOperation = 'source-over';
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.72)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);

    if (this.fade > 0) {
      g.fillStyle = `rgba(0,0,0,${this.fade})`;
      g.fillRect(0, 0, W, H);
    }
  }

  _drawPlayer() {
    const g = this.g;
    const p = this.p;
    const cx = p.x + p.w / 2;
    const top = p.y;
    const f = p.face;
    const swing = Math.sin(p.run) * (p.onGround ? 1 : 0.2);
    g.save();
    g.translate(cx, top);
    g.scale(f, 1);
    g.fillStyle = '#060606';
    g.strokeStyle = '#060606';
    g.lineCap = 'round';

    // legs
    g.lineWidth = 6;
    const hip = 36;
    g.beginPath();
    g.moveTo(-3, hip);
    g.lineTo(-3 + swing * 8, 56);
    g.moveTo(3, hip);
    g.lineTo(3 - swing * 8, 56);
    if (!p.onGround) {
      g.moveTo(-3, hip);
      g.lineTo(6, 50);
    }
    g.stroke();

    // torso with backpack
    g.beginPath();
    g.roundRect(-8, 14, 16, 25, 5);
    g.fill();
    g.beginPath();
    g.roundRect(-14, 16, 8, 18, 3);
    g.fill();

    // arms
    g.lineWidth = 4;
    g.beginPath();
    if (p.pushing) {
      g.moveTo(2, 20);
      g.lineTo(14, 22);
    } else {
      g.moveTo(0, 18);
      g.lineTo(-swing * 7, 34);
    }
    g.stroke();

    // head + headset
    g.beginPath();
    g.arc(0, 7, 8, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 7, 11, Math.PI * 1.05, Math.PI * 1.95);
    g.stroke();
    g.beginPath();
    g.roundRect(-11, 4, 5, 8, 2);
    g.fill();
    g.beginPath();
    g.moveTo(-8, 12);
    g.quadraticCurveTo(-2, 18, 7, 13);
    g.stroke();
    // headset status LED
    const blink = Math.sin(this.t * 3) > -0.2;
    if (blink) {
      g.fillStyle = '#d4432f';
      g.fillRect(-10, 6, 2, 2);
    }
    g.restore();
  }

  _drawChaser(x) {
    const g = this.g;
    const t = this.t;
    const cy = 300;
    // body mass trailing to the left
    g.fillStyle = '#050505';
    g.beginPath();
    g.moveTo(x - 900, -50);
    g.lineTo(x - 140, -50);
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI;
      const r = 150 + Math.sin(t * 7 + i * 1.7) * 14;
      g.lineTo(x - 140 + Math.sin(a) * r, cy - Math.cos(a) * 240);
    }
    g.lineTo(x - 900, GROUND + 200);
    g.closePath();
    g.fill();
    // cable tendrils
    g.strokeStyle = '#050505';
    g.lineWidth = 5;
    for (let i = 0; i < 6; i++) {
      const y0 = 120 + i * 55;
      g.beginPath();
      g.moveTo(x - 30, y0);
      g.quadraticCurveTo(x + 10 + Math.sin(t * 5 + i) * 18, y0 + 20, x + Math.sin(t * 4 + i * 2) * 10, y0 + 40);
      g.stroke();
    }
    // clock face
    const fx = x - 80;
    g.fillStyle = '#d9d9d2';
    g.beginPath();
    g.arc(fx, cy - 40, 46, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#050505';
    g.lineWidth = 4;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(fx + Math.cos(a) * 36, cy - 40 + Math.sin(a) * 36);
      g.lineTo(fx + Math.cos(a) * 42, cy - 40 + Math.sin(a) * 42);
      g.stroke();
    }
    const sec = Math.floor(t * 2) / 2;
    const ah = sec * 0.9;
    g.beginPath();
    g.moveTo(fx, cy - 40);
    g.lineTo(fx + Math.cos(ah - Math.PI / 2) * 34, cy - 40 + Math.sin(ah - Math.PI / 2) * 34);
    g.stroke();
    g.beginPath();
    g.moveTo(fx, cy - 40);
    g.lineTo(fx + Math.cos(ah / 12 - Math.PI / 2) * 20, cy - 40 + Math.sin(ah / 12 - Math.PI / 2) * 20);
    g.stroke();
  }
}
