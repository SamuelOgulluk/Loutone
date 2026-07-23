import type { MidiNote } from '@/types/project'
import { uid } from '@/types/project'

export function notesToMidiBlob(notes: MidiNote[], bpm: number) {
  const ticksPerBeat = 480
  const events: { tick: number; data: number[] }[] = []
  for (const n of notes) {
    const start = Math.round(n.start * ticksPerBeat)
    const end = Math.round((n.start + n.duration) * ticksPerBeat)
    events.push({ tick: start, data: [0x90, n.pitch, Math.max(1, Math.min(127, n.velocity))] })
    events.push({ tick: end, data: [0x80, n.pitch, 0] })
  }
  events.sort((a, b) => a.tick - b.tick || a.data[0] - b.data[0])

  const track: number[] = []
  const writeVar = (v: number) => {
    const bytes: number[] = []
    let val = v
    bytes.unshift(val & 0x7f)
    val >>= 7
    while (val > 0) {
      bytes.unshift((val & 0x7f) | 0x80)
      val >>= 7
    }
    track.push(...bytes)
  }

  let last = 0
  // tempo meta
  writeVar(0)
  track.push(0xff, 0x51, 0x03)
  const micros = Math.round(60_000_000 / bpm)
  track.push((micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff)

  for (const ev of events) {
    writeVar(ev.tick - last)
    last = ev.tick
    track.push(...ev.data)
  }
  writeVar(0)
  track.push(0xff, 0x2f, 0x00)

  const header = [
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
    0x00, 0x00, 0x00, 0x01,
    (ticksPerBeat >> 8) & 0xff, ticksPerBeat & 0xff,
  ]
  const trackHeader = [
    0x4d, 0x54, 0x72, 0x6b,
    (track.length >> 24) & 0xff,
    (track.length >> 16) & 0xff,
    (track.length >> 8) & 0xff,
    track.length & 0xff,
  ]
  return new Blob([new Uint8Array([...header, ...trackHeader, ...track])], { type: 'audio/midi' })
}

export function parseMidiFile(buffer: ArrayBuffer): MidiNote[] {
  const view = new DataView(buffer)
  if (view.getUint32(0) !== 0x4d546864) return []
  const ticksPerBeat = view.getUint16(12)
  let offset = 14
  const notes: MidiNote[] = []
  const active = new Map<number, { start: number; velocity: number }>()

  while (offset + 8 <= buffer.byteLength) {
    if (view.getUint32(offset) !== 0x4d54726b) break
    const length = view.getUint32(offset + 4)
    offset += 8
    const end = offset + length
    let tick = 0
    let running = 0
    while (offset < end) {
      let delta = 0
      let byte = 0
      do {
        byte = view.getUint8(offset++)
        delta = (delta << 7) | (byte & 0x7f)
      } while (byte & 0x80 && offset < end)
      tick += delta
      let status = view.getUint8(offset)
      if (status < 0x80) {
        status = running
      } else {
        offset++
        running = status
      }
      const type = status & 0xf0
      if (type === 0x90 || type === 0x80) {
        const pitch = view.getUint8(offset++)
        const vel = view.getUint8(offset++)
        const beat = tick / ticksPerBeat
        if (type === 0x90 && vel > 0) {
          active.set(pitch, { start: beat, velocity: vel })
        } else {
          const on = active.get(pitch)
          if (on) {
            notes.push({
              id: uid('note'),
              pitch,
              start: on.start,
              duration: Math.max(0.05, beat - on.start),
              velocity: on.velocity,
            })
            active.delete(pitch)
          }
        }
      } else if (type === 0xc0 || type === 0xd0) {
        offset += 1
      } else if (type === 0xf0) {
        if (status === 0xff) {
          offset++
          const len = view.getUint8(offset++)
          offset += len
        } else {
          while (offset < end && view.getUint8(offset++) !== 0xf7) { /* sysex */ }
        }
      } else {
        offset += 2
      }
    }
  }
  return notes
}
