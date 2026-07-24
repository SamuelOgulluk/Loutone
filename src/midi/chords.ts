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
  o: [0, 3, 6],
  aug: [0, 4, 8],
  '+': [0, 4, 8],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  M7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  min7: [0, 3, 7, 10],
  dim7: [0, 3, 6, 9],
  o7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  'ø': [0, 3, 6, 10],
  'ø7': [0, 3, 6, 10],
  '9': [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  M9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  min9: [0, 3, 7, 10, 14],
  '7b9': [0, 4, 7, 10, 13],
  '7(#9)': [0, 4, 7, 10, 15],
  '7#9': [0, 4, 7, 10, 15],
  '7b5': [0, 4, 6, 10],
  '7#5': [0, 4, 8, 10],
  '7(#5)': [0, 4, 8, 10],
  '13': [0, 4, 7, 10, 21],
  maj13: [0, 4, 7, 11, 21],
  m11: [0, 3, 7, 10, 14, 17],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '7sus4': [0, 5, 7, 10],
  add9: [0, 4, 7, 14],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  min6: [0, 3, 7, 9],
  '6/9': [0, 4, 7, 9, 14],
  '69': [0, 4, 7, 9, 14],
}

function normalizeQuality(raw: string) {
  let q = raw.trim()
  q = q.replace(/\s+/g, '')
  // (b9) / (#9) / (b5) → suffixes
  q = q.replace(/\(b9\)/gi, 'b9')
  q = q.replace(/\(#9\)/gi, '#9')
  q = q.replace(/\(b5\)/gi, 'b5')
  q = q.replace(/\(#5\)/gi, '#5')
  q = q.replace(/\(add9\)/gi, 'add9')
  q = q.replace(/^maj/i, 'maj')
  q = q.replace(/^min/i, 'min')
  q = q.replace(/^Maj/, 'maj')
  q = q.replace(/^Min/, 'min')
  if (/^maj7$/i.test(q)) return 'maj7'
  if (/^maj9$/i.test(q)) return 'maj9'
  if (/^min7$/i.test(q) || /^mi7$/i.test(q)) return 'm7'
  if (/^min9$/i.test(q) || /^mi9$/i.test(q)) return 'm9'
  if (/^min6$/i.test(q) || /^mi6$/i.test(q)) return 'm6'
  if (/^dim7$/i.test(q)) return 'dim7'
  if (/^7b9$/i.test(q)) return '7b9'
  if (/^7#9$/i.test(q)) return '7#9'
  return q
}

export function parseChord(input: string, octave = 3): ChordResult | null {
  const raw = input.trim()
  if (!raw) return null
  const m = raw.match(/^([A-Ga-g])([#b]?)(.*)$/)
  if (!m) return null
  const letter = m[1].toUpperCase()
  const accidental = m[2]
  const quality = normalizeQuality(m[3] || '')

  let rootPc = NOTE_MAP[letter]
  if (rootPc === undefined) return null
  if (accidental === '#') rootPc = (rootPc + 1) % 12
  if (accidental === 'b') rootPc = (rootPc + 11) % 12

  const intervals =
    QUALITIES[quality] ??
    QUALITIES[quality.toLowerCase()] ??
    QUALITIES[quality.replace(/^min/, 'm')] ??
    null
  if (!intervals) return null

  const root = rootPc + (octave + 1) * 12
  // Compact voicing: keep extensions within ~2 octaves
  const pitches = intervals.map((i) => {
    let p = root + i
    while (p > root + 19) p -= 12
    return p
  })
  return {
    root,
    pitches,
    name: `${letter}${accidental}${quality}`,
  }
}

export function chordToNotes(chord: ChordResult, start: number, duration: number, velocity = 90): MidiNote[] {
  return chord.pitches.map((pitch, i) => ({
    id: uid('note'),
    pitch,
    start,
    duration,
    velocity: Math.max(50, velocity - i * 3),
  }))
}

export function parseChordList(text: string): string[] {
  return text
    .split(/[\s,|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}
