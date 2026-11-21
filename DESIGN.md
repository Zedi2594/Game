# Tadpole Tag Multiplayer
Concept: a multiplayer game of tag where you are a tadpole in a pond. One tadpole is IT; tag others to pass it on, and earn points for every second you are not IT.
Core mechanic: the tadpole always faces the mouse cursor. W swims forward, Click or Space dashes toward the cursor. Rocks and reed beds block the way, and green booster pads shoot you forward at super speed. Authoritative Node server (Nova), 2D canvas, flat pond art.

## Journal
- User asked for frogspawn collected by swimming over it, plus a main menu with a frog shop for coloured tadpoles. Frogspawn now banks into a persistent localStorage wallet (menu.js) from a per-round server count (snapshot field fs). Shop colours (shared/skins.mjs) are sent to the server (msg t:k) and shown on every tadpole. Pickup reach widened to 6px and a +1 popup added. Not yet played in browser.
- User asked for frog spawn orbs that act as coins and 5 points per tag. Added 40 orbs per round (shared/sim.mjs makeWorld), each worth 1 point, collected by swimming over them (server collectOrbs; snapshot field oc lists taken orbs). Tagger already got +5 per tag; now it reads C.tagPoints. Not yet played in browser.
- User asked for a 5s dash cooldown with an on-screen cooldown indicator. Set dashCooldown to 5.0 in shared/sim.mjs and added a bottom-right "Dash" gauge (shows Ready in green, or seconds left while recharging). Not yet played in browser.
- User asked for more watery swim/dash sounds (tag sound kept). Switched dash and stroke presets from sawtooth/sine tones to sine bubble trains; not yet heard by ear.
- Added sfx.js (Star audio SDK synth presets): dash sound for own and nearby tadpoles (dashCd jump in snapshots), swim stroke loop while W is held, splash on any tag, and a stronger sound when you become IT.
- Initial build: 90s rounds, 6s results, 8 players max, 1 point/sec survival, +5 for a tag. Client predicts own tadpole with server ack + input replay.
