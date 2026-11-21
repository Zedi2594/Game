// Sound effects for dashing, swimming and tagging. Every sound goes through the Star audio SDK.
import createAudio from '/star-sdk/audio.js';

export function createSfx() {
  const audio = createAudio();
  audio.preload({
    // Dash: a quick train of rising water bubbles (sine blips) that reads as a gurgling jet.
    'sfx.dash': {
      waveform: 'sine',
      frequency: [220, 280, 360, 450, 560, 700, 860, 1000],
      duration: 0.34,
      volume: 0.4,
    },
    // Swim stroke: two soft low bubbles, like a paddle pushing water.
    'sfx.stroke': {
      waveform: 'sine',
      frequency: [180, 240, 210],
      duration: 0.16,
      volume: 0.26,
    },
    'sfx.splash': {
      waveform: 'triangle',
      frequency: [720, 520, 340, 200],
      duration: 0.34,
      volume: 0.45,
    },
    // Frog spawn coin: a bright two-note bloop.
    'sfx.coin': {
      waveform: 'sine',
      frequency: [880, 1320],
      duration: 0.12,
      volume: 0.35,
    },
    'sfx.tagged': {
      waveform: 'square',
      frequency: [180, 260, 420, 300],
      duration: 0.32,
      volume: 0.4,
    },
  });

  let strokeTimer = 0;
  return {
    dash(volume = 1) {
      audio.play('sfx.dash', { volume: 0.55 * volume });
    },
    // Call every frame with swimming = true while W is held; plays a stroke on a fixed interval.
    swim(dt, swimming) {
      if (!swimming) {
        strokeTimer = 0;
        return;
      }
      strokeTimer -= dt;
      if (strokeTimer <= 0) {
        audio.play('sfx.stroke', { volume: 0.6 });
        strokeTimer = 0.32;
      }
    },
    coin() {
      audio.play('sfx.coin', { volume: 0.5 });
    },
    tagged() {
      audio.play('sfx.tagged', { volume: 0.7 });
    },
    splash(volume = 0.5) {
      audio.play('sfx.splash', { volume });
    },
  };
}
