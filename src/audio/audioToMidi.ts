import modelJsonUrl from '@spotify/basic-pitch/model/model.json?url'
import weightsBinUrl from '@spotify/basic-pitch/model/group1-shard1of1.bin?url'
import {
  BasicPitch,
  addPitchBendsToNoteEvents,
  noteFramesToTime,
  outputToNotesPoly,
  type NoteEventTime,
} from '@spotify/basic-pitch'
import * as tf from '@tensorflow/tfjs'
import { secondsToBeats } from '@/midi/notes'

export type TranscribedNote = {
  pitch: number
  start: number
  duration: number
  velocity: number
}

const TARGET_SR = 22050
const FRAME_SEC = 256 / 22050
let engineReady: Promise<BasicPitch> | null = null

async function loadGraphModel() {
  const modelJson = await fetch(modelJsonUrl).then((r) => r.json())
  const weightData = await fetch(weightsBinUrl).then((r) => r.arrayBuffer())
  return tf.loadGraphModel({
    load: async () => ({
      modelTopology: modelJson.modelTopology,
      format: modelJson.format,
      generatedBy: modelJson.generatedBy,
      convertedBy: modelJson.convertedBy,
      signature: modelJson.signature,
      weightSpecs: modelJson.weightsManifest[0].weights,
      weightData,
    }),
  })
}

async function initEngine() {
  await tf.ready()
  try {
    await tf.setBackend('webgl')
  } catch {
    await tf.setBackend('cpu')
  }
  return new BasicPitch(loadGraphModel())
}

function getEngine() {
  if (!engineReady) engineReady = initEngine()
  return engineReady
}

async function toMono22050(buffer: AudioBuffer) {
  const length = Math.max(1, Math.ceil(buffer.duration * TARGET_SR))
  const ctx = new OfflineAudioContext(1, length, TARGET_SR)
  const mono = ctx.createBuffer(1, buffer.length, buffer.sampleRate)
  const out = mono.getChannelData(0)
  const channels = buffer.numberOfChannels
  for (let i = 0; i < buffer.length; i++) {
    let sum = 0
    for (let c = 0; c < channels; c++) sum += buffer.getChannelData(c)[i]
    out[i] = sum / channels
  }
  const src = ctx.createBufferSource()
  src.buffer = mono
  src.connect(ctx.destination)
  src.start()
  return ctx.startRendering()
}

function sliceBuffer(buffer: AudioBuffer, offsetBeats: number, durationBeats: number, bpm: number) {
  const startSec = (offsetBeats / bpm) * 60
  const durSec = (durationBeats / bpm) * 60
  const start = Math.max(0, Math.floor(startSec * buffer.sampleRate))
  const end = Math.min(buffer.length, Math.ceil((startSec + durSec) * buffer.sampleRate))
  const len = Math.max(1, end - start)
  const sliced = new AudioBuffer({
    length: len,
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
  })
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    sliced.copyToChannel(buffer.getChannelData(c).subarray(start, end), c)
  }
  return sliced
}

function onsetEnvelope(onsets: number[][]) {
  return onsets.map((row) => {
    let peak = 0
    for (const v of row) if (v > peak) peak = v
    return peak
  })
}

function findOnsetPeaks(
  env: number[],
  from: number,
  to: number,
  minGapFrames: number,
  mode: 'refine' | 'split',
) {
  const peaks: number[] = []
  const lo = Math.max(1, from)
  const hi = Math.min(env.length - 1, to)
  let mean = 0
  let max = 0
  for (let i = lo; i < hi; i++) {
    mean += env[i]
    if (env[i] > max) max = env[i]
  }
  mean /= Math.max(1, hi - lo)
  const thresh =
    mode === 'split'
      ? Math.max(0.16, mean * 1.45 + 0.05, max * 0.55)
      : Math.max(0.11, mean * 1.25 + 0.03)

  for (let i = lo; i < hi; i++) {
    if (env[i] < thresh) continue
    if (env[i] < env[i - 1] || env[i] < env[i + 1]) continue
    const last = peaks[peaks.length - 1]
    if (last != null && i - last < minGapFrames) {
      if (env[i] > env[last]) peaks[peaks.length - 1] = i
      continue
    }
    peaks.push(i)
  }
  return peaks
}

function refineStartsFromOnsets(notes: NoteEventTime[], env: number[]) {
  const minGap = Math.max(2, Math.floor(0.028 / FRAME_SEC))
  const peaks = findOnsetPeaks(env, 0, env.length - 1, minGap, 'refine')
  const peakTimes = peaks.map((f) => ({ t: f * FRAME_SEC, amp: env[f] }))

  return notes.map((note) => {
    let bestT = note.startTimeSeconds
    let bestScore = -1
    for (const p of peakTimes) {
      const dt = Math.abs(p.t - note.startTimeSeconds)
      if (dt > 0.045 || p.amp < 0.13) continue
      const score = p.amp - dt * 2.2
      if (score > bestScore) {
        bestScore = score
        bestT = p.t
      }
    }
    if (bestT === note.startTimeSeconds || bestScore < 0.08) return note
    const shift = bestT - note.startTimeSeconds
    return {
      ...note,
      startTimeSeconds: bestT,
      durationSeconds: Math.max(0.022, note.durationSeconds - shift),
    }
  })
}

function splitNotesAtOnsets(notes: NoteEventTime[], onsets: number[][]) {
  const env = onsetEnvelope(onsets)
  const minGap = Math.max(2, Math.floor(0.032 / FRAME_SEC))
  const out: NoteEventTime[] = []

  for (const note of notes) {
    const startF = Math.floor(note.startTimeSeconds / FRAME_SEC)
    const endF = Math.ceil((note.startTimeSeconds + note.durationSeconds) / FRAME_SEC)
    if (note.durationSeconds < 0.24 || endF - startF < 10) {
      out.push(note)
      continue
    }

    const peaks = findOnsetPeaks(env, startF + 2, endF - 2, minGap, 'split')
    const splitTimes = peaks
      .map((f) => f * FRAME_SEC)
      .filter(
        (t) =>
          t > note.startTimeSeconds + 0.06 &&
          t < note.startTimeSeconds + note.durationSeconds - 0.06,
      )

    if (!splitTimes.length) {
      out.push(note)
      continue
    }

    let t0 = note.startTimeSeconds
    for (const t of splitTimes) {
      out.push({
        ...note,
        startTimeSeconds: t0,
        durationSeconds: Math.max(0.03, t - t0),
      })
      t0 = t
    }
    out.push({
      ...note,
      startTimeSeconds: t0,
      durationSeconds: Math.max(0.03, note.startTimeSeconds + note.durationSeconds - t0),
    })
  }

  return out.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds || a.pitchMidi - b.pitchMidi)
}

function mergeAdjacentSamePitch(notes: NoteEventTime[]) {
  const sorted = [...notes].sort(
    (a, b) => a.startTimeSeconds - b.startTimeSeconds || a.pitchMidi - b.pitchMidi,
  )
  const out: NoteEventTime[] = []
  for (const note of sorted) {
    const prev = out[out.length - 1]
    if (
      prev &&
      Math.abs(prev.pitchMidi - note.pitchMidi) < 0.5 &&
      note.startTimeSeconds <= prev.startTimeSeconds + prev.durationSeconds + 0.05
    ) {
      const end = Math.max(
        prev.startTimeSeconds + prev.durationSeconds,
        note.startTimeSeconds + note.durationSeconds,
      )
      prev.durationSeconds = end - prev.startTimeSeconds
      prev.amplitude = Math.max(prev.amplitude, note.amplitude)
      continue
    }
    out.push({ ...note })
  }
  return out
}

function pruneWeakOverlaps(notes: NoteEventTime[]) {
  return notes.filter((n, i) => {
    if (n.amplitude >= 0.3) return true
    const weak = notes.some(
      (m, j) =>
        j !== i &&
        Math.abs(m.pitchMidi - n.pitchMidi) < 0.5 &&
        m.amplitude > n.amplitude * 1.4 &&
        n.startTimeSeconds >= m.startTimeSeconds - 0.025 &&
        n.startTimeSeconds + n.durationSeconds <= m.startTimeSeconds + m.durationSeconds + 0.04,
    )
    return !weak
  })
}

function mergeDuplicateStarts(notes: NoteEventTime[]) {
  const out: NoteEventTime[] = []
  for (const note of notes) {
    const prev = out[out.length - 1]
    if (
      prev &&
      Math.abs(prev.pitchMidi - note.pitchMidi) < 0.5 &&
      Math.abs(prev.startTimeSeconds - note.startTimeSeconds) < 0.032
    ) {
      prev.durationSeconds = Math.max(
        prev.durationSeconds,
        note.startTimeSeconds + note.durationSeconds - prev.startTimeSeconds,
      )
      prev.amplitude = Math.max(prev.amplitude, note.amplitude)
      continue
    }
    out.push({ ...note })
  }
  return out
}

function extractNotes(frames: number[][], onsets: number[][], contours: number[][]) {
  const primary = outputToNotesPoly(
    frames,
    onsets,
    0.26,
    0.19,
    4,
    true,
    null,
    null,
    true,
    4,
  )
  const ghost = outputToNotesPoly(
    frames,
    onsets,
    0.22,
    0.16,
    4,
    true,
    null,
    null,
    false,
    4,
  )

  const primaryTimed = noteFramesToTime(addPitchBendsToNoteEvents(contours, primary))
  const ghostTimed = noteFramesToTime(addPitchBendsToNoteEvents(contours, ghost))
  const hasPrimaryNear = (n: NoteEventTime) =>
    primaryTimed.some(
      (p) =>
        Math.abs(p.pitchMidi - n.pitchMidi) < 0.5 &&
        Math.abs(p.startTimeSeconds - n.startTimeSeconds) < 0.055,
    )
  const merged = [...primaryTimed, ...ghostTimed.filter((n) => !hasPrimaryNear(n))].sort(
    (a, b) => a.startTimeSeconds - b.startTimeSeconds || a.pitchMidi - b.pitchMidi,
  )

  const env = onsetEnvelope(onsets)
  let out = refineStartsFromOnsets(merged, env)
  out = splitNotesAtOnsets(out, onsets)
  out = mergeAdjacentSamePitch(out)
  out = pruneWeakOverlaps(out)
  return mergeDuplicateStarts(out)
}

export async function transcribeAudioToMidi(
  buffer: AudioBuffer,
  bpm: number,
  onProgress?: (p: number) => void,
  opts?: { offsetBeats?: number; durationBeats?: number },
) {
  onProgress?.(0.03)
  const source =
    opts?.durationBeats && opts.durationBeats > 0
      ? sliceBuffer(buffer, opts.offsetBeats ?? 0, opts.durationBeats, bpm)
      : buffer
  const mono = await toMono22050(source)
  onProgress?.(0.1)

  const engine = await getEngine()
  const frames: number[][] = []
  const onsets: number[][] = []
  const contours: number[][] = []

  await engine.evaluateModel(
    mono,
    (f, o, c) => {
      frames.push(...f)
      onsets.push(...o)
      contours.push(...c)
    },
    (p) => onProgress?.(0.1 + p * 0.82),
  )

  const timed = extractNotes(frames, onsets, contours)
  const minBeat = secondsToBeats(0.024, bpm)

  const notes = timed.map((n) => ({
    pitch: Math.round(n.pitchMidi),
    start: secondsToBeats(n.startTimeSeconds, bpm),
    duration: Math.max(minBeat, secondsToBeats(n.durationSeconds, bpm)),
    velocity: Math.max(38, Math.min(127, Math.round(n.amplitude * 118))),
  }))

  onProgress?.(1)
  return notes
}
