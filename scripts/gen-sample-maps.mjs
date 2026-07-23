import fs from 'node:fs'

const raw = fs.readFileSync('_tonejs_inst.js', 'utf8')
const packs = [
  'bass-electric', 'cello', 'contrabass', 'flute', 'guitar-acoustic',
  'guitar-electric', 'guitar-nylon', 'harmonium', 'harp', 'organ',
  'piano', 'saxophone', 'trumpet', 'violin', 'xylophone',
]
const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 }

function toMidi(n) {
  const m = n.match(/^([A-G]#?)(-?\d+)$/)
  if (!m) throw new Error(n)
  return (parseInt(m[2], 10) + 1) * 12 + NOTE[m[1]]
}

function fileOf(n) {
  return `${n.replace('#', 's')}.mp3`
}

const out = {}
for (const id of packs) {
  const start = raw.indexOf(`'${id}': {`)
  if (start < 0) {
    console.error('missing', id)
    continue
  }
  const brace = raw.indexOf('{', start)
  let depth = 0
  let end = brace
  for (let i = brace; i < raw.length; i++) {
    if (raw[i] === '{') depth++
    if (raw[i] === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  const body = raw.slice(brace, end + 1)
  const notes = []
  const seen = new Set()
  for (const mm of body.matchAll(/'([^']+)':\s*'([^']+)'/g)) {
    const note = mm[1]
    if (seen.has(note)) continue
    seen.add(note)
    notes.push({ midi: toMidi(note), file: fileOf(note) })
  }
  notes.sort((a, b) => a.midi - b.midi)
  out[id] = notes
  console.log(id, notes.length)
}

fs.mkdirSync('src/instruments', { recursive: true })
fs.writeFileSync('src/instruments/sampleMaps.generated.json', JSON.stringify(out, null, 2))
console.log('ok')
