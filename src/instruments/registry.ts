import { midiToFreq } from '@/midi/notes'

export type VoiceHandle = {
  stop: (when?: number) => void
}

export type InstrumentCategory =
  | 'keys'
  | 'bass'
  | 'pads'
  | 'drums'
  | 'lead'
  | 'strings'
  | 'guitar'
  | 'user'

export type InstrumentDef = {
  id: string
  name: string
  category: InstrumentCategory
  createVoice: (
    ctx: AudioContext,
    destination: AudioNode,
    pitch: number,
    velocity: number,
    when: number,
    duration: number,
  ) => VoiceHandle
}

export const INSTRUMENT_DND_MIME = 'application/x-soft-instrument'
export const INSTRUMENT_DND_PREFIX = 'soft-inst:'

export function encodeInstrumentDrag(id: string, name: string) {
  return `${INSTRUMENT_DND_PREFIX}${JSON.stringify({ id, name })}`
}

export function parseInstrumentDragPayload(raw: string) {
  const text = raw.trim()
  if (!text) return null
  try {
    if (text.startsWith(INSTRUMENT_DND_PREFIX)) {
      return JSON.parse(text.slice(INSTRUMENT_DND_PREFIX.length)) as { id: string; name: string }
    }
    const parsed = JSON.parse(text) as { id?: string; name?: string }
    if (parsed?.id) return { id: parsed.id, name: parsed.name ?? parsed.id }
  } catch { /* */ }
  return null
}

export function isInstrumentDragEvent(e: { dataTransfer: DataTransfer }) {
  const types = [...e.dataTransfer.types]
  if (types.includes(INSTRUMENT_DND_MIME)) return true
  // text/plain seul : seulement si ce n'est pas un effet / fichier
  if (types.includes('Files')) return false
  if (types.includes('application/x-soft-effect')) return false
  return false
}

export const CATEGORY_ORDER: InstrumentCategory[] = [
  'keys',
  'bass',
  'guitar',
  'pads',
  'drums',
  'lead',
  'strings',
  'user',
]

export const CATEGORY_LABELS: Record<InstrumentCategory, string> = {
  keys: 'Claviers',
  bass: 'Basses',
  guitar: 'Guitares',
  pads: 'Pads',
  drums: 'Batterie',
  lead: 'Leads',
  strings: 'Cordes',
  user: 'Utilisateur',
}

const registry = new Map<string, InstrumentDef>()

export function registerInstrument(def: InstrumentDef) {
  registry.set(def.id, def)
}

export function getInstrument(id: string) {
  return registry.get(id)
}

export function listInstruments() {
  return [...registry.values()]
}

export function listInstrumentsByCategory() {
  const groups = new Map<InstrumentCategory, InstrumentDef[]>()
  for (const cat of CATEGORY_ORDER) groups.set(cat, [])
  for (const inst of registry.values()) {
    const list = groups.get(inst.category) ?? []
    list.push(inst)
    groups.set(inst.category, list)
  }
  return CATEGORY_ORDER.filter((cat) => (groups.get(cat)?.length ?? 0) > 0).map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    instruments: groups.get(cat)!,
  }))
}

function envGain(ctx: AudioContext, velocity: number, when: number, duration: number, a: number, d: number, s: number, r: number) {
  const g = ctx.createGain()
  const peak = (velocity / 127) * 0.35
  const end = when + duration
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(peak, when + a)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * s), when + a + d)
  g.gain.setValueAtTime(Math.max(0.0001, peak * s), Math.max(when + a + d, end))
  g.gain.exponentialRampToValueAtTime(0.0001, end + r)
  return g
}

export function makeSynthVoice(
  ctx: AudioContext,
  destination: AudioNode,
  pitch: number,
  velocity: number,
  when: number,
  duration: number,
  opts: {
    type?: OscillatorType
    detune?: number
    filterFreq?: number
    filterQ?: number
    a?: number
    d?: number
    s?: number
    r?: number
    gain?: number
  } = {},
): VoiceHandle {
  const osc = ctx.createOscillator()
  osc.type = opts.type ?? 'triangle'
  osc.frequency.setValueAtTime(midiToFreq(pitch), when)
  if (opts.detune) osc.detune.setValueAtTime(opts.detune, when)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(opts.filterFreq ?? 4200, when)
  filter.Q.setValueAtTime(opts.filterQ ?? 0.7, when)

  const g = envGain(ctx, velocity * (opts.gain ?? 1), when, duration, opts.a ?? 0.01, opts.d ?? 0.1, opts.s ?? 0.5, opts.r ?? 0.15)
  osc.connect(filter)
  filter.connect(g)
  g.connect(destination)
  osc.start(when)
  const stopAt = when + duration + (opts.r ?? 0.15) + 0.05
  osc.stop(stopAt)
  return {
    stop: (t) => {
      try {
        osc.stop(t ?? ctx.currentTime)
      } catch { /* already stopped */ }
    },
  }
}

export function makeNoiseHit(
  ctx: AudioContext,
  destination: AudioNode,
  velocity: number,
  when: number,
  duration: number,
  filterFreq: number,
) {
  const len = Math.max(0.02, duration)
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = filterFreq
  filter.Q.value = 1.2
  const g = ctx.createGain()
  const peak = (velocity / 127) * 0.4
  g.gain.setValueAtTime(peak, when)
  g.gain.exponentialRampToValueAtTime(0.0001, when + len)
  src.connect(filter)
  filter.connect(g)
  g.connect(destination)
  src.start(when)
  src.stop(when + len + 0.02)
  return { stop: () => { try { src.stop() } catch { /* */ } } }
}

export function makeSampleVoice(
  ctx: AudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  pitch: number,
  rootMidi: number,
  velocity: number,
  when: number,
  duration: number,
  opts: {
    gain?: number
    attack?: number
    release?: number
    filterFreq?: number
    filterQ?: number
    detuneCents?: number
    drive?: number
    loop?: boolean
  } = {},
): VoiceHandle {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const rate = Math.pow(2, (pitch - rootMidi) / 12)
  src.playbackRate.setValueAtTime(rate, when)
  if (opts.detuneCents) src.detune.setValueAtTime(opts.detuneCents, when)
  if (opts.loop && buffer.duration > 0.8) {
    src.loop = true
    src.loopStart = Math.min(0.45, buffer.duration * 0.12)
    src.loopEnd = Math.max(src.loopStart + 0.3, buffer.duration * 0.88)
  }

  let node: AudioNode = src
  if (opts.filterFreq) {
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(opts.filterFreq, when)
    filter.Q.setValueAtTime(opts.filterQ ?? 0.7, when)
    src.connect(filter)
    node = filter
  }
  if (opts.drive && opts.drive > 0) {
    const shaper = ctx.createWaveShaper()
    const amount = Math.min(1, opts.drive)
    const curve = new Float32Array(256)
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1
      curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x))
    }
    shaper.curve = curve
    node.connect(shaper)
    node = shaper
  }

  const g = ctx.createGain()
  const peak = Math.max(0.0001, (velocity / 127) * (opts.gain ?? 0.85))
  const a = opts.attack ?? 0.005
  const r = opts.release ?? 0.12
  const end = when + Math.max(0.03, duration)
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(peak, when + a)
  g.gain.setValueAtTime(peak, Math.max(when + a, end))
  g.gain.exponentialRampToValueAtTime(0.0001, end + r)
  node.connect(g)
  g.connect(destination)

  const bufDur = buffer.duration / rate
  const playDur = opts.loop ? duration + r + 0.05 : Math.min(bufDur, duration + r + 0.05)
  src.start(when, 0)
  src.stop(when + playDur + 0.02)
  return {
    stop: (t) => {
      try {
        src.stop(t ?? ctx.currentTime)
      } catch { /* */ }
    },
  }
}
