import mapsJson from './sampleMaps.generated.json'

export type SampleNote = { midi: number; file: string }

type PackMap = Record<string, SampleNote[]>

const SAMPLE_PACKS = mapsJson as PackMap

const CDN = 'https://cdn.jsdelivr.net/gh/nbrosowsky/tonejs-instruments@master/samples'
const LOCAL = `${import.meta.env.BASE_URL}samples`
const DRUM_CDN = 'https://tonejs.github.io/audio/drum-samples/acoustic-kit'

const bufferCache = new Map<string, AudioBuffer | Promise<AudioBuffer>>()
const packState = new Map<string, 'loading' | 'ready' | 'error'>()
const packNotes = new Map<string, SampleNote[]>()
let decodeCtx: AudioContext | null = null
let preferLocal = true

export { SAMPLE_PACKS }

export function setSampleDecodeContext(ctx: AudioContext) {
  decodeCtx = ctx
}

function ensureDecodeCtx() {
  if (!decodeCtx) decodeCtx = new AudioContext()
  return decodeCtx
}

function packUrl(packId: string, file: string) {
  const local = `${LOCAL}/${packId}/${file}`
  const remote = `${CDN}/${packId}/${file}`
  return preferLocal ? [local, remote] : [remote, local]
}

async function fetchArrayBuffer(urls: string[]) {
  for (const url of urls) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      return await res.arrayBuffer()
    } catch { /* next */ }
  }
  throw new Error(`Sample introuvable: ${urls[0]}`)
}

async function decode(key: string, urls: string[]) {
  const existing = bufferCache.get(key)
  if (existing) return existing
  const pending = (async () => {
    const raw = await fetchArrayBuffer(urls)
    const ctx = ensureDecodeCtx()
    const buf = await ctx.decodeAudioData(raw.slice(0))
    bufferCache.set(key, buf)
    return buf
  })()
  bufferCache.set(key, pending)
  try {
    return await pending
  } catch (err) {
    bufferCache.delete(key)
    throw err
  }
}

export function getSampleNotes(packId: string) {
  return SAMPLE_PACKS[packId] || []
}

export function isPackReady(packId: string) {
  return packState.get(packId) === 'ready'
}

export function findNearestSample(packId: string, pitch: number) {
  const notes = packNotes.get(packId) || getSampleNotes(packId)
  if (!notes.length) return null
  let best = notes[0]
  let bestDist = Math.abs(notes[0].midi - pitch)
  for (let i = 1; i < notes.length; i++) {
    const d = Math.abs(notes[i].midi - pitch)
    if (d < bestDist) {
      best = notes[i]
      bestDist = d
    }
  }
  return best
}

export function getCachedBuffer(packId: string, file: string) {
  const v = bufferCache.get(`${packId}/${file}`)
  if (v && !(v instanceof Promise)) return v
  return null
}

async function loadOne(packId: string, note: SampleNote) {
  await decode(`${packId}/${note.file}`, packUrl(packId, note.file))
}

export async function loadSamplePack(
  packId: string,
  opts: {
    minify?: number
    concurrency?: number
    force?: boolean
    onProgress?: (p: number) => void
  } = {},
) {
  const notesAll = getSampleNotes(packId)
  if (!notesAll.length) return false
  if (packState.get(packId) === 'ready' && !opts.force) return true
  if (packState.get(packId) === 'loading') {
    while (packState.get(packId) === 'loading') await new Promise((r) => setTimeout(r, 40))
    return packState.get(packId) === 'ready'
  }

  packState.set(packId, 'loading')
  const step = opts.minify && opts.minify > 1 ? opts.minify : 1
  const notes = notesAll.filter((_, i) => i % step === 0)
  packNotes.set(packId, notes)

  const limit = opts.concurrency ?? 6
  let i = 0
  let ok = 0
  async function worker() {
    while (i < notes.length) {
      const idx = i++
      try {
        await loadOne(packId, notes[idx])
        ok++
        opts.onProgress?.(ok / notes.length)
      } catch (err) {
        console.warn('[samples]', packId, notes[idx].file, err)
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()))

  if (ok === 0) {
    packState.set(packId, 'error')
    preferLocal = false
    return false
  }
  packState.set(packId, 'ready')

  if (step > 1) {
    void (async () => {
      const missing = notesAll.filter((n) => !getCachedBuffer(packId, n.file))
      for (const n of missing) {
        try {
          await loadOne(packId, n)
        } catch { /* */ }
      }
      packNotes.set(packId, notesAll)
    })()
  } else {
    packNotes.set(packId, notesAll)
  }
  return true
}

export async function loadDrumHits() {
  const hits = ['kick', 'snare', 'hihat', 'tom1', 'tom2', 'tom3']
  packState.set('drums-kit', 'loading')
  for (const name of hits) {
    try {
      await decode(`drums-kit/${name}.mp3`, [
        `${LOCAL}/drums-kit/${name}.mp3`,
        `${DRUM_CDN}/${name}.mp3`,
      ])
    } catch (err) {
      console.warn('[samples] drum', name, err)
    }
  }
  packState.set('drums-kit', 'ready')
  return true
}

export function getDrumBuffer(name: string) {
  return getCachedBuffer('drums-kit', `${name}.mp3`)
}

export const INSTRUMENT_TO_PACK: Record<string, { pack: string; minify?: number }> = {
  piano: { pack: 'piano', minify: 1 },
  epiano: { pack: 'piano', minify: 2 },
  organ: { pack: 'organ' },
  bass: { pack: 'bass-electric' },
  'bass-sub': { pack: 'contrabass' },
  'bass-pluck': { pack: 'bass-electric' },
  'guitar-clean': { pack: 'guitar-acoustic' },
  'guitar-crunch': { pack: 'guitar-electric' },
  'guitar-lead': { pack: 'guitar-electric' },
  pads: { pack: 'harmonium' },
  'pads-warm': { pack: 'harmonium' },
  'pads-bright': { pack: 'harp' },
  drums: { pack: 'drums-kit' },
  lead: { pack: 'saxophone' },
  'lead-saw': { pack: 'trumpet' },
  'lead-pluck': { pack: 'flute' },
  strings: { pack: 'violin' },
  'strings-cello': { pack: 'cello' },
}

export async function preloadEssentialSamples() {
  await Promise.all([
    loadSamplePack('piano', { minify: 2, concurrency: 8 }),
    loadSamplePack('bass-electric', { concurrency: 6 }),
    loadDrumHits(),
  ])
}

export async function preloadPackForInstrument(instrumentId: string) {
  const map = INSTRUMENT_TO_PACK[instrumentId]
  if (!map) return
  if (map.pack === 'drums-kit') return loadDrumHits()
  return loadSamplePack(map.pack, { minify: map.minify ?? 1, concurrency: 8 })
}
