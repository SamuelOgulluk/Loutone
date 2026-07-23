import { makeSynthVoice } from '../registry'
import { registerSampleInstrument } from '../sampleInstrument'

registerSampleInstrument({
  id: 'pads',
  name: 'Pads',
  category: 'pads',
  voice: { gain: 0.55, attack: 0.25, release: 0.7, filterFreq: 2200 },
  fallback: (ctx, dest, pitch, vel, when, dur) => {
    const a = makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'sawtooth',
      filterFreq: 900,
      a: 0.35,
      d: 0.4,
      s: 0.8,
      r: 0.8,
      gain: 0.45,
    })
    makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'triangle',
      detune: -8,
      filterFreq: 700,
      a: 0.4,
      d: 0.4,
      s: 0.75,
      r: 0.9,
      gain: 0.4,
    })
    return a
  },
})

registerSampleInstrument({
  id: 'pads-warm',
  name: 'Pad warm',
  category: 'pads',
  voice: { gain: 0.6, attack: 0.4, release: 0.9, filterFreq: 1600 },
  fallback: (ctx, dest, pitch, vel, when, dur) =>
    makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'triangle',
      filterFreq: 1100,
      a: 0.5,
      d: 0.5,
      s: 0.9,
      r: 1.1,
      gain: 0.5,
    }),
})

registerSampleInstrument({
  id: 'pads-bright',
  name: 'Pad bright',
  category: 'pads',
  voice: { gain: 0.55, attack: 0.2, release: 0.65, filterFreq: 4800 },
  fallback: (ctx, dest, pitch, vel, when, dur) => {
    const a = makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'sawtooth',
      filterFreq: 2200,
      a: 0.25,
      d: 0.35,
      s: 0.7,
      r: 0.7,
      gain: 0.35,
    })
    makeSynthVoice(ctx, dest, pitch + 7, vel * 0.35, when, dur, {
      type: 'sine',
      detune: 5,
      filterFreq: 2800,
      a: 0.3,
      d: 0.35,
      s: 0.65,
      r: 0.75,
      gain: 0.25,
    })
    return a
  },
})
