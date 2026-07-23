import { create } from 'zustand'
import type {
  AudioClip,
  AutomationPoint,
  AutomationTargetMode,
  MidiClip,
  MidiNote,
  Project,
  QuantizeDivision,
  Track,
  TrackEffect,
  EffectType,
} from '@/types/project'
import { TRACK_COLORS, clipLoopLength, uid } from '@/types/project'
import { createDemoProject, createEmptyProject } from '@/project/demo'
import { createTrackEffect } from '@/audio/effects'
import {
  clamp01,
  ensureAutomationLane,
  findLane,
  resolveAutomationTarget,
  withEnsuredLane,
} from '@/audio/automation'
import { applySwing, quantizeNotes } from '@/midi/chords'
import { audioEngine } from '@/audio/engine'
import { preloadPackForInstrument } from '@/instruments/sampleBank'
import { getInstrument } from '@/instruments'

type Selection = {
  trackId: string | null
  clipId: string | null
  selectedClipIds: string[]
  noteIds: string[]
  effectId: string | null
}

type ClipboardClip =
  | { kind: 'midi'; trackId: string; clip: MidiClip }
  | { kind: 'audio'; trackId: string; clip: AudioClip }

type ClipClipboard = {
  items: ClipboardClip[]
}

type NoteClipboard = {
  notes: MidiNote[]
}

type ClipboardKind = 'clips' | 'notes'

const HISTORY_LIMIT = 80
const HISTORY_COALESCE_MS = 750

type DawState = {
  project: Project
  selection: Selection
  clipClipboard: ClipClipboard
  noteClipboard: NoteClipboard
  lastClipboard: ClipboardKind
  past: Project[]
  future: Project[]
  historyCoalesceKey: string | null
  historyCoalesceAt: number
  playing: boolean
  positionBeat: number
  snap: boolean
  quantizeDivision: QuantizeDivision
  quantizeStrength: number
  swingAmount: number
  zoom: number
  pianoRollOpen: boolean
  metronome: boolean
  meters: Record<string, number>
  automationTarget: AutomationTargetMode
  automationOpenIds: string[]
  setProject: (project: Project) => void
  newProject: () => void
  loadDemo: () => void
  setName: (name: string) => void
  setBpm: (bpm: number) => void
  setTimeSignature: (numerator: number, denominator: number) => void
  setLoop: (enabled: boolean, start?: number, end?: number) => void
  setZoom: (zoom: number) => void
  setSnap: (snap: boolean) => void
  setQuantize: (division: QuantizeDivision, strength?: number) => void
  setSwing: (amount: number) => void
  setPianoRollOpen: (open: boolean) => void
  setMetronome: (on: boolean) => void
  setSelection: (sel: Partial<Selection>) => void
  selectClips: (clipIds: string[], trackId?: string | null, focusClipId?: string | null) => void
  toggleClipSelection: (clipId: string, trackId: string) => void
  setPositionBeat: (beat: number) => void
  setPlaying: (playing: boolean) => void
  setMeters: (meters: Record<string, number>) => void
  pushHistory: (coalesceKey?: string) => void
  endHistoryGesture: () => void
  undo: () => void
  redo: () => void
  addMidiTrack: (instrumentId: string, name?: string) => void
  addAudioTrack: (name?: string) => void
  addBlankTrack: (type?: 'midi' | 'audio') => void
  assignInstrument: (trackId: string, instrumentId: string, name?: string) => void
  updateTrack: (trackId: string, patch: Partial<Track>) => void
  removeTrack: (trackId: string) => void
  addMidiClip: (trackId: string, clip: Omit<MidiClip, 'id'> & { id?: string }) => void
  updateMidiClip: (trackId: string, clipId: string, patch: Partial<MidiClip>) => void
  addAudioClip: (trackId: string, clip: Omit<AudioClip, 'id'> & { id?: string }) => void
  updateAudioClip: (trackId: string, clipId: string, patch: Partial<AudioClip>) => void
  removeClip: (trackId: string, clipId: string) => void
  removeSelectedClips: () => void
  copySelectedClips: () => void
  cutSelectedClips: () => void
  pasteClips: (atBeat?: number) => void
  copySelectedNotes: () => boolean
  cutSelectedNotes: () => boolean
  pasteNotes: (atBeat?: number) => boolean
  duplicateSelectedClips: () => void
  splitSelectedClipsAtPlayhead: () => void
  moveClipsBy: (clipIds: string[], deltaBeats: number) => void
  addNote: (trackId: string, clipId: string, note: Omit<MidiNote, 'id'> & { id?: string }) => void
  updateNote: (trackId: string, clipId: string, noteId: string, patch: Partial<MidiNote>) => void
  removeNotes: (trackId: string, clipId: string, noteIds: string[]) => void
  quantizeSelected: () => void
  applySwingSelected: () => void
  addEffect: (trackId: string, type: EffectType) => void
  addEffectToSelectedTrack: (type: EffectType) => void
  updateEffect: (trackId: string, effectId: string, params: Partial<TrackEffect['params']>) => void
  removeEffect: (trackId: string, effectId: string) => void
  moveEffect: (trackId: string, effectId: string, dir: -1 | 1) => void
  setAutomationTarget: (mode: AutomationTargetMode) => void
  toggleAutomationOpen: (trackId: string) => void
  setAutomationOpen: (trackId: string, open: boolean) => void
  addAutomationPoint: (trackId: string, beat: number, value: number) => void
  updateAutomationPoint: (
    trackId: string,
    pointId: string,
    patch: Partial<Pick<AutomationPoint, 'beat' | 'value'>>,
    coalesce?: boolean,
  ) => void
  removeAutomationPoint: (trackId: string, pointId: string) => void
  syncEngine: () => void
}

function emptySelection(): Selection {
  return { trackId: null, clipId: null, selectedClipIds: [], noteIds: [], effectId: null }
}

function withSync(get: () => DawState, project: Project) {
  queueMicrotask(() => {
    audioEngine.syncProject(project)
    get().setPlaying(get().playing)
  })
  return project
}

function ensureMidiClip(clip: Omit<MidiClip, 'id'> & { id?: string }): MidiClip {
  const duration = Math.max(0.25, clip.duration)
  return {
    ...clip,
    id: clip.id ?? uid('clip'),
    duration,
    loopLength: clipLoopLength({ loopLength: clip.loopLength, duration }),
    notes: clip.notes ?? [],
  }
}

function ensureAudioClip(clip: Omit<AudioClip, 'id'> & { id?: string }): AudioClip {
  const duration = Math.max(0.25, clip.duration)
  return {
    ...clip,
    id: clip.id ?? uid('clip'),
    duration,
    loopLength: clipLoopLength({ loopLength: clip.loopLength, duration }),
    offset: clip.offset ?? 0,
  }
}

function findClipRef(project: Project, clipId: string) {
  for (const track of project.tracks) {
    const midi = track.midiClips.find((c) => c.id === clipId)
    if (midi) return { track, kind: 'midi' as const, clip: midi }
    const audio = track.audioClips.find((c) => c.id === clipId)
    if (audio) return { track, kind: 'audio' as const, clip: audio }
  }
  return null
}

function cloneMidiClip(clip: MidiClip, patch?: Partial<MidiClip>): MidiClip {
  return {
    ...clip,
    ...patch,
    id: patch?.id ?? uid('clip'),
    notes: (patch?.notes ?? clip.notes).map((n) => ({ ...n, id: uid('note') })),
  }
}

function cloneAudioClip(clip: AudioClip, patch?: Partial<AudioClip>): AudioClip {
  return {
    ...clip,
    ...patch,
    id: patch?.id ?? uid('clip'),
  }
}

function gatherClipboard(project: Project, clipIds: string[]): ClipboardClip[] {
  const items: ClipboardClip[] = []
  for (const id of clipIds) {
    const ref = findClipRef(project, id)
    if (!ref) continue
    if (ref.kind === 'midi') {
      items.push({ kind: 'midi', trackId: ref.track.id, clip: cloneMidiClip(ref.clip, { id: ref.clip.id }) })
    } else {
      items.push({ kind: 'audio', trackId: ref.track.id, clip: cloneAudioClip(ref.clip, { id: ref.clip.id }) })
    }
  }
  return items
}

function selectionClipIds(selection: Selection) {
  if (selection.selectedClipIds.length) return selection.selectedClipIds
  if (selection.clipId) return [selection.clipId]
  return []
}

const SPLIT_EDGE = 0.001

function playheadInsideClip(clip: { start: number; duration: number }, positionBeat: number) {
  const rel = positionBeat - clip.start
  return rel > SPLIT_EDGE && rel < clip.duration - SPLIT_EDGE
}

function splitMidiNotesAt(notes: MidiNote[], cut: number) {
  const left = notes
    .filter((n) => n.start < cut)
    .map((n) => ({
      ...n,
      id: uid('note'),
      duration: Math.min(n.duration, cut - n.start),
    }))
  const right = notes
    .filter((n) => n.start + n.duration > cut)
    .map((n) => {
      const start = Math.max(0, n.start - cut)
      return {
        ...n,
        id: uid('note'),
        start,
        duration: n.start < cut ? n.start + n.duration - cut : n.duration,
      }
    })
  return { left, right }
}

function mapTracksWithClips(
  project: Project,
  mutator: (track: Track) => Track,
) {
  return { ...project, tracks: project.tracks.map(mutator) }
}

function cloneProject(project: Project) {
  return structuredClone(project)
}

function recordHistory(get: () => DawState, set: (partial: Partial<DawState>) => void, coalesceKey?: string) {
  const s = get()
  const now = performance.now()
  if (
    coalesceKey &&
    coalesceKey === s.historyCoalesceKey &&
    now - s.historyCoalesceAt < HISTORY_COALESCE_MS
  ) {
    return
  }
  const past = [...s.past, cloneProject(s.project)].slice(-HISTORY_LIMIT)
  set({
    past,
    future: [],
    historyCoalesceKey: coalesceKey ?? null,
    historyCoalesceAt: now,
  })
}

function clearHistoryStacks() {
  return {
    past: [] as Project[],
    future: [] as Project[],
    historyCoalesceKey: null as string | null,
    historyCoalesceAt: 0,
  }
}

export const useDawStore = create<DawState>((set, get) => ({
  project: createDemoProject(),
  selection: emptySelection(),
  clipClipboard: { items: [] },
  noteClipboard: { notes: [] },
  lastClipboard: 'clips',
  past: [],
  future: [],
  historyCoalesceKey: null,
  historyCoalesceAt: 0,
  playing: false,
  positionBeat: 0,
  snap: true,
  quantizeDivision: 16,
  quantizeStrength: 1,
  swingAmount: 0,
  zoom: 48,
  pianoRollOpen: true,
  metronome: false,
  meters: {},
  automationTarget: 'volume',
  automationOpenIds: [],
  setProject: (project) => {
    set({
      project: withSync(get, project),
      selection: { ...emptySelection(), trackId: project.tracks[0]?.id ?? null },
      automationOpenIds: [],
      ...clearHistoryStacks(),
    })
  },
  newProject: () => get().setProject(createEmptyProject()),
  loadDemo: () => get().setProject(createDemoProject()),
  setName: (name) => {
    recordHistory(get, set)
    set((s) => ({ project: { ...s.project, name } }))
  },
  setBpm: (bpm) => {
    recordHistory(get, set, 'bpm')
    const project = { ...get().project, bpm: Math.max(20, Math.min(300, bpm)) }
    set({ project })
    audioEngine.setBpm(project.bpm)
    audioEngine.syncProject(project)
  },
  setTimeSignature: (numerator, denominator) => {
    recordHistory(get, set)
    set((s) => ({ project: { ...s.project, timeSignature: { numerator, denominator } } }))
  },
  setLoop: (enabled, start, end) => {
    recordHistory(get, set, 'loop')
    const s = get()
    let loopStart = start ?? s.project.loopStart
    let loopEnd = end ?? s.project.loopEnd
    if (loopEnd < loopStart) {
      const t = loopStart
      loopStart = loopEnd
      loopEnd = t
    }
    if (loopEnd - loopStart < 0.25) loopEnd = loopStart + 0.25
    const project = {
      ...s.project,
      loopEnabled: enabled,
      loopStart: Math.max(0, loopStart),
      loopEnd: Math.max(0.25, loopEnd),
    }
    set({ project })
    audioEngine.syncProject(project)
  },
  setZoom: (zoom) => set({ zoom: Math.max(12, Math.min(160, zoom)) }),
  setSnap: (snap) => set({ snap }),
  setQuantize: (division, strength) =>
    set({ quantizeDivision: division, quantizeStrength: strength ?? get().quantizeStrength }),
  setSwing: (amount) => set({ swingAmount: Math.max(0, Math.min(1, amount)) }),
  setPianoRollOpen: (open) => set({ pianoRollOpen: open }),
  setMetronome: (on) => {
    set({ metronome: on })
    audioEngine.setMetronome(on)
  },
  setSelection: (sel) =>
    set((s) => {
      const next = { ...s.selection, ...sel }
      if (sel.clipId !== undefined && sel.selectedClipIds === undefined) {
        next.selectedClipIds = sel.clipId ? [sel.clipId] : []
      }
      if (sel.trackId !== undefined && sel.effectId === undefined && sel.trackId !== s.selection.trackId) {
        next.effectId = null
      }
      return { selection: next }
    }),
  selectClips: (clipIds, trackId, focusClipId) => {
    const ids = [...new Set(clipIds)]
    const focus = focusClipId ?? ids[ids.length - 1] ?? null
    let resolvedTrack = trackId ?? null
    if (!resolvedTrack && focus) {
      resolvedTrack = findClipRef(get().project, focus)?.track.id ?? null
    }
    set({
      selection: {
        trackId: resolvedTrack ?? get().selection.trackId,
        clipId: focus,
        selectedClipIds: ids,
        noteIds: [],
        effectId: get().selection.effectId,
      },
    })
  },
  toggleClipSelection: (clipId, trackId) => {
    const { selection } = get()
    const has = selection.selectedClipIds.includes(clipId)
    const ids = has
      ? selection.selectedClipIds.filter((id) => id !== clipId)
      : [...selection.selectedClipIds, clipId]
    const focus = has
      ? (ids[ids.length - 1] ?? null)
      : clipId
    set({
      selection: {
        trackId,
        clipId: focus,
        selectedClipIds: ids,
        noteIds: [],
        effectId: trackId === selection.trackId ? selection.effectId : null,
      },
    })
  },
  setPositionBeat: (beat) => set({ positionBeat: beat }),
  setPlaying: (playing) => set({ playing }),
  setMeters: (meters) => set({ meters }),
  pushHistory: (coalesceKey) => recordHistory(get, set, coalesceKey),
  endHistoryGesture: () => set({ historyCoalesceKey: null, historyCoalesceAt: 0 }),
  undo: () => {
    const s = get()
    if (!s.past.length) return
    const previous = s.past[s.past.length - 1]
    const past = s.past.slice(0, -1)
    const future = [cloneProject(s.project), ...s.future].slice(0, HISTORY_LIMIT)
    set({
      project: withSync(get, previous),
      past,
      future,
      historyCoalesceKey: null,
      historyCoalesceAt: 0,
    })
  },
  redo: () => {
    const s = get()
    if (!s.future.length) return
    const next = s.future[0]
    const future = s.future.slice(1)
    const past = [...s.past, cloneProject(s.project)].slice(-HISTORY_LIMIT)
    set({
      project: withSync(get, next),
      past,
      future,
      historyCoalesceKey: null,
      historyCoalesceAt: 0,
    })
  },
  addMidiTrack: (instrumentId, name) => {
    recordHistory(get, set)
    const s = get()
    const color = TRACK_COLORS[s.project.tracks.length % TRACK_COLORS.length]
    const clipId = uid('clip')
    const track: Track = {
      id: uid('trk'),
      name: name ?? instrumentId,
      type: 'midi',
      color,
      height: 64,
      volume: 0.85,
      pan: 0,
      mute: false,
      solo: false,
      arm: false,
      instrumentId,
      effects: [],
      automation: [],
      audioClips: [],
      midiClips: [
        {
          id: clipId,
          name: 'Clip',
          start: 0,
          duration: 8,
          loopLength: 8,
          notes: [],
          color,
        },
      ],
    }
    const project = { ...s.project, tracks: [...s.project.tracks, track] }
    set({
      project: withSync(get, project),
      selection: { trackId: track.id, clipId, selectedClipIds: [clipId], noteIds: [], effectId: null },
    })
  },
  addAudioTrack: (name) => {
    recordHistory(get, set)
    const s = get()
    const color = TRACK_COLORS[s.project.tracks.length % TRACK_COLORS.length]
    const track: Track = {
      id: uid('trk'),
      name: name ?? 'Audio',
      type: 'audio',
      color,
      height: 64,
      volume: 0.85,
      pan: 0,
      mute: false,
      solo: false,
      arm: false,
      instrumentId: null,
      effects: [],
      automation: [],
      audioClips: [],
      midiClips: [],
    }
    const project = { ...s.project, tracks: [...s.project.tracks, track] }
    set({
      project: withSync(get, project),
      selection: { trackId: track.id, clipId: null, selectedClipIds: [], noteIds: [], effectId: null },
    })
  },
  addBlankTrack: (type = 'midi') => {
    recordHistory(get, set)
    const s = get()
    const color = TRACK_COLORS[s.project.tracks.length % TRACK_COLORS.length]
    const isAudio = type === 'audio'
    const track: Track = {
      id: uid('trk'),
      name: isAudio ? 'Audio' : 'Piste',
      type: isAudio ? 'audio' : 'midi',
      color,
      height: 64,
      volume: 0.85,
      pan: 0,
      mute: false,
      solo: false,
      arm: false,
      instrumentId: null,
      effects: [],
      automation: [],
      audioClips: [],
      midiClips: [],
    }
    const project = { ...s.project, tracks: [...s.project.tracks, track] }
    set({
      project: withSync(get, project),
      selection: { trackId: track.id, clipId: null, selectedClipIds: [], noteIds: [], effectId: null },
    })
  },
  assignInstrument: (trackId, instrumentId, name) => {
    recordHistory(get, set)
    void preloadPackForInstrument(instrumentId)
    const s = get()
    const track = s.project.tracks.find((t) => t.id === trackId)
    if (!track) return
    const prevInst = track.instrumentId ? getInstrument(track.instrumentId) : null
    // Renomme seulement si le nom suit encore l'ancien instrument (ou nom générique)
    const rename =
      track.type === 'audio' ||
      !track.instrumentId ||
      track.name === 'Piste' ||
      track.name === 'Audio' ||
      (prevInst != null && track.name === prevInst.name) ||
      (!!name && track.name === track.instrumentId)
    const project = {
      ...s.project,
      tracks: s.project.tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              type: 'midi' as const,
              instrumentId,
              name: rename && name ? name : t.name,
            }
          : t,
      ),
    }
    set({
      project: withSync(get, project),
      selection: {
        ...s.selection,
        trackId,
        effectId: null,
      },
    })
  },
  updateTrack: (trackId, patch) => {
    const keys = Object.keys(patch)
    const coalesce =
      keys.length === 1 && (keys[0] === 'volume' || keys[0] === 'pan' || keys[0] === 'height')
        ? `track-${trackId}-${keys[0]}`
        : keys.length === 1 && keys[0] === 'effects'
          ? `track-${trackId}-fx`
          : undefined
    recordHistory(get, set, coalesce)
    const project = {
      ...get().project,
      tracks: get().project.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)),
    }
    set({ project: withSync(get, project) })
  },
  removeTrack: (trackId) => {
    recordHistory(get, set)
    const project = { ...get().project, tracks: get().project.tracks.filter((t) => t.id !== trackId) }
    const sel = get().selection
    set({
      project: withSync(get, project),
      selection: sel.trackId === trackId ? emptySelection() : sel,
      automationOpenIds: get().automationOpenIds.filter((id) => id !== trackId),
    })
  },
  addMidiClip: (trackId, clip) => {
    recordHistory(get, set)
    const full = ensureMidiClip(clip)
    const project = {
      ...get().project,
      tracks: get().project.tracks.map((t) =>
        t.id === trackId ? { ...t, midiClips: [...t.midiClips, full] } : t,
      ),
    }
    set({ project: withSync(get, project) })
  },
  updateMidiClip: (trackId, clipId, patch) => {
    recordHistory(get, set, 'clip-edit')
    const project = {
      ...get().project,
      tracks: get().project.tracks.map((t) =>
        t.id === trackId
          ? { ...t, midiClips: t.midiClips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) }
          : t,
      ),
    }
    set({ project: withSync(get, project) })
  },
  addAudioClip: (trackId, clip) => {
    recordHistory(get, set)
    const full = ensureAudioClip(clip)
    const project = {
      ...get().project,
      tracks: get().project.tracks.map((t) =>
        t.id === trackId ? { ...t, audioClips: [...t.audioClips, full] } : t,
      ),
    }
    set({ project: withSync(get, project) })
  },
  updateAudioClip: (trackId, clipId, patch) => {
    recordHistory(get, set, 'clip-edit')
    const project = {
      ...get().project,
      tracks: get().project.tracks.map((t) =>
        t.id === trackId
          ? { ...t, audioClips: t.audioClips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) }
          : t,
      ),
    }
    set({ project: withSync(get, project) })
  },
  removeClip: (trackId, clipId) => {
    recordHistory(get, set)
    const project = {
      ...get().project,
      tracks: get().project.tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              midiClips: t.midiClips.filter((c) => c.id !== clipId),
              audioClips: t.audioClips.filter((c) => c.id !== clipId),
            }
          : t,
      ),
    }
    const sel = get().selection
    const selectedClipIds = sel.selectedClipIds.filter((id) => id !== clipId)
    set({
      project: withSync(get, project),
      selection: {
        ...sel,
        clipId: sel.clipId === clipId ? (selectedClipIds[0] ?? null) : sel.clipId,
        selectedClipIds,
      },
    })
  },
  removeSelectedClips: () => {
    const { selection, project } = get()
    const ids = new Set(selection.selectedClipIds.length ? selection.selectedClipIds : selection.clipId ? [selection.clipId] : [])
    if (!ids.size) return
    recordHistory(get, set)
    const next = mapTracksWithClips(project, (t) => ({
      ...t,
      midiClips: t.midiClips.filter((c) => !ids.has(c.id)),
      audioClips: t.audioClips.filter((c) => !ids.has(c.id)),
    }))
    set({
      project: withSync(get, next),
      selection: { ...selection, clipId: null, selectedClipIds: [], noteIds: [] },
    })
  },
  copySelectedClips: () => {
    const { selection, project } = get()
    const ids = selection.selectedClipIds.length
      ? selection.selectedClipIds
      : selection.clipId
        ? [selection.clipId]
        : []
    if (!ids.length) return
    set({ clipClipboard: { items: gatherClipboard(project, ids) }, lastClipboard: 'clips' })
  },
  cutSelectedClips: () => {
    get().copySelectedClips()
    get().removeSelectedClips()
  },
  pasteClips: (atBeat) => {
    const { clipClipboard, project, positionBeat, selection } = get()
    if (!clipClipboard.items.length) return
    recordHistory(get, set)
    const origin = Math.min(...clipClipboard.items.map((i) => i.clip.start))
    const targetBeat = atBeat ?? positionBeat
    const delta = targetBeat - origin
    const newIds: string[] = []
    let focusTrack = selection.trackId
    const tracks = project.tracks.map((t) => ({ ...t, midiClips: [...t.midiClips], audioClips: [...t.audioClips] }))
    for (const item of clipClipboard.items) {
      let track = tracks.find((t) => t.id === item.trackId)
      if (!track) {
        track = tracks.find((t) => t.id === selection.trackId) ?? tracks[0]
      }
      if (!track) continue
      if (item.kind === 'midi' && track.type === 'audio') {
        const midiTrack = tracks.find((t) => t.type === 'midi')
        if (!midiTrack) continue
        track = midiTrack
      }
      if (item.kind === 'audio' && track.type === 'midi') {
        const audioTrack = tracks.find((t) => t.type === 'audio')
        if (!audioTrack) continue
        track = audioTrack
      }
      focusTrack = track.id
      if (item.kind === 'midi') {
        const clip = cloneMidiClip(item.clip, { start: Math.max(0, item.clip.start + delta) })
        track.midiClips.push(clip)
        newIds.push(clip.id)
      } else {
        const clip = cloneAudioClip(item.clip, { start: Math.max(0, item.clip.start + delta) })
        track.audioClips.push(clip)
        newIds.push(clip.id)
      }
    }
    const next = { ...project, tracks }
    set({
      project: withSync(get, next),
      selection: {
        trackId: focusTrack,
        clipId: newIds[newIds.length - 1] ?? null,
        selectedClipIds: newIds,
        noteIds: [],
        effectId: null,
      },
    })
  },
  copySelectedNotes: () => {
    const { selection, project } = get()
    if (!selection.trackId || !selection.clipId || !selection.noteIds.length) return false
    const clip = project.tracks
      .find((t) => t.id === selection.trackId)
      ?.midiClips.find((c) => c.id === selection.clipId)
    if (!clip) return false
    const selected = clip.notes.filter((n) => selection.noteIds.includes(n.id))
    if (!selected.length) return false
    const origin = Math.min(...selected.map((n) => n.start))
    set({
      noteClipboard: {
        notes: selected.map((n) => ({ ...n, start: n.start - origin })),
      },
      lastClipboard: 'notes',
    })
    return true
  },
  cutSelectedNotes: () => {
    if (!get().copySelectedNotes()) return false
    const { selection } = get()
    if (!selection.trackId || !selection.clipId) return false
    get().removeNotes(selection.trackId, selection.clipId, selection.noteIds)
    return true
  },
  pasteNotes: (atBeat) => {
    const { noteClipboard, selection, project, positionBeat } = get()
    if (!noteClipboard.notes.length || !selection.trackId || !selection.clipId) return false
    const track = project.tracks.find((t) => t.id === selection.trackId)
    const clip = track?.midiClips.find((c) => c.id === selection.clipId)
    if (!track || !clip) return false
    recordHistory(get, set)
    const rel =
      atBeat ??
      Math.max(0, Math.min(clip.duration - 0.01, positionBeat - clip.start))
    const newNotes = noteClipboard.notes.map((n) => ({
      ...n,
      id: uid('note'),
      start: Math.max(0, rel + n.start),
    }))
    const notes = [...clip.notes, ...newNotes]
    const nextProject = {
      ...project,
      tracks: project.tracks.map((t) =>
        t.id === track.id
          ? { ...t, midiClips: t.midiClips.map((c) => (c.id === clip.id ? { ...c, notes } : c)) }
          : t,
      ),
    }
    set({
      project: withSync(get, nextProject),
      selection: {
        ...selection,
        noteIds: newNotes.map((n) => n.id),
      },
    })
    return true
  },
  duplicateSelectedClips: () => {
    const { selection, project } = get()
    const ids = selection.selectedClipIds.length
      ? selection.selectedClipIds
      : selection.clipId
        ? [selection.clipId]
        : []
    if (!ids.length) return
    recordHistory(get, set)
    const refs = ids.map((id) => findClipRef(project, id)).filter(Boolean) as NonNullable<ReturnType<typeof findClipRef>>[]
    if (!refs.length) return
    const newIds: string[] = []
    const tracks = project.tracks.map((t) => ({ ...t, midiClips: [...t.midiClips], audioClips: [...t.audioClips] }))
    for (const ref of refs) {
      const track = tracks.find((t) => t.id === ref.track.id)
      if (!track) continue
      if (ref.kind === 'midi') {
        const clip = cloneMidiClip(ref.clip, { start: ref.clip.start + ref.clip.duration })
        track.midiClips.push(clip)
        newIds.push(clip.id)
      } else {
        const clip = cloneAudioClip(ref.clip, { start: ref.clip.start + ref.clip.duration })
        track.audioClips.push(clip)
        newIds.push(clip.id)
      }
    }
    set({
      project: withSync(get, { ...project, tracks }),
      selection: {
        trackId: refs[0]?.track.id ?? selection.trackId,
        clipId: newIds[newIds.length - 1] ?? null,
        selectedClipIds: newIds,
        noteIds: [],
        effectId: selection.effectId,
      },
    })
  },
  splitSelectedClipsAtPlayhead: () => {
    const { selection, project, positionBeat } = get()
    const ids = selectionClipIds(selection)
    if (!ids.length) return
    const newIds: string[] = []
    const tracks = project.tracks.map((t) => ({ ...t, midiClips: [...t.midiClips], audioClips: [...t.audioClips] }))
    for (const id of ids) {
      const ref = findClipRef(project, id)
      if (!ref || !playheadInsideClip(ref.clip, positionBeat)) continue
      const track = tracks.find((t) => t.id === ref.track.id)
      if (!track) continue
      const leftDur = positionBeat - ref.clip.start
      const rightDur = ref.clip.duration - leftDur
      const loopLen = clipLoopLength(ref.clip)
      const looped = loopLen < ref.clip.duration - SPLIT_EDGE
      const leftLoop = Math.min(loopLen, leftDur)
      const rightLoop = Math.min(loopLen, rightDur)
      if (ref.kind === 'midi') {
        const notes = looped
          ? {
              left: ref.clip.notes.map((n) => ({ ...n, id: uid('note') })),
              right: ref.clip.notes.map((n) => ({ ...n, id: uid('note') })),
            }
          : splitMidiNotesAt(ref.clip.notes, leftDur)
        const left: MidiClip = {
          ...ref.clip,
          duration: leftDur,
          loopLength: leftLoop,
          notes: notes.left,
        }
        const right = cloneMidiClip(ref.clip, {
          start: positionBeat,
          duration: rightDur,
          loopLength: rightLoop,
          notes: notes.right,
        })
        track.midiClips = track.midiClips.map((c) => (c.id === id ? left : c))
        track.midiClips.push(right)
        newIds.push(left.id, right.id)
      } else {
        const left: AudioClip = {
          ...ref.clip,
          duration: leftDur,
          loopLength: leftLoop,
        }
        const right = cloneAudioClip(ref.clip, {
          start: positionBeat,
          duration: rightDur,
          loopLength: rightLoop,
          offset: looped ? ref.clip.offset : ref.clip.offset + leftDur,
        })
        track.audioClips = track.audioClips.map((c) => (c.id === id ? left : c))
        track.audioClips.push(right)
        newIds.push(left.id, right.id)
      }
    }
    if (!newIds.length) return
    recordHistory(get, set)
    set({
      project: withSync(get, { ...project, tracks }),
      selection: {
        ...selection,
        clipId: newIds[newIds.length - 1] ?? null,
        selectedClipIds: newIds,
        noteIds: [],
      },
    })
  },
  moveClipsBy: (clipIds, deltaBeats) => {
    if (!deltaBeats) return
    recordHistory(get, set, 'move-clips')
    const idSet = new Set(clipIds)
    const project = {
      ...get().project,
      tracks: get().project.tracks.map((t) => ({
        ...t,
        midiClips: t.midiClips.map((c) =>
          idSet.has(c.id) ? { ...c, start: Math.max(0, c.start + deltaBeats) } : c,
        ),
        audioClips: t.audioClips.map((c) =>
          idSet.has(c.id) ? { ...c, start: Math.max(0, c.start + deltaBeats) } : c,
        ),
      })),
    }
    set({ project: withSync(get, project) })
  },
  addNote: (trackId, clipId, note) => {
    const full = { ...note, id: note.id ?? uid('note') }
    get().updateMidiClip(trackId, clipId, {
      notes: [
        ...(get().project.tracks.find((t) => t.id === trackId)?.midiClips.find((c) => c.id === clipId)?.notes ?? []),
        full,
      ],
    })
  },
  updateNote: (trackId, clipId, noteId, patch) => {
    const clip = get().project.tracks.find((t) => t.id === trackId)?.midiClips.find((c) => c.id === clipId)
    if (!clip) return
    get().updateMidiClip(trackId, clipId, {
      notes: clip.notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
    })
  },
  removeNotes: (trackId, clipId, noteIds) => {
    const clip = get().project.tracks.find((t) => t.id === trackId)?.midiClips.find((c) => c.id === clipId)
    if (!clip) return
    const setIds = new Set(noteIds)
    get().updateMidiClip(trackId, clipId, { notes: clip.notes.filter((n) => !setIds.has(n.id)) })
    set((s) => ({ selection: { ...s.selection, noteIds: [] } }))
  },
  quantizeSelected: () => {
    const { selection, project, quantizeDivision, quantizeStrength } = get()
    if (!selection.trackId || !selection.clipId) return
    const clip = project.tracks.find((t) => t.id === selection.trackId)?.midiClips.find((c) => c.id === selection.clipId)
    if (!clip) return
    const target = selection.noteIds.length
      ? clip.notes.map((n) => (selection.noteIds.includes(n.id) ? quantizeNotes([n], quantizeDivision, quantizeStrength)[0] : n))
      : quantizeNotes(clip.notes, quantizeDivision, quantizeStrength)
    get().updateMidiClip(selection.trackId, selection.clipId, { notes: target })
  },
  applySwingSelected: () => {
    const { selection, project, swingAmount, quantizeDivision } = get()
    if (!selection.trackId || !selection.clipId || swingAmount <= 0) return
    const clip = project.tracks.find((t) => t.id === selection.trackId)?.midiClips.find((c) => c.id === selection.clipId)
    if (!clip) return
    get().updateMidiClip(selection.trackId, selection.clipId, {
      notes: applySwing(clip.notes, swingAmount, quantizeDivision),
    })
  },
  addEffect: (trackId, type) => {
    const track = get().project.tracks.find((t) => t.id === trackId)
    if (!track) return
    const fx = createTrackEffect(type)
    get().updateTrack(trackId, { effects: [...track.effects, fx] })
    set((s) => ({
      selection: { ...s.selection, trackId, effectId: fx.id },
    }))
  },
  addEffectToSelectedTrack: (type) => {
    const trackId = get().selection.trackId
    if (!trackId) return
    get().addEffect(trackId, type)
  },
  updateEffect: (trackId, effectId, params) => {
    const track = get().project.tracks.find((t) => t.id === trackId)
    if (!track) return
    recordHistory(get, set, `fx-${effectId}`)
    const project = {
      ...get().project,
      tracks: get().project.tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              effects: t.effects.map((e) =>
                e.id === effectId ? { ...e, params: { ...e.params, ...params } as TrackEffect['params'] } : e,
              ),
            }
          : t,
      ),
    }
    set({ project: withSync(get, project) })
  },
  removeEffect: (trackId, effectId) => {
    const track = get().project.tracks.find((t) => t.id === trackId)
    if (!track) return
    get().updateTrack(trackId, { effects: track.effects.filter((e) => e.id !== effectId) })
    set((s) => ({
      selection: {
        ...s.selection,
        effectId: s.selection.effectId === effectId ? null : s.selection.effectId,
      },
    }))
  },
  moveEffect: (trackId, effectId, dir) => {
    const track = get().project.tracks.find((t) => t.id === trackId)
    if (!track) return
    const idx = track.effects.findIndex((e) => e.id === effectId)
    const next = idx + dir
    if (idx < 0 || next < 0 || next >= track.effects.length) return
    const effects = [...track.effects]
    const [item] = effects.splice(idx, 1)
    effects.splice(next, 0, item)
    get().updateTrack(trackId, { effects })
  },
  setAutomationTarget: (mode) => set({ automationTarget: mode }),
  toggleAutomationOpen: (trackId) => {
    const open = get().automationOpenIds
    const next = open.includes(trackId) ? open.filter((id) => id !== trackId) : [...open, trackId]
    set({ automationOpenIds: next })
    if (next.includes(trackId)) {
      const track = get().project.tracks.find((t) => t.id === trackId)
      const target = track ? resolveAutomationTarget(track, get().automationTarget) : null
      if (track && target && !findLane(track, target)) {
        const project = {
          ...get().project,
          tracks: get().project.tracks.map((t) => (t.id === trackId ? withEnsuredLane(t, target) : t)),
        }
        set({ project: withSync(get, project) })
      }
    }
  },
  setAutomationOpen: (trackId, open) => {
    const ids = get().automationOpenIds
    const has = ids.includes(trackId)
    if (open && !has) get().toggleAutomationOpen(trackId)
    if (!open && has) set({ automationOpenIds: ids.filter((id) => id !== trackId) })
  },
  addAutomationPoint: (trackId, beat, value) => {
    const track = get().project.tracks.find((t) => t.id === trackId)
    if (!track) return
    const target = resolveAutomationTarget(track, get().automationTarget)
    if (!target) return
    recordHistory(get, set)
    const laneBase = ensureAutomationLane(track, target)
    const point: AutomationPoint = {
      id: uid('ap'),
      beat: Math.max(0, beat),
      value: clamp01(value),
    }
    const lane = { ...laneBase, points: [...laneBase.points, point] }
    const hasLane = findLane(track, target)
    const automation = hasLane
      ? (track.automation ?? []).map((l) => (l.id === lane.id ? lane : l))
      : [...(track.automation ?? []), lane]
    const project = {
      ...get().project,
      tracks: get().project.tracks.map((t) => (t.id === trackId ? { ...t, automation } : t)),
    }
    const openIds = get().automationOpenIds.includes(trackId)
      ? get().automationOpenIds
      : [...get().automationOpenIds, trackId]
    set({ project: withSync(get, project), automationOpenIds: openIds })
  },
  updateAutomationPoint: (trackId, pointId, patch, coalesce) => {
    const track = get().project.tracks.find((t) => t.id === trackId)
    if (!track) return
    recordHistory(get, set, coalesce ? `auto-${trackId}-${pointId}` : undefined)
    const project = {
      ...get().project,
      tracks: get().project.tracks.map((t) => {
        if (t.id !== trackId) return t
        return {
          ...t,
          automation: t.automation.map((lane) => ({
            ...lane,
            points: lane.points.map((p) => {
              if (p.id !== pointId) return p
              return {
                ...p,
                beat: patch.beat !== undefined ? Math.max(0, patch.beat) : p.beat,
                value: patch.value !== undefined ? clamp01(patch.value) : p.value,
              }
            }),
          })),
        }
      }),
    }
    set({ project: withSync(get, project) })
  },
  removeAutomationPoint: (trackId, pointId) => {
    const track = get().project.tracks.find((t) => t.id === trackId)
    if (!track) return
    recordHistory(get, set)
    const project = {
      ...get().project,
      tracks: get().project.tracks.map((t) => {
        if (t.id !== trackId) return t
        return {
          ...t,
          automation: t.automation.map((lane) => ({
            ...lane,
            points: lane.points.filter((p) => p.id !== pointId),
          })),
        }
      }),
    }
    set({ project: withSync(get, project) })
  },
  syncEngine: () => audioEngine.syncProject(get().project),
}))
