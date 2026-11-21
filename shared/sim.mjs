// Shared tadpole physics. The server is the authority; the browser runs the same
// step for its own tadpole (prediction) so inputs feel instant.
export const TICK = 1 / 30;
export const WORLD_W = 2400;
export const WORLD_H = 1600;

export const C = {
  radius: 15,
  swimAccel: 900,
  swimDrag: 2.6,
  dashImpulse: 820,
  dashCooldown: 5.0,
  boostSpeed: 1000,
  boostTime: 0.7,
  boostCooldown: 1.0,
  maxSpeed: 1150,
  bounce: 0.5,
  tagRadius: 34,
  tagImmune: 1.5,
  tagPoints: 5,
  orbRadius: 7,
  orbPoints: 1,
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic pond layout: rocks and reed beds (solid) plus booster pads.
export function makeWorld(seed) {
  const rnd = mulberry32(seed);
  const obstacles = [];
  for (let guard = 0; obstacles.length < 46 && guard < 4000; guard++) {
    const r = 26 + rnd() * 44;
    const x = 80 + rnd() * (WORLD_W - 160);
    const y = 80 + rnd() * (WORLD_H - 160);
    if (obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 30)) continue;
    obstacles.push({ x, y, r, kind: rnd() < 0.5 ? 'rock' : 'reed' });
  }
  const pads = [];
  for (let guard = 0; pads.length < 9 && guard < 4000; guard++) {
    const x = 120 + rnd() * (WORLD_W - 240);
    const y = 120 + rnd() * (WORLD_H - 240);
    const dir = rnd() * Math.PI * 2;
    if (obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + 110)) continue;
    if (pads.some((p) => Math.hypot(p.x - x, p.y - y) < 260)) continue;
    pads.push({ x, y, dir, len: 70, wid: 40 });
  }
  // Frog spawn orbs: coins that tadpoles swim over to collect. Placed clear of obstacles and pads.
  const orbs = [];
  for (let guard = 0; orbs.length < 40 && guard < 4000; guard++) {
    const x = 60 + rnd() * (WORLD_W - 120);
    const y = 60 + rnd() * (WORLD_H - 120);
    if (obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + 14)) continue;
    if (pads.some((p) => Math.hypot(p.x - x, p.y - y) < p.len + 20)) continue;
    if (orbs.some((o) => Math.hypot(o.x - x, o.y - y) < 40)) continue;
    orbs.push({ x, y, phase: rnd() * Math.PI * 2, taken: false });
  }
  return { seed, obstacles, pads, orbs };
}

export function findSpawn(world, rand = Math.random) {
  for (let i = 0; i < 200; i++) {
    const x = 120 + rand() * (WORLD_W - 240);
    const y = 120 + rand() * (WORLD_H - 240);
    if (world.obstacles.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + C.radius + 40)) {
      return { x, y };
    }
  }
  return { x: WORLD_W / 2, y: WORLD_H / 2 };
}

export function newBody(x, y) {
  return { x, y, vx: 0, vy: 0, a: 0, dashCd: 0, boost: 0, boostCd: 0 };
}

function inPad(pad, x, y) {
  const dx = x - pad.x;
  const dy = y - pad.y;
  const c = Math.cos(pad.dir);
  const s = Math.sin(pad.dir);
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  return Math.abs(lx) <= pad.len && Math.abs(ly) <= pad.wid;
}

// One fixed step. inp = { aim: radians, swim: bool, dash: bool }.
export function stepBody(b, inp, dt, world) {
  b.a = inp.aim;
  if (b.dashCd > 0) b.dashCd = Math.max(0, b.dashCd - dt);
  if (b.boostCd > 0) b.boostCd = Math.max(0, b.boostCd - dt);

  if (inp.dash && b.dashCd <= 0) {
    b.vx += Math.cos(inp.aim) * C.dashImpulse;
    b.vy += Math.sin(inp.aim) * C.dashImpulse;
    b.dashCd = C.dashCooldown;
  }
  if (inp.swim) {
    b.vx += Math.cos(b.a) * C.swimAccel * dt;
    b.vy += Math.sin(b.a) * C.swimAccel * dt;
  }

  if (b.boost > 0) {
    b.boost = Math.max(0, b.boost - dt);
  } else {
    const k = Math.exp(-C.swimDrag * dt);
    b.vx *= k;
    b.vy *= k;
  }

  if (b.boost <= 0 && b.boostCd <= 0) {
    for (const pad of world.pads) {
      if (inPad(pad, b.x, b.y)) {
        b.vx = Math.cos(pad.dir) * C.boostSpeed;
        b.vy = Math.sin(pad.dir) * C.boostSpeed;
        b.boost = C.boostTime;
        b.boostCd = C.boostCooldown;
        break;
      }
    }
  }

  const sp = Math.hypot(b.vx, b.vy);
  if (sp > C.maxSpeed) {
    b.vx *= C.maxSpeed / sp;
    b.vy *= C.maxSpeed / sp;
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  for (const o of world.obstacles) {
    const dx = b.x - o.x;
    const dy = b.y - o.y;
    const d = Math.hypot(dx, dy);
    const min = o.r + C.radius;
    if (d < min && d > 0.0001) {
      const nx = dx / d;
      const ny = dy / d;
      b.x = o.x + nx * min;
      b.y = o.y + ny * min;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= (1 + C.bounce) * vn * nx;
        b.vy -= (1 + C.bounce) * vn * ny;
      }
    }
  }

  const m = C.radius;
  if (b.x < m) { b.x = m; if (b.vx < 0) b.vx = -b.vx * C.bounce; }
  if (b.x > WORLD_W - m) { b.x = WORLD_W - m; if (b.vx > 0) b.vx = -b.vx * C.bounce; }
  if (b.y < m) { b.y = m; if (b.vy < 0) b.vy = -b.vy * C.bounce; }
  if (b.y > WORLD_H - m) { b.y = WORLD_H - m; if (b.vy > 0) b.vy = -b.vy * C.bounce; }
}
