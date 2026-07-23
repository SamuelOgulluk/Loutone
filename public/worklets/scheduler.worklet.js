class TransportScheduler extends AudioWorkletProcessor {
  constructor() {
    super()
    this.playing = false
    this.bpm = 120
    this.beat = 0
    this.lastPost = 0
    this.port.onmessage = (e) => {
      const msg = e.data
      if (msg.type === 'play') {
        this.playing = true
        if (typeof msg.beat === 'number') this.beat = msg.beat
      } else if (msg.type === 'pause') {
        this.playing = false
      } else if (msg.type === 'stop') {
        this.playing = false
        this.beat = 0
      } else if (msg.type === 'seek') {
        this.beat = msg.beat
      } else if (msg.type === 'bpm') {
        this.bpm = Math.max(20, Math.min(300, msg.bpm))
      }
    }
  }

  process() {
    const block = 128
    if (this.playing) {
      const samplesPerBeat = (sampleRate * 60) / this.bpm
      this.beat += block / samplesPerBeat
    }
    this.lastPost += block
    if (this.lastPost >= sampleRate / 60) {
      this.lastPost = 0
      this.port.postMessage({ type: 'pos', beat: this.beat, time: currentTime })
    }
    return true
  }
}

registerProcessor('transport-scheduler', TransportScheduler)
