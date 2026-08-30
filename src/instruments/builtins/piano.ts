import { makeSynthVoice } from '../registry'
import { registerSampleInstrument } from '../sampleInstrument'
import { midiToFreq } from '@/midi/notes'

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
    gain: 0.92,
    attack: 0.003,
    release: 0.85,
    filterFreq: 7800,
    filterQ: 0.55,
  },
  fallback: (ctx, dest, pitch, vel, when, dur) => {
    const f = midiToFreq(pitch)
    const car = ctx.createOscillator()
    const mod = ctx.createOscillator()
    const modG = ctx.createGain()
    const out = ctx.createGain()
    car.type = 'sine'
    mod.type = 'sine'
    car.frequency.setValueAtTime(f, when)
    mod.frequency.setValueAtTime(f, when)
    const idx = (vel / 127) * f * 2.4
    modG.gain.setValueAtTime(idx, when)
    modG.gain.exponentialRampToValueAtTime(Math.max(1, idx * 0.12), when + 0.45)
    mod.connect(modG)
    modG.connect(car.frequency)
    const peak = (vel / 127) * 0.32
    out.gain.setValueAtTime(0.0001, when)
    out.gain.exponentialRampToValueAtTime(peak, when + 0.004)
    out.gain.exponentialRampToValueAtTime(peak * 0.38, when + 0.4)
    out.gain.setValueAtTime(peak * 0.38, when + dur)
    out.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.7)
    car.connect(out)
    out.connect(dest)
    car.start(when)
    mod.start(when)
    car.stop(when + dur + 0.75)
    mod.stop(when + dur + 0.75)
    return {
      stop: (t) => {
        try {
          car.stop(t ?? ctx.currentTime)
          mod.stop(t ?? ctx.currentTime)
        } catch { /* */ }
      },
    }
  },
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
