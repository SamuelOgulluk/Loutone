export function midiToFreq(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function beatsToSeconds(beats: number, bpm: number) {
  return (beats * 60) / bpm
}

export function secondsToBeats(seconds: number, bpm: number) {
  return (seconds * bpm) / 60
}

export function noteName(pitch: number) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(pitch / 12) - 1
  return `${names[((pitch % 12) + 12) % 12]}${octave}`
}
