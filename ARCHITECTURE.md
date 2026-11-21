# Architecture
- `server/index.mjs`: authoritative 30 Hz tag server (Nova). Rounds, tagging, frogspawn pickup (`collectOrbs`), snapshots at 15 Hz (per-player row: id,x,y,a,it,ack,score,vx,vy,dashCd,boost,boostCd,skin,fs). Accepts `i` (input) and `k` (colour) messages.
- `shared/sim.mjs`: constants `C`, `makeWorld` (obstacles, pads, frogspawn orbs), `stepBody` physics used by server and client prediction.
- `shared/skins.mjs`: tadpole colour list and prices (index = skin id sent to server).
- `main.js`: client entry. Connection, snapshot handling, prediction, camera, HUD, wires menu/sfx/render.
- `menu.js`: main menu, frog shop, frogspawn wallet (localStorage key `tadpole-tag:progress`).
- `render.js`: canvas drawing (pond, pads, rocks/reeds, orbs, tadpoles, fx, +1 pops).
- `sfx.js`: sounds via Star audio SDK.
- `index.html`: HUD, dash gauge, menu overlay markup.
