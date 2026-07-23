import { makeSynthVoice } from '../registry'
import { registerSampleInstrument } from '../sampleInstrument'

registerSampleInstrument({
  id: 'strings',
  name: 'Cordes',
  category: 'strings',
  voice: { gain: 0.55, attack: 0.12, release: 0.45, filterFreq: 3200 },
  fallback: (ctx, dest, pitch, vel, when, dur) => {
    const a = makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'sawtooth',
      filterFreq: 1600,
      a: 0.2,
      d: 0.3,
      s: 0.85,
      r: 0.5,
      gain: 0.35,
    })
    makeSynthVoice(ctx, dest, pitch + 12, vel * 0.5, when, dur, {
      type: 'triangle',
      detune: 6,
      filterFreq: 2200,
      a: 0.25,
      d: 0.3,
      s: 0.7,
      r: 0.55,
      gain: 0.2,
    })
    return a
  },
})

registerSampleInstrument({
  id: 'strings-cello',
  name: 'Violoncelle',
  category: 'strings',
  voice: { gain: 0.7, attack: 0.1, release: 0.4, filterFreq: 2400 },
  fallback: (ctx, dest, pitch, vel, when, dur) =>
    makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'sawtooth',
      filterFreq: 900,
      filterQ: 1.2,
      a: 0.15,
      d: 0.25,
      s: 0.8,
      r: 0.4,
      gain: 0.5,
    }),
})
