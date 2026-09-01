import { useEffect, useState } from 'react'
import { audioEngine } from '@/audio/engine'
import { beatToParts, partsToBeat, MUSICAL_TIME_HINT } from '@/midi/timeFormat'

type Field = 'bar' | 'beat' | 'sub'

type Props = {
  positionBeat: number
  beatsPerBar: number
  onSeek: (beat: number) => void
}

function displayValue(field: Field, parts: ReturnType<typeof beatToParts>) {
  if (field === 'bar') return String(parts.bar).padStart(3, '0')
  if (field === 'beat') return String(parts.beat)
  return String(parts.sub).padStart(2, '0')
}

export function PositionBubbles({ positionBeat, beatsPerBar, onSeek }: Props) {
  const parts = beatToParts(positionBeat, beatsPerBar)
  const [focus, setFocus] = useState(null as Field | null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (focus) return
    setDraft('')
  }, [positionBeat, beatsPerBar, focus])

  const seekFromParts = (bar: number, beat: number, sub: number) => {
    const next = Math.max(0, partsToBeat(bar, beat, sub, beatsPerBar))
    audioEngine.seek(next)
    onSeek(next)
  }

  const commit = (field: Field) => {
    const n = Number(draft)
    if (Number.isNaN(n)) {
      setFocus(null)
      return
    }
    if (field === 'bar') seekFromParts(n, parts.beat, parts.sub)
    else if (field === 'beat') seekFromParts(parts.bar, n, parts.sub)
    else seekFromParts(parts.bar, parts.beat, n)
    setFocus(null)
  }

  const nudge = (field: Field, delta: number) => {
    if (field === 'bar') seekFromParts(parts.bar + delta, parts.beat, parts.sub)
    else if (field === 'beat') seekFromParts(parts.bar, parts.beat + delta, parts.sub)
    else seekFromParts(parts.bar, parts.beat, parts.sub + delta)
  }

  const fields: { id: Field; label: string; title: string; width: string }[] = [
    { id: 'bar', label: 'Mes', title: 'Mesure', width: '3.1rem' },
    { id: 'beat', label: 'T', title: `Temps (1–${beatsPerBar})`, width: '2rem' },
    { id: 'sub', label: 'ct', title: 'Centième du temps (0–99)', width: '2.2rem' },
  ]

  return (
    <div className="tb-position-bubbles" title={MUSICAL_TIME_HINT}>
      {fields.map((f) => (
        <label key={f.id} className="tb-position-bubble" style={{ width: f.width }}>
          <span className="tb-position-cap">{f.label}</span>
          <input
            type="text"
            inputMode="numeric"
            className="mono tb-position-input"
            value={focus === f.id ? draft : displayValue(f.id, parts)}
            title={f.title}
            aria-label={f.title}
            onFocus={() => {
              setFocus(f.id)
              setDraft(displayValue(f.id, parts))
            }}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
            onBlur={() => commit(f.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit(f.id)
                e.currentTarget.blur()
              }
              if (e.key === 'Escape') {
                setFocus(null)
                e.currentTarget.blur()
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                nudge(f.id, 1)
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                nudge(f.id, -1)
              }
            }}
          />
        </label>
      ))}
    </div>
  )
}
