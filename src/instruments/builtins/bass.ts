import { makeSynthVoice } from '../registry'
import { registerSampleInstrument } from '../sampleInstrument'

registerSampleInstrument({
  id: 'bass',
  name: 'Basse',
  category: 'bass',
  voice: (pitch) => ({
    gain: 1.05,
    attack: 0.008,
    release: 0.1,
    filterFreq: 900 + (pitch - 36) * 10,
    filterQ: 1.2,
  }),
  fallback: (ctx, dest, pitch, vel, when, dur) =>
    makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'sawtooth',
      filterFreq: 420 + (pitch - 36) * 8,
      filterQ: 2.5,
      a: 0.01,
      d: 0.12,
      s: 0.7,
      r: 0.08,
      gain: 1.2,
    }),
})

registerSampleInstrument({
  id: 'bass-sub',
  name: 'Basse sub',
  category: 'bass',
  voice: { gain: 1.15, attack: 0.02, release: 0.14, filterFreq: 400 },
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
    filterFreq: 1400 + (pitch - 36) * 12,
    filterQ: 2,
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
