import mapsJson from './sampleMaps.generated.json'
import extraMaps from './sampleMaps.extra.json'

export type SampleNote = { midi: number; file: string }

type PackMap = Record<string, SampleNote[]>

const SAMPLE_PACKS = { ...(mapsJson as PackMap), ...(extraMaps as PackMap) }

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

const LOCAL_PACKS = extraMaps as PackMap

function packUrl(packId: string, file: string) {
  const local = `${LOCAL}/${packId}/${file}`
  if (LOCAL_PACKS[packId]) return [local]
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
  piano: { pack: 'piano-upright' },
  epiano: { pack: 'epiano-dx' },
  organ: { pack: 'organ-drawbar' },
  bass: { pack: 'bass-yr' },
  'bass-sub': { pack: 'bass-lately' },
  'bass-pluck': { pack: 'bass-dx' },
  'guitar-clean': { pack: 'guitar-spanish' },
  'guitar-crunch': { pack: 'guitar-dist1' },
  'guitar-lead': { pack: 'guitar-dist2' },
  pads: { pack: 'pad-newage' },
  'pads-warm': { pack: 'pad-newage' },
  'pads-bright': { pack: 'pad-sweep' },
  drums: { pack: 'drums-kit' },
  lead: { pack: 'lead-calliope' },
  'lead-saw': { pack: 'lead-square' },
  'lead-pluck': { pack: 'lead-crystal' },
  strings: { pack: 'strings-1' },
  'strings-cello': { pack: 'strings-2' },
}

export async function preloadEssentialSamples() {
  await Promise.all([
    loadSamplePack('piano-upright', { minify: 2, concurrency: 8 }),
    loadSamplePack('epiano-dx', { concurrency: 6 }),
    loadSamplePack('pad-newage', { concurrency: 6 }),
    loadSamplePack('bass-yr', { concurrency: 6 }),
    loadSamplePack('guitar-spanish', { minify: 2, concurrency: 8 }),
    loadSamplePack('strings-1', { concurrency: 6 }),
    loadDrumHits(),
  ])
}

export async function preloadPackForInstrument(instrumentId: string) {
  const map = INSTRUMENT_TO_PACK[instrumentId]
  if (!map) return
  if (map.pack === 'drums-kit') return loadDrumHits()
  return loadSamplePack(map.pack, { minify: map.minify ?? 1, concurrency: 8 })
}
