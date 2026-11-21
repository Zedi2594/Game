// Authoritative tadpole tag server. Runs a 30 Hz simulation and broadcasts snapshots at 15 Hz.
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { TICK, C, makeWorld, findSpawn, newBody, stepBody } from '../shared/sim.mjs';
import { SKIN_COUNT } from '../shared/skins.mjs';

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const ROUND_SECONDS = 90;
const RESULTS_SECONDS = 7;
const MAX_QUEUE = 6;

let world = makeWorld(randomSeed());
let nextId = 1;
let tickCount = 0;
let fxEvents = [];
const players = new Map();
const round = { state: 'waiting', timeLeft: ROUND_SECONDS, intermission: 0 };

function randomSeed() {
  return (Math.random() * 0x7fffffff) | 0;
}

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

function nameFrom(headers, id) {
  let raw = headers['x-star-player-name'] || '';
  try { raw = decodeURIComponent(raw); } catch { raw = ''; }
  const clean = String(raw).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 18);
  return clean || `Tadpole${id}`;
}

function spawnBody() {
  const s = findSpawn(world);
  return newBody(s.x, s.y);
}

function broadcast(obj, except = null) {
  const s = JSON.stringify(obj);
  for (const p of players.values()) {
    if (p !== except && p.ws.readyState === 1) p.ws.send(s);
  }
}

function onJoin(ws, req) {
  const id = nextId++;
  const p = {
    id, ws, name: nameFrom(req.headers, id), body: spawnBody(),
    queue: [], ack: 0, lastSeq: 0, last: { aim: 0, swim: false },
    it: false, immune: 0, score: 0, skin: 0, fs: 0,
  };
  const roster = [[p.id, p.name], ...[...players.values()].map((q) => [q.id, q.name])];
  players.set(id, p);
  if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'w', id, seed: world.seed, roster }));
  broadcast({ t: 'j', id, name: p.name }, p);
  ws.on('message', (raw) => onInput(p, raw));
  ws.on('close', () => onLeave(p));
  ws.on('error', () => {});
  if (round.state === 'waiting' && players.size >= 2) startRound();
}

function onLeave(p) {
  if (!players.delete(p.id)) return;
  broadcast({ t: 'l', id: p.id });
  if (p.it && round.state === 'playing' && players.size) {
    const list = [...players.values()];
    const next = list[(Math.random() * list.length) | 0];
    next.it = true;
    next.immune = 0;
    p.it = false;
  }
  if (round.state === 'playing' && players.size < 2) endRound();
}

function onInput(p, raw) {
  let m;
  try { m = JSON.parse(String(raw)); } catch { return; }
  if (m && m.t === 'k') {
    // Cosmetic colour choice; shown to other players.
    const c = Number(m.c);
    if (Number.isInteger(c) && c >= 0 && c < SKIN_COUNT) p.skin = c;
    return;
  }
  if (!m || m.t !== 'i') return;
  const seq = Number(m.seq);
  if (!Number.isInteger(seq) || seq <= p.lastSeq) return;
  p.lastSeq = seq;
  const aim = Number.isFinite(m.aim) ? m.aim : p.last.aim;
  p.queue.push({ seq, aim, swim: m.swim === true, dash: m.dash === true });
  if (p.queue.length > MAX_QUEUE) {
    const dropped = p.queue.splice(0, p.queue.length - MAX_QUEUE);
    if (dropped.some((d) => d.dash)) p.queue[0].dash = true;
  }
}

function startRound() {
  world = makeWorld(randomSeed());
  round.state = 'playing';
  round.timeLeft = ROUND_SECONDS;
  round.intermission = 0;
  fxEvents = [];
  const list = [...players.values()];
  const itPlayer = list[(Math.random() * list.length) | 0];
  for (const p of list) {
    p.body = spawnBody();
    p.it = p === itPlayer;
    p.immune = 0;
    p.score = 0;
    p.fs = 0;
  }
}

function endRound() {
  round.state = 'results';
  round.intermission = RESULTS_SECONDS;
  round.timeLeft = 0;
  for (const p of players.values()) p.it = false;
}

// Any tadpole swimming over a frog spawn orb collects it as a coin. Orbs reset with each round's world.
function collectOrbs() {
  const reach = C.radius + C.orbRadius + 6;
  for (let i = 0; i < world.orbs.length; i++) {
    const o = world.orbs[i];
    if (o.taken) continue;
    for (const p of players.values()) {
      if (Math.hypot(p.body.x - o.x, p.body.y - o.y) < reach) {
        o.taken = true;
        p.fs += 1;
        p.score += C.orbPoints;
        break;
      }
    }
  }
}

function updateRound(dt) {
  round.timeLeft -= dt;
  for (const p of players.values()) {
    if (p.immune > 0) p.immune -= dt;
    if (!p.it) p.score += dt;
  }
  collectOrbs();
  let it = [...players.values()].find((p) => p.it);
  if (!it) {
    const list = [...players.values()];
    it = list[(Math.random() * list.length) | 0];
    it.it = true;
  }
  if (it.immune <= 0) {
    for (const p of players.values()) {
      if (p === it) continue;
      if (Math.hypot(p.body.x - it.body.x, p.body.y - it.body.y) < C.tagRadius) {
        fxEvents.push([r1((p.body.x + it.body.x) / 2), r1((p.body.y + it.body.y) / 2)]);
        it.it = false;
        it.score += C.tagPoints;
        p.it = true;
        p.immune = C.tagImmune;
        break;
      }
    }
  }
  if (round.timeLeft <= 0 || players.size < 2) endRound();
}

function tick() {
  tickCount++;
  for (const p of players.values()) {
    let inp;
    if (p.queue.length) {
      inp = p.queue.shift();
      p.ack = inp.seq;
      p.last = inp;
    } else {
      inp = { aim: p.last.aim, swim: p.last.swim, dash: false };
    }
    stepBody(p.body, inp, TICK, world);
  }
  if (round.state === 'playing') {
    updateRound(TICK);
  } else if (round.state === 'results') {
    round.intermission -= TICK;
    if (round.intermission <= 0) {
      if (players.size >= 2) startRound();
      else round.state = 'waiting';
    }
  } else if (round.state === 'waiting' && players.size >= 2) {
    startRound();
  }
  if (tickCount % 2 === 0) broadcastSnapshot();
}

function broadcastSnapshot() {
  const snap = {
    t: 's',
    sd: world.seed,
    st: round.state,
    tl: r1(Math.max(0, round.timeLeft)),
    ii: r1(Math.max(0, round.intermission)),
    p: [...players.values()].map((p) => {
      const b = p.body;
      return [
        p.id, r1(b.x), r1(b.y), r2(b.a), p.it ? 1 : 0, p.ack, Math.round(p.score),
        r1(b.vx), r1(b.vy), r2(b.dashCd), r2(b.boost), r2(b.boostCd), p.skin, p.fs,
      ];
    }),
    tg: fxEvents,
    oc: world.orbs.flatMap((o, i) => (o.taken ? [i] : [])),
  };
  fxEvents = [];
  const s = JSON.stringify(snap);
  for (const p of players.values()) {
    if (p.ws.readyState === 1) p.ws.send(s);
  }
}

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });
httpServer.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://local').pathname !== '/socket') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});
wss.on('connection', onJoin);

httpServer.listen(PORT, HOST);
setInterval(tick, TICK * 1000);
process.on('SIGTERM', () => {
  httpServer.close();
  process.exit(0);
});
