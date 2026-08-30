import { makeSampleVoice, makeSynthVoice, registerInstrument } from './registry'
import {
  findNearestSample,
  getCachedBuffer,
  getDrumBuffer,
  isPackReady,
  INSTRUMENT_TO_PACK,
  preloadPackForInstrument,
} from './sampleBank'

type VoiceOpts = {
  gain?: number
  attack?: number
  release?: number
  filterFreq?: number
  filterQ?: number
  detuneCents?: number
  drive?: number
  loop?: boolean
}

type SynthFallback = (
  ctx: AudioContext,
  dest: AudioNode,
  pitch: number,
  vel: number,
  when: number,
  dur: number,
) => { stop: (when?: number) => void }

export function registerSampleInstrument(opts: {
  id: string
  name: string
  category: 'keys' | 'bass' | 'pads' | 'drums' | 'lead' | 'strings' | 'guitar' | 'user'
  pack?: string
  voice?: VoiceOpts | ((pitch: number, vel: number) => VoiceOpts)
  fallback: SynthFallback
}) {
  const packId = opts.pack ?? INSTRUMENT_TO_PACK[opts.id]?.pack
  registerInstrument({
    id: opts.id,
    name: opts.name,
    category: opts.category,
    createVoice: (ctx, dest, pitch, vel, when, dur) => {
      void preloadPackForInstrument(opts.id)
      if (!packId || packId === 'drums-kit' || !isPackReady(packId)) {
        return opts.fallback(ctx, dest, pitch, vel, when, dur)
      }
      const nearest = findNearestSample(packId, pitch)
      if (!nearest) return opts.fallback(ctx, dest, pitch, vel, when, dur)
      const buf = getCachedBuffer(packId, nearest.file)
      if (!buf) return opts.fallback(ctx, dest, pitch, vel, when, dur)
      const voice = typeof opts.voice === 'function' ? opts.voice(pitch, vel) : (opts.voice ?? {})
      return makeSampleVoice(ctx, dest, buf, pitch, nearest.midi, vel, when, dur, voice)
    },
  })
}

export function registerDrumKitInstrument() {
  registerInstrument({
    id: 'drums',
    name: 'Batterie',
    category: 'drums',
    createVoice: (ctx, dest, pitch, vel, when, _dur) => {
      void preloadPackForInstrument('drums')
      let hit = 'tom1'
      if (pitch <= 36) hit = 'kick'
      else if (pitch <= 40) hit = 'snare'
      else if (pitch <= 46) hit = 'hihat'
      else if (pitch <= 50) hit = 'tom1'
      else if (pitch <= 55) hit = 'tom2'
      else hit = 'tom3'
      const buf = getDrumBuffer(hit)
      if (!buf) {
        return makeSynthVoice(ctx, dest, Math.min(pitch, 60), vel, when, 0.18, {
          type: 'sine',
          a: 0.001,
          d: 0.08,
          s: 0.1,
          r: 0.08,
          gain: 0.7,
        })
      }
      return makeSampleVoice(ctx, dest, buf, 60, 60, vel, when, 0.5, {
        gain: hit === 'kick' ? 1.1 : hit === 'hihat' ? 0.55 : 0.85,
        attack: 0.001,
        release: 0.08,
      })
    },
  })
}
