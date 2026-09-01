import { audioEngine } from '@/audio/engine'

export type MicErrorCode = 'denied' | 'missing' | 'busy' | 'unsupported' | 'empty' | 'short' | 'decode'

export class MicCaptureError extends Error {
  code: MicErrorCode

  constructor(code: MicErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

function micErrorFrom(err: unknown) {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return new MicCaptureError('denied', 'Micro refusé — autorise l’accès dans le navigateur')
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return new MicCaptureError('missing', 'Aucun micro détecté — vérifie Windows > Son > Entrée')
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return new MicCaptureError('busy', 'Micro occupé par une autre application')
  }
  const msg = err instanceof Error ? err.message : String(err)
  return new MicCaptureError('unsupported', msg || 'Micro indisponible')
}

function pickRecorderMime() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) return mime
  }
  return ''
}

export class VoiceRecorder {
  private stream = null as MediaStream | null
  private recorder = null as MediaRecorder | null
  private monitorCtx = null as AudioContext | null
  private analyser = null as AnalyserNode | null
  private monitorSource = null as MediaStreamAudioSourceNode | null
  private chunks: Blob[] = []
  private running = false
  private mime = ''
  private levelBuf = null as Float32Array | null

  get isRecording() {
    return this.running
  }

  getInputLevel() {
    if (!this.analyser || !this.levelBuf) return 0
    const buf = this.levelBuf
    if (!buf) return 0
    this.analyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>)
    let sum = 0
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i]
      sum += v * v
    }
    return Math.min(1, Math.sqrt(sum / buf.length) * 4)
  }

  async start() {
    if (this.running) return
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new MicCaptureError('unsupported', 'Enregistrement micro non supporté ici')
    }
    if (typeof MediaRecorder === 'undefined') {
      throw new MicCaptureError('unsupported', 'MediaRecorder indisponible dans ce navigateur')
    }

    await audioEngine.resume()

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      })
    } catch (err) {
      throw micErrorFrom(err)
    }

    const track = this.stream.getAudioTracks()[0]
    if (!track || track.readyState !== 'live') {
      throw new MicCaptureError('missing', 'Flux micro inactif — vérifie la source d’entrée')
    }

    this.mime = pickRecorderMime()
    this.chunks = []
    try {
      this.recorder = this.mime
        ? new MediaRecorder(this.stream, { mimeType: this.mime })
        : new MediaRecorder(this.stream)
    } catch (err) {
      throw micErrorFrom(err)
    }

    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }

    this.monitorCtx = new AudioContext({ latencyHint: 'interactive' })
    await this.monitorCtx.resume()
    this.monitorSource = this.monitorCtx.createMediaStreamSource(this.stream)
    this.analyser = this.monitorCtx.createAnalyser()
    this.analyser.fftSize = 512
    this.levelBuf = new Float32Array(this.analyser.fftSize)
    this.monitorSource.connect(this.analyser)

    this.recorder.start(200)
    this.running = true
  }

  async stop() {
    if (!this.running || !this.recorder) return null
    this.running = false
    const recorder = this.recorder
    const mime = this.mime || recorder.mimeType || 'audio/webm'

    const blob = await new Promise<Blob>((resolve, reject) => {
      const fail = () => reject(new MicCaptureError('empty', 'Échec capture audio'))
      recorder.onerror = fail
      recorder.onstop = () => {
        if (!this.chunks.length) {
          reject(new MicCaptureError('empty', 'Aucun audio capturé — micro muet ou trop court'))
          return
        }
        resolve(new Blob(this.chunks, { type: mime }))
      }
      try {
        if (recorder.state === 'recording') recorder.requestData()
        recorder.stop()
      } catch (err) {
        reject(micErrorFrom(err))
      }
    }).finally(() => {
      this.teardownStream()
    })

    if (blob.size < 128) {
      throw new MicCaptureError('empty', 'Aucun signal micro — vérifie le volume d’entrée Windows')
    }

    await audioEngine.init()
    const ctx = audioEngine.ctx
    if (!ctx) throw new MicCaptureError('decode', 'Moteur audio indisponible')

    let decoded: AudioBuffer
    try {
      decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    } catch {
      throw new MicCaptureError('decode', 'Impossible de décoder l’enregistrement')
    }

    if (decoded.duration < 0.12) {
      throw new MicCaptureError('short', 'Enregistrement trop court — parle au moins une seconde')
    }

    if (peakLevel(decoded) < 0.002) {
      throw new MicCaptureError('empty', 'Signal trop faible — monte le gain micro ou rapproche-toi')
    }

    return decoded
  }

  async cancel() {
    this.running = false
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
    } catch { /* */ }
    this.teardownStream()
    this.chunks = []
    this.recorder = null
  }

  private teardownStream() {
    try {
      this.monitorSource?.disconnect()
      this.analyser?.disconnect()
    } catch { /* */ }
    void this.monitorCtx?.close().catch(() => {})
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.monitorCtx = null
    this.monitorSource = null
    this.analyser = null
    this.levelBuf = null
    this.recorder = null
  }
}

function peakLevel(buffer: AudioBuffer) {
  let peak = 0
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i])
      if (v > peak) peak = v
    }
  }
  return peak
}
