import type { EffectParams, EffectType, TrackEffect } from '@/types/project'
import { uid } from '@/types/project'

export type AutomableParam = {
  name: string
  setNormalized: (value: number, when?: number) => void
  rampNormalized: (value: number, when: number) => void
  cancelFrom: (when: number) => void
}

export type EffectNodes = {
  input: AudioNode
  output: AudioNode
  update: (params: TrackEffect['params']) => void
  dispose: () => void
  automables: AutomableParam[]
}

function makeGainAutomable(name: string, gain: AudioParam, map: (v: number) => number): AutomableParam {
  return {
    name,
    setNormalized: (value, when) => {
      const mapped = map(value)
      if (typeof when === 'number') gain.setValueAtTime(mapped, when)
      else gain.value = mapped
    },
    rampNormalized: (value, when) => gain.linearRampToValueAtTime(map(value), when),
    cancelFrom: (when) => {
      try {
        gain.cancelScheduledValues(when)
      } catch { /* */ }
    },
  }
}

function createReverb(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as { mix: number; decay: number; enabled: boolean }
  const input = ctx.createGain()
  const dry = ctx.createGain()
  const wet = ctx.createGain()
  const output = ctx.createGain()
  const convolver = ctx.createConvolver()
  convolver.buffer = makeImpulse(ctx, p.decay || 2)
  input.connect(dry)
  input.connect(convolver)
  convolver.connect(wet)
  dry.connect(output)
  wet.connect(output)
  const apply = () => {
    const mix = p.enabled ? p.mix : 0
    dry.gain.value = 1 - mix
    wet.gain.value = mix
  }
  apply()
  const setMix = (v: number, when?: number) => {
    const mix = p.enabled ? Math.max(0, Math.min(1, v)) : 0
    if (typeof when === 'number') {
      dry.gain.setValueAtTime(1 - mix, when)
      wet.gain.setValueAtTime(mix, when)
    } else {
      dry.gain.value = 1 - mix
      wet.gain.value = mix
    }
  }
  return {
    input,
    output,
    update: (np) => {
      Object.assign(p, np)
      convolver.buffer = makeImpulse(ctx, p.decay || 2)
      apply()
    },
    dispose: () => {
      input.disconnect()
      dry.disconnect()
      wet.disconnect()
      convolver.disconnect()
      output.disconnect()
    },
    automables: [
      {
        name: 'mix',
        setNormalized: (value, when) => setMix(value, when),
        rampNormalized: (value, when) => {
          const mix = p.enabled ? Math.max(0, Math.min(1, value)) : 0
          dry.gain.linearRampToValueAtTime(1 - mix, when)
          wet.gain.linearRampToValueAtTime(mix, when)
        },
        cancelFrom: (when) => {
          try {
            dry.gain.cancelScheduledValues(when)
            wet.gain.cancelScheduledValues(when)
          } catch { /* */ }
        },
      },
    ],
  }
}

function makeImpulse(ctx: AudioContext, decay: number) {
  const rate = ctx.sampleRate
  const len = Math.max(1, Math.floor(rate * decay))
  const buffer = ctx.createBuffer(2, len, rate)
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2)
    }
  }
  return buffer
}

function createEcho(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as { mix: number; time: number; feedback: number; enabled: boolean }
  const input = ctx.createGain()
  const delay = ctx.createDelay(2)
  const feedback = ctx.createGain()
  const wet = ctx.createGain()
  const dry = ctx.createGain()
  const output = ctx.createGain()
  delay.delayTime.value = p.time
  feedback.gain.value = p.feedback
  input.connect(dry)
  input.connect(delay)
  delay.connect(feedback)
  feedback.connect(delay)
  delay.connect(wet)
  dry.connect(output)
  wet.connect(output)
  const apply = () => {
    delay.delayTime.value = p.time
    feedback.gain.value = p.enabled ? p.feedback : 0
    wet.gain.value = p.enabled ? p.mix : 0
    dry.gain.value = 1
  }
  apply()
  return {
    input,
    output,
    update: (np) => {
      Object.assign(p, np)
      apply()
    },
    dispose: () => {
      input.disconnect()
      delay.disconnect()
      feedback.disconnect()
      wet.disconnect()
      dry.disconnect()
      output.disconnect()
    },
    automables: [
      makeGainAutomable('mix', wet.gain, (v) => (p.enabled ? Math.max(0, Math.min(1, v)) : 0)),
      makeGainAutomable('feedback', feedback.gain, (v) => (p.enabled ? Math.max(0, Math.min(0.95, v)) : 0)),
      {
        name: 'time',
        setNormalized: (value, when) => {
          const t = 0.02 + Math.max(0, Math.min(1, value)) * 1.5
          if (typeof when === 'number') delay.delayTime.setValueAtTime(t, when)
          else delay.delayTime.value = t
        },
        rampNormalized: (value, when) => {
          delay.delayTime.linearRampToValueAtTime(0.02 + Math.max(0, Math.min(1, value)) * 1.5, when)
        },
        cancelFrom: (when) => {
          try {
            delay.delayTime.cancelScheduledValues(when)
          } catch { /* */ }
        },
      },
    ],
  }
}

function createCompressor(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as { threshold: number; ratio: number; attack: number; release: number; enabled: boolean }
  const input = ctx.createGain()
  const comp = ctx.createDynamicsCompressor()
  const bypass = ctx.createGain()
  const output = ctx.createGain()
  const wet = ctx.createGain()
  input.connect(comp)
  input.connect(bypass)
  comp.connect(wet)
  wet.connect(output)
  bypass.connect(output)
  const apply = () => {
    comp.threshold.value = p.threshold
    comp.ratio.value = p.ratio
    comp.attack.value = p.attack
    comp.release.value = p.release
    wet.gain.value = p.enabled ? 1 : 0
    bypass.gain.value = p.enabled ? 0 : 1
  }
  apply()
  return {
    input,
    output,
    update: (np) => {
      Object.assign(p, np)
      apply()
    },
    dispose: () => {
      input.disconnect()
      comp.disconnect()
      bypass.disconnect()
      wet.disconnect()
      output.disconnect()
    },
    automables: [
      {
        name: 'threshold',
        setNormalized: (value, when) => {
          const t = -60 + Math.max(0, Math.min(1, value)) * 60
          if (typeof when === 'number') comp.threshold.setValueAtTime(t, when)
          else comp.threshold.value = t
        },
        rampNormalized: (value, when) => {
          comp.threshold.linearRampToValueAtTime(-60 + Math.max(0, Math.min(1, value)) * 60, when)
        },
        cancelFrom: (when) => {
          try {
            comp.threshold.cancelScheduledValues(when)
          } catch { /* */ }
        },
      },
    ],
  }
}

function createEq(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as { low: number; mid: number; high: number; enabled: boolean }
  const input = ctx.createGain()
  const low = ctx.createBiquadFilter()
  const mid = ctx.createBiquadFilter()
  const high = ctx.createBiquadFilter()
  const output = ctx.createGain()
  low.type = 'lowshelf'
  low.frequency.value = 200
  mid.type = 'peaking'
  mid.frequency.value = 1000
  mid.Q.value = 1
  high.type = 'highshelf'
  high.frequency.value = 4000
  input.connect(low)
  low.connect(mid)
  mid.connect(high)
  high.connect(output)
  const apply = () => {
    if (!p.enabled) {
      low.gain.value = 0
      mid.gain.value = 0
      high.gain.value = 0
      return
    }
    low.gain.value = p.low
    mid.gain.value = p.mid
    high.gain.value = p.high
  }
  apply()
  const makeBand = (name: string, node: BiquadFilterNode): AutomableParam => ({
    name,
    setNormalized: (value, when) => {
      const g = p.enabled ? -12 + Math.max(0, Math.min(1, value)) * 24 : 0
      if (typeof when === 'number') node.gain.setValueAtTime(g, when)
      else node.gain.value = g
    },
    rampNormalized: (value, when) => {
      const g = p.enabled ? -12 + Math.max(0, Math.min(1, value)) * 24 : 0
      node.gain.linearRampToValueAtTime(g, when)
    },
    cancelFrom: (when) => {
      try {
        node.gain.cancelScheduledValues(when)
      } catch { /* */ }
    },
  })
  return {
    input,
    output,
    update: (np) => {
      Object.assign(p, np)
      apply()
    },
    dispose: () => {
      input.disconnect()
      low.disconnect()
      mid.disconnect()
      high.disconnect()
      output.disconnect()
    },
    automables: [makeBand('low', low), makeBand('mid', mid), makeBand('high', high)],
  }
}

function makeCurve(amount: number) {
  const n = 256
  const curve = new Float32Array(n)
  const k = Math.max(0.01, amount) * 40
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x))
  }
  return curve
}

function makeBitCurve(bits: number) {
  const steps = Math.pow(2, Math.max(1, Math.min(16, bits)))
  const n = 256
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = Math.round(x * steps) / steps
  }
  return curve
}

function dryWet(ctx: AudioContext, input: AudioNode, wetNode: AudioNode, mix: number, enabled: boolean) {
  const dry = ctx.createGain()
  const wet = ctx.createGain()
  const output = ctx.createGain()
  input.connect(dry)
  wetNode.connect(wet)
  dry.connect(output)
  wet.connect(output)
  const m = enabled ? mix : 0
  dry.gain.value = 1 - m
  wet.gain.value = m
  return { dry, wet, output, setMix: (v: number, on: boolean) => {
    const mm = on ? Math.max(0, Math.min(1, v)) : 0
    dry.gain.value = 1 - mm
    wet.gain.value = mm
  } }
}

function createAutotune(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as EffectParams['autotune']
  const input = ctx.createGain()
  const delay = ctx.createDelay(0.05)
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  const formant = ctx.createBiquadFilter()
  formant.type = 'peaking'
  formant.frequency.value = 900
  formant.Q.value = 4
  lfo.type = 'sine'
  lfo.frequency.value = 0.5 + p.speed * 8
  lfoGain.gain.value = 0.0005 + p.amount * 0.008
  delay.delayTime.value = 0.012
  lfo.connect(lfoGain)
  lfoGain.connect(delay.delayTime)
  lfo.start()
  input.connect(delay)
  delay.connect(formant)
  const dw = dryWet(ctx, input, formant, p.mix, p.enabled)
  const apply = () => {
    lfo.frequency.value = 0.5 + p.speed * 8
    lfoGain.gain.value = p.enabled ? 0.0005 + p.amount * 0.008 : 0
    formant.gain.value = p.enabled ? 2 + p.amount * 10 : 0
    dw.setMix(p.mix, p.enabled)
  }
  apply()
  return {
    input,
    output: dw.output,
    update: (np) => { Object.assign(p, np); apply() },
    dispose: () => {
      try { lfo.stop() } catch { /* */ }
      input.disconnect(); delay.disconnect(); formant.disconnect()
      lfo.disconnect(); lfoGain.disconnect(); dw.dry.disconnect(); dw.wet.disconnect(); dw.output.disconnect()
    },
    automables: [
      makeGainAutomable('mix', dw.wet.gain, (v) => (p.enabled ? Math.max(0, Math.min(1, v)) : 0)),
      makeGainAutomable('amount', lfoGain.gain, (v) => (p.enabled ? 0.0005 + v * 0.008 : 0)),
    ],
  }
}

function createVocoder(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as EffectParams['vocoder']
  const input = ctx.createGain()
  const output = ctx.createGain()
  const dry = ctx.createGain()
  const wet = ctx.createGain()
  const carrier = ctx.createOscillator()
  const carrierGain = ctx.createGain()
  carrier.type = 'sawtooth'
  carrier.frequency.value = 80 + p.carrier * 320
  carrierGain.gain.value = 0.35
  carrier.connect(carrierGain)
  carrier.start()
  const bands = [200, 400, 800, 1600, 3200, 6400]
  const disposers: (() => void)[] = []
  for (const freq of bands) {
    const modBp = ctx.createBiquadFilter()
    modBp.type = 'bandpass'
    modBp.frequency.value = freq
    modBp.Q.value = 2.5
    const carBp = ctx.createBiquadFilter()
    carBp.type = 'bandpass'
    carBp.frequency.value = freq
    carBp.Q.value = 2.5
    const follower = ctx.createWaveShaper()
    follower.curve = makeCurve(0.8)
    const env = ctx.createGain()
    const bandOut = ctx.createGain()
    bandOut.gain.value = 0
    input.connect(modBp)
    modBp.connect(follower)
    const smooth = ctx.createBiquadFilter()
    smooth.type = 'lowpass'
    smooth.frequency.value = 12
    follower.connect(smooth)
    smooth.connect(bandOut.gain)
    carrierGain.connect(carBp)
    carBp.connect(bandOut)
    bandOut.connect(wet)
    disposers.push(() => {
      modBp.disconnect(); carBp.disconnect(); follower.disconnect()
      smooth.disconnect(); env.disconnect(); bandOut.disconnect()
    })
  }
  input.connect(dry)
  dry.connect(output)
  wet.connect(output)
  const apply = () => {
    carrier.frequency.value = 80 + p.carrier * 320
    const m = p.enabled ? p.mix * p.depth : 0
    wet.gain.value = m
    dry.gain.value = 1 - (p.enabled ? p.mix * 0.7 : 0)
  }
  apply()
  return {
    input,
    output,
    update: (np) => { Object.assign(p, np); apply() },
    dispose: () => {
      try { carrier.stop() } catch { /* */ }
      disposers.forEach((d) => d())
      input.disconnect(); dry.disconnect(); wet.disconnect()
      carrier.disconnect(); carrierGain.disconnect(); output.disconnect()
    },
    automables: [
      makeGainAutomable('mix', wet.gain, (v) => (p.enabled ? Math.max(0, Math.min(1, v)) * p.depth : 0)),
    ],
  }
}

function createRobot(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as EffectParams['robot']
  const input = ctx.createGain()
  const ring = ctx.createGain()
  ring.gain.value = 0
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = 40 + p.frequency * 460
  osc.connect(ring.gain)
  osc.start()
  input.connect(ring)
  const dw = dryWet(ctx, input, ring, p.mix, p.enabled)
  const apply = () => {
    osc.frequency.value = 40 + p.frequency * 460
    dw.setMix(p.mix, p.enabled)
  }
  apply()
  return {
    input,
    output: dw.output,
    update: (np) => { Object.assign(p, np); apply() },
    dispose: () => {
      try { osc.stop() } catch { /* */ }
      input.disconnect(); ring.disconnect(); osc.disconnect()
      dw.dry.disconnect(); dw.wet.disconnect(); dw.output.disconnect()
    },
    automables: [
      makeGainAutomable('mix', dw.wet.gain, (v) => (p.enabled ? Math.max(0, Math.min(1, v)) : 0)),
      {
        name: 'frequency',
        setNormalized: (value, when) => {
          const f = 40 + Math.max(0, Math.min(1, value)) * 460
          if (typeof when === 'number') osc.frequency.setValueAtTime(f, when)
          else osc.frequency.value = f
        },
        rampNormalized: (value, when) => {
          osc.frequency.linearRampToValueAtTime(40 + Math.max(0, Math.min(1, value)) * 460, when)
        },
        cancelFrom: (when) => { try { osc.frequency.cancelScheduledValues(when) } catch { /* */ } },
      },
    ],
  }
}

function createChorus(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as EffectParams['chorus']
  const input = ctx.createGain()
  const delay = ctx.createDelay(0.05)
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  lfo.type = 'sine'
  lfo.frequency.value = 0.1 + p.rate * 4
  delay.delayTime.value = 0.02
  lfoGain.gain.value = 0.001 + p.depth * 0.012
  lfo.connect(lfoGain)
  lfoGain.connect(delay.delayTime)
  lfo.start()
  input.connect(delay)
  const dw = dryWet(ctx, input, delay, p.mix, p.enabled)
  const apply = () => {
    lfo.frequency.value = 0.1 + p.rate * 4
    lfoGain.gain.value = p.enabled ? 0.001 + p.depth * 0.012 : 0
    dw.setMix(p.mix, p.enabled)
  }
  apply()
  return {
    input,
    output: dw.output,
    update: (np) => { Object.assign(p, np); apply() },
    dispose: () => {
      try { lfo.stop() } catch { /* */ }
      input.disconnect(); delay.disconnect(); lfo.disconnect(); lfoGain.disconnect()
      dw.dry.disconnect(); dw.wet.disconnect(); dw.output.disconnect()
    },
    automables: [makeGainAutomable('mix', dw.wet.gain, (v) => (p.enabled ? Math.max(0, Math.min(1, v)) : 0))],
  }
}

function createFlanger(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as EffectParams['flanger']
  const input = ctx.createGain()
  const delay = ctx.createDelay(0.02)
  const feedback = ctx.createGain()
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  delay.delayTime.value = 0.005
  feedback.gain.value = p.feedback
  lfo.type = 'sine'
  lfo.frequency.value = 0.05 + p.rate * 2
  lfoGain.gain.value = 0.002
  lfo.connect(lfoGain)
  lfoGain.connect(delay.delayTime)
  lfo.start()
  input.connect(delay)
  delay.connect(feedback)
  feedback.connect(delay)
  const dw = dryWet(ctx, input, delay, p.mix, p.enabled)
  const apply = () => {
    feedback.gain.value = p.enabled ? p.feedback : 0
    lfo.frequency.value = 0.05 + p.rate * 2
    dw.setMix(p.mix, p.enabled)
  }
  apply()
  return {
    input,
    output: dw.output,
    update: (np) => { Object.assign(p, np); apply() },
    dispose: () => {
      try { lfo.stop() } catch { /* */ }
      input.disconnect(); delay.disconnect(); feedback.disconnect()
      lfo.disconnect(); lfoGain.disconnect()
      dw.dry.disconnect(); dw.wet.disconnect(); dw.output.disconnect()
    },
    automables: [
      makeGainAutomable('mix', dw.wet.gain, (v) => (p.enabled ? Math.max(0, Math.min(1, v)) : 0)),
      makeGainAutomable('feedback', feedback.gain, (v) => (p.enabled ? Math.max(0, Math.min(0.95, v)) : 0)),
    ],
  }
}

function createPhaser(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as EffectParams['phaser']
  const input = ctx.createGain()
  const stages: BiquadFilterNode[] = []
  let prev: AudioNode = input
  for (let i = 0; i < 4; i++) {
    const ap = ctx.createBiquadFilter()
    ap.type = 'allpass'
    ap.frequency.value = 300 + i * 400
    prev.connect(ap)
    prev = ap
    stages.push(ap)
  }
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  lfo.type = 'sine'
  lfo.frequency.value = 0.1 + p.rate * 3
  lfoGain.gain.value = 200 + p.depth * 1800
  lfo.connect(lfoGain)
  stages.forEach((s) => lfoGain.connect(s.frequency))
  lfo.start()
  const dw = dryWet(ctx, input, prev, p.mix, p.enabled)
  const apply = () => {
    lfo.frequency.value = 0.1 + p.rate * 3
    lfoGain.gain.value = p.enabled ? 200 + p.depth * 1800 : 0
    dw.setMix(p.mix, p.enabled)
  }
  apply()
  return {
    input,
    output: dw.output,
    update: (np) => { Object.assign(p, np); apply() },
    dispose: () => {
      try { lfo.stop() } catch { /* */ }
      input.disconnect(); stages.forEach((s) => s.disconnect())
      lfo.disconnect(); lfoGain.disconnect()
      dw.dry.disconnect(); dw.wet.disconnect(); dw.output.disconnect()
    },
    automables: [makeGainAutomable('mix', dw.wet.gain, (v) => (p.enabled ? Math.max(0, Math.min(1, v)) : 0))],
  }
}

function createDistortion(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as EffectParams['distortion']
  const input = ctx.createGain()
  const shaper = ctx.createWaveShaper()
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 800 + p.tone * 12000
  shaper.curve = makeCurve(p.drive)
  shaper.oversample = '2x'
  input.connect(shaper)
  shaper.connect(tone)
  const dw = dryWet(ctx, input, tone, p.mix, p.enabled)
  const apply = () => {
    shaper.curve = makeCurve(p.enabled ? p.drive : 0.01)
    tone.frequency.value = 800 + p.tone * 12000
    dw.setMix(p.mix, p.enabled)
  }
  apply()
  return {
    input,
    output: dw.output,
    update: (np) => { Object.assign(p, np); apply() },
    dispose: () => {
      input.disconnect(); shaper.disconnect(); tone.disconnect()
      dw.dry.disconnect(); dw.wet.disconnect(); dw.output.disconnect()
    },
    automables: [makeGainAutomable('mix', dw.wet.gain, (v) => (p.enabled ? Math.max(0, Math.min(1, v)) : 0))],
  }
}

function createBitcrush(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as EffectParams['bitcrush']
  const input = ctx.createGain()
  const shaper = ctx.createWaveShaper()
  shaper.curve = makeBitCurve(p.bits)
  input.connect(shaper)
  const dw = dryWet(ctx, input, shaper, p.mix, p.enabled)
  const apply = () => {
    shaper.curve = makeBitCurve(p.enabled ? p.bits : 16)
    dw.setMix(p.mix, p.enabled)
  }
  apply()
  return {
    input,
    output: dw.output,
    update: (np) => { Object.assign(p, np); apply() },
    dispose: () => {
      input.disconnect(); shaper.disconnect()
      dw.dry.disconnect(); dw.wet.disconnect(); dw.output.disconnect()
    },
    automables: [makeGainAutomable('mix', dw.wet.gain, (v) => (p.enabled ? Math.max(0, Math.min(1, v)) : 0))],
  }
}

function createTremolo(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as EffectParams['tremolo']
  const input = ctx.createGain()
  const amp = ctx.createGain()
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  const offset = ctx.createConstantSource()
  amp.gain.value = 1
  lfo.type = 'sine'
  lfo.frequency.value = 0.5 + p.rate * 12
  lfoGain.gain.value = p.depth * 0.5
  offset.offset.value = 1 - p.depth * 0.5
  lfo.connect(lfoGain)
  lfoGain.connect(amp.gain)
  offset.connect(amp.gain)
  lfo.start()
  offset.start()
  input.connect(amp)
  const bypass = ctx.createGain()
  const output = ctx.createGain()
  input.connect(bypass)
  amp.connect(output)
  bypass.connect(output)
  const apply = () => {
    lfo.frequency.value = 0.5 + p.rate * 12
    if (p.enabled) {
      lfoGain.gain.value = p.depth * 0.5
      offset.offset.value = 1 - p.depth * 0.5
      bypass.gain.value = 0
    } else {
      bypass.gain.value = 1
      lfoGain.gain.value = 0
      offset.offset.value = 1
    }
  }
  apply()
  return {
    input,
    output,
    update: (np) => { Object.assign(p, np); apply() },
    dispose: () => {
      try { lfo.stop(); offset.stop() } catch { /* */ }
      input.disconnect(); amp.disconnect(); bypass.disconnect(); output.disconnect()
      lfo.disconnect(); lfoGain.disconnect(); offset.disconnect()
    },
    automables: [
      {
        name: 'depth',
        setNormalized: (value) => {
          const d = p.enabled ? Math.max(0, Math.min(1, value)) : 0
          lfoGain.gain.value = d * 0.5
          offset.offset.value = 1 - d * 0.5
        },
        rampNormalized: (value, when) => {
          const d = p.enabled ? Math.max(0, Math.min(1, value)) : 0
          lfoGain.gain.linearRampToValueAtTime(d * 0.5, when)
          offset.offset.linearRampToValueAtTime(1 - d * 0.5, when)
        },
        cancelFrom: (when) => {
          try {
            lfoGain.gain.cancelScheduledValues(when)
            offset.offset.cancelScheduledValues(when)
          } catch { /* */ }
        },
      },
    ],
  }
}

function createWah(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as EffectParams['wah']
  const input = ctx.createGain()
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 8
  bp.frequency.value = 400
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  lfo.type = 'sine'
  lfo.frequency.value = 0.2 + p.rate * 6
  lfoGain.gain.value = 200 + p.amount * 2200
  const base = ctx.createConstantSource()
  base.offset.value = 400
  lfo.connect(lfoGain)
  lfoGain.connect(bp.frequency)
  base.connect(bp.frequency)
  lfo.start()
  base.start()
  input.connect(bp)
  const dw = dryWet(ctx, input, bp, 0.85, p.enabled)
  const apply = () => {
    lfo.frequency.value = 0.2 + p.rate * 6
    lfoGain.gain.value = p.enabled ? 200 + p.amount * 2200 : 0
    dw.setMix(p.enabled ? 0.9 : 0, p.enabled)
  }
  apply()
  return {
    input,
    output: dw.output,
    update: (np) => { Object.assign(p, np); apply() },
    dispose: () => {
      try { lfo.stop(); base.stop() } catch { /* */ }
      input.disconnect(); bp.disconnect(); lfo.disconnect(); lfoGain.disconnect(); base.disconnect()
      dw.dry.disconnect(); dw.wet.disconnect(); dw.output.disconnect()
    },
    automables: [makeGainAutomable('amount', lfoGain.gain, (v) => (p.enabled ? 200 + v * 2200 : 0))],
  }
}

function createFilterFx(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as EffectParams['filter']
  const input = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 200 + p.cutoff * 16000
  filter.Q.value = 0.5 + p.resonance * 18
  input.connect(filter)
  const dw = dryWet(ctx, input, filter, p.mix, p.enabled)
  const apply = () => {
    filter.frequency.value = 200 + p.cutoff * 16000
    filter.Q.value = 0.5 + p.resonance * 18
    dw.setMix(p.mix, p.enabled)
  }
  apply()
  return {
    input,
    output: dw.output,
    update: (np) => { Object.assign(p, np); apply() },
    dispose: () => {
      input.disconnect(); filter.disconnect()
      dw.dry.disconnect(); dw.wet.disconnect(); dw.output.disconnect()
    },
    automables: [
      {
        name: 'cutoff',
        setNormalized: (value, when) => {
          const f = 200 + Math.max(0, Math.min(1, value)) * 16000
          if (typeof when === 'number') filter.frequency.setValueAtTime(f, when)
          else filter.frequency.value = f
        },
        rampNormalized: (value, when) => {
          filter.frequency.linearRampToValueAtTime(200 + Math.max(0, Math.min(1, value)) * 16000, when)
        },
        cancelFrom: (when) => { try { filter.frequency.cancelScheduledValues(when) } catch { /* */ } },
      },
      makeGainAutomable('mix', dw.wet.gain, (v) => (p.enabled ? Math.max(0, Math.min(1, v)) : 0)),
    ],
  }
}

function createSaturator(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as EffectParams['saturator']
  const input = ctx.createGain()
  const shaper = ctx.createWaveShaper()
  shaper.curve = makeCurve(0.2 + p.drive * 0.8)
  shaper.oversample = '2x'
  input.connect(shaper)
  const dw = dryWet(ctx, input, shaper, p.mix, p.enabled)
  const apply = () => {
    shaper.curve = makeCurve(p.enabled ? 0.2 + p.drive * 0.8 : 0.01)
    dw.setMix(p.mix, p.enabled)
  }
  apply()
  return {
    input,
    output: dw.output,
    update: (np) => { Object.assign(p, np); apply() },
    dispose: () => {
      input.disconnect(); shaper.disconnect()
      dw.dry.disconnect(); dw.wet.disconnect(); dw.output.disconnect()
    },
    automables: [makeGainAutomable('mix', dw.wet.gain, (v) => (p.enabled ? Math.max(0, Math.min(1, v)) : 0))],
  }
}

function createTelephone(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as EffectParams['telephone']
  const input = ctx.createGain()
  const hp = ctx.createBiquadFilter()
  const lp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 400
  lp.type = 'lowpass'
  lp.frequency.value = 2800
  input.connect(hp)
  hp.connect(lp)
  const dw = dryWet(ctx, input, lp, p.mix, p.enabled)
  const apply = () => dw.setMix(p.mix, p.enabled)
  apply()
  return {
    input,
    output: dw.output,
    update: (np) => { Object.assign(p, np); apply() },
    dispose: () => {
      input.disconnect(); hp.disconnect(); lp.disconnect()
      dw.dry.disconnect(); dw.wet.disconnect(); dw.output.disconnect()
    },
    automables: [makeGainAutomable('mix', dw.wet.gain, (v) => (p.enabled ? Math.max(0, Math.min(1, v)) : 0))],
  }
}

function createLofi(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as EffectParams['lofi']
  const input = ctx.createGain()
  const crush = ctx.createWaveShaper()
  crush.curve = makeBitCurve(4 + (1 - p.crush) * 10)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2500
  const delay = ctx.createDelay(0.02)
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  delay.delayTime.value = 0.008
  lfo.type = 'sine'
  lfo.frequency.value = 0.2 + p.wow * 4
  lfoGain.gain.value = 0.001 + p.wow * 0.004
  lfo.connect(lfoGain)
  lfoGain.connect(delay.delayTime)
  lfo.start()
  input.connect(crush)
  crush.connect(lp)
  lp.connect(delay)
  const dw = dryWet(ctx, input, delay, p.mix, p.enabled)
  const apply = () => {
    crush.curve = makeBitCurve(p.enabled ? 4 + (1 - p.crush) * 10 : 16)
    lfo.frequency.value = 0.2 + p.wow * 4
    lfoGain.gain.value = p.enabled ? 0.001 + p.wow * 0.004 : 0
    dw.setMix(p.mix, p.enabled)
  }
  apply()
  return {
    input,
    output: dw.output,
    update: (np) => { Object.assign(p, np); apply() },
    dispose: () => {
      try { lfo.stop() } catch { /* */ }
      input.disconnect(); crush.disconnect(); lp.disconnect(); delay.disconnect()
      lfo.disconnect(); lfoGain.disconnect()
      dw.dry.disconnect(); dw.wet.disconnect(); dw.output.disconnect()
    },
    automables: [makeGainAutomable('mix', dw.wet.gain, (v) => (p.enabled ? Math.max(0, Math.min(1, v)) : 0))],
  }
}

function createPingPong(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as EffectParams['pingpong']
  const input = ctx.createGain()
  const merge = ctx.createChannelMerger(2)
  const delayL = ctx.createDelay(2)
  const delayR = ctx.createDelay(2)
  const fbL = ctx.createGain()
  const fbR = ctx.createGain()
  const wet = ctx.createGain()
  const dry = ctx.createGain()
  const output = ctx.createGain()
  delayL.delayTime.value = p.time
  delayR.delayTime.value = p.time
  fbL.gain.value = p.feedback
  fbR.gain.value = p.feedback
  input.connect(dry)
  input.connect(delayL)
  delayL.connect(fbL)
  fbL.connect(delayR)
  delayR.connect(fbR)
  fbR.connect(delayL)
  delayL.connect(merge, 0, 0)
  delayR.connect(merge, 0, 1)
  merge.connect(wet)
  dry.connect(output)
  wet.connect(output)
  const apply = () => {
    delayL.delayTime.value = p.time
    delayR.delayTime.value = p.time
    fbL.gain.value = p.enabled ? p.feedback : 0
    fbR.gain.value = p.enabled ? p.feedback : 0
    wet.gain.value = p.enabled ? p.mix : 0
  }
  apply()
  return {
    input,
    output,
    update: (np) => { Object.assign(p, np); apply() },
    dispose: () => {
      input.disconnect(); merge.disconnect()
      delayL.disconnect(); delayR.disconnect(); fbL.disconnect(); fbR.disconnect()
      wet.disconnect(); dry.disconnect(); output.disconnect()
    },
    automables: [
      makeGainAutomable('mix', wet.gain, (v) => (p.enabled ? Math.max(0, Math.min(1, v)) : 0)),
      makeGainAutomable('feedback', fbL.gain, (v) => (p.enabled ? Math.max(0, Math.min(0.95, v)) : 0)),
    ],
  }
}

function createLimiter(ctx: AudioContext, params: TrackEffect['params']): EffectNodes {
  const p = params as EffectParams['limiter']
  const input = ctx.createGain()
  const comp = ctx.createDynamicsCompressor()
  const bypass = ctx.createGain()
  const wet = ctx.createGain()
  const output = ctx.createGain()
  comp.threshold.value = p.threshold
  comp.knee.value = 0
  comp.ratio.value = 20
  comp.attack.value = 0.003
  comp.release.value = p.release
  input.connect(comp)
  input.connect(bypass)
  comp.connect(wet)
  wet.connect(output)
  bypass.connect(output)
  const apply = () => {
    comp.threshold.value = p.threshold
    comp.release.value = p.release
    wet.gain.value = p.enabled ? 1 : 0
    bypass.gain.value = p.enabled ? 0 : 1
  }
  apply()
  return {
    input,
    output,
    update: (np) => { Object.assign(p, np); apply() },
    dispose: () => {
      input.disconnect(); comp.disconnect(); bypass.disconnect(); wet.disconnect(); output.disconnect()
    },
    automables: [
      {
        name: 'threshold',
        setNormalized: (value, when) => {
          const t = -30 + Math.max(0, Math.min(1, value)) * 30
          if (typeof when === 'number') comp.threshold.setValueAtTime(t, when)
          else comp.threshold.value = t
        },
        rampNormalized: (value, when) => {
          comp.threshold.linearRampToValueAtTime(-30 + Math.max(0, Math.min(1, value)) * 30, when)
        },
        cancelFrom: (when) => { try { comp.threshold.cancelScheduledValues(when) } catch { /* */ } },
      },
    ],
  }
}

export function createEffect(ctx: AudioContext, type: EffectType, params: TrackEffect['params']): EffectNodes {
  switch (type) {
    case 'reverb':
      return createReverb(ctx, params)
    case 'echo':
      return createEcho(ctx, params)
    case 'compressor':
      return createCompressor(ctx, params)
    case 'eq':
      return createEq(ctx, params)
    case 'autotune':
      return createAutotune(ctx, params)
    case 'vocoder':
      return createVocoder(ctx, params)
    case 'robot':
      return createRobot(ctx, params)
    case 'chorus':
      return createChorus(ctx, params)
    case 'flanger':
      return createFlanger(ctx, params)
    case 'phaser':
      return createPhaser(ctx, params)
    case 'distortion':
      return createDistortion(ctx, params)
    case 'bitcrush':
      return createBitcrush(ctx, params)
    case 'tremolo':
      return createTremolo(ctx, params)
    case 'wah':
      return createWah(ctx, params)
    case 'filter':
      return createFilterFx(ctx, params)
    case 'saturator':
      return createSaturator(ctx, params)
    case 'telephone':
      return createTelephone(ctx, params)
    case 'lofi':
      return createLofi(ctx, params)
    case 'pingpong':
      return createPingPong(ctx, params)
    case 'limiter':
      return createLimiter(ctx, params)
  }
}

export function defaultEffectParams(type: EffectType): TrackEffect['params'] {
  switch (type) {
    case 'reverb':
      return { mix: 0.25, decay: 2.2, enabled: true }
    case 'echo':
      return { mix: 0.3, time: 0.28, feedback: 0.35, enabled: true }
    case 'compressor':
      return { threshold: -18, ratio: 3, attack: 0.01, release: 0.2, enabled: true }
    case 'eq':
      return { low: 0, mid: 0, high: 0, enabled: true }
    case 'autotune':
      return { mix: 0.7, amount: 0.65, speed: 0.45, enabled: true }
    case 'vocoder':
      return { mix: 0.75, carrier: 0.35, depth: 0.85, enabled: true }
    case 'robot':
      return { mix: 0.55, frequency: 0.25, enabled: true }
    case 'chorus':
      return { mix: 0.4, rate: 0.35, depth: 0.5, enabled: true }
    case 'flanger':
      return { mix: 0.35, rate: 0.25, feedback: 0.45, enabled: true }
    case 'phaser':
      return { mix: 0.45, rate: 0.3, depth: 0.55, enabled: true }
    case 'distortion':
      return { drive: 0.45, mix: 0.5, tone: 0.55, enabled: true }
    case 'bitcrush':
      return { bits: 6, mix: 0.45, enabled: true }
    case 'tremolo':
      return { rate: 0.4, depth: 0.55, enabled: true }
    case 'wah':
      return { rate: 0.35, amount: 0.6, enabled: true }
    case 'filter':
      return { cutoff: 0.55, resonance: 0.25, mix: 1, enabled: true }
    case 'saturator':
      return { drive: 0.4, mix: 0.5, enabled: true }
    case 'telephone':
      return { mix: 0.85, enabled: true }
    case 'lofi':
      return { mix: 0.55, wow: 0.35, crush: 0.45, enabled: true }
    case 'pingpong':
      return { mix: 0.35, time: 0.32, feedback: 0.4, enabled: true }
    case 'limiter':
      return { threshold: -6, release: 0.15, enabled: true }
  }
}

export function createTrackEffect(type: EffectType): TrackEffect {
  return { id: uid('fx'), type, params: defaultEffectParams(type) }
}

export type EffectCatalogEntry = {
  type: EffectType
  label: string
  short: string
  group: string
}

export const EFFECT_CATALOG: EffectCatalogEntry[] = [
  { type: 'autotune', label: 'Autotune', short: 'Tune', group: 'Voix' },
  { type: 'vocoder', label: 'Vocoder', short: 'Voco', group: 'Voix' },
  { type: 'robot', label: 'Robot', short: 'Robo', group: 'Voix' },
  { type: 'telephone', label: 'Téléphone', short: 'Tel', group: 'Voix' },
  { type: 'reverb', label: 'Reverb', short: 'Rev', group: 'Spatial' },
  { type: 'echo', label: 'Echo', short: 'Echo', group: 'Spatial' },
  { type: 'pingpong', label: 'Ping-pong', short: 'PP', group: 'Spatial' },
  { type: 'chorus', label: 'Chorus', short: 'Cho', group: 'Modulation' },
  { type: 'flanger', label: 'Flanger', short: 'Fla', group: 'Modulation' },
  { type: 'phaser', label: 'Phaser', short: 'Pha', group: 'Modulation' },
  { type: 'tremolo', label: 'Tremolo', short: 'Tre', group: 'Modulation' },
  { type: 'wah', label: 'Wah', short: 'Wah', group: 'Modulation' },
  { type: 'distortion', label: 'Distortion', short: 'Dist', group: 'Distorsion' },
  { type: 'saturator', label: 'Saturateur', short: 'Sat', group: 'Distorsion' },
  { type: 'bitcrush', label: 'Bitcrush', short: 'Bit', group: 'Distorsion' },
  { type: 'lofi', label: 'Lo-fi', short: 'LoFi', group: 'Distorsion' },
  { type: 'eq', label: 'EQ', short: 'EQ', group: 'Filtre' },
  { type: 'filter', label: 'Filtre', short: 'Filt', group: 'Filtre' },
  { type: 'compressor', label: 'Compressor', short: 'Comp', group: 'Dynamique' },
  { type: 'limiter', label: 'Limiter', short: 'Lim', group: 'Dynamique' },
]

export const EFFECT_GROUPS = ['Voix', 'Spatial', 'Modulation', 'Distorsion', 'Filtre', 'Dynamique']

export const EFFECT_DND_MIME = 'application/x-soft-effect'

export class EffectChain {
  private nodes: EffectNodes[] = []
  private effectIds: string[] = []
  readonly input: GainNode
  readonly output: GainNode
  private ctx: AudioContext

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.input = ctx.createGain()
    this.output = ctx.createGain()
    this.input.connect(this.output)
  }

  rebuild(effects: TrackEffect[]) {
    for (const n of this.nodes) n.dispose()
    this.nodes = []
    this.effectIds = []
    try {
      this.input.disconnect()
    } catch { /* */ }
    let prev: AudioNode = this.input
    for (const fx of effects) {
      const node = createEffect(this.ctx, fx.type, { ...fx.params })
      this.nodes.push(node)
      this.effectIds.push(fx.id)
      prev.connect(node.input)
      prev = node.output
    }
    prev.connect(this.output)
  }

  update(effects: TrackEffect[]) {
    if (effects.length !== this.nodes.length) {
      this.rebuild(effects)
      return
    }
    effects.forEach((fx, i) => this.nodes[i]?.update(fx.params))
  }

  getAutomable(effectId: string, param: string) {
    const idx = this.effectIds.indexOf(effectId)
    if (idx < 0) return null
    return this.nodes[idx]?.automables.find((a) => a.name === param) ?? null
  }

  dispose() {
    for (const n of this.nodes) n.dispose()
    this.nodes = []
    this.effectIds = []
    try {
      this.input.disconnect()
      this.output.disconnect()
    } catch { /* */ }
  }
}
