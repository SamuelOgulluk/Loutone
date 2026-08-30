import { makeSynthVoice } from '../registry'
import { registerSampleInstrument } from '../sampleInstrument'

registerSampleInstrument({
  id: 'pads',
  name: 'Pads',
  category: 'pads',
  voice: { gain: 0.52, attack: 0.28, release: 1.1, filterFreq: 4200, loop: true },
  fallback: (ctx, dest, pitch, vel, when, dur) => {
    const a = makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'sawtooth',
      detune: -7,
      filterFreq: 1400,
      a: 0.4,
      d: 0.5,
      s: 0.85,
      r: 1.1,
      gain: 0.38,
    })
    makeSynthVoice(ctx, dest, pitch, vel * 0.7, when, dur, {
      type: 'triangle',
      detune: 9,
      filterFreq: 1800,
      a: 0.45,
      d: 0.5,
      s: 0.8,
      r: 1.2,
      gain: 0.32,
    })
    return a
  },
})

registerSampleInstrument({
  id: 'pads-warm',
  name: 'Pad warm',
  category: 'pads',
  voice: { gain: 0.48, attack: 0.42, release: 1.35, filterFreq: 4200, loop: true },
  fallback: (ctx, dest, pitch, vel, when, dur) =>
    makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'triangle',
      filterFreq: 1600,
      a: 0.55,
      d: 0.6,
      s: 0.9,
      r: 1.3,
      gain: 0.48,
    }),
})

registerSampleInstrument({
  id: 'pads-bright',
  name: 'Pad bright',
  category: 'pads',
  voice: { gain: 0.5, attack: 0.22, release: 0.95, filterFreq: 6200, loop: true },
  fallback: (ctx, dest, pitch, vel, when, dur) => {
    const a = makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'sawtooth',
      filterFreq: 2800,
      a: 0.28,
      d: 0.4,
      s: 0.75,
      r: 0.9,
      gain: 0.32,
    })
    makeSynthVoice(ctx, dest, pitch + 7, vel * 0.3, when, dur, {
      type: 'sine',
      detune: 5,
      filterFreq: 3600,
      a: 0.32,
      d: 0.4,
      s: 0.7,
      r: 0.95,
      gain: 0.22,
    })
    return a
  },
})
