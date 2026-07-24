import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useDawStore } from '@/store/useDawStore'
import { snapBeat } from '@/ui/hooks/useTransport'
import { parseChord, chordToNotes } from '@/midi/chords'
import { noteName } from '@/midi/notes'
import { uid } from '@/types/project'

const KEY_H = 18
const LOW = 36
const HIGH = 96

export function PianoRoll() {
  const project = useDawStore((s) => s.project)
  const selection = useDawStore((s) => s.selection)
  const zoom = useDawStore((s) => s.zoom)
  const positionBeat = useDawStore((s) => s.positionBeat)
  const quantizeDivision = useDawStore((s) => s.quantizeDivision)
  const quantizeStrength = useDawStore((s) => s.quantizeStrength)
  const swingAmount = useDawStore((s) => s.swingAmount)
  const setQuantize = useDawStore((s) => s.setQuantize)
  const setSwing = useDawStore((s) => s.setSwing)
  const setSelection = useDawStore((s) => s.setSelection)
  const addNote = useDawStore((s) => s.addNote)
  const updateNote = useDawStore((s) => s.updateNote)
  const removeNotes = useDawStore((s) => s.removeNotes)
  const quantizeSelected = useDawStore((s) => s.quantizeSelected)
  const applySwingSelected = useDawStore((s) => s.applySwingSelected)
  const updateMidiClip = useDawStore((s) => s.updateMidiClip)
  const [chordInput, setChordInput] = useState('Cmaj7')
  const [themeTick, setThemeTick] = useState(0)

  useEffect(() => {
    const onTheme = () => setThemeTick((n) => n + 1)
    window.addEventListener('lutra-theme', onTheme)
    return () => window.removeEventListener('lutra-theme', onTheme)
  }, [])
  const [drawVel, setDrawVel] = useState(100)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; mode: 'move' | 'resize'; ox: number; oStart: number; oDur: number } | null>(null)

  const track = project.tracks.find((t) => t.id === selection.trackId)
  const clip = track?.midiClips.find((c) => c.id === selection.clipId) ?? track?.midiClips[0]
  const beats = clip?.duration ?? 8
  const width = Math.max(400, beats * zoom * 2)
  const height = (HIGH - LOW + 1) * KEY_H

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !clip) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const css = getComputedStyle(document.documentElement)
    const rollBg = css.getPropertyValue('--roll-bg').trim() || '#14110e'
    const rollKey = css.getPropertyValue('--roll-key').trim() || '#221e19'
    const rollKeyBlack = css.getPropertyValue('--roll-key-black').trim() || '#1a1714'
    const rollLine = css.getPropertyValue('--roll-line').trim() || '#2a241e'
    const rollBar = css.getPropertyValue('--roll-bar').trim() || '#4a4035'
    const rollSelect = css.getPropertyValue('--roll-select').trim() || '#e8a04a'
    const rollSelectStroke = css.getPropertyValue('--roll-select-stroke').trim() || '#f5e6c8'
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = rollBg
    ctx.fillRect(0, 0, width, height)

    for (let p = LOW; p <= HIGH; p++) {
      const y = (HIGH - p) * KEY_H
      const black = [1, 3, 6, 8, 10].includes(p % 12)
      ctx.fillStyle = black ? rollKeyBlack : rollKey
      ctx.fillRect(0, y, width, KEY_H)
      ctx.strokeStyle = rollLine
      ctx.beginPath()
      ctx.moveTo(0, y + KEY_H)
      ctx.lineTo(width, y + KEY_H)
      ctx.stroke()
    }

    const step = 4 / quantizeDivision
    for (let b = 0; b <= beats; b += step) {
      const x = (b / beats) * width
      const bar = Math.abs(b % project.timeSignature.numerator) < 0.001
      ctx.strokeStyle = bar ? rollBar : rollLine
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }

    for (const n of clip.notes) {
      const x = (n.start / beats) * width
      const w = Math.max(4, (n.duration / beats) * width)
      const y = (HIGH - n.pitch) * KEY_H + 1
      const selected = selection.noteIds.includes(n.id)
      ctx.fillStyle = selected ? rollSelect : track?.color ?? '#8fbf9a'
      ctx.globalAlpha = 0.35 + (n.velocity / 127) * 0.65
      ctx.fillRect(x, y, w, KEY_H - 2)
      ctx.globalAlpha = 1
      ctx.strokeStyle = selected ? rollSelectStroke : '#00000055'
      ctx.strokeRect(x, y, w, KEY_H - 2)
    }

    const playX = ((positionBeat - (clip.start ?? 0)) / beats) * width
    if (playX >= 0 && playX <= width) {
      ctx.strokeStyle = rollSelect
      ctx.beginPath()
      ctx.moveTo(playX, 0)
      ctx.lineTo(playX, height)
      ctx.stroke()
    }
  }, [clip, width, height, selection.noteIds, positionBeat, quantizeDivision, project.timeSignature.numerator, track?.color, beats, themeTick])

  if (!track || track.type !== 'midi') {
    return (
      <section className="panel h-full flex items-center justify-center text-[var(--muted)] text-sm">
        Sélectionnez une piste MIDI
      </section>
    )
  }

  if (!clip) {
    return (
      <section className="panel h-full flex items-center justify-center text-[var(--muted)] text-sm">
        Aucun clip MIDI
      </section>
    )
  }

  const beatFromX = (x: number) => snapBeat((x / width) * beats)
  const pitchFromY = (y: number) => Math.max(LOW, Math.min(HIGH, HIGH - Math.floor(y / KEY_H)))

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const beat = beatFromX(x)
    const pitch = pitchFromY(y)
    const hit = [...clip.notes].reverse().find(
      (n) => n.pitch === pitch && beat >= n.start && beat <= n.start + n.duration,
    )
    if (hit) {
      const nearEnd = beat > hit.start + hit.duration * 0.75
      setSelection({ trackId: track.id, clipId: clip.id, noteIds: [hit.id] })
      dragRef.current = {
        id: hit.id,
        mode: nearEnd ? 'resize' : 'move',
        ox: x,
        oStart: hit.start,
        oDur: hit.duration,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    if (e.button === 0) {
      const note = {
        id: uid('note'),
        pitch,
        start: beat,
        duration: 4 / quantizeDivision,
        velocity: drawVel,
      }
      addNote(track.id, clip.id, note)
      setSelection({ trackId: track.id, clipId: clip.id, noteIds: [note.id] })
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (drag.mode === 'move') {
      const db = beatFromX(x) - beatFromX(drag.ox)
      updateNote(track.id, clip.id, drag.id, {
        start: Math.max(0, snapBeat(drag.oStart + db)),
        pitch: pitchFromY(y),
      })
    } else {
      const end = beatFromX(x)
      updateNote(track.id, clip.id, drag.id, {
        duration: Math.max(4 / 32, snapBeat(end) - drag.oStart),
      })
    }
  }

  const insertChord = () => {
    const parsed = parseChord(chordInput)
    if (!parsed) return
    const start = snapBeat(Math.max(0, positionBeat - clip.start))
    const notes = chordToNotes(parsed, start, 1, drawVel)
    updateMidiClip(track.id, clip.id, { notes: [...clip.notes, ...notes] })
    setSelection({ trackId: track.id, clipId: clip.id, noteIds: notes.map((n) => n.id) })
  }

  return (
    <section className="panel flex flex-col h-full min-w-0 overflow-hidden">
      <div className="piano-roll-toolbar shrink-0 min-w-0 border-b border-[var(--line)] px-3 py-1.5 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <h2 className="text-sm font-semibold text-[var(--accent)] shrink-0">Piano roll</h2>
          <span className="text-xs text-[var(--muted)] truncate max-w-[10rem]">{track.name} · {clip.name}</span>
          <label className="text-xs text-[var(--muted)] flex items-center gap-1 shrink-0">
            Q
            <select
              value={quantizeDivision}
              onChange={(e) => setQuantize(Number(e.target.value) as 4 | 8 | 16 | 32)}
            >
              <option value={4}>1/4</option>
              <option value={8}>1/8</option>
              <option value={16}>1/16</option>
              <option value={32}>1/32</option>
            </select>
          </label>
          <label className="text-xs text-[var(--muted)] flex items-center gap-1 shrink-0">
            Force
            <input
              className="piano-roll-range"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={quantizeStrength}
              onChange={(e) => setQuantize(quantizeDivision, Number(e.target.value))}
            />
          </label>
          <button className="btn btn-compact text-xs" onClick={() => quantizeSelected()}>Quantize</button>
          <label className="text-xs text-[var(--muted)] flex items-center gap-1 shrink-0">
            Swing
            <input
              className="piano-roll-range"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={swingAmount}
              onChange={(e) => setSwing(Number(e.target.value))}
            />
          </label>
          <button className="btn btn-compact text-xs" onClick={() => applySwingSelected()}>Appliquer</button>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <label className="text-xs text-[var(--muted)] flex items-center gap-1 shrink-0">
            Accord
            <input className="w-16 mono text-xs" value={chordInput} onChange={(e) => setChordInput(e.target.value)} />
          </label>
          <button className="btn btn-compact text-xs btn-accent" onClick={insertChord}>Insérer</button>
          <label className="text-xs text-[var(--muted)] flex items-center gap-1 shrink-0">
            Vel
            <input
              className="piano-roll-range"
              type="range"
              min={1}
              max={127}
              value={drawVel}
              onChange={(e) => setDrawVel(Number(e.target.value))}
            />
          </label>
          <button
            className="btn btn-compact text-xs"
            onClick={() => {
              if (selection.noteIds.length) removeNotes(track.id, clip.id, selection.noteIds)
            }}
          >
            Suppr
          </button>
          <button
            className="btn btn-compact text-xs"
            onClick={async () => {
              const { notesToMidiBlob } = await import('@/midi/importExport')
              const blob = notesToMidiBlob(clip.notes, project.bpm)
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `${clip.name}.mid`
              a.click()
              URL.revokeObjectURL(url)
            }}
          >
            Export
          </button>
          <button
            className="btn btn-compact text-xs"
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = '.mid,.midi'
              input.onchange = async () => {
                const file = input.files?.[0]
                if (!file) return
                const { parseMidiFile } = await import('@/midi/importExport')
                const notes = parseMidiFile(await file.arrayBuffer())
                updateMidiClip(track.id, clip.id, { notes: [...clip.notes, ...notes] })
              }
              input.click()
            }}
          >
            Import
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 min-w-0 min-h-0 overflow-auto flex">
        <div className="sticky left-0 z-10 shrink-0 bg-[var(--bg-1)] border-r border-[var(--line)]" style={{ width: 44 }}>
          {Array.from({ length: HIGH - LOW + 1 }, (_, i) => {
            const p = HIGH - i
            const black = [1, 3, 6, 8, 10].includes(p % 12)
            return (
              <div
                key={p}
                className={`mono text-[9px] px-1 flex items-center ${black ? 'text-[var(--muted)]' : 'text-[var(--text)]'}`}
                style={{
                  height: KEY_H,
                  background: black ? 'var(--roll-key-black)' : 'var(--roll-key)',
                }}
              >
                {p % 12 === 0 ? noteName(p) : ''}
              </div>
            )
          })}
        </div>
        <canvas
          ref={canvasRef}
          className="cursor-crosshair"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            dragRef.current = null
            useDawStore.getState().endHistoryGesture()
          }}
          onPointerCancel={() => {
            dragRef.current = null
            useDawStore.getState().endHistoryGesture()
          }}
        />
      </div>
    </section>
  )
}
