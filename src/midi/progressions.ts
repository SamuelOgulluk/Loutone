import type { MidiNote } from '@/types/project'
import { chordToNotes, parseChord, parseChordList } from './chords'

export type ModeEvolution = {
  id: string
  label: string
  feel: string
  order: number
  chords: string[]
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

// Ordonnées du plus clair / pop au plus sombre / tendu
export const MODE_EVOLUTIONS: ModeEvolution[] = [
  {
    id: 'pop-clair',
    label: 'Pop claire',
    feel: 'Lumineux, radio-friendly',
    order: 1,
    chords: ['C', 'G', 'Am', 'F'],
  },
  {
    id: 'folk-ouvert',
    label: 'Folk ouvert',
    feel: 'Chaleureux, acoustique',
    order: 2,
    chords: ['G', 'Em', 'C', 'D'],
  },
  {
    id: 'soul-maj9',
    label: 'Soul maj9',
    feel: 'Doux, velours',
    order: 3,
    chords: ['Cmaj9', 'Am7', 'Dm7', 'G7'],
  },
  {
    id: 'riviere-jazz',
    label: 'Rivière jazz',
    feel: 'Élégant, narratif',
    order: 4,
    chords: ['Cmaj9', 'A7(b9)', 'Dm9', 'Fm6', 'Em7', 'Ebdim7', 'Dm7', 'G7(b9)'],
  },
  {
    id: 'neo-soul',
    label: 'Neo-soul',
    feel: 'Moderne, groovy',
    order: 5,
    chords: ['Am9', 'D9', 'Gmaj7', 'Cmaj9'],
  },
  {
    id: 'modal-mixo',
    label: 'Modal Mixolydien',
    feel: 'Rock / blues ouvert',
    order: 6,
    chords: ['G', 'F', 'C', 'G'],
  },
  {
    id: 'dorian-groove',
    label: 'Groove dorien',
    feel: 'Funky, un peu sombre',
    order: 7,
    chords: ['Dm7', 'G7', 'Dm7', 'Am7'],
  },
  {
    id: 'mineur-dramatique',
    label: 'Mineur dramatique',
    feel: 'Sérieux, ciné',
    order: 8,
    chords: ['Am', 'F', 'C', 'G'],
  },
  {
    id: 'triste-relatif',
    label: 'Tristesse relative',
    feel: 'Mélancolique',
    order: 9,
    chords: ['Em', 'C', 'G', 'D'],
  },
  {
    id: 'jazzy-ii-v-i',
    label: 'ii–V–I jazz',
    feel: 'Classique jazz',
    order: 10,
    chords: ['Dm7', 'G7', 'Cmaj7', 'A7'],
  },
  {
    id: 'alterne-sombre',
    label: 'Dominantes altérées',
    feel: 'Tendu, chromatique',
    order: 11,
    chords: ['Cmaj7', 'A7(b9)', 'Dm7', 'G7(b9)'],
  },
  {
    id: 'noir-dim',
    label: 'Passage diminué',
    feel: 'Instable, film noir',
    order: 12,
    chords: ['Am', 'Edim7', 'Dm', 'E7(b9)'],
  },
]

export function getEvolution(id: string) {
  return MODE_EVOLUTIONS.find((e) => e.id === id) ?? null
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

export const CHORD_RHYTHMS: ChordRhythm[] = [
  { id: 'whole', label: 'Ronde', hint: '1 accord / mesure', beatsFor: (b) => b },
  { id: 'half', label: '2 blanches', hint: '2 accords / mesure', beatsFor: (b) => b / 2 },
  { id: 'quarter', label: '4 noires', hint: '4 accords / mesure', beatsFor: (b) => b / 4 },
  { id: 'eighth', label: '8 croches', hint: '8 accords / mesure', beatsFor: (b) => b / 8 },
  { id: 'triplet', label: 'Triolets', hint: '3 accords / mesure', beatsFor: (b) => b / 3 },
  {
    id: 'triplet-half',
    label: 'Triolets de blanches',
    hint: '3 accords / 2 mesures',
    beatsFor: (b) => (b * 2) / 3,
  },
]

export function getChordRhythm(id: string) {
  return CHORD_RHYTHMS.find((r) => r.id === id) ?? CHORD_RHYTHMS[0]
}

export function resolveSectionChords(section: StructureSection) {
  if (section.customChords.trim()) return parseChordList(section.customChords)
  if (section.progressionId) {
    const evo = getEvolution(section.progressionId)
    if (evo) return [...evo.chords]
  }
  return [] as string[]
}

export function chordsToMidiNotes(
  chordNames: string[],
  opts: {
    beatsPerChord?: number
    octave?: number
    velocity?: number
    startBeat?: number
    fillBeats?: number
  } = {},
) {
  const beatsPerChord = opts.beatsPerChord ?? 4
  const octave = opts.octave ?? 3
  const velocity = opts.velocity ?? 82
  const startBeat = opts.startBeat ?? 0
  const notes: MidiNote[] = []
  if (!chordNames.length || beatsPerChord <= 0) return notes

  if (opts.fillBeats && opts.fillBeats > 0) {
    let t = startBeat
    let i = 0
    const end = startBeat + opts.fillBeats
    while (t < end - 0.001) {
      const parsed = parseChord(chordNames[i % chordNames.length], octave)
      const dur = Math.min(beatsPerChord, end - t)
      if (parsed && dur > 0.05) notes.push(...chordToNotes(parsed, t, dur * 0.95, velocity))
      t += beatsPerChord
      i += 1
      if (i > 512) break
    }
    return notes
  }

  chordNames.forEach((name, i) => {
    const parsed = parseChord(name, octave)
    if (!parsed) return
    const start = startBeat + i * beatsPerChord
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
