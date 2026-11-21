// Canvas drawing for the pond, obstacles, booster pads and tadpoles (world coordinates).
import { WORLD_W, WORLD_H } from './shared/sim.mjs';

const TAU = Math.PI * 2;
const COLORS = {
  water: '#0e4f5c', rock: '#5d5246', rockHi: '#8a7b6a', rockShadow: '#2b2a2b',
  reed: '#2f7d45', reedTip: '#7fd683', pad: '#1f8f8a', padEdge: '#7ffff0', chevron: '#d7fff7',
};

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function drawWorld(g, t) {
  g.fillStyle = COLORS.water;
  g.fillRect(0, 0, WORLD_W, WORLD_H);
  for (let i = 0; i < 70; i++) {
    const x = hash(i * 3 + 1) * WORLD_W;
    const y = hash(i * 3 + 2) * WORLD_H;
    const r = 80 + hash(i * 3 + 3) * 160;
    g.fillStyle = i % 2 ? 'rgba(0,20,25,0.18)' : 'rgba(120,255,230,0.06)';
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  g.strokeStyle = 'rgba(180,255,240,0.10)';
  g.lineWidth = 3;
  for (let i = 0; i < 40; i++) {
    const x = hash(i + 100) * WORLD_W + Math.sin(t * 0.6 + i) * 30;
    const y = hash(i + 200) * WORLD_H;
    g.beginPath();
    g.arc(x, y, 30 + hash(i) * 40, 0.2, 1.4);
    g.stroke();
  }
  g.fillStyle = 'rgba(70,170,90,0.35)';
  for (let i = 0; i < 45; i++) {
    const x = hash(i * 5 + 7) * WORLD_W;
    const y = hash(i * 5 + 8) * WORLD_H;
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, 18 + hash(i) * 10, 0.3, TAU - 0.3);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = '#c8f5e6';
  g.lineWidth = 10;
  g.strokeRect(0, 0, WORLD_W, WORLD_H);
}

export function drawPads(g, pads, t) {
  for (const pad of pads) {
    g.save();
    g.translate(pad.x, pad.y);
    g.rotate(pad.dir);
    g.fillStyle = COLORS.pad;
    g.strokeStyle = COLORS.padEdge;
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(-pad.len, -pad.wid, pad.len * 2, pad.wid * 2, 12);
    g.fill();
    g.stroke();
    g.fillStyle = COLORS.chevron;
    const off = (t * 120) % 40;
    for (let x = -pad.len + off - 20; x < pad.len - 14; x += 40) {
      if (x < -pad.len + 8) continue;
      g.globalAlpha = 0.85;
      g.beginPath();
      g.moveTo(x, -13);
      g.lineTo(x + 14, 0);
      g.lineTo(x, 13);
      g.lineTo(x + 6, 0);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
    g.restore();
  }
}

export function drawObstacles(g, obstacles) {
  for (const o of obstacles) {
    if (o.kind === 'rock') {
      g.fillStyle = COLORS.rockShadow;
      g.beginPath();
      g.arc(o.x + 5, o.y + 7, o.r, 0, TAU);
      g.fill();
      g.fillStyle = COLORS.rock;
      g.beginPath();
      g.arc(o.x, o.y, o.r, 0, TAU);
      g.fill();
      g.fillStyle = COLORS.rockHi;
      g.beginPath();
      g.arc(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.45, 0, TAU);
      g.fill();
    } else {
      g.fillStyle = 'rgba(15,50,25,0.55)';
      g.beginPath();
      g.arc(o.x, o.y, o.r + 6, 0, TAU);
      g.fill();
      g.lineCap = 'round';
      g.strokeStyle = COLORS.reed;
      g.lineWidth = 5;
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * TAU + hash(o.x + k) * 0.5;
        const r1 = o.r * (0.7 + hash(o.y + k) * 0.3);
        const x1 = o.x + Math.cos(a) * r1;
        const y1 = o.y + Math.sin(a) * r1;
        g.beginPath();
        g.moveTo(o.x + Math.cos(a) * o.r * 0.2, o.y + Math.sin(a) * o.r * 0.2);
        g.lineTo(x1, y1);
        g.stroke();
        g.fillStyle = COLORS.reedTip;
        g.beginPath();
        g.arc(x1, y1, 3.5, 0, TAU);
        g.fill();
      }
    }
  }
}

// b: { x, y, a, vx, vy, boost }. opts: { id, color, it, local, name, scale }.
export function drawTadpole(g, b, t, opts) {
  const speed = Math.hypot(b.vx || 0, b.vy || 0);
  const wig = Math.sin(t * 14 + opts.id * 1.7) * (2.5 + Math.min(7, speed / 110));
  g.save();
  g.translate(b.x, b.y);
  if (opts.it) {
    g.fillStyle = 'rgba(255,94,77,0.30)';
    g.beginPath();
    g.arc(0, 0, 30, 0, TAU);
    g.fill();
  }
  g.rotate(b.a || 0);
  if (b.boost > 0) {
    g.strokeStyle = 'rgba(210,255,250,0.7)';
    g.lineWidth = 2.5;
    g.lineCap = 'round';
    for (const yy of [-7, 0, 7]) {
      g.beginPath();
      g.moveTo(-26, yy * 1.6);
      g.lineTo(-60 - Math.random() * 14, yy * 1.6);
      g.stroke();
    }
  }
  g.strokeStyle = opts.color;
  g.lineCap = 'round';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(-9, 0);
  g.quadraticCurveTo(-26, wig, -44, -wig * 0.6);
  g.stroke();
  g.fillStyle = opts.color;
  g.beginPath();
  g.ellipse(0, 0, 15, 11.5, 0, 0, TAU);
  g.fill();
  if (opts.local) {
    g.lineWidth = 2.5;
    g.strokeStyle = '#ffffff';
    g.stroke();
  }
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(7, -4.5, 3.6, 0, TAU);
  g.arc(7, 4.5, 3.6, 0, TAU);
  g.fill();
  g.fillStyle = '#111';
  g.beginPath();
  g.arc(8.2, -4.5, 1.8, 0, TAU);
  g.arc(8.2, 4.5, 1.8, 0, TAU);
  g.fill();
  g.restore();

  if (opts.name) {
    const s = opts.scale || 1;
    g.save();
    g.font = `bold ${Math.round(12 / s)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.lineWidth = 3 / s;
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.fillStyle = opts.it ? '#ffb3a8' : '#eafff6';
    const label = opts.it ? `IT · ${opts.name}` : opts.name;
    g.strokeText(label, b.x, b.y - 28);
    g.fillText(label, b.x, b.y - 28);
    g.restore();
  }
}

// Frog spawn coins: jelly beads with a dark centre. `taken` is a Set of collected orb indices.
export function drawOrbs(g, orbs, taken, t) {
  for (let i = 0; i < orbs.length; i++) {
    if (taken.has(i)) continue;
    const o = orbs[i];
    const bob = Math.sin(t * 2.4 + o.phase) * 1.5;
    const x = o.x;
    const y = o.y + bob;
    g.fillStyle = 'rgba(190,255,200,0.28)';
    g.beginPath();
    g.arc(x, y, 9.5, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(225,255,220,0.82)';
    g.beginPath();
    g.arc(x, y, 6.5, 0, TAU);
    g.fill();
    g.fillStyle = '#1d4a2c';
    g.beginPath();
    g.arc(x + 0.5, y + 0.5, 2.4, 0, TAU);
    g.fill();
  }
}

// Floating "+1" text where frogspawn was collected. pops: [{ x, y, age }].
export function drawPops(g, pops) {
  g.save();
  g.font = 'bold 14px system-ui, sans-serif';
  g.textAlign = 'center';
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.fillStyle = '#d8ffb0';
  for (const p of pops) {
    const k = p.age / 0.8;
    g.globalAlpha = Math.max(0, 1 - k);
    g.strokeText('+1', p.x, p.y - 14 - k * 30);
    g.fillText('+1', p.x, p.y - 14 - k * 30);
  }
  g.restore();
}

export function drawFx(g, fx) {
  for (const f of fx) {
    const k = f.age / 0.6;
    g.strokeStyle = `rgba(255,120,90,${(1 - k).toFixed(3)})`;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(f.x, f.y, 12 + k * 60, 0, TAU);
    g.stroke();
  }
}
