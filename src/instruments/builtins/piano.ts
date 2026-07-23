import { makeSynthVoice } from '../registry'
import { registerSampleInstrument } from '../sampleInstrument'

registerSampleInstrument({
  id: 'piano',
  name: 'Piano',
  category: 'keys',
  voice: (pitch) => ({
    gain: 0.95,
    attack: 0.004,
    release: 0.35,
    filterFreq: 5200 + pitch * 12,
  }),
  fallback: (ctx, dest, pitch, vel, when, dur) => {
    const a = makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'triangle',
      filterFreq: 3200 + pitch * 20,
      a: 0.005,
      d: 0.25,
      s: 0.25,
      r: 0.35,
      gain: 1.1,
    })
    makeSynthVoice(ctx, dest, pitch, vel * 0.4, when, dur, {
      type: 'sine',
      detune: 4,
      filterFreq: 1800,
      a: 0.005,
      d: 0.3,
      s: 0.2,
      r: 0.4,
      gain: 0.6,
    })
    return a
  },
})

registerSampleInstrument({
  id: 'epiano',
  name: 'Piano électrique',
  category: 'keys',
  voice: {
    gain: 0.8,
    attack: 0.003,
    release: 0.45,
    filterFreq: 2800,
    filterQ: 1.4,
  },
  fallback: (ctx, dest, pitch, vel, when, dur) =>
    makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'sine',
      filterFreq: 2400 + pitch * 10,
      filterQ: 1.2,
      a: 0.004,
      d: 0.35,
      s: 0.15,
      r: 0.45,
      gain: 1,
    }),
})

registerSampleInstrument({
  id: 'organ',
  name: 'Orgue',
  category: 'keys',
  voice: { gain: 0.7, attack: 0.02, release: 0.08, filterFreq: 4000 },
  fallback: (ctx, dest, pitch, vel, when, dur) => {
    const a = makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'square',
      filterFreq: 2200,
      a: 0.02,
      d: 0.05,
      s: 0.9,
      r: 0.08,
      gain: 0.45,
    })
    makeSynthVoice(ctx, dest, pitch + 12, vel * 0.4, when, dur, {
      type: 'sine',
      filterFreq: 3000,
      a: 0.02,
      d: 0.05,
      s: 0.85,
      r: 0.08,
      gain: 0.3,
    })
    return a
  },
})
