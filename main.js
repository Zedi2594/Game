// Client entry: connection, local prediction, input, camera and HUD.
import { createInput } from '/star-sdk/v1/input.js';
import { createConnection } from './star-server-client.mjs';
import { C, TICK, WORLD_W, WORLD_H, makeWorld, stepBody } from './shared/sim.mjs';
import { skinColor } from './shared/skins.mjs';
import { drawWorld, drawPads, drawObstacles, drawOrbs, drawTadpole, drawFx, drawPops } from './render.js';
import { createSfx } from './sfx.js';
import { createMenu } from './menu.js';

const canvas = document.getElementById('stage');
const g = canvas.getContext('2d');
const el = {
  status: document.getElementById('status'),
  retry: document.getElementById('retry-btn'),
  invite: document.getElementById('invite-btn'),
  inviteLink: document.getElementById('invite-link'),
  round: document.getElementById('round'),
  board: document.getElementById('board'),
  banner: document.getElementById('banner'),
  dashText: document.getElementById('dash-text'),
  dashFill: document.getElementById('dash-fill'),
};

const input = createInput({
  actions: {
    swim: { type: 'button', keys: ['KeyW', 'ArrowUp'], touch: 'button' },
    dash: { type: 'button', keys: ['Space'], touch: 'button' },
  },
});

const sfx = createSfx();

const net = {
  session: null,
  status: { state: 'connecting' },
  ready: false,
  myId: null,
  seed: null,
  world: null,
  local: null,        // predicted body for my tadpole
  prev: null,         // previous fixed-step position, for smooth rendering
  pending: [],        // inputs sent but not yet acknowledged
  seq: 0,
  info: new Map(),    // id -> { name, it, score }
  others: new Map(),  // id -> display + target state
  round: { st: 'waiting', tl: 0, ii: 0 },
  taken: new Set(),   // indices of frog spawn coins already collected this round
  fsLast: 0,          // my frogspawn count this round as of the last snapshot (credited to the wallet)
  pops: [],           // "+1" popups where frogspawn was collected
  fx: [],
  aim: 0,
  mouse: null,        // last pointer position in CSS px
  dashQueued: false,
  view: { scale: 1, camX: 0, camY: 0 },
};

const menu = createMenu({ onEquip: () => sendSkin() });

function sendSkin() {
  if (net.status.state !== 'connected') return;
  try {
    connection.send(JSON.stringify({ t: 'k', c: menu.equipped() }));
  } catch { /* the colour is sent again on the next join */ }
}

const connection = createConnection({
  onConnect(session) {
    net.session = session;
    renderHud();
  },
  onStatus(status) {
    net.status = status;
    if (status.state !== 'connected') {
      net.ready = false;
      net.local = null;
      net.pending = [];
    }
    renderHud();
  },
  onMessage(event) {
    let m;
    try { m = JSON.parse(event.data); } catch { return; }
    handle(m);
  },
});

function handle(m) {
  if (m.t === 'w') {
    net.myId = m.id;
    net.seed = null;
    net.world = null;
    net.local = null;
    net.ready = false;
    net.seq = 0;
    net.pending = [];
    net.info = new Map(m.roster.map(([id, name]) => [id, { name, it: false, score: 0, skin: 0 }]));
    net.others.clear();
    net.fsLast = 0;
    sendSkin();
  } else if (m.t === 'j') {
    if (m.id !== net.myId) net.info.set(m.id, { name: m.name, it: false, score: 0, skin: 0 });
  } else if (m.t === 'l') {
    net.info.delete(m.id);
    net.others.delete(m.id);
  } else if (m.t === 's') {
    onSnapshot(m);
  }
}

function onSnapshot(m) {
  if (m.sd !== net.seed) {
    net.seed = m.sd;
    net.world = makeWorld(m.sd);
    net.fsLast = 0; // a new round starts with no frogspawn collected
  }
  const wasPlaying = net.round.st === 'playing';
  net.round = { st: m.st, tl: m.tl, ii: m.ii };
  const takenBefore = net.taken.size;
  const prevTaken = net.taken;
  net.taken = new Set(m.oc);
  if (wasPlaying && net.taken.size > takenBefore) {
    sfx.coin();
    for (const i of net.taken) {
      const orb = net.world?.orbs[i];
      if (orb && !prevTaken.has(i)) net.pops.push({ x: orb.x, y: orb.y, age: 0 });
    }
  }
  for (const [x, y] of m.tg) net.fx.push({ x, y, age: 0 });
  let gotTagged = false;
  for (const e of m.p) {
    const [id, x, y, a, it, ack, score, vx, vy, dashCd, boost, boostCd, skin, fs] = e;
    let info = net.info.get(id);
    if (!info) {
      info = { name: `Tadpole${id}`, it: false, score: 0, skin: 0 };
      net.info.set(id, info);
    }
    if (id === net.myId && it === 1 && !info.it && wasPlaying) gotTagged = true;
    info.it = it === 1;
    info.score = score;
    info.skin = skin;
    if (id === net.myId) {
      reconcile({ x, y, a, ack, vx, vy, dashCd, boost, boostCd });
      // Frogspawn counts up within a round; bank whatever is new since the last snapshot.
      if (fs > net.fsLast) menu.credit(fs - net.fsLast);
      net.fsLast = fs;
    } else {
      let o = net.others.get(id);
      if (!o) {
        o = { x, y, dx: x, dy: y, a, vx, vy, boost, dashCd };
        net.others.set(id, o);
      }
      // A dash resets the cooldown to its maximum, so a rise in dashCd means someone dashed.
      if (dashCd > o.dashCd + 0.05) sfx.dash(0.5);
      o.dashCd = dashCd;
      Object.assign(o, { tx: x, ty: y, a, vx, vy, boost, skin });
    }
  }
  if (gotTagged) sfx.tagged();
  else if (m.tg.length && wasPlaying) sfx.splash(0.5);
}

// Authority says where my tadpole was at `ack`; replay the inputs it has not used yet.
function reconcile(s) {
  if (!net.world) return;
  net.pending = net.pending.filter((p) => p.seq > s.ack);
  const b = { x: s.x, y: s.y, vx: s.vx, vy: s.vy, a: s.a, dashCd: s.dashCd, boost: s.boost, boostCd: s.boostCd };
  for (const p of net.pending) stepBody(b, p.inp, TICK, net.world);
  net.local = b;
  net.prev = { x: b.x, y: b.y };
  net.ready = true;
}

function predictStep() {
  const b = net.local;
  const playing = !menu.isOpen();
  const inp = { aim: net.aim, swim: playing && input.held('swim'), dash: false };
  if (net.dashQueued && playing) {
    inp.dash = true;
    net.dashQueued = false;
    if (b.dashCd <= 0) sfx.dash(1);
  }
  net.seq += 1;
  net.pending.push({ seq: net.seq, inp });
  if (net.pending.length > 90) net.pending.shift();
  connection.send(JSON.stringify({
    t: 'i', seq: net.seq, aim: Math.round(inp.aim * 1000) / 1000, swim: inp.swim, dash: inp.dash,
  }));
  net.prev = { x: b.x, y: b.y };
  stepBody(b, inp, TICK, net.world);
}

function viewScale() {
  return Math.min(Math.max(Math.min(innerWidth / 1000, innerHeight / 640), 0.6), 1.4);
}

function updateCamera(focus) {
  const scale = viewScale();
  const vw = innerWidth / scale;
  const vh = innerHeight / scale;
  let camX = focus.x - vw / 2;
  let camY = focus.y - vh / 2;
  camX = vw >= WORLD_W ? (WORLD_W - vw) / 2 : Math.min(Math.max(camX, 0), WORLD_W - vw);
  camY = vh >= WORLD_H ? (WORLD_H - vh) / 2 : Math.min(Math.max(camY, 0), WORLD_H - vh);
  net.view = { scale, camX, camY };
}

function updateAim() {
  if (!net.local || !net.mouse) return;
  const { scale, camX, camY } = net.view;
  const wx = net.mouse.x / scale + camX;
  const wy = net.mouse.y / scale + camY;
  const dx = wx - net.local.x;
  const dy = wy - net.local.y;
  if (Math.hypot(dx, dy) > 6) net.aim = Math.atan2(dy, dx);
}

function draw(t) {
  const dpr = window.devicePixelRatio || 1;
  const W = innerWidth;
  const H = innerHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const focus = net.local ? renderPos() : { x: WORLD_W / 2, y: WORLD_H / 2 };
  updateCamera(focus);
  const { scale, camX, camY } = net.view;
  g.setTransform(dpr * scale, 0, 0, dpr * scale, -camX * dpr * scale, -camY * dpr * scale);
  g.clearRect(camX, camY, W / scale, H / scale);

  if (net.world) {
    drawWorld(g, t);
    drawPads(g, net.world.pads, t);
    drawObstacles(g, net.world.obstacles);
    drawOrbs(g, net.world.orbs, net.taken, t);
  } else {
    g.fillStyle = '#0e4f5c';
    g.fillRect(0, 0, WORLD_W, WORLD_H);
  }
  drawFx(g, net.fx);
  drawPops(g, net.pops);

  for (const [id, o] of net.others) {
    const info = net.info.get(id);
    drawTadpole(g, { x: o.dx, y: o.dy, a: o.a, vx: o.vx, vy: o.vy, boost: o.boost }, t, {
      id, color: skinColor(o.skin), it: !!info?.it, name: info?.name, scale,
    });
  }
  if (net.local) {
    const p = renderPos();
    const mine = net.info.get(net.myId);
    drawTadpole(g, { x: p.x, y: p.y, a: net.local.a, vx: net.local.vx, vy: net.local.vy, boost: net.local.boost }, t, {
      id: net.myId ?? 0, color: skinColor(menu.equipped()), it: !!mine?.it, local: true, name: mine?.name, scale,
    });
  }
}

function renderPos() {
  if (!net.local) return { x: WORLD_W / 2, y: WORLD_H / 2 };
  const alpha = Math.min(1, acc / TICK);
  const p = net.prev || net.local;
  return { x: p.x + (net.local.x - p.x) * alpha, y: p.y + (net.local.y - p.y) * alpha };
}

let acc = 0;
let last = performance.now();
let t = 0;
let lastHud = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  t += dt;
  const playing = !menu.isOpen();
  if (input.justPressed('dash') && playing) net.dashQueued = true;
  const swimming = !!(playing && net.local && net.ready && net.world && input.held('swim'));
  sfx.swim(dt, swimming);
  if (net.local && net.ready && net.world) {
    acc += dt;
    while (acc >= TICK) {
      acc -= TICK;
      predictStep();
    }
    updateAim();
  }
  for (const o of net.others.values()) {
    if (o.tx === undefined) continue;
    const k = 1 - Math.exp(-dt * 14);
    o.dx += (o.tx - o.dx) * k;
    o.dy += (o.ty - o.dy) * k;
  }
  for (const f of net.fx) f.age += dt;
  net.fx = net.fx.filter((f) => f.age < 0.6);
  for (const p of net.pops) p.age += dt;
  net.pops = net.pops.filter((p) => p.age < 0.8);
  draw(t);
  renderDash();
  if (now - lastHud > 200) {
    renderHud();
    lastHud = now;
  }
  requestAnimationFrame(frame);
}

function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function statusText() {
  const st = net.status;
  switch (st.state) {
    case 'connecting': return 'Connecting to the pond…';
    case 'reconnecting': return 'Reconnecting…';
    case 'offline': return 'Offline. Waiting for the network…';
    case 'replaced': return 'This tadpole was taken over by another tab.';
    case 'reload-required': return 'The game was updated. Reload to rejoin.';
    case 'error': return st.error?.message || 'Could not join the pond.';
    case 'closed': return 'Disconnected from the pond.';
    default: {
      if (!net.ready) return 'Joining the pond…';
      const code = net.session?.roomCode;
      return `Room ${code || '—'} · ${net.info.size} tadpole${net.info.size === 1 ? '' : 's'}`;
    }
  }
}

// Dash cooldown gauge: fills while recharging, green with "Ready" when a dash is available.
let dashShown = '';
function renderDash() {
  const cd = net.local ? Math.max(0, net.local.dashCd) : 0;
  const ready = cd <= 0;
  const text = ready ? 'Ready' : `${cd.toFixed(1)}s`;
  const key = ready ? 'ready' : text;
  if (key === dashShown) return;
  dashShown = key;
  el.dashText.textContent = text;
  el.dashText.classList.toggle('text-emerald-200', ready);
  el.dashText.classList.toggle('text-white/70', !ready);
  el.dashFill.style.width = `${ready ? 100 : (1 - cd / C.dashCooldown) * 100}%`;
  el.dashFill.classList.toggle('bg-emerald-400', ready);
  el.dashFill.classList.toggle('bg-slate-400', !ready);
}

function renderHud() {
  el.status.textContent = statusText();
  const st = net.status.state;
  el.retry.classList.toggle('hidden', !['error', 'replaced', 'closed'].includes(st));
  el.invite.classList.toggle('hidden', !net.session?.inviteUrl);

  const itEntry = [...net.info.values()].find((p) => p.it);
  if (net.round.st === 'playing') {
    const who = itEntry ? itEntry.name : 'Nobody';
    el.round.textContent = `${who} is IT · ${fmtTime(net.round.tl)} left`;
  } else if (net.round.st === 'results') {
    el.round.textContent = `Round over · next in ${Math.ceil(net.round.ii)}s`;
  } else {
    el.round.textContent = 'Waiting for another tadpole. Swim around or invite a friend!';
  }

  const mine = net.info.get(net.myId);
  if (menu.isOpen()) {
    el.banner.classList.add('hidden');
  } else if (net.round.st === 'results') {
    const ranked = [...net.info.values()].sort((a, b) => b.score - a.score);
    const top = ranked[0];
    el.banner.classList.remove('hidden');
    el.banner.innerHTML = '';
    const h = document.createElement('div');
    h.className = 'text-3xl font-black text-amber-300 drop-shadow';
    h.textContent = top ? `${top.name} wins!` : 'Round over';
    const sub = document.createElement('div');
    sub.className = 'mt-1 text-sm font-semibold text-white/90';
    sub.textContent = top ? `${Math.round(top.score)} points` : '';
    el.banner.append(h, sub);
  } else if (mine?.it && net.round.st === 'playing') {
    el.banner.classList.remove('hidden');
    el.banner.innerHTML = '';
    const h = document.createElement('div');
    h.className = 'text-2xl font-black text-rose-300 drop-shadow';
    h.textContent = "You're IT! Tag a tadpole";
    el.banner.append(h);
  } else {
    el.banner.classList.add('hidden');
  }

  const ranked = [...net.info.entries()].sort((a, b) => b[1].score - a[1].score);
  el.board.innerHTML = '';
  for (const [id, p] of ranked) {
    const li = document.createElement('li');
    li.className = `flex justify-between gap-2 text-xs ${id === net.myId ? 'font-bold text-emerald-200' : 'text-white/85'}`;
    const name = document.createElement('span');
    name.className = 'truncate';
    name.textContent = `${p.it ? '● ' : ''}${p.name}`;
    const score = document.createElement('span');
    score.textContent = String(Math.round(p.score));
    li.append(name, score);
    el.board.append(li);
  }
}

el.invite.addEventListener('click', async () => {
  const url = net.session?.inviteUrl;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    el.invite.textContent = 'Link copied!';
    el.inviteLink.classList.add('hidden');
  } catch {
    el.inviteLink.value = url;
    el.inviteLink.classList.remove('hidden');
    el.inviteLink.select();
  }
});

el.retry.addEventListener('click', () => connection.retry());

function setMouse(e) {
  net.mouse = { x: e.clientX, y: e.clientY };
}
window.addEventListener('pointermove', setMouse);
canvas.addEventListener('pointerdown', (e) => {
  setMouse(e);
  net.dashQueued = true;
});

requestAnimationFrame(frame);
renderHud();
