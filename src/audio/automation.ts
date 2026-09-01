import type {
  AutomationLane,
  AutomationPoint,
  AutomationTarget,
  AutomationTargetMode,
  EffectType,
  Track,
  TrackEffect,
} from '@/types/project'
import { uid } from '@/types/project'

export const AUTOMATION_LANE_H = 48

export function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

export function sortPoints(points: AutomationPoint[]) {
  return [...points].sort((a, b) => a.beat - b.beat || a.id.localeCompare(b.id))
}

export function interpolateAutomation(points: AutomationPoint[], beat: number, fallback = 1) {
  const sorted = sortPoints(points)
  if (!sorted.length) return fallback
  if (beat <= sorted[0].beat) return sorted[0].value
  const last = sorted[sorted.length - 1]
  if (beat >= last.beat) return last.value
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (beat >= a.beat && beat <= b.beat) {
      const span = b.beat - a.beat
      if (span <= 1e-9) return b.value
      const t = (beat - a.beat) / span
      return a.value + (b.value - a.value) * t
    }
  }
  return fallback
}

export function targetsEqual(a: AutomationTarget, b: AutomationTarget) {
  if (a === b) return true
  if (typeof a === 'string' || typeof b === 'string') return a === b
  if (a.type !== b.type) return false
  if (a.type === 'effect' && b.type === 'effect') {
    return a.effectId === b.effectId && a.param === b.param
  }
  if (a.type === 'instrument' && b.type === 'instrument') {
    return a.param === b.param
  }
  return false
}

export function findLane(track: Track, target: AutomationTarget) {
  return (track.automation ?? []).find((lane) => targetsEqual(lane.target, target)) ?? null
}

export function firstEffectParam(type: EffectType) {
  switch (type) {
    case 'reverb':
    case 'echo':
    case 'autotune':
    case 'vocoder':
    case 'robot':
    case 'chorus':
    case 'flanger':
    case 'phaser':
    case 'distortion':
    case 'bitcrush':
    case 'saturator':
    case 'telephone':
    case 'lofi':
    case 'pingpong':
      return 'mix'
    case 'compressor':
    case 'limiter':
      return 'threshold'
    case 'eq':
      return 'mid'
    case 'tremolo':
      return 'depth'
    case 'wah':
      return 'amount'
    case 'filter':
      return 'cutoff'
  }
}

export function resolveAutomationTarget(track: Track, mode: AutomationTargetMode): AutomationTarget | null {
  if (mode === 'volume') return 'volume'
  if (mode === 'instrument') return { type: 'instrument', param: 'cutoff' }
  const fx = track.effects[0]
  if (!fx) return null
  return { type: 'effect', effectId: fx.id, param: firstEffectParam(fx.type) }
}

export function ensureAutomationLane(track: Track, target: AutomationTarget): AutomationLane {
  const existing = findLane(track, target)
  if (existing) return existing
  return { id: uid('auto'), target, points: [] }
}

export function withEnsuredLane(track: Track, target: AutomationTarget) {
  const existing = findLane(track, target)
  if (existing) return track
  return { ...track, automation: [...(track.automation ?? []), ensureAutomationLane(track, target)] }
}

export function mapNormalizedToEffect(type: EffectType, param: string, value: number) {
  const v = clamp01(value)
  if (type === 'reverb') {
    if (param === 'mix') return v
    if (param === 'decay') return 0.2 + v * 4.8
  }
  if (type === 'echo' || type === 'pingpong') {
    if (param === 'mix') return v
    if (param === 'time') return 0.02 + v * 1.5
    if (param === 'feedback') return v * 0.95
  }
  if (type === 'compressor') {
    if (param === 'threshold') return -60 + v * 60
    if (param === 'ratio') return 1 + v * 19
    if (param === 'attack') return 0.001 + v * 0.5
    if (param === 'release') return 0.01 + v * 0.8
  }
  if (type === 'limiter') {
    if (param === 'threshold') return -30 + v * 30
    if (param === 'release') return 0.01 + v * 0.8
  }
  if (type === 'eq') {
    if (param === 'low' || param === 'mid' || param === 'high') return -12 + v * 24
  }
  if (type === 'bitcrush' && param === 'bits') return 2 + v * 14
  if (type === 'filter' && param === 'cutoff') return 200 + v * 16000
  if (type === 'robot' && param === 'frequency') return 40 + v * 460
  return v
}

export function mapNormalizedToCutoff(value: number) {
  return 200 * Math.pow(40, clamp01(value))
}

export function effectParamLabel(param: string) {
  const labels: Record<string, string> = {
    mix: 'Mix',
    decay: 'Decay',
    time: 'Temps',
    feedback: 'Feedback',
    threshold: 'Seuil',
    ratio: 'Ratio',
    attack: 'Attaque',
    release: 'Release',
    low: 'Graves',
    mid: 'Médiums',
    high: 'Aigus',
    cutoff: 'Filtre',
    amount: 'Intensité',
    speed: 'Vitesse',
    carrier: 'Porteur',
    depth: 'Profondeur',
    frequency: 'Fréquence',
    rate: 'Rate',
    drive: 'Drive',
    tone: 'Tonalité',
    bits: 'Bits',
    resonance: 'Résonance',
    wow: 'Wow',
    crush: 'Crush',
  }
  return labels[param] ?? param
}

export function automationModeLabel(mode: AutomationTargetMode) {
  if (mode === 'volume') return 'Volume'
  if (mode === 'effect') return 'Effet'
  return 'Instrument'
}

export function laneTitle(track: Track, target: AutomationTarget | null) {
  if (!target) return 'Aucun effet'
  if (target === 'volume') return 'Volume'
  if (target === 'pan') return 'Pan'
  if (target.type === 'instrument') return `Instrument · ${effectParamLabel(target.param)}`
  const fx = track.effects.find((e) => e.id === target.effectId)
  if (!fx) return 'Effet'
  return `${fx.type} · ${effectParamLabel(target.param)}`
}

export function normalizeTrackAutomation(track: Partial<Track> & { effects?: TrackEffect[] }) {
  return Array.isArray(track.automation) ? track.automation : []
}

export function scheduleAudioParamCurve(
  param: AudioParam,
  points: AutomationPoint[],
  mapValue: (v: number) => number,
  beatNow: number,
  audioNow: number,
  bpm: number,
  fallback: number,
) {
  const sorted = sortPoints(points)
  try {
    param.cancelScheduledValues(audioNow)
  } catch { /* */ }
  const current = mapValue(interpolateAutomation(sorted, beatNow, fallback))
  param.setValueAtTime(current, audioNow)
  for (const p of sorted) {
    if (p.beat < beatNow - 0.001) continue
    const when = audioNow + ((p.beat - beatNow) * 60) / bpm
    if (when < audioNow) continue
    param.linearRampToValueAtTime(mapValue(p.value), when)
  }
}
