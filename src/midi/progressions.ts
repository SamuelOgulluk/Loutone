import type { MidiNote } from '@/types/project'
import { chordToNotes, parseChord, parseChordList } from './chords'

export type ProgressionGenre = 'pop' | 'folk' | 'soul' | 'jazz' | 'modal' | 'dark'

export type ModeEvolution = {
  id: string
  label: string
  feel: string
  genre: ProgressionGenre
  order: number
  degrees: string[]
}

export type MusicalKey = {
  tonic: string
  mode: 'maj' | 'min'
}

export type SectionKind =
  | 'intro'
  | 'couplet'
  | 'pre-refrain'
  | 'refrain'
  | 'pont'
  | 'break'
  | 'outro'

export type StructureSection = {
  id: string
  kind: SectionKind
  bars: number
  progressionId: string | null
  customChords: string
}

export const SECTION_LABELS: Record<SectionKind, string> = {
  intro: 'Intro',
  couplet: 'Couplet',
  'pre-refrain': 'Pré-refrain',
  refrain: 'Refrain',
  pont: 'Pont',
  break: 'Break',
  outro: 'Outro',
}

export const SECTION_KINDS = Object.keys(SECTION_LABELS) as SectionKind[]

export const GENRE_ORDER: ProgressionGenre[] = ['pop', 'folk', 'soul', 'jazz', 'modal', 'dark']

export const GENRE_LABELS: Record<ProgressionGenre, string> = {
  pop: 'Pop',
  folk: 'Folk & rock',
  soul: 'Soul & R&B',
  jazz: 'Jazz',
  modal: 'Modal & groove',
  dark: 'Dramatique',
}

export const KEY_TONICS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

export const DEFAULT_KEY: MusicalKey = { tonic: 'C', mode: 'maj' }

export function formatKey(key: MusicalKey) {
  return `${key.tonic}${key.mode}`
}

export const MODE_EVOLUTIONS: ModeEvolution[] = [
  {
    id: 'pop-clair',
    label: 'Pop claire',
    feel: 'Lumineux, radio-friendly',
    genre: 'pop',
    order: 1,
    degrees: ['I', 'V', 'vi', 'IV'],
  },
  {
    id: 'pop-sensitive',
    label: 'Pop sensible',
    feel: 'Élégiaque, couplet moderne',
    genre: 'pop',
    order: 2,
    degrees: ['vi', 'IV', 'I', 'V'],
  },
  {
    id: 'pop-classic',
    label: 'I–vi–IV–V',
    feel: 'Classique années 50–60',
    genre: 'pop',
    order: 3,
    degrees: ['I', 'vi', 'IV', 'V'],
  },
  {
    id: 'folk-ouvert',
    label: 'Folk ouvert',
    feel: 'Chaleureux, acoustique',
    genre: 'folk',
    order: 4,
    degrees: ['I', 'vi', 'IV', 'V'],
  },
  {
    id: 'folk-camion',
    label: 'Folk route',
    feel: 'Simple, campfire',
    genre: 'folk',
    order: 5,
    degrees: ['I', 'IV', 'V', 'I'],
  },
  {
    id: 'rock-mixo',
    label: 'Rock mixolydien',
    feel: 'Ouvert, bluesy',
    genre: 'folk',
    order: 6,
    degrees: ['I', 'bVII', 'IV', 'I'],
  },
  {
    id: 'soul-maj9',
    label: 'Soul maj9',
    feel: 'Doux, velours',
    genre: 'soul',
    order: 7,
    degrees: ['Imaj9', 'vi7', 'ii7', 'V7'],
  },
  {
    id: 'neo-soul',
    label: 'Neo-soul',
    feel: 'Moderne, groovy',
    genre: 'soul',
    order: 8,
    degrees: ['vi9', 'II9', 'Vmaj7', 'Imaj9'],
  },
  {
    id: 'soul-sus',
    label: 'Soul suspendu',
    feel: 'Flottant, gospel light',
    genre: 'soul',
    order: 9,
    degrees: ['I', 'IVsus', 'VIsus', 'V'],
  },
  {
    id: 'riviere-jazz',
    label: 'Rivière jazz',
    feel: 'Élégant, narratif',
    genre: 'jazz',
    order: 10,
    degrees: ['Imaj9', 'VI7(b9)', 'ii9', 'iv6', 'iii7', 'biiidim7', 'ii7', 'V7(b9)'],
  },
  {
    id: 'jazzy-ii-v-i',
    label: 'ii–V–I',
    feel: 'Classique jazz',
    genre: 'jazz',
    order: 11,
    degrees: ['ii7', 'V7', 'Imaj7', 'VI7'],
  },
  {
    id: 'alterne-sombre',
    label: 'Dominantes altérées',
    feel: 'Tendu, chromatique',
    genre: 'jazz',
    order: 12,
    degrees: ['Imaj7', 'VI7(b9)', 'ii7', 'V7(b9)'],
  },
  {
    id: 'dorian-groove',
    label: 'Groove dorien',
    feel: 'Funky, un peu sombre',
    genre: 'modal',
    order: 13,
    degrees: ['i7', 'IV7', 'i7', 'v7'],
  },
  {
    id: 'modal-mixo',
    label: 'Modal Mixolydien',
    feel: 'Rock / blues ouvert',
    genre: 'modal',
    order: 14,
    degrees: ['I', 'bVII', 'IV', 'I'],
  },
  {
    id: 'mineur-dramatique',
    label: 'Mineur dramatique',
    feel: 'Sérieux, ciné',
    genre: 'dark',
    order: 15,
    degrees: ['i', 'VI', 'III', 'VII'],
  },
  {
    id: 'triste-relatif',
    label: 'Tristesse relative',
    feel: 'Mélancolique',
    genre: 'dark',
    order: 16,
    degrees: ['i', 'VII', 'VI', 'V'],
  },
  {
    id: 'noir-dim',
    label: 'Passage diminué',
    feel: 'Instable, film noir',
    genre: 'dark',
    order: 17,
    degrees: ['i', 'vdim7', 'iv', 'V7(b9)'],
  },
]

export function getEvolution(id: string) {
  return MODE_EVOLUTIONS.find((e) => e.id === id) ?? null
}

export function evolutionsByGenre() {
  return GENRE_ORDER.map((genre) => ({
    genre,
    label: GENRE_LABELS[genre],
    items: MODE_EVOLUTIONS.filter((e) => e.genre === genre).sort((a, b) => a.order - b.order),
  })).filter((g) => g.items.length)
}

const NOTE_PC: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11]
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10]
const DEGREE_INDEX: Record<string, number> = {
  I: 0,
  II: 1,
  III: 2,
  IV: 3,
  V: 4,
  VI: 5,
  VII: 6,
}

function tonicPc(tonic: string) {
  return NOTE_PC[tonic] ?? 0
}

function preferFlats(key: MusicalKey) {
  if (/b/.test(key.tonic) || key.tonic === 'F') return true
  if (/#/.test(key.tonic) || key.tonic === 'B' || key.tonic === 'E') return false
  if (key.mode === 'min') return ['C', 'D', 'G', 'F'].includes(key.tonic) ? true : /b/.test(key.tonic)
  return ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'].includes(key.tonic)
}

function pcToName(pc: number, flats: boolean) {
  const names = flats ? FLAT_NAMES : SHARP_NAMES
  return names[((pc % 12) + 12) % 12]
}

function normalizeDegreeSuffix(raw: string, minorDefault: boolean) {
  let q = raw.trim().replace(/\s+/g, '')
  q = q.replace(/°/g, 'dim')
  q = q.replace(/ø/g, 'm7b5')
  q = q.replace(/\(b9\)/gi, '(b9)')
  if (q === 'sus') q = 'sus4'
  if (!q) return minorDefault ? 'm' : ''
  if (minorDefault && q === '7') return 'm7'
  if (minorDefault && q === '9') return 'm9'
  if (minorDefault && q === '6') return 'm6'
  if (minorDefault && q === '11') return 'm11'
  if (minorDefault && /^dim/.test(q)) return q
  if (minorDefault && !/^(m|min|dim|ø|m7b5)/i.test(q) && !/^\(/.test(q)) {
    if (/^maj/.test(q) || q === 'sus4' || q === 'sus2') return q
  }
  // V7(b9) style kept as 7(b9) for parseChord
  q = q.replace(/^\(/, '7(')
  if (q.startsWith('7(') && minorDefault) {
    /* dominante mineure rare: garder 7 */
  }
  return q
}

export function resolveDegreeToChord(degree: string, key: MusicalKey) {
  const raw = degree.trim()
  if (!raw) return ''
  const m = raw.match(/^(b|#)?(VII|VI|IV|III|II|I|vii|vi|iv|iii|ii|i)(.*)$/)
  if (!m) return raw
  const accidental = m[1] || ''
  const numeral = m[2]
  const upper = numeral.toUpperCase()
  const minorDefault = numeral === numeral.toLowerCase()
  const degIdx = DEGREE_INDEX[upper]
  if (degIdx === undefined) return raw

  const steps = key.mode === 'maj' ? MAJOR_STEPS : MINOR_STEPS
  let pc = (tonicPc(key.tonic) + steps[degIdx]) % 12
  if (accidental === 'b') pc = (pc + 11) % 12
  if (accidental === '#') pc = (pc + 1) % 12

  // Mineur : V et vii souvent élevés (harmonique) si majuscule V / suffixe 7
  if (key.mode === 'min' && upper === 'V' && !minorDefault) {
    pc = (tonicPc(key.tonic) + 7) % 12
  }
  if (key.mode === 'min' && upper === 'VII' && !minorDefault) {
    pc = (tonicPc(key.tonic) + 11) % 12
  }

  let suffix = normalizeDegreeSuffix(m[3] || '', minorDefault)
  if (key.mode === 'maj' && upper === 'VII' && minorDefault && !m[3]) suffix = 'dim'

  // 7(b9) depuis suffixe déjà formé
  if (suffix === '7(b9)' || suffix === '(b9)') suffix = '7(b9)'
  if (suffix.endsWith('(b9)') && !suffix.startsWith('7') && !/^m/.test(suffix)) {
    suffix = `7${suffix.startsWith('(') ? suffix : `(${suffix}`}`
    suffix = suffix.replace('7((', '7(')
  }

  // parseChord attend 7b9 ou 7(b9) — on a enrichi chords.ts pour (b9)
  const root = pcToName(pc, preferFlats(key))
  const quality = suffix === '7(b9)' ? '7(b9)' : suffix
  // Qualités type dim7 déjà ok
  return `${root}${quality}`
}

export function evolutionChords(evo: ModeEvolution, key: MusicalKey) {
  return evo.degrees.map((d) => resolveDegreeToChord(d, key)).filter(Boolean)
}

export function evolutionDegreesLabel(evo: ModeEvolution) {
  return evo.degrees.join(' – ')
}

export type ChordRhythmId =
  | 'whole'
  | 'half'
  | 'quarter'
  | 'eighth'
  | 'triplet'
  | 'triplet-half'

export type ChordRhythm = {
  id: ChordRhythmId
  label: string
  hint: string
  beatsFor: (beatsPerBar: number) => number
}

export type RhythmCell = {
  id: string
  beats: number
}

export const CHORD_RHYTHMS: ChordRhythm[] = [
  { id: 'whole', label: 'Ronde', hint: '1 / mesure', beatsFor: (b) => b },
  { id: 'half', label: '2 blanches', hint: '2 / mesure', beatsFor: (b) => b / 2 },
  { id: 'quarter', label: '4 noires', hint: '4 / mesure', beatsFor: (b) => b / 4 },
  { id: 'eighth', label: '8 croches', hint: '8 / mesure', beatsFor: (b) => b / 8 },
  { id: 'triplet', label: 'Triolets', hint: '3 / mesure', beatsFor: (b) => b / 3 },
  {
    id: 'triplet-half',
    label: 'Triolets ♩.',
    hint: '3 / 2 mesures',
    beatsFor: (b) => (b * 2) / 3,
  },
]

export function getChordRhythm(id: string) {
  return CHORD_RHYTHMS.find((r) => r.id === id) ?? CHORD_RHYTHMS[0]
}

export function makeRhythmCell(beats: number): RhythmCell {
  return { id: `r_${Math.random().toString(36).slice(2, 9)}`, beats }
}

export function defaultRhythmPattern(beatsPerBar: number): RhythmCell[] {
  return [makeRhythmCell(beatsPerBar)]
}

export function rhythmPatternFromPreset(id: ChordRhythmId, beatsPerBar: number): RhythmCell[] {
  const cell = getChordRhythm(id).beatsFor(beatsPerBar)
  const target = id === 'triplet-half' ? beatsPerBar * 2 : beatsPerBar
  const cells: RhythmCell[] = []
  let t = 0
  while (t + 0.001 < target) {
    const beats = Math.min(cell, target - t)
    cells.push(makeRhythmCell(beats))
    t += beats
    if (cells.length > 64) break
  }
  return cells.length ? cells : defaultRhythmPattern(beatsPerBar)
}

export function rhythmPatternTotal(cells: RhythmCell[]) {
  return cells.reduce((sum, c) => sum + c.beats, 0)
}

export function rhythmNoteLabel(beats: number, beatsPerBar: number) {
  const r = beats / Math.max(0.001, beatsPerBar)
  if (r >= 0.95) return { glyph: '𝅝', name: 'Ronde' }
  if (Math.abs(beats - (beatsPerBar * 2) / 3) < 0.05) return { glyph: '♩.', name: 'Triolet' }
  if (r >= 0.45) return { glyph: '𝅗', name: 'Blanche' }
  if (Math.abs(beats - beatsPerBar / 3) < 0.05) return { glyph: '⅓', name: 'Triolet' }
  if (r >= 0.22) return { glyph: '♩', name: 'Noire' }
  if (r >= 0.1) return { glyph: '♪', name: 'Croche' }
  return { glyph: '𝅘', name: 'Court' }
}

export function resolveSectionChords(section: StructureSection, key: MusicalKey = DEFAULT_KEY) {
  if (section.customChords.trim()) return parseChordList(section.customChords)
  if (section.progressionId) {
    const evo = getEvolution(section.progressionId)
    if (evo) return evolutionChords(evo, key)
  }
  return [] as string[]
}

export function chordsToMidiNotes(
  chordNames: string[],
  opts: {
    beatsPerChord?: number
    pattern?: number[]
    octave?: number
    velocity?: number
    startBeat?: number
    fillBeats?: number
  } = {},
) {
  const octave = opts.octave ?? 3
  const velocity = opts.velocity ?? 82
  const startBeat = opts.startBeat ?? 0
  const notes: MidiNote[] = []
  if (!chordNames.length) return notes

  const pattern =
    opts.pattern && opts.pattern.length
      ? opts.pattern.filter((b) => b > 0)
      : [opts.beatsPerChord ?? 4]
  if (!pattern.length) return notes

  if (opts.fillBeats && opts.fillBeats > 0) {
    let t = startBeat
    let i = 0
    let p = 0
    const end = startBeat + opts.fillBeats
    while (t < end - 0.001) {
      const slot = pattern[p % pattern.length]
      const dur = Math.min(slot, end - t)
      const parsed = parseChord(chordNames[i % chordNames.length], octave)
      if (parsed && dur > 0.05) notes.push(...chordToNotes(parsed, t, dur * 0.95, velocity))
      t += slot
      i += 1
      p += 1
      if (i > 512) break
    }
    return notes
  }

  chordNames.forEach((name, i) => {
    const parsed = parseChord(name, octave)
    if (!parsed) return
    const beatsPerChord = pattern[i % pattern.length]
    let start = startBeat
    for (let k = 0; k < i; k++) start += pattern[k % pattern.length]
    notes.push(...chordToNotes(parsed, start, beatsPerChord * 0.95, velocity))
  })
  return notes
}

export function defaultStructure(): StructureSection[] {
  return [
    { id: 'sec_intro', kind: 'intro', bars: 2, progressionId: 'soul-maj9', customChords: '' },
    { id: 'sec_couplet', kind: 'couplet', bars: 4, progressionId: 'riviere-jazz', customChords: '' },
    { id: 'sec_refrain', kind: 'refrain', bars: 4, progressionId: 'neo-soul', customChords: '' },
    { id: 'sec_pont', kind: 'pont', bars: 2, progressionId: 'alterne-sombre', customChords: '' },
    { id: 'sec_outro', kind: 'outro', bars: 2, progressionId: 'soul-maj9', customChords: '' },
  ]
}
