import { makeSynthVoice } from '../registry'
import { registerSampleInstrument } from '../sampleInstrument'

registerSampleInstrument({
  id: 'lead',
  name: 'Lead',
  category: 'lead',
  voice: { gain: 0.72, attack: 0.015, release: 0.18, filterFreq: 6800, filterQ: 0.8, loop: true },
  fallback: (ctx, dest, pitch, vel, when, dur) =>
    makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'square',
      filterFreq: 2800,
      filterQ: 4,
      a: 0.02,
      d: 0.15,
      s: 0.55,
      r: 0.12,
      gain: 0.55,
    }),
})

registerSampleInstrument({
  id: 'lead-saw',
  name: 'Lead saw',
  category: 'lead',
  voice: { gain: 0.68, attack: 0.01, release: 0.16, filterFreq: 7200, filterQ: 0.7, loop: true },
  fallback: (ctx, dest, pitch, vel, when, dur) =>
    makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'sawtooth',
      filterFreq: 3600,
      filterQ: 2.5,
      a: 0.01,
      d: 0.12,
      s: 0.6,
      r: 0.1,
      gain: 0.5,
    }),
})

registerSampleInstrument({
  id: 'lead-pluck',
  name: 'Lead pluck',
  category: 'lead',
  voice: { gain: 0.78, attack: 0.002, release: 0.22, filterFreq: 7600, filterQ: 1.1 },
  fallback: (ctx, dest, pitch, vel, when, dur) =>
    makeSynthVoice(ctx, dest, pitch, vel, when, dur, {
      type: 'triangle',
      filterFreq: 4000,
      filterQ: 5,
      a: 0.002,
      d: 0.08,
      s: 0.15,
      r: 0.12,
      gain: 0.7,
    }),
})
