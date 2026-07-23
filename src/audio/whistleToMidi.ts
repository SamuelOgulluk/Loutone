import { secondsToBeats } from '@/midi/notes'

export type WhistleMidiNote = {
  pitch: number
  start: number
  duration: number
  velocity: number
}

const WHISTLE_MIN_HZ = 450
const WHISTLE_MAX_HZ = 2800
const WIN = 2048
const HOP = 160
const YIN_THRESHOLD = 0.15
const CLARITY_MIN = 0.82
const RMS_MIN = 0.006
const MIN_NOTE_SEC = 0.055
const MIN_SPLIT_SEC = 0.08
const PITCH_JUMP = 1.25
const BRIDGE_GAP_SEC = 0.055
const MERGE_GAP_SEC = 0.07
const MIN_ONSET_GAP = 0.07

type Frame = {
  t: number
  midi: number | null
  rms: number
  flux: number
}

function yieldUi() {
  return new Promise((r) => window.setTimeout(r, 0))
}

function mergeChunks(chunks: Float32Array[], sampleRate: number) {
  let total = 0
  for (const c of chunks) total += c.length
  const data = new Float32Array(Math.max(1, total))
  let o = 0
  for (const c of chunks) {
    data.set(c, o)
    o += c.length
  }
  const scratch = new OfflineAudioContext(1, Math.max(1, total), sampleRate)
  const buffer = scratch.createBuffer(1, Math.max(1, total), sampleRate)
  buffer.copyToChannel(data, 0)
  return buffer
}

function freqToMidi(freq: number) {
  return 12 * Math.log2(freq / 440) + 69
}

function yinPitch(buf: Float32Array, sampleRate: number) {
  const n = buf.length
  let rms = 0
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / n)
  if (rms < RMS_MIN) return { freq: -1, clarity: 0, rms }

  const minTau = Math.max(2, Math.floor(sampleRate / WHISTLE_MAX_HZ))
  const maxTau = Math.min(Math.floor(n / 2) - 1, Math.floor(sampleRate / WHISTLE_MIN_HZ))
  if (maxTau <= minTau) return { freq: -1, clarity: 0, rms }

  const yin = new Float32Array(maxTau + 1)
  let running = 0
  yin[0] = 1
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0
    const lim = n - tau
    for (let i = 0; i < lim; i++) {
      const d = buf[i] - buf[i + tau]
      sum += d * d
    }
    running += sum
    yin[tau] = running ? (sum * tau) / running : 1
  }

  let tauEstimate = -1
  for (let tau = minTau; tau < maxTau; tau++) {
    if (yin[tau] < YIN_THRESHOLD) {
      while (tau + 1 < maxTau && yin[tau + 1] < yin[tau]) tau++
      tauEstimate = tau
      break
    }
  }
  if (tauEstimate < 0) {
    let best = 1
    let bestTau = -1
    for (let tau = minTau; tau <= maxTau; tau++) {
      if (yin[tau] < best) {
        best = yin[tau]
        bestTau = tau
      }
    }
    if (bestTau < 0 || best > 0.28) return { freq: -1, clarity: 1 - best, rms }
    tauEstimate = bestTau
  }

  const x0 = yin[tauEstimate - 1] ?? yin[tauEstimate]
  const x1 = yin[tauEstimate]
  const x2 = yin[tauEstimate + 1] ?? yin[tauEstimate]
  const better = tauEstimate + (x2 - x0) / (2 * (2 * x1 - x2 - x0) || 1)
  const freq = sampleRate / better
  const clarity = 1 - yin[tauEstimate]
  if (clarity < CLARITY_MIN || freq < WHISTLE_MIN_HZ || freq > WHISTLE_MAX_HZ) {
    return { freq: -1, clarity, rms }
  }
  return { freq, clarity, rms }
}

function bandEnergy(buf: Float32Array) {
  // proxy haute bande pour onsets de sifflement (différences locales)
  let e = 0
  for (let i = 1; i < buf.length; i++) {
    const d = buf[i] - buf[i - 1]
    e += d * d
  }
  return Math.sqrt(e / buf.length)
}

function median(nums: number[]) {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function trimSilence(data: Float32Array, sampleRate: number) {
  const win = Math.floor(sampleRate * 0.01)
  const thresh = 0.004
  let start = 0
  let end = data.length
  for (let i = 0; i + win < data.length; i += win) {
    let r = 0
    for (let j = 0; j < win; j++) r += data[i + j] * data[i + j]
    if (Math.sqrt(r / win) > thresh) {
      start = Math.max(0, i - win)
      break
    }
  }
  for (let i = data.length - win; i > start; i -= win) {
    let r = 0
    for (let j = 0; j < win; j++) r += data[i + j] * data[i + j]
    if (Math.sqrt(r / win) > thresh) {
      end = Math.min(data.length, i + win * 2)
      break
    }
  }
  return data.subarray(start, Math.max(start + 1, end))
}

async function extractFrames(
  data: Float32Array,
  sampleRate: number,
  onProgress?: (p: number) => void,
) {
  const frames: Frame[] = []
  const tmp = new Float32Array(WIN)
  let prevEnergy = 0
  let prevMidi: number | null = null
  const last = Math.max(0, data.length - WIN)
  const total = Math.ceil(last / HOP) || 1

  for (let i = 0, idx = 0; i <= last; i += HOP, idx++) {
    tmp.set(data.subarray(i, i + WIN))
    // fenêtre Hann légère
    for (let k = 0; k < WIN; k++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (WIN - 1))
      tmp[k] *= w
    }
    const { freq, rms } = yinPitch(tmp, sampleRate)
    const energy = bandEnergy(tmp)
    const flux = Math.max(0, energy - prevEnergy * 0.85)
    prevEnergy = energy

    let midi: number | null = null
    if (freq > 0) {
      const raw = freqToMidi(freq)
      if (prevMidi == null) midi = Math.round(raw)
      else if (Math.abs(raw - prevMidi) < 0.6) midi = prevMidi
      else midi = Math.round(raw)
      prevMidi = midi
    } else {
      prevMidi = null
    }

    frames.push({ t: i / sampleRate, midi, rms, flux })
    if (idx % 32 === 0) {
      onProgress?.(idx / total)
      await yieldUi()
    }
  }
  onProgress?.(1)
  return frames
}

function peakOnsets(frames: Frame[]) {
  const fluxes = frames.map((f) => f.flux)
  const sorted = [...fluxes].sort((a, b) => a - b)
  const base = sorted[Math.floor(sorted.length * 0.72)] || 0
  const thresh = Math.max(base * 3.4, 0.0014)
  const onsets: number[] = []
  for (let i = 2; i < frames.length - 2; i++) {
    const f = fluxes[i]
    if (f < thresh) continue
    if (f >= fluxes[i - 1] && f >= fluxes[i + 1] && f >= fluxes[i - 2] && f >= fluxes[i + 2]) {
      if ((frames[i].rms + frames[i + 1].rms) * 0.5 < RMS_MIN * 0.85) continue
      // préfère les vraies réattaques : dip d'énergie juste avant
      const prevRms = (frames[i - 1].rms + frames[i - 2].rms) * 0.5
      const curRms = frames[i].rms
      if (prevRms > RMS_MIN && curRms < prevRms * 1.15 && f < thresh * 1.35) continue
      if (onsets.length && frames[i].t - onsets[onsets.length - 1] < MIN_ONSET_GAP) {
        const prevIdx = frames.findIndex((fr) => fr.t === onsets[onsets.length - 1])
        if (prevIdx >= 0 && fluxes[i] > fluxes[prevIdx]) onsets[onsets.length - 1] = frames[i].t
        continue
      }
      onsets.push(frames[i].t)
    }
  }
  return onsets
}

function mergeSamePitch(notes: WhistleMidiNote[], bpm: number) {
  if (notes.length < 2) return notes
  const gapBeats = secondsToBeats(MERGE_GAP_SEC, bpm)
  const out: WhistleMidiNote[] = [{ ...notes[0] }]
  for (let i = 1; i < notes.length; i++) {
    const prev = out[out.length - 1]
    const n = notes[i]
    const gap = n.start - (prev.start + prev.duration)
    if (n.pitch === prev.pitch && gap >= -0.02 && gap <= gapBeats) {
      prev.duration = n.start + n.duration - prev.start
      prev.velocity = Math.max(prev.velocity, n.velocity)
      continue
    }
    out.push({ ...n })
  }
  return out
}

function framesToNotes(frames: Frame[], bpm: number) {
  if (!frames.length) return [] as WhistleMidiNote[]

  const dt = frames.length > 1 ? frames[1].t - frames[0].t : HOP / 16000
  const onsets = peakOnsets(frames)
  const notes: WhistleMidiNote[] = []

  let i = 0
  while (i < frames.length) {
    while (i < frames.length && frames[i].midi == null) i++
    if (i >= frames.length) break

    const startT = frames[i].t
    let pitchRef = frames[i].midi as number
    const pitches = [pitchRef]
    const rmses = [frames[i].rms]
    let j = i + 1
    let bridged = 0

    while (j < frames.length) {
      const f = frames[j]

      // micro-trous YIN : on continue la note au lieu de couper
      if (f.midi == null) {
        const gapEnd = f.t + BRIDGE_GAP_SEC
        let k = j + 1
        while (k < frames.length && frames[k].t < gapEnd && frames[k].midi == null) k++
        if (k < frames.length && frames[k].midi != null && Math.abs((frames[k].midi as number) - pitchRef) < PITCH_JUMP) {
          bridged += k - j
          j = k
          continue
        }
        break
      }

      // onset seulement si note déjà assez longue + vrai pic
      if (
        f.t - startT >= MIN_SPLIT_SEC &&
        onsets.some((t) => t > startT + MIN_SPLIT_SEC * 0.85 && Math.abs(t - f.t) < dt * 0.9)
      ) break

      if (Math.abs(f.midi - pitchRef) >= PITCH_JUMP) {
        const next = frames[j + 1]
        const next2 = frames[j + 2]
        const stable =
          next?.midi != null &&
          Math.abs(next.midi - f.midi) < 0.7 &&
          (next2 == null || next2.midi == null || Math.abs(next2.midi - f.midi) < 0.9)
        if (!stable) {
          j++
          continue
        }
        if (f.t - startT >= MIN_SPLIT_SEC) break
      }

      pitches.push(f.midi)
      rmses.push(f.rms)
      // référence = médiane récente → ignore le vibrato
      pitchRef = Math.round(median(pitches.slice(-8)))
      j++
    }

    const endT = j < frames.length ? frames[j].t : frames[frames.length - 1].t + dt
    const dur = endT - startT
    if (dur >= MIN_NOTE_SEC && pitches.length + bridged >= 2) {
      notes.push({
        pitch: Math.max(48, Math.min(100, Math.round(median(pitches)))),
        start: secondsToBeats(startT, bpm),
        duration: Math.max(0.05, secondsToBeats(dur, bpm)),
        velocity: Math.max(55, Math.min(120, Math.round(60 + median(rmses) * 450))),
      })
    }
    i = Math.max(j, i + 1)
  }

  if (!notes.length) return notes
  const merged = mergeSamePitch(notes, bpm)
  const t0 = merged[0].start
  return merged.map((n) => ({ ...n, start: Math.max(0, n.start - t0) }))
}

async function analyzeWhistle(
  buffer: AudioBuffer,
  bpm: number,
  onProgress?: (p: number) => void,
) {
  const raw = trimSilence(buffer.getChannelData(0), buffer.sampleRate)
  // downsample → analyse bien plus rapide, timing inchangé
  const targetSr = 16000
  const data = downsample(raw, buffer.sampleRate, targetSr)
  onProgress?.(0.02)
  const frames = await extractFrames(data, targetSr, (p) => onProgress?.(0.02 + p * 0.9))
  const notes = framesToNotes(frames, bpm)
  onProgress?.(1)
  return notes
}

function downsample(input: Float32Array, fromRate: number, toRate: number) {
  if (toRate >= fromRate) return input
  const ratio = fromRate / toRate
  const outLen = Math.max(1, Math.floor(input.length / ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio
    const i0 = Math.floor(src)
    const f = src - i0
    const a = input[i0] ?? 0
    const b = input[i0 + 1] ?? a
    out[i] = a + (b - a) * f
  }
  return out
}

export class WhistleRecorder {
  private stream = null as MediaStream | null
  private ctx = null as AudioContext | null
  private source = null as MediaStreamAudioSourceNode | null
  private processor = null as ScriptProcessorNode | null
  private mute = null as GainNode | null
  private chunks: Float32Array[] = []
  private running = false
  private converting = false
  private sampleRate = 44100

  get isRecording() {
    return this.running
  }

  get isBusy() {
    return this.converting
  }

  async start() {
    if (this.running || this.converting) return
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    })
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    await this.ctx.resume()
    this.sampleRate = this.ctx.sampleRate
    this.source = this.ctx.createMediaStreamSource(this.stream)
    this.processor = this.ctx.createScriptProcessor(2048, 1, 1)
    this.mute = this.ctx.createGain()
    this.mute.gain.value = 0.0001
    this.chunks = []
    this.processor.onaudioprocess = (e) => {
      if (!this.running) return
      this.chunks.push(Float32Array.from(e.inputBuffer.getChannelData(0)))
    }
    this.source.connect(this.processor)
    this.processor.connect(this.mute)
    this.mute.connect(this.ctx.destination)
    this.running = true
  }

  async stop(bpm: number, onProgress?: (p: number) => void) {
    if (this.converting) return { notes: [] as WhistleMidiNote[], durationBeats: 4 }
    this.converting = true
    this.running = false
    const chunks = this.chunks
    const rate = this.sampleRate
    try {
      this.source?.disconnect()
      this.processor?.disconnect()
      this.mute?.disconnect()
    } catch { /* */ }
    if (this.processor) this.processor.onaudioprocess = null
    this.stream?.getTracks().forEach((t) => t.stop())
    await this.ctx?.close().catch(() => {})
    this.stream = null
    this.ctx = null
    this.source = null
    this.processor = null
    this.mute = null
    this.chunks = []

    try {
      if (!chunks.length) return { notes: [] as WhistleMidiNote[], durationBeats: 4 }
      const buffer = mergeChunks(chunks, rate)
      if (buffer.duration < 0.12) return { notes: [] as WhistleMidiNote[], durationBeats: 4 }
      const notes = await analyzeWhistle(buffer, bpm, onProgress)
      const last = notes[notes.length - 1]
      const durationBeats = last ? Math.max(1, last.start + last.duration + 0.15) : 4
      return { notes, durationBeats }
    } finally {
      this.converting = false
    }
  }

  async cancel() {
    this.running = false
    this.converting = false
    try {
      this.source?.disconnect()
      this.processor?.disconnect()
      this.mute?.disconnect()
    } catch { /* */ }
    if (this.processor) this.processor.onaudioprocess = null
    this.stream?.getTracks().forEach((t) => t.stop())
    await this.ctx?.close().catch(() => {})
    this.stream = null
    this.ctx = null
    this.source = null
    this.processor = null
    this.mute = null
    this.chunks = []
  }
}
