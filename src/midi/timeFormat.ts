export function beatToParts(positionBeat: number, beatsPerBar: number) {
  const bar = Math.floor(positionBeat / beatsPerBar) + 1
  const beat = Math.floor(positionBeat % beatsPerBar) + 1
  const sub = Math.min(99, Math.round((positionBeat % 1) * 100))
  return { bar, beat, sub }
}

export function normalizeParts(bar: number, beat: number, sub: number, beatsPerBar: number) {
  let b = Math.max(1, Math.floor(bar))
  let t = Math.floor(beat)
  let s = Math.floor(sub)

  while (s >= 100) {
    s -= 100
    t += 1
  }
  while (s < 0) {
    s += 100
    t -= 1
  }
  while (t > beatsPerBar) {
    t -= beatsPerBar
    b += 1
  }
  while (t < 1) {
    if (b <= 1) {
      t = 1
      s = Math.max(0, s)
      break
    }
    t += beatsPerBar
    b -= 1
  }

  return { bar: b, beat: t, sub: Math.max(0, Math.min(99, s)) }
}

export function partsToBeat(bar: number, beat: number, sub: number, beatsPerBar: number) {
  const p = normalizeParts(bar, beat, sub, beatsPerBar)
  return (p.bar - 1) * beatsPerBar + (p.beat - 1) + p.sub / 100
}

export function formatMusicalTime(positionBeat: number, beatsPerBar: number) {
  const { bar, beat, sub } = beatToParts(positionBeat, beatsPerBar)
  return `${String(bar).padStart(3, '0')}.${beat}.${String(sub).padStart(2, '0')}`
}

export function parseMusicalTime(input: string, beatsPerBar: number) {
  const raw = input.trim()
  if (!raw) return null

  const parts = raw.replace(/:/g, '.').split('.').filter((p) => p.length > 0)
  if (!parts.length) return null

  const nums = parts.map((p) => Number(p))
  if (nums.some((n) => Number.isNaN(n))) return null

  let bar = 1
  let beat = 1
  let sub = 0

  if (parts.length === 1) bar = nums[0]
  else if (parts.length === 2) {
    bar = nums[0]
    beat = nums[1]
  } else {
    bar = nums[0]
    beat = nums[1]
    sub = nums[2]
  }

  if (bar < 1 || beat < 1 || beat > beatsPerBar) return null
  if (sub < 0 || sub > 99) return null

  return partsToBeat(bar, beat, sub, beatsPerBar)
}

export const MUSICAL_TIME_HINT =
  'Mesure, temps et centième du temps — chaque bulle se met à jour avec les autres.'