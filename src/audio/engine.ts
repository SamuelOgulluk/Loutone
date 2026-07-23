import type { Project, Track } from '@/types/project'
import { clipLoopLength } from '@/types/project'
import { beatsToSeconds } from '@/midi/notes'
import { getInstrument } from '@/instruments'
import {
  findLane,
  interpolateAutomation,
  mapNormalizedToCutoff,
  scheduleAudioParamCurve,
} from './automation'
import { EffectChain } from './effects'

type TrackNodes = {
  input: GainNode
  instFilter: BiquadFilterNode
  panner: StereoPannerNode
  volume: GainNode
  analyser: AnalyserNode
  fx: EffectChain
  muteGain: GainNode
}

type Scheduled = { stop: () => void }

export class AudioEngine {
  ctx: AudioContext | null = null
  private master: GainNode | null = null
  private masterAnalyser: AnalyserNode | null = null
  private worklet: AudioWorkletNode | null = null
  private tracks = new Map<string, TrackNodes>()
  private buffers = new Map<string, AudioBuffer>()
  private scheduled: Scheduled[] = []
  private project: Project | null = null
  private playing = false
  private beat = 0
  private lookAhead = 0.15
  private scheduleHorizon = 0.4
  private timerId: number | null = null
  private scheduledKeys = new Set<string>()
  private onPos: ((beat: number) => void) | null = null
  private meterData = new Map<string, number>()
  private masterPeak = 0
  private lastAutoBeat = -1
  private metronomeOn = false
  private metroGain: GainNode | null = null
  private metroKeys = new Set<string>()
  private freeMetroTimer: number | null = null
  private freeMetroNext = 0
  private freeMetroBeat = 0

  async init() {
    if (this.ctx) return
    const ctx = new AudioContext()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0.85
    this.masterAnalyser = ctx.createAnalyser()
    this.masterAnalyser.fftSize = 256
    this.master.connect(this.masterAnalyser)
    this.masterAnalyser.connect(ctx.destination)
    this.metroGain = ctx.createGain()
    this.metroGain.gain.value = 0.55
    this.metroGain.connect(this.master)
    try {
      await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/scheduler.worklet.js`)
      this.worklet = new AudioWorkletNode(ctx, 'transport-scheduler')
      const silent = ctx.createGain()
      silent.gain.value = 0
      this.worklet.connect(silent)
      silent.connect(ctx.destination)
      this.worklet.port.onmessage = (e) => {
        if (e.data.type === 'pos') {
          this.beat = e.data.beat
          this.onPos?.(this.beat)
        }
      }
    } catch (err) {
      console.warn('AudioWorklet unavailable, using main-thread clock', err)
    }
  }

  setPositionCallback(cb: (beat: number) => void) {
    this.onPos = cb
  }

  getBeat() {
    return this.beat
  }

  async resume() {
    await this.init()
    if (this.ctx?.state === 'suspended') await this.ctx.resume()
  }

  syncProject(project: Project) {
    this.project = project
    if (!this.ctx || !this.master) return
    const ids = new Set(project.tracks.map((t) => t.id))
    for (const [id, nodes] of this.tracks) {
      if (!ids.has(id)) {
        nodes.fx.dispose()
        nodes.input.disconnect()
        this.tracks.delete(id)
      }
    }
    for (const track of project.tracks) {
      let nodes = this.tracks.get(track.id)
      if (!nodes) {
        nodes = this.createTrackNodes()
        this.tracks.set(track.id, nodes)
      }
      this.applyTrack(track, nodes, project)
    }
    this.worklet?.port.postMessage({ type: 'bpm', bpm: project.bpm })
    if (this.playing) this.rescheduleAutomation()
  }

  private createTrackNodes(): TrackNodes {
    const ctx = this.ctx!
    const input = ctx.createGain()
    const instFilter = ctx.createBiquadFilter()
    instFilter.type = 'lowpass'
    instFilter.frequency.value = 18000
    instFilter.Q.value = 0.7
    const fx = new EffectChain(ctx)
    const muteGain = ctx.createGain()
    const panner = ctx.createStereoPanner()
    const volume = ctx.createGain()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    input.connect(instFilter)
    instFilter.connect(fx.input)
    fx.output.connect(muteGain)
    muteGain.connect(panner)
    panner.connect(volume)
    volume.connect(analyser)
    analyser.connect(this.master!)
    return { input, instFilter, panner, volume, analyser, fx, muteGain }
  }

  private applyTrack(track: Track, nodes: TrackNodes, project: Project) {
    const anySolo = project.tracks.some((t) => t.solo)
    const audible = anySolo ? track.solo : !track.mute
    nodes.muteGain.gain.value = audible ? 1 : 0
    nodes.panner.pan.value = track.pan
    nodes.fx.rebuild(track.effects)
    this.applyAutomationNow(track, nodes, project.bpm)
  }

  private applyAutomationNow(track: Track, nodes: TrackNodes, bpm: number) {
    if (!this.ctx) return
    const audioNow = this.ctx.currentTime
    const beatNow = this.beat
    const volLane = findLane(track, 'volume')
    const volMul = volLane?.points.length
      ? interpolateAutomation(volLane.points, beatNow, 1)
      : 1
    if (this.playing && volLane?.points.length) {
      scheduleAudioParamCurve(
        nodes.volume.gain,
        volLane.points,
        (v) => track.volume * v,
        beatNow,
        audioNow,
        bpm,
        1,
      )
    } else {
      try {
        nodes.volume.gain.cancelScheduledValues(audioNow)
      } catch { /* */ }
      nodes.volume.gain.setValueAtTime(track.volume * volMul, audioNow)
    }

    const instLane = findLane(track, { type: 'instrument', param: 'cutoff' })
    if (this.playing && instLane?.points.length) {
      scheduleAudioParamCurve(
        nodes.instFilter.frequency,
        instLane.points,
        mapNormalizedToCutoff,
        beatNow,
        audioNow,
        bpm,
        0.85,
      )
    } else {
      try {
        nodes.instFilter.frequency.cancelScheduledValues(audioNow)
      } catch { /* */ }
      const cutoff = instLane?.points.length
        ? mapNormalizedToCutoff(interpolateAutomation(instLane.points, beatNow, 0.85))
        : 18000
      nodes.instFilter.frequency.setValueAtTime(cutoff, audioNow)
    }

    for (const lane of track.automation ?? []) {
      if (typeof lane.target === 'string' || lane.target.type !== 'effect') continue
      if (!lane.points.length) continue
      const auto = nodes.fx.getAutomable(lane.target.effectId, lane.target.param)
      if (!auto) continue
      auto.cancelFrom(audioNow)
      const cur = interpolateAutomation(lane.points, beatNow, 0.5)
      auto.setNormalized(cur, audioNow)
      if (!this.playing) continue
      for (const p of lane.points) {
        if (p.beat < beatNow - 0.001) continue
        const when = audioNow + ((p.beat - beatNow) * 60) / bpm
        if (when < audioNow) continue
        auto.rampNormalized(p.value, when)
      }
    }
  }

  private rescheduleAutomation() {
    if (!this.project || !this.ctx) return
    for (const track of this.project.tracks) {
      const nodes = this.tracks.get(track.id)
      if (!nodes) continue
      this.applyAutomationNow(track, nodes, this.project.bpm)
    }
    this.lastAutoBeat = this.beat
  }

  async loadAudioFile(key: string, file: ArrayBuffer | File) {
    await this.init()
    const buf = file instanceof File ? await file.arrayBuffer() : file
    const decoded = await this.ctx!.decodeAudioData(buf.slice(0))
    this.buffers.set(key, decoded)
    return decoded
  }

  hasBuffer(key: string) {
    return this.buffers.has(key)
  }

  getBuffer(key: string) {
    return this.buffers.get(key)
  }

  setBuffer(key: string, buffer: AudioBuffer) {
    this.buffers.set(key, buffer)
  }

  async ensurePlaceholderTone(key = 'demo_tone', seconds = 4, freq = 220) {
    await this.init()
    if (this.buffers.has(key) || !this.ctx) return this.buffers.get(key)!
    const rate = this.ctx.sampleRate
    const len = Math.floor(rate * seconds)
    const buffer = this.ctx.createBuffer(2, len, rate)
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c)
      for (let i = 0; i < len; i++) {
        const t = i / rate
        const env = Math.min(1, t * 4) * Math.max(0, 1 - t / seconds)
        data[i] = Math.sin(2 * Math.PI * freq * t) * 0.25 * env
      }
    }
    this.buffers.set(key, buffer)
    return buffer
  }

  async play(fromBeat?: number) {
    await this.resume()
    if (!this.project || !this.ctx) return
    if (typeof fromBeat === 'number') this.beat = fromBeat
    this.playing = true
    this.stopFreeMetro()
    this.scheduledKeys.clear()
    this.clearScheduled()
    this.rescheduleAutomation()
    this.worklet?.port.postMessage({ type: 'play', beat: this.beat })
    this.worklet?.port.postMessage({ type: 'bpm', bpm: this.project.bpm })
    this.scheduleLoop()
  }

  pause() {
    this.playing = false
    this.worklet?.port.postMessage({ type: 'pause' })
    this.clearScheduled()
    if (this.timerId) {
      window.clearTimeout(this.timerId)
      this.timerId = null
    }
    if (this.project) {
      for (const track of this.project.tracks) {
        const nodes = this.tracks.get(track.id)
        if (nodes) this.applyAutomationNow(track, nodes, this.project.bpm)
      }
    }
    if (this.metronomeOn) this.startFreeMetro()
  }

  stop() {
    this.pause()
    this.beat = 0
    this.worklet?.port.postMessage({ type: 'stop' })
    this.onPos?.(0)
  }

  seek(beat: number) {
    this.beat = Math.max(0, beat)
    this.worklet?.port.postMessage({ type: 'seek', beat: this.beat })
    this.onPos?.(this.beat)
    if (this.playing) {
      this.clearScheduled()
      this.scheduledKeys.clear()
      this.rescheduleAutomation()
    } else if (this.project) {
      for (const track of this.project.tracks) {
        const nodes = this.tracks.get(track.id)
        if (nodes) this.applyAutomationNow(track, nodes, this.project.bpm)
      }
    }
  }

  setBpm(bpm: number) {
    this.worklet?.port.postMessage({ type: 'bpm', bpm })
    if (this.metronomeOn && !this.playing) this.restartFreeMetro()
  }

  setMetronome(on: boolean) {
    this.metronomeOn = on
    if (!on) {
      this.stopFreeMetro()
      this.metroKeys.clear()
      return
    }
    void this.resume().then(() => {
      if (!this.playing) this.startFreeMetro()
    })
  }

  isMetronomeOn() {
    return this.metronomeOn
  }

  private scheduleClick(when: number, accent: boolean) {
    const ctx = this.ctx
    const gainNode = this.metroGain
    if (!ctx || !gainNode || when < ctx.currentTime - 0.02) return
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = accent ? 1200 : 880
    env.gain.value = 0
    env.gain.setValueAtTime(0, when)
    env.gain.linearRampToValueAtTime(accent ? 0.35 : 0.22, when + 0.002)
    env.gain.exponentialRampToValueAtTime(0.001, when + (accent ? 0.07 : 0.05))
    osc.connect(env)
    env.connect(gainNode)
    try {
      osc.start(when)
      osc.stop(when + 0.09)
    } catch { /* */ }
    this.scheduled.push({
      stop: () => {
        try { osc.stop() } catch { /* */ }
      },
    })
  }

  private scheduleMetronomeAhead() {
    if (!this.metronomeOn || !this.playing || !this.ctx || !this.project) return
    const ctx = this.ctx
    const project = this.project
    const bpm = project.bpm
    const beatsPerBar = project.timeSignature.numerator
    const now = ctx.currentTime
    const horizon = now + this.scheduleHorizon
    const beatNow = this.beat
    let beat = Math.ceil(beatNow - 0.0001)
    while (true) {
      const when = now + beatsToSeconds(beat - beatNow, bpm)
      if (when > horizon) break
      if (when >= now - 0.01) {
        const key = `metro:${beat}`
        if (!this.metroKeys.has(key)) {
          this.metroKeys.add(key)
          const accent = Math.round(beat) % beatsPerBar === 0
          this.scheduleClick(when, accent)
        }
      }
      beat += 1
      if (beat > beatNow + 64) break
    }
    if (this.metroKeys.size > 200) {
      const keep = new Set([...this.metroKeys].slice(-80))
      this.metroKeys = keep
    }
  }

  private startFreeMetro() {
    this.stopFreeMetro()
    if (!this.ctx || !this.project || this.playing) return
    const beatsPerBar = this.project.timeSignature.numerator
    this.freeMetroBeat = 0
    this.freeMetroNext = this.ctx.currentTime + 0.05
    const tick = () => {
      if (!this.metronomeOn || this.playing || !this.ctx || !this.project) {
        this.freeMetroTimer = null
        return
      }
      const now = this.ctx.currentTime
      const beatSec = 60 / this.project.bpm
      while (this.freeMetroNext < now + 0.25) {
        const accent = this.freeMetroBeat % beatsPerBar === 0
        this.scheduleClick(Math.max(this.freeMetroNext, now + 0.01), accent)
        this.freeMetroNext += beatSec
        this.freeMetroBeat += 1
      }
      this.freeMetroTimer = window.setTimeout(tick, 40)
    }
    tick()
  }

  private stopFreeMetro() {
    if (this.freeMetroTimer) {
      window.clearTimeout(this.freeMetroTimer)
      this.freeMetroTimer = null
    }
  }

  private restartFreeMetro() {
    if (this.metronomeOn && !this.playing) this.startFreeMetro()
  }

  private clearScheduled() {
    for (const s of this.scheduled) s.stop()
    this.scheduled = []
    this.metroKeys.clear()
  }

  private scheduleLoop() {
    if (!this.playing || !this.ctx || !this.project) return
    this.scheduleAhead()
    this.timerId = window.setTimeout(() => this.scheduleLoop(), this.lookAhead * 1000)
  }

  private scheduleAhead() {
    const ctx = this.ctx!
    const project = this.project!
    const now = ctx.currentTime
    const horizon = now + this.scheduleHorizon
    const bpm = project.bpm
    const beatNow = this.beat
    const audioNow = now

    if (Math.abs(beatNow - this.lastAutoBeat) > 0.25) {
      this.rescheduleAutomation()
    }

    for (const track of project.tracks) {
      const nodes = this.tracks.get(track.id)
      if (!nodes) continue
      const anySolo = project.tracks.some((t) => t.solo)
      if (anySolo ? !track.solo : track.mute) continue

      for (const clip of track.midiClips) {
        const loopLen = clipLoopLength(clip)
        const clipEnd = clip.start + clip.duration
        for (const note of clip.notes) {
          if (note.start >= loopLen) continue
          const maxIter = Math.ceil(clip.duration / loopLen) + 1
          for (let iter = 0; iter < maxIter; iter++) {
            const noteStartAbs = clip.start + iter * loopLen + note.start
            if (noteStartAbs >= clipEnd) break
            if (noteStartAbs + note.duration < beatNow - 0.05) continue
            const playDur = Math.min(note.duration, clipEnd - noteStartAbs)
            if (playDur <= 0.001) continue
            const key = `${track.id}:${clip.id}:${note.id}:${iter}:${Math.floor(noteStartAbs * 100)}`
            if (this.scheduledKeys.has(key)) continue
            const when = audioNow + beatsToSeconds(noteStartAbs - beatNow, bpm)
            if (when < now - 0.02) continue
            if (when > horizon) continue
            this.scheduledKeys.add(key)
            const inst = getInstrument(track.instrumentId ?? 'piano')
            if (!inst) continue
            const durSec = beatsToSeconds(playDur, bpm)
            const handle = inst.createVoice(ctx, nodes.input, note.pitch, note.velocity, Math.max(when, now), durSec)
            this.scheduled.push(handle)
          }
        }
      }

      for (const clip of track.audioClips) {
        const loopLen = clipLoopLength(clip)
        const clipEnd = clip.start + clip.duration
        const buffer = this.buffers.get(clip.bufferKey)
        if (!buffer) continue
        const maxIter = Math.ceil(clip.duration / loopLen) + 1
        for (let iter = 0; iter < maxIter; iter++) {
          const segStart = clip.start + iter * loopLen
          if (segStart >= clipEnd) break
          const segDur = Math.min(loopLen, clipEnd - segStart)
          if (segDur <= 0.001) continue
          if (segStart + segDur < beatNow - 0.05) continue
          const key = `audio:${track.id}:${clip.id}:${iter}:${Math.floor(segStart * 100)}`
          if (this.scheduledKeys.has(key)) continue
          const when = audioNow + beatsToSeconds(segStart - beatNow, bpm)
          if (when > horizon) continue
          if (when + beatsToSeconds(segDur, bpm) < now) continue
          this.scheduledKeys.add(key)
          const src = ctx.createBufferSource()
          src.buffer = buffer
          const offsetSec = beatsToSeconds(clip.offset, bpm)
          const durSec = beatsToSeconds(segDur, bpm)
          const startAt = Math.max(when, now)
          const trim = startAt - when
          src.connect(nodes.input)
          try {
            src.start(startAt, offsetSec + trim, Math.max(0.01, durSec - trim))
          } catch { /* */ }
          this.scheduled.push({
            stop: () => {
              try { src.stop() } catch { /* */ }
            },
          })
        }
      }
    }

    if (project.loopEnabled && beatNow >= project.loopEnd) {
      this.seek(project.loopStart)
      this.scheduledKeys.clear()
    }
    this.scheduleMetronomeAhead()
  }

  tickFallback(dtSec: number) {
    if (!this.playing || !this.project || this.worklet) return
    this.beat += (dtSec * this.project.bpm) / 60
    if (this.project.loopEnabled && this.beat >= this.project.loopEnd) {
      this.beat = this.project.loopStart
      this.scheduledKeys.clear()
      this.rescheduleAutomation()
    }
    this.onPos?.(this.beat)
  }

  readMeters() {
    const result: Record<string, number> = { master: 0 }
    if (this.masterAnalyser) {
      result.master = peakFromAnalyser(this.masterAnalyser)
      this.masterPeak = result.master
    }
    for (const [id, nodes] of this.tracks) {
      const p = peakFromAnalyser(nodes.analyser)
      result[id] = p
      this.meterData.set(id, p)
    }
    return result
  }

  getMasterPeak() {
    return this.masterPeak
  }

  async exportWav() {
    if (!this.project) return null
    const { bounceProject, encodeWav } = await import('./export')
    const rendered = await bounceProject(this.project)
    return encodeWav(rendered)
  }
}

function peakFromAnalyser(analyser: AnalyserNode) {
  const data = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteTimeDomainData(data)
  let peak = 0
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i] - 128) / 128
    if (v > peak) peak = v
  }
  return peak
}

export const audioEngine = new AudioEngine()
