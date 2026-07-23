import type { MidiNote, QuantizeDivision } from '@/types/project'
import { uid } from '@/types/project'

export function quantizeBeats(beat: number, division: QuantizeDivision, strength = 1) {
  const step = 4 / division
  const snapped = Math.round(beat / step) * step
  return beat + (snapped - beat) * strength
}

export function quantizeNotes(notes: MidiNote[], division: QuantizeDivision, strength = 1) {
  return notes.map((n) => ({
    ...n,
    start: quantizeBeats(n.start, division, strength),
  }))
}

export function applySwing(notes: MidiNote[], amount: number, division: QuantizeDivision = 8) {
  if (amount <= 0) return notes
  const step = 4 / division
  return notes.map((n) => {
    const idx = Math.round(n.start / step)
    if (idx % 2 === 1) {
      return { ...n, start: n.start + step * amount * 0.5 }
    }
    return n
  })
}

export type ChordResult = { root: number; pitches: number[]; name: string }

const NOTE_MAP: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
}

const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7],
  maj: [0, 4, 7],
  M: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  M7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  min7: [0, 3, 7, 10],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  '9': [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 14],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
}

export function parseChord(input: string, octave = 4): ChordResult | null {
  const raw = input.trim()
  if (!raw) return null
  const m = raw.match(/^([A-Ga-g])([#b]?)(.*)$/)
  if (!m) return null
  const letter = m[1].toUpperCase()
  const accidental = m[2]
  let quality = m[3].replace(/^maj/i, 'maj').replace(/^min/i, 'min').replace(/^M/, 'M')
  quality = quality === 'Maj7' || quality === 'maj7' ? 'maj7' : quality
  quality = quality === 'Min7' || quality === 'min7' ? 'm7' : quality

  let rootPc = NOTE_MAP[letter]
  if (rootPc === undefined) return null
  if (accidental === '#') rootPc = (rootPc + 1) % 12
  if (accidental === 'b') rootPc = (rootPc + 11) % 12

  const intervals = QUALITIES[quality] ?? QUALITIES[quality.toLowerCase()]
  if (!intervals) {
    const fallback = QUALITIES[quality.replace('min', 'm')] ?? null
    if (!fallback) return null
    const root = rootPc + (octave + 1) * 12
    return {
      root,
      pitches: fallback.map((i) => root + i),
      name: `${letter}${accidental}${quality}`,
    }
  }
  const root = rootPc + (octave + 1) * 12
  return {
    root,
    pitches: intervals.map((i) => root + i),
    name: `${letter}${accidental}${quality}`,
  }
}

export function chordToNotes(chord: ChordResult, start: number, duration: number, velocity = 90): MidiNote[] {
  return chord.pitches.map((pitch) => ({
    id: uid('note'),
    pitch,
    start,
    duration,
    velocity,
  }))
}
