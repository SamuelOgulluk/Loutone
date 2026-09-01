import { makeSynthVoice } from '../registry'
import { registerSampleInstrument } from '../sampleInstrument'

registerSampleInstrument({
  id: 'bass',
  name: 'Basse',
  category: 'bass',
  voice: (pitch) => ({
    gain: 0.9,
    attack: 0.005,
    release: 0.16,
    filterFreq: 780 + (pitch - 28) * 22,
    filterQ: 0.5,
    loop: true,
  }),
  fallback: (ctx, dest, pitch, vel, when, dur) =>
    makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'triangle',
      filterFreq: 360 + (pitch - 36) * 6,
      filterQ: 1.2,
      a: 0.01,
      d: 0.14,
      s: 0.75,
      r: 0.12,
      gain: 1.05,
    }),
})

registerSampleInstrument({
  id: 'bass-sub',
  name: 'Basse sub',
  category: 'bass',
  voice: { gain: 1.12, attack: 0.02, release: 0.18, filterFreq: 900 },
  fallback: (ctx, dest, pitch, vel, when, dur) =>
    makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'sine',
      filterFreq: 280,
      a: 0.02,
      d: 0.15,
      s: 0.85,
      r: 0.12,
      gain: 1.4,
    }),
})

registerSampleInstrument({
  id: 'bass-pluck',
  name: 'Basse pluck',
  category: 'bass',
  voice: (pitch) => ({
    gain: 1,
    attack: 0.002,
    release: 0.12,
    filterFreq: 2800 + (pitch - 36) * 16,
    filterQ: 1.1,
  }),
  fallback: (ctx, dest, pitch, vel, when, dur) =>
    makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'triangle',
      filterFreq: 900 + (pitch - 36) * 10,
      filterQ: 3,
      a: 0.003,
      d: 0.1,
      s: 0.25,
      r: 0.1,
      gain: 1.1,
    }),
})
