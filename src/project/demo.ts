import type { MidiNote, Project, Track } from '@/types/project'
import { TRACK_COLORS, uid } from '@/types/project'
import { createTrackEffect } from '@/audio/effects'

export function createEmptyProject(name = 'Sans titre'): Project {
  return {
    version: 1,
    name,
    bpm: 120,
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

function chord(pitches: number[], start: number, duration: number, velocity = 78) {
  return pitches.map((p, i) => note(p, start, duration, Math.max(50, velocity - i * 4)))
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
  const length = opts.length ?? 32
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

// Progression Am – F – C – G (×2) · 32 beats @ ~100 BPM
const PROG = [
  { root: 57, chord: [57, 60, 64, 67], bass: 45 }, // Am7
  { root: 53, chord: [53, 57, 60, 65], bass: 41 }, // F
  { root: 48, chord: [48, 52, 55, 60], bass: 36 }, // C
  { root: 55, chord: [55, 59, 62, 67], bass: 43 }, // G
]

function buildDrums() {
  const notes: MidiNote[] = []
  for (let b = 0; b < 32; b++) {
    const barBeat = b % 4
    // Kick
    if (barBeat === 0 || barBeat === 2) {
      notes.push(note(36, b, 0.22, barBeat === 0 ? 118 : 100))
    }
    if (barBeat === 0) notes.push(note(36, b + 0.75, 0.12, 72)) // syncopation
    // Snare
    if (barBeat === 1 || barBeat === 3) {
      notes.push(note(38, b, 0.16, 108))
      if (b >= 16 && barBeat === 3) notes.push(note(38, b + 0.5, 0.1, 70)) // fill hint
    }
    // Ghost snare
    if (barBeat === 0 || barBeat === 2) notes.push(note(38, b + 0.5, 0.08, 42))
    // Hats
    notes.push(note(42, b, 0.08, barBeat % 2 === 0 ? 78 : 58))
    notes.push(note(42, b + 0.5, 0.08, 48))
    if (b % 8 === 7) notes.push(note(46, b + 0.75, 0.12, 85)) // open hat
    // Tom fill last bar
    if (b >= 30) {
      notes.push(note(50, b, 0.12, 90))
      notes.push(note(47, b + 0.33, 0.12, 88))
      notes.push(note(45, b + 0.66, 0.14, 92))
    }
  }
  return notes
}

function buildBass() {
  const notes: MidiNote[] = []
  for (let i = 0; i < 8; i++) {
    const start = i * 4
    const { bass } = PROG[i % 4]
    notes.push(note(bass, start, 1.4, 112))
    notes.push(note(bass, start + 1.5, 0.4, 88))
    notes.push(note(bass + 7, start + 2, 0.9, 100))
    notes.push(note(bass, start + 3, 0.45, 95))
    notes.push(note(bass + 5, start + 3.5, 0.4, 90))
  }
  return notes
}

function buildKeys() {
  const notes: MidiNote[] = []
  for (let i = 0; i < 8; i++) {
    const start = i * 4
    const c = PROG[i % 4].chord
    // Comping rhythm
    notes.push(...chord(c, start, 1.1, 82))
    notes.push(...chord(c, start + 1.5, 0.45, 68))
    notes.push(...chord([c[0], c[2], c[3]], start + 2.5, 0.7, 74))
    if (i % 2 === 1) notes.push(...chord(c.map((p) => p + 12), start + 3.25, 0.5, 55))
  }
  return notes
}

function buildGuitar() {
  const notes: MidiNote[] = []
  const pattern = [0, 2, 1, 3, 2, 0, 3, 1]
  for (let i = 0; i < 8; i++) {
    const start = i * 4
    const c = PROG[i % 4].chord
    for (let s = 0; s < 8; s++) {
      const p = c[pattern[s] % c.length] + (s % 4 === 3 ? 12 : 0)
      notes.push(note(p, start + s * 0.5, 0.42, 58 + (s % 2) * 10))
    }
  }
  return notes
}

function buildPads() {
  const notes: MidiNote[] = []
  for (let i = 0; i < 8; i++) {
    const start = i * 4
    const c = PROG[i % 4].chord
    notes.push(...chord([c[0] - 12, c[1], c[2], c[3]], start, 3.9, 52))
  }
  return notes
}

function buildStrings() {
  const notes: MidiNote[] = []
  // Counter-melody in higher register
  const line = [
    [64, 0, 1.5], [67, 1.5, 1], [69, 2.5, 1.5],
    [65, 4, 1.5], [64, 5.5, 1], [60, 6.5, 1.5],
    [67, 8, 2], [64, 10, 1], [60, 11, 1],
    [62, 12, 1.5], [59, 13.5, 1], [55, 14.5, 1.5],
  ] as const
  for (const [pitch, start, dur] of line) {
    notes.push(note(pitch, start, dur, 70))
    notes.push(note(pitch, start + 16, dur, 72))
  }
  // Soft pad doubles
  for (let i = 0; i < 8; i++) {
    const c = PROG[i % 4].chord
    notes.push(note(c[2], i * 4, 3.8, 40))
  }
  return notes
}

function buildLead() {
  const notes: MidiNote[] = []
  // Hook enters after 8 beats
  const hook = [
    [72, 8, 0.7], [74, 8.75, 0.45], [76, 9.25, 1.2],
    [74, 10.5, 0.5], [72, 11, 0.9],
    [71, 12, 0.7], [72, 12.75, 0.5], [74, 13.25, 0.9],
    [76, 14.25, 0.6], [79, 14.9, 1.1],
    [76, 16, 0.8], [74, 16.85, 0.5], [72, 17.4, 1.3],
    [69, 18.8, 0.7], [67, 19.6, 1.2],
    [72, 21, 0.6], [74, 21.7, 0.5], [76, 22.3, 1.4],
    [74, 24, 0.8], [72, 24.9, 0.6], [71, 25.6, 0.9],
    [69, 26.6, 0.7], [67, 27.4, 1.1],
    [64, 28.6, 1.2], [67, 29.9, 0.8], [69, 30.8, 1.1],
  ] as const
  for (const [pitch, start, dur] of hook) {
    notes.push(note(pitch, start, dur, 88))
  }
  return notes
}

function buildPluck() {
  const notes: MidiNote[] = []
  for (let i = 0; i < 8; i++) {
    const start = i * 4
    const c = PROG[i % 4].chord
    // Offbeat plucks
    for (const off of [0.5, 1.5, 2.5, 3.5]) {
      notes.push(note(c[1] + 12, start + off, 0.22, 62))
      notes.push(note(c[2] + 12, start + off + 0.25, 0.18, 50))
    }
  }
  return notes
}

export function createDemoProject(): Project {
  const length = 32
  return {
    version: 1,
    name: 'Démo Lutra — Rivière',
    bpm: 100,
    timeSignature: { numerator: 4, denominator: 4 },
    loopEnabled: true,
    loopStart: 0,
    loopEnd: length,
    lengthBeats: 64,
    tracks: [
      midiTrack('Batterie', TRACK_COLORS[2], 'drums', buildDrums(), {
        volume: 0.82,
        height: 68,
        clipName: 'Groove',
        length,
        effects: [createTrackEffect('compressor'), createTrackEffect('eq')],
      }),
      midiTrack('Basse', TRACK_COLORS[1], 'bass', buildBass(), {
        volume: 0.92,
        height: 64,
        clipName: 'Ligne',
        length,
        effects: [createTrackEffect('compressor'), createTrackEffect('saturator')],
      }),
      midiTrack('Piano électrique', TRACK_COLORS[0], 'epiano', buildKeys(), {
        volume: 0.78,
        pan: -0.08,
        height: 72,
        clipName: 'Accords',
        length,
        effects: [createTrackEffect('reverb'), createTrackEffect('chorus')],
      }),
      midiTrack('Guitare', TRACK_COLORS[5] ?? TRACK_COLORS[4], 'guitar-clean', buildGuitar(), {
        volume: 0.58,
        pan: 0.22,
        height: 60,
        clipName: 'Arpèges',
        length,
        effects: [createTrackEffect('reverb'), createTrackEffect('eq')],
      }),
      midiTrack('Pads', TRACK_COLORS[3], 'pads-warm', buildPads(), {
        volume: 0.42,
        pan: -0.12,
        height: 56,
        clipName: 'Atmos',
        length,
        effects: [createTrackEffect('reverb'), createTrackEffect('chorus')],
      }),
      midiTrack('Cordes', TRACK_COLORS[6] ?? TRACK_COLORS[3], 'strings', buildStrings(), {
        volume: 0.48,
        pan: 0.1,
        height: 56,
        clipName: 'Ligne douce',
        length,
        effects: [createTrackEffect('reverb'), createTrackEffect('eq')],
      }),
      midiTrack('Lead sax', TRACK_COLORS[7] ?? TRACK_COLORS[0], 'lead', buildLead(), {
        volume: 0.7,
        pan: 0.05,
        height: 64,
        clipName: 'Hook',
        length,
        effects: [createTrackEffect('reverb'), createTrackEffect('echo')],
      }),
      midiTrack('Pluck', TRACK_COLORS[4], 'lead-pluck', buildPluck(), {
        volume: 0.4,
        pan: -0.2,
        height: 52,
        clipName: 'Sparkle',
        length,
        effects: [createTrackEffect('pingpong'), createTrackEffect('eq')],
      }),
    ],
  }
}
