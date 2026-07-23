import type { Project } from '@/types/project'
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

export function createDemoProject(): Project {
  const pianoNotes = [
    { pitch: 60, start: 0, duration: 1, velocity: 90 },
    { pitch: 64, start: 0, duration: 1, velocity: 80 },
    { pitch: 67, start: 0, duration: 1, velocity: 80 },
    { pitch: 62, start: 2, duration: 1, velocity: 85 },
    { pitch: 65, start: 2, duration: 1, velocity: 75 },
    { pitch: 69, start: 2, duration: 1, velocity: 75 },
    { pitch: 60, start: 4, duration: 1, velocity: 90 },
    { pitch: 64, start: 4, duration: 1, velocity: 80 },
    { pitch: 67, start: 4, duration: 1, velocity: 80 },
    { pitch: 71, start: 4, duration: 1, velocity: 70 },
    { pitch: 57, start: 6, duration: 1, velocity: 85 },
    { pitch: 60, start: 6, duration: 1, velocity: 75 },
    { pitch: 64, start: 6, duration: 1, velocity: 75 },
    { pitch: 48, start: 8, duration: 2, velocity: 88 },
    { pitch: 52, start: 8, duration: 2, velocity: 78 },
    { pitch: 55, start: 8, duration: 2, velocity: 78 },
    { pitch: 59, start: 8, duration: 2, velocity: 70 },
  ].map((n) => ({ ...n, id: uid('note') }))

  const bassNotes = [
    { pitch: 36, start: 0, duration: 1.5, velocity: 100 },
    { pitch: 36, start: 2, duration: 0.5, velocity: 90 },
    { pitch: 38, start: 2.5, duration: 1.5, velocity: 95 },
    { pitch: 36, start: 4, duration: 1.5, velocity: 100 },
    { pitch: 43, start: 6, duration: 1, velocity: 95 },
    { pitch: 41, start: 7, duration: 1, velocity: 90 },
    { pitch: 36, start: 8, duration: 2, velocity: 100 },
    { pitch: 36, start: 10, duration: 2, velocity: 95 },
    { pitch: 38, start: 12, duration: 2, velocity: 95 },
    { pitch: 36, start: 14, duration: 2, velocity: 100 },
  ].map((n) => ({ ...n, id: uid('note') }))

  const drumNotes = []
  for (let b = 0; b < 16; b++) {
    drumNotes.push({ id: uid('note'), pitch: 36, start: b, duration: 0.2, velocity: b % 4 === 0 ? 110 : 85 })
    if (b % 2 === 1) drumNotes.push({ id: uid('note'), pitch: 38, start: b, duration: 0.15, velocity: 95 })
    drumNotes.push({ id: uid('note'), pitch: 42, start: b, duration: 0.08, velocity: 70 })
    drumNotes.push({ id: uid('note'), pitch: 42, start: b + 0.5, duration: 0.08, velocity: 55 })
  }

  const padNotes = [
    { pitch: 60, start: 0, duration: 8, velocity: 60 },
    { pitch: 67, start: 0, duration: 8, velocity: 50 },
    { pitch: 57, start: 8, duration: 8, velocity: 55 },
    { pitch: 64, start: 8, duration: 8, velocity: 50 },
  ].map((n) => ({ ...n, id: uid('note') }))

  return {
    version: 1,
    name: 'Démo Otty',
    bpm: 108,
    timeSignature: { numerator: 4, denominator: 4 },
    loopEnabled: true,
    loopStart: 0,
    loopEnd: 16,
    lengthBeats: 32,
    tracks: [
      {
        id: uid('trk'),
        name: 'Piano',
        type: 'midi',
        color: TRACK_COLORS[0],
        height: 72,
        volume: 0.85,
        pan: 0,
        mute: false,
        solo: false,
        arm: false,
        instrumentId: 'piano',
        effects: [createTrackEffect('reverb')],
        automation: [],
        audioClips: [],
        midiClips: [
          {
            id: uid('clip'),
            name: 'Accords',
            start: 0,
            duration: 16,
            loopLength: 16,
            notes: pianoNotes,
            color: TRACK_COLORS[0],
          },
        ],
      },
      {
        id: uid('trk'),
        name: 'Basse',
        type: 'midi',
        color: TRACK_COLORS[1],
        height: 64,
        volume: 0.9,
        pan: 0,
        mute: false,
        solo: false,
        arm: false,
        instrumentId: 'bass',
        effects: [createTrackEffect('compressor')],
        automation: [],
        audioClips: [],
        midiClips: [
          {
            id: uid('clip'),
            name: 'Ligne',
            start: 0,
            duration: 16,
            loopLength: 16,
            notes: bassNotes,
            color: TRACK_COLORS[1],
          },
        ],
      },
      {
        id: uid('trk'),
        name: 'Batterie',
        type: 'midi',
        color: TRACK_COLORS[2],
        height: 64,
        volume: 0.8,
        pan: 0,
        mute: false,
        solo: false,
        arm: false,
        instrumentId: 'drums',
        effects: [],
        automation: [],
        audioClips: [],
        midiClips: [
          {
            id: uid('clip'),
            name: 'Groove',
            start: 0,
            duration: 16,
            loopLength: 16,
            notes: drumNotes,
            color: TRACK_COLORS[2],
          },
        ],
      },
      {
        id: uid('trk'),
        name: 'Pads',
        type: 'midi',
        color: TRACK_COLORS[3],
        height: 56,
        volume: 0.55,
        pan: -0.15,
        mute: false,
        solo: false,
        arm: false,
        instrumentId: 'pads',
        effects: [createTrackEffect('reverb'), createTrackEffect('eq')],
        automation: [],
        audioClips: [],
        midiClips: [
          {
            id: uid('clip'),
            name: 'Atmos',
            start: 0,
            duration: 16,
            loopLength: 16,
            notes: padNotes,
            color: TRACK_COLORS[3],
          },
        ],
      },
      {
        id: uid('trk'),
        name: 'Audio',
        type: 'audio',
        color: TRACK_COLORS[4],
        height: 64,
        volume: 0.55,
        pan: 0.1,
        mute: false,
        solo: false,
        arm: false,
        instrumentId: null,
        effects: [createTrackEffect('eq')],
        automation: [],
        audioClips: [
          {
            id: uid('clip'),
            name: 'Tone (placeholder)',
            start: 0,
            duration: 4,
            loopLength: 4,
            offset: 0,
            bufferKey: 'demo_tone',
            color: TRACK_COLORS[4],
          },
        ],
        midiClips: [],
      },
    ],
  }
}
