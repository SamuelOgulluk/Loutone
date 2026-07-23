export type TrackType = 'audio' | 'midi'

export type TimeSignature = {
  numerator: number
  denominator: number
}

export type MidiNote = {
  id: string
  pitch: number
  start: number
  duration: number
  velocity: number
}

export type AudioClip = {
  id: string
  name: string
  start: number
  duration: number
  // Source region length; duration > loopLength repeats the buffer region
  loopLength: number
  offset: number
  bufferKey: string
  color?: string
}

export type MidiClip = {
  id: string
  name: string
  start: number
  duration: number
  // Source note pattern length; duration > loopLength repeats notes in time
  loopLength: number
  notes: MidiNote[]
  color?: string
}

export function clipLoopLength(clip: { loopLength?: number; duration: number }) {
  const len = clip.loopLength
  if (typeof len === 'number' && len > 0) return len
  return Math.max(0.25, clip.duration)
}

export type EffectType =
  | 'reverb'
  | 'echo'
  | 'compressor'
  | 'eq'
  | 'autotune'
  | 'vocoder'
  | 'robot'
  | 'chorus'
  | 'flanger'
  | 'phaser'
  | 'distortion'
  | 'bitcrush'
  | 'tremolo'
  | 'wah'
  | 'filter'
  | 'saturator'
  | 'telephone'
  | 'lofi'
  | 'pingpong'
  | 'limiter'

export type EffectParams = {
  reverb: { mix: number; decay: number; enabled: boolean }
  echo: { mix: number; time: number; feedback: number; enabled: boolean }
  compressor: { threshold: number; ratio: number; attack: number; release: number; enabled: boolean }
  eq: { low: number; mid: number; high: number; enabled: boolean }
  autotune: { mix: number; amount: number; speed: number; enabled: boolean }
  vocoder: { mix: number; carrier: number; depth: number; enabled: boolean }
  robot: { mix: number; frequency: number; enabled: boolean }
  chorus: { mix: number; rate: number; depth: number; enabled: boolean }
  flanger: { mix: number; rate: number; feedback: number; enabled: boolean }
  phaser: { mix: number; rate: number; depth: number; enabled: boolean }
  distortion: { drive: number; mix: number; tone: number; enabled: boolean }
  bitcrush: { bits: number; mix: number; enabled: boolean }
  tremolo: { rate: number; depth: number; enabled: boolean }
  wah: { rate: number; amount: number; enabled: boolean }
  filter: { cutoff: number; resonance: number; mix: number; enabled: boolean }
  saturator: { drive: number; mix: number; enabled: boolean }
  telephone: { mix: number; enabled: boolean }
  lofi: { mix: number; wow: number; crush: number; enabled: boolean }
  pingpong: { mix: number; time: number; feedback: number; enabled: boolean }
  limiter: { threshold: number; release: number; enabled: boolean }
}

export type TrackEffect = {
  id: string
  type: EffectType
  params: EffectParams[EffectType]
}

export type AutomationPoint = {
  id: string
  beat: number
  value: number
}

export type AutomationTarget =
  | 'volume'
  | 'pan'
  | { type: 'effect'; effectId: string; param: string }
  | { type: 'instrument'; param: string }

export type AutomationLane = {
  id: string
  target: AutomationTarget
  points: AutomationPoint[]
}

export type AutomationTargetMode = 'volume' | 'effect' | 'instrument'

export type Track = {
  id: string
  name: string
  type: TrackType
  color: string
  height: number
  volume: number
  pan: number
  mute: boolean
  solo: boolean
  arm: boolean
  instrumentId: string | null
  effects: TrackEffect[]
  automation: AutomationLane[]
  audioClips: AudioClip[]
  midiClips: MidiClip[]
}

export type Project = {
  version: 1
  name: string
  bpm: number
  timeSignature: TimeSignature
  loopEnabled: boolean
  loopStart: number
  loopEnd: number
  tracks: Track[]
  lengthBeats: number
}

export type QuantizeDivision = 4 | 8 | 16 | 32

export const TRACK_COLORS = [
  '#c4a574',
  '#8fbf9a',
  '#d47b5a',
  '#7a9eb5',
  '#b58f7a',
  '#9a8fb5',
  '#a8b57a',
  '#b57a8f',
] as const

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}
