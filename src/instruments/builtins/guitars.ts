import { makeSynthVoice } from '../registry'
import { registerSampleInstrument } from '../sampleInstrument'

registerSampleInstrument({
  id: 'guitar-clean',
  name: 'Guitare clean',
  category: 'guitar',
  voice: (pitch) => ({
    gain: 0.85,
    attack: 0.006,
    release: 0.22,
    filterFreq: 4200 + pitch * 8,
  }),
  fallback: (ctx, dest, pitch, vel, when, dur) => {
    const a = makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'triangle',
      filterFreq: 2800 + pitch * 12,
      a: 0.008,
      d: 0.18,
      s: 0.45,
      r: 0.22,
      gain: 0.9,
    })
    makeSynthVoice(ctx, dest, pitch, vel * 0.35, when, dur, {
      type: 'sine',
      detune: 3,
      filterFreq: 1600,
      a: 0.01,
      d: 0.2,
      s: 0.35,
      r: 0.25,
      gain: 0.5,
    })
    return a
  },
})

registerSampleInstrument({
  id: 'guitar-crunch',
  name: 'Guitare crunch',
  category: 'guitar',
  voice: (pitch) => ({
    gain: 0.7,
    attack: 0.005,
    release: 0.16,
    filterFreq: 4800 + pitch * 8,
    filterQ: 1.1,
    drive: 0.22,
  }),
  fallback: (ctx, dest, pitch, vel, when, dur) => {
    const a = makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'sawtooth',
      filterFreq: 1800 + pitch * 8,
      filterQ: 2.2,
      a: 0.006,
      d: 0.14,
      s: 0.55,
      r: 0.16,
      gain: 0.7,
    })
    makeSynthVoice(ctx, dest, pitch, vel * 0.5, when, dur, {
      type: 'square',
      detune: -6,
      filterFreq: 1200,
      a: 0.008,
      d: 0.12,
      s: 0.4,
      r: 0.14,
      gain: 0.35,
    })
    return a
  },
})

registerSampleInstrument({
  id: 'guitar-lead',
  name: 'Guitare lead',
  category: 'guitar',
  voice: {
    gain: 0.65,
    attack: 0.015,
    release: 0.28,
    filterFreq: 5200,
    filterQ: 1.2,
    drive: 0.18,
  },
  fallback: (ctx, dest, pitch, vel, when, dur) =>
    makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'sawtooth',
      filterFreq: 3200,
      filterQ: 3.5,
      a: 0.02,
      d: 0.2,
      s: 0.65,
      r: 0.28,
      gain: 0.55,
    }),
})
