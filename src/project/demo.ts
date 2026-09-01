import type { MidiNote, Project, Track } from '@/types/project'
import { TRACK_COLORS, uid } from '@/types/project'
import { createTrackEffect } from '@/audio/effects'
import type { EffectType } from '@/types/project'

export function createEmptyProject(name = 'Sans titre'): Project {
  return {
    version: 1,
    name,
    bpm: 84,
    timeSignature: { numerator: 4, denominator: 4 },
    loopEnabled: true,
    loopStart: 0,
    loopEnd: 16,
    lengthBeats: 32,
    tracks: [],
  }
}

function note(pitch: number, start: number, duration: number, velocity = 90): MidiNote {
  return { id: uid('note'), pitch, start, duration, velocity }
}

function chord(pitches: number[], start: number, duration: number, velocity = 72) {
  return pitches.map((p, i) => note(p, start, duration, Math.max(48, velocity - i * 3)))
}

function fx(type: EffectType, extra: Record<string, number | boolean> = {}) {
  const e = createTrackEffect(type)
  Object.assign(e.params, extra)
  return e
}

function midiTrack(
  name: string,
  color: string,
  instrumentId: string,
  notes: MidiNote[],
  opts: {
    volume?: number
    pan?: number
    height?: number
    effects?: ReturnType<typeof createTrackEffect>[]
    clipName?: string
    length?: number
  } = {},
): Track {
  const length = opts.length ?? 64
  return {
    id: uid('trk'),
    name,
    type: 'midi',
    color,
    height: opts.height ?? 64,
    volume: opts.volume ?? 0.8,
    pan: opts.pan ?? 0,
    mute: false,
    solo: false,
    arm: false,
    instrumentId,
    effects: opts.effects ?? [],
    automation: [],
    audioClips: [],
    midiClips: [
      {
        id: uid('clip'),
        name: opts.clipName ?? name,
        start: 0,
        duration: length,
        loopLength: length,
        notes,
        color,
      },
    ],
  }
}

// i – iv – bVII – III – bVI – iiø – V – i (Cm), 16 mesures @ 84 BPM
const BARS = [
  { bass: 36, chord: [51, 55, 58, 62] }, // Cm9
  { bass: 41, chord: [53, 56, 60, 63] }, // Fm7
  { bass: 34, chord: [50, 56, 60, 65] }, // Bb13
  { bass: 39, chord: [55, 58, 62, 65] }, // Ebmaj9
  { bass: 44, chord: [48, 51, 55, 60] }, // Abmaj7
  { bass: 38, chord: [50, 53, 56, 60] }, // Dm7b5
  { bass: 43, chord: [48, 53, 55, 60] }, // G7sus
  { bass: 36, chord: [51, 55, 58, 62] }, // Cm9
  { bass: 36, chord: [51, 55, 58, 67] }, // Cm11
  { bass: 41, chord: [53, 56, 60, 65] }, // Fm9
  { bass: 34, chord: [50, 55, 56, 60] }, // Bb9
  { bass: 39, chord: [53, 55, 58, 62] }, // Ebmaj7
  { bass: 44, chord: [48, 51, 55, 63] }, // Abmaj9
  { bass: 43, chord: [47, 53, 55, 62] }, // G7
  { bass: 36, chord: [51, 55, 58, 62] }, // Cm9
  { bass: 36, chord: [48, 55, 58, 63] }, // Cm (land)
] as const

function buildDrums() {
  const notes: MidiNote[] = []
  for (let bar = 0; bar < 16; bar++) {
    const s = bar * 4
    const open = bar >= 8
    notes.push(note(36, s, 0.28, open ? 112 : 100))
    notes.push(note(36, s + 2.75, 0.18, open ? 92 : 80))
    if (open && bar % 2 === 0) notes.push(note(36, s + 1.75, 0.12, 70))
    notes.push(note(38, s + 1, 0.16, 102))
    notes.push(note(38, s + 3, 0.16, 96))
    if (bar % 2 === 1) notes.push(note(38, s + 2.5, 0.08, 30))
    const hats = [58, 34, 48, 32, 54, 36, 46, 30]
    for (let i = 0; i < 8; i++) {
      if (bar < 2 && i % 2 === 1) continue
      notes.push(note(42, s + i * 0.5, 0.08, hats[i] + (open ? 6 : 0)))
    }
    if (bar === 7 || bar === 15) notes.push(note(42, s + 3.5, 0.2, 88))
  }
  return notes
}

function bassRoot(midi: number) {
  return midi > 40 ? midi - 12 : midi
}

function buildBass() {
  const notes: MidiNote[] = []
  for (let i = 0; i < 16; i++) {
    const s = i * 4
    const root = bassRoot(BARS[i].bass)
    const next = bassRoot(BARS[(i + 1) % 16].bass)
    const lift = i >= 8
    const color = root + (root % 12 === 8 || root % 12 === 3 ? 4 : 7)
    const colorTone = color > 50 ? root - 5 : color

    if (i === 7 || i === 15) {
      notes.push(note(root, s, 2.2, 104))
      notes.push(note(colorTone, s + 2.35, 0.32, 76))
      const approach = next > root ? next - 2 : next + 2
      notes.push(note(approach, s + 2.85, 0.38, 84))
      notes.push(note(next, s + 3.4, 0.5, 96))
      continue
    }

    notes.push(note(root, s, 0.95, lift ? 110 : 104))
    notes.push(note(root, s + 1.5, 0.14, 48))

    if (i % 2 === 0) {
      notes.push(note(root, s + 2.25, 0.2, 70))
      notes.push(note(root, s + 2.75, 0.55, 98))
    } else {
      notes.push(note(colorTone, s + 2.05, 0.28, 78))
      notes.push(note(root, s + 2.75, 0.48, 96))
    }

    if (i % 4 === 3) {
      const approach = next > root ? next - 1 : root - 1
      notes.push(note(approach, s + 3.5, 0.4, 88))
    } else if (lift) {
      notes.push(note(root, s + 3.5, 0.16, 58))
    }
  }
  return notes
}

function buildKeys() {
  const notes: MidiNote[] = []
  for (let i = 0; i < 16; i++) {
    const s = i * 4
    const c = [...BARS[i].chord]
    notes.push(...chord(c, s, 1.65, 76))
    if (i === 7 || i === 15) {
      notes.push(...chord(c, s + 2, 1.8, 62))
      continue
    }
    notes.push(...chord([c[0], c[2]], s + 2, 0.35, 64))
    notes.push(...chord(c, s + 2.75, 1.05, 70))
  }
  return notes
}

function buildPads() {
  const notes: MidiNote[] = []
  for (let i = 0; i < 16; i++) {
    const c = BARS[i].chord
    notes.push(...chord([c[0] - 12, c[1], c[2]], i * 4, 3.85, 46))
  }
  return notes
}

function buildGuitar() {
  const notes: MidiNote[] = []
  for (let i = 8; i < 16; i++) {
    const s = i * 4
    const c = BARS[i].chord
    notes.push(note(c[1] + 12, s + 1, 0.28, 52))
    notes.push(note(c[2] + 12, s + 1.12, 0.22, 44))
    notes.push(note(c[0] + 12, s + 3, 0.32, 50))
    notes.push(note(c[2] + 12, s + 3.15, 0.24, 42))
  }
  return notes
}

function buildMelody() {
  const notes: MidiNote[] = []
  const line = [
    [67, 0.75, 1.6, 84], [70, 2.6, 0.35, 76], [72, 3.1, 1.7, 88],
    [70, 5.1, 0.9, 80], [67, 6.2, 1.5, 78],
    [65, 8.5, 0.85, 76], [67, 9.5, 0.4, 74], [68, 10.05, 1.55, 82],
    [67, 12.0, 1.5, 80], [63, 13.75, 2.0, 76],
    [67, 16.75, 1.5, 86], [70, 18.5, 0.35, 78], [72, 19.0, 1.65, 90],
    [70, 20.9, 0.7, 80], [68, 21.75, 0.55, 76], [67, 22.5, 1.25, 78],
    [65, 24.5, 0.7, 76], [63, 25.4, 0.45, 74], [62, 26.0, 1.5, 78],
    [60, 28.0, 3.5, 84],
    [72, 32.75, 1.4, 88], [70, 34.4, 0.4, 80], [67, 34.95, 1.55, 82],
    [65, 36.75, 1.35, 78], [63, 38.35, 1.4, 76],
    [65, 40.5, 0.85, 78], [67, 41.5, 0.4, 76], [68, 42.05, 1.5, 84],
    [67, 44.0, 1.35, 80], [63, 45.6, 2.05, 76],
    [68, 48.75, 1.25, 82], [67, 50.2, 0.45, 76], [65, 50.8, 1.7, 80],
    [67, 53.0, 0.7, 78], [65, 53.85, 0.7, 74], [63, 54.7, 0.9, 76],
    [60, 56.0, 7.5, 86],
  ] as const
  for (const [pitch, start, dur, vel] of line) notes.push(note(pitch, start, dur, vel))
  return notes
}

function buildStrings() {
  const notes: MidiNote[] = []
  for (let i = 8; i < 16; i++) {
    const c = BARS[i].chord
    notes.push(note(c[2], i * 4, 3.7, 38))
    notes.push(note(c[c.length - 1], i * 4 + 0.05, 3.6, 32))
  }
  return notes
}

export function createDemoProject(): Project {
  const length = 64
  return {
    version: 1,
    name: 'Démo Loutone — Fenêtre',
    bpm: 84,
    timeSignature: { numerator: 4, denominator: 4 },
    loopEnabled: true,
    loopStart: 0,
    loopEnd: length,
    lengthBeats: 64,
    tracks: [
      midiTrack('Batterie', TRACK_COLORS[2], 'drums', buildDrums(), {
        volume: 0.74,
        height: 66,
        clipName: 'Pocket',
        length,
        effects: [fx('compressor', { threshold: -16, ratio: 2.4 }), fx('eq', { high: 2 })],
      }),
      midiTrack('Basse', TRACK_COLORS[1], 'bass', buildBass(), {
        volume: 0.82,
        height: 62,
        clipName: 'Poche',
        length,
        effects: [fx('compressor', { threshold: -18, ratio: 2.2 }), fx('eq', { low: 1.5, high: -1.5 })],
      }),
      midiTrack('Rhodes', TRACK_COLORS[0], 'epiano', buildKeys(), {
        volume: 0.72,
        pan: -0.06,
        height: 70,
        clipName: 'Voicings',
        length,
        effects: [fx('reverb', { mix: 0.32, decay: 2.8 }), fx('chorus', { mix: 0.22, rate: 0.22, depth: 0.4 })],
      }),
      midiTrack('Pads', TRACK_COLORS[3], 'pads-warm', buildPads(), {
        volume: 0.3,
        pan: -0.1,
        height: 52,
        clipName: 'Air',
        length,
        effects: [fx('reverb', { mix: 0.55, decay: 3.6 }), fx('chorus', { mix: 0.18 })],
      }),
      midiTrack('Guitare', TRACK_COLORS[5] ?? TRACK_COLORS[4], 'guitar-clean', buildGuitar(), {
        volume: 0.42,
        pan: 0.28,
        height: 54,
        clipName: 'Réponses',
        length,
        effects: [fx('reverb', { mix: 0.4, decay: 2.4 }), fx('echo', { mix: 0.18, time: 0.36, feedback: 0.22 })],
      }),
      midiTrack('Mélodie', TRACK_COLORS[7] ?? TRACK_COLORS[0], 'piano', buildMelody(), {
        volume: 0.64,
        pan: 0.04,
        height: 64,
        clipName: 'Thème',
        length,
        effects: [fx('reverb', { mix: 0.28, decay: 2.6 }), fx('eq', { high: 1.5 })],
      }),
      midiTrack('Cordes', TRACK_COLORS[6] ?? TRACK_COLORS[3], 'strings', buildStrings(), {
        volume: 0.34,
        pan: 0.12,
        height: 50,
        clipName: 'Halo',
        length,
        effects: [fx('reverb', { mix: 0.48, decay: 3.2 }), fx('eq', { low: -3 })],
      }),
    ],
  }
}
