import type { Project, Track } from '@/types/project'
import { clipLoopLength } from '@/types/project'
import { beatsToSeconds } from '@/midi/notes'
import { getInstrument } from '@/instruments'
import { EffectChain } from './effects'
import {
  findLane,
  interpolateAutomation,
  mapNormalizedToCutoff,
  scheduleAudioParamCurve,
  sortPoints,
} from './automation'
import { audioEngine } from './engine'

const TAIL_SEC = 1.5
const DEFAULT_BEATS = 16
const MP3_KBPS = 192

export function projectExportBeats(project: Project) {
  let end = Math.max(project.lengthBeats || 0, DEFAULT_BEATS)
  if (project.loopEnabled && project.loopEnd > project.loopStart) {
    end = Math.max(end, project.loopEnd)
  }
  for (const track of project.tracks) {
    for (const c of track.midiClips) end = Math.max(end, c.start + c.duration)
    for (const c of track.audioClips) end = Math.max(end, c.start + c.duration)
  }
  return end
}

export async function bounceProject(project: Project) {
  const durationBeats = projectExportBeats(project)
  const durationSec = beatsToSeconds(durationBeats, project.bpm) + TAIL_SEC
  const sampleRate = audioEngine.ctx?.sampleRate ?? 44100
  const length = Math.max(1, Math.ceil(sampleRate * durationSec))
  const offline = new OfflineAudioContext(2, length, sampleRate)
  const ctx = offline as unknown as AudioContext
  const master = offline.createGain()
  master.gain.value = 0.85
  master.connect(offline.destination)

  const anySolo = project.tracks.some((t) => t.solo)
  for (const track of project.tracks) {
    const audible = anySolo ? track.solo : !track.mute
    if (!audible) continue
    scheduleTrack(ctx, master, track, project)
  }

  return offline.startRendering()
}

function scheduleTrack(ctx: AudioContext, master: AudioNode, track: Track, project: Project) {
  const input = ctx.createGain()
  const instFilter = ctx.createBiquadFilter()
  instFilter.type = 'lowpass'
  instFilter.frequency.value = 18000
  instFilter.Q.value = 0.7
  const fx = new EffectChain(ctx)
  const muteGain = ctx.createGain()
  const panner = ctx.createStereoPanner()
  const volume = ctx.createGain()
  muteGain.gain.value = 1
  volume.gain.value = track.volume
  panner.pan.value = track.pan
  input.connect(instFilter)
  instFilter.connect(fx.input)
  fx.output.connect(muteGain)
  muteGain.connect(panner)
  panner.connect(volume)
  volume.connect(master)
  fx.rebuild(track.effects)

  const bpm = project.bpm
  const volLane = findLane(track, 'volume')
  if (volLane?.points.length) {
    scheduleAudioParamCurve(volume.gain, volLane.points, (v) => track.volume * v, 0, 0, bpm, 1)
  }
  const instLane = findLane(track, { type: 'instrument', param: 'cutoff' })
  if (instLane?.points.length) {
    scheduleAudioParamCurve(instFilter.frequency, instLane.points, mapNormalizedToCutoff, 0, 0, bpm, 0.85)
  } else {
    instFilter.frequency.value = 18000
  }
  for (const lane of track.automation ?? []) {
    if (typeof lane.target === 'string' || lane.target.type !== 'effect') continue
    if (!lane.points.length) continue
    const auto = fx.getAutomable(lane.target.effectId, lane.target.param)
    if (!auto) continue
    const sorted = sortPoints(lane.points)
    auto.setNormalized(interpolateAutomation(sorted, 0, 0.5), 0)
    for (const p of sorted) {
      const when = beatsToSeconds(p.beat, bpm)
      auto.rampNormalized(p.value, when)
    }
  }

  for (const clip of track.midiClips) {
    const loopLen = clipLoopLength(clip)
    const clipEnd = clip.start + clip.duration
    for (const note of clip.notes) {
      if (note.start >= loopLen) continue
      const maxIter = Math.ceil(clip.duration / loopLen) + 1
      for (let iter = 0; iter < maxIter; iter++) {
        const noteStartAbs = clip.start + iter * loopLen + note.start
        if (noteStartAbs >= clipEnd) break
        const playDur = Math.min(note.duration, clipEnd - noteStartAbs)
        if (playDur <= 0.001) continue
        const inst = getInstrument(track.instrumentId ?? 'piano')
        if (!inst) continue
        const when = beatsToSeconds(noteStartAbs, bpm)
        const durSec = beatsToSeconds(playDur, bpm)
        inst.createVoice(ctx, input, note.pitch, note.velocity, when, durSec)
      }
    }
  }

  for (const clip of track.audioClips) {
    const buffer = audioEngine.getBuffer(clip.bufferKey)
    if (!buffer) continue
    const loopLen = clipLoopLength(clip)
    const clipEnd = clip.start + clip.duration
    const maxIter = Math.ceil(clip.duration / loopLen) + 1
    for (let iter = 0; iter < maxIter; iter++) {
      const segStart = clip.start + iter * loopLen
      if (segStart >= clipEnd) break
      const segDur = Math.min(loopLen, clipEnd - segStart)
      if (segDur <= 0.001) continue
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(input)
      const when = beatsToSeconds(segStart, bpm)
      const offsetSec = beatsToSeconds(clip.offset, bpm)
      const durSec = beatsToSeconds(segDur, bpm)
      try {
        src.start(when, offsetSec, Math.max(0.01, durSec))
      } catch { /* */ }
    }
  }
}

export function encodeWav(buffer: AudioBuffer) {
  const numChannels = Math.min(2, buffer.numberOfChannels)
  const sampleRate = buffer.sampleRate
  const samples = buffer.length
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const dataSize = samples * blockAlign
  const ab = new ArrayBuffer(44 + dataSize)
  const view = new DataView(ab)
  writeStr(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(view, 8, 'WAVE')
  writeStr(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeStr(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  const ch0 = buffer.getChannelData(0)
  const ch1 = numChannels > 1 ? buffer.getChannelData(1) : ch0
  let offset = 44
  for (let i = 0; i < samples; i++) {
    view.setInt16(offset, floatToInt16(ch0[i]), true)
    offset += 2
    if (numChannels > 1) {
      view.setInt16(offset, floatToInt16(ch1[i]), true)
      offset += 2
    }
  }
  return new Blob([ab], { type: 'audio/wav' })
}

export async function encodeMp3(buffer: AudioBuffer) {
  try {
    const { Mp3Encoder } = await import('@breezystack/lamejs')
    const channels = Math.min(2, buffer.numberOfChannels)
    const sampleRate = buffer.sampleRate
    const left = floatToPcm16(buffer.getChannelData(0))
    const right = channels > 1 ? floatToPcm16(buffer.getChannelData(1)) : left
    const encoder = new Mp3Encoder(channels, sampleRate, MP3_KBPS)
    const blockSize = 1152
    const parts = [] as Uint8Array[]
    for (let i = 0; i < left.length; i += blockSize) {
      const l = left.subarray(i, i + blockSize)
      const buf =
        channels === 2
          ? encoder.encodeBuffer(l, right.subarray(i, i + blockSize))
          : encoder.encodeBuffer(l)
      if (buf.length > 0) parts.push(buf)
    }
    const flush = encoder.flush()
    if (flush.length > 0) parts.push(flush)
    if (parts.length === 0) throw new Error('encodeur MP3 vide')
    return new Blob(parts as BlobPart[], { type: 'audio/mpeg' })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`Encodage MP3: ${detail}`)
  }
}

export async function exportProjectWav(project: Project) {
  const rendered = await bounceProject(project)
  const blob = encodeWav(rendered)
  const name = `${project.name || 'projet'}.wav`
  await saveAudioBlob(blob, name, [{ name: 'WAV', extensions: ['wav'] }])
  return blob
}

export async function exportProjectMp3(project: Project) {
  const rendered = await bounceProject(project)
  const blob = await encodeMp3(rendered)
  const name = `${project.name || 'projet'}.mp3`
  await saveAudioBlob(blob, name, [{ name: 'MP3', extensions: ['mp3'] }])
  return blob
}

async function saveAudioBlob(
  blob: Blob,
  defaultPath: string,
  filters: { name: string; extensions: string[] }[],
) {
  try {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const path = await save({ defaultPath, filters })
    if (!path) return false
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()))
    return true
  } catch {
    downloadBlob(blob, defaultPath)
    return true
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function floatToInt16(sample: number) {
  const s = Math.max(-1, Math.min(1, sample))
  return s < 0 ? (s * 0x8000) | 0 : (s * 0x7fff) | 0
}

function floatToPcm16(data: Float32Array) {
  const out = new Int16Array(data.length)
  for (let i = 0; i < data.length; i++) out[i] = floatToInt16(data[i])
  return out
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
}
