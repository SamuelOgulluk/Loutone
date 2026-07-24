import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDawStore } from '@/store/useDawStore'
import { audioEngine } from '@/audio/engine'
import { TRACK_COLORS, uid } from '@/types/project'
import {
  CHORD_RHYTHMS,
  MODE_EVOLUTIONS,
  SECTION_KINDS,
  SECTION_LABELS,
  chordsToMidiNotes,
  defaultRhythmPattern,
  defaultStructure,
  getEvolution,
  makeRhythmCell,
  resolveSectionChords,
  rhythmNoteLabel,
  rhythmPatternFromPreset,
  rhythmPatternTotal,
  type ChordRhythmId,
  type ModeEvolution,
  type RhythmCell,
  type SectionKind,
  type StructureSection,
} from '@/midi/progressions'

type Props = {
  open: boolean
  onClose: () => void
}

export function ModesPanel({ open, onClose }: Props) {
  const project = useDawStore((s) => s.project)
  const addBlankTrack = useDawStore((s) => s.addBlankTrack)
  const assignInstrument = useDawStore((s) => s.assignInstrument)
  const addMidiClip = useDawStore((s) => s.addMidiClip)
  const setSelection = useDawStore((s) => s.setSelection)
  const setPianoRollOpen = useDawStore((s) => s.setPianoRollOpen)
  const setLoop = useDawStore((s) => s.setLoop)
  const setProject = useDawStore((s) => s.setProject)

  const beatsPerBar = project.timeSignature.numerator
  const [sections, setSections] = useState(defaultStructure)
  const [selectedEvo, setSelectedEvo] = useState(MODE_EVOLUTIONS[3]?.id ?? MODE_EVOLUTIONS[0].id)
  const [activeSectionId, setActiveSectionId] = useState(sections[1]?.id ?? sections[0].id)
  const [rhythmCells, setRhythmCells] = useState(() => defaultRhythmPattern(4))
  const [selectedCellId, setSelectedCellId] = useState('')
  const [status, setStatus] = useState('')

  const evolutions = useMemo(
    () => [...MODE_EVOLUTIONS].sort((a, b) => a.order - b.order),
    [],
  )

  const patternBeats = useMemo(() => rhythmCells.map((c) => c.beats), [rhythmCells])
  const patternTotal = rhythmPatternTotal(rhythmCells)
  const patternBars = Math.max(1, Math.ceil(patternTotal / Math.max(1, beatsPerBar) - 0.001))

  useEffect(() => {
    if (!open) audioEngine.stopPreview()
    return () => audioEngine.stopPreview()
  }, [open])

  if (!open) return null

  const updateSection = (id: string, patch: Partial<StructureSection>) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const previewEvolution = (evo: ModeEvolution, pattern = patternBeats) => {
    const slots = pattern.length ? pattern : [beatsPerBar]
    const chordSecs = evo.chords.map((_, i) => {
      const beats = slots[i % slots.length]
      return Math.max(0.45, (beats * 60) / Math.max(40, project.bpm) * 1.25)
    })
    void audioEngine.previewChordProgression(evo.chords, {
      chordSecs,
      gapSec: 0.06,
      octave: 3,
      instrumentId: 'piano',
    })
  }

  const setPattern = (cells: RhythmCell[], replay = true) => {
    const next = cells.length ? cells : defaultRhythmPattern(beatsPerBar)
    setRhythmCells(next)
    if (!next.find((c) => c.id === selectedCellId)) setSelectedCellId(next[0]?.id ?? '')
    if (replay) {
      const evo = getEvolution(selectedEvo)
      if (evo) previewEvolution(evo, next.map((c) => c.beats))
    }
  }

  const assignEvoToActive = (evo: ModeEvolution) => {
    setSelectedEvo(evo.id)
    setSections((prev) =>
      prev.map((s) =>
        s.id === activeSectionId
          ? { ...s, progressionId: evo.id, customChords: evo.chords.join(' ') }
          : s,
      ),
    )
    previewEvolution(evo)
  }

  const appendNote = (beats: number) => {
    setPattern([...rhythmCells, makeRhythmCell(beats)])
  }

  const appendTriplet = () => {
    const unit = beatsPerBar / 3
    setPattern([...rhythmCells, makeRhythmCell(unit), makeRhythmCell(unit), makeRhythmCell(unit)])
  }

  const loadPreset = (id: ChordRhythmId) => {
    setPattern(rhythmPatternFromPreset(id, beatsPerBar))
  }

  const removeSelectedCell = () => {
    if (rhythmCells.length <= 1) return
    setPattern(rhythmCells.filter((c) => c.id !== selectedCellId))
  }

  const splitSelectedCell = () => {
    const idx = rhythmCells.findIndex((c) => c.id === selectedCellId)
    if (idx < 0) return
    const cell = rhythmCells[idx]
    if (cell.beats < 0.5) return
    const half = cell.beats / 2
    const next = [...rhythmCells]
    next.splice(idx, 1, makeRhythmCell(half), makeRhythmCell(half))
    setSelectedCellId(next[idx].id)
    setPattern(next)
  }

  const nudgeSelected = (factor: number) => {
    const idx = rhythmCells.findIndex((c) => c.id === selectedCellId)
    if (idx < 0) return
    const beats = Math.max(0.25, Math.round(rhythmCells[idx].beats * factor * 4) / 4)
    const next = rhythmCells.map((c, i) => (i === idx ? { ...c, beats } : c))
    setPattern(next)
  }

  const addSection = () => {
    const id = uid('sec')
    setSections((prev) => [
      ...prev,
      {
        id,
        kind: 'couplet',
        bars: 4,
        progressionId: selectedEvo,
        customChords: getEvolution(selectedEvo)?.chords.join(' ') ?? '',
      },
    ])
    setActiveSectionId(id)
  }

  const removeSection = (id: string) => {
    setSections((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((s) => s.id !== id)
      if (activeSectionId === id) setActiveSectionId(next[0].id)
      return next
    })
  }

  const applyToProject = () => {
    let cursor = 0
    const clips: { name: string; start: number; duration: number; notes: ReturnType<typeof chordsToMidiNotes> }[] = []

    for (const section of sections) {
      const chordNames = resolveSectionChords(section)
      if (!chordNames.length) continue
      const sectionBeats = Math.max(1, section.bars) * beatsPerBar
      const notes = chordsToMidiNotes(chordNames, {
        pattern: patternBeats.length ? patternBeats : [beatsPerBar],
        fillBeats: sectionBeats,
        startBeat: 0,
        octave: 3,
        velocity: 84,
      })
      clips.push({
        name: SECTION_LABELS[section.kind],
        start: cursor,
        duration: sectionBeats,
        notes,
      })
      cursor += sectionBeats
    }

    if (!clips.length) {
      setStatus('Aucune progression valide')
      return
    }

    let track = project.tracks.find((t) => t.type === 'midi' && t.instrumentId === 'piano')
    if (!track) {
      addBlankTrack('midi')
      const trackId = useDawStore.getState().selection.trackId
      if (trackId) assignInstrument(trackId, 'piano', 'Piano')
      track = useDawStore.getState().project.tracks.find((t) => t.id === trackId)
    }
    if (!track) {
      setStatus('Impossible de créer la piste piano')
      return
    }

    const color = track.color || TRACK_COLORS[0]
    let lastClipId = ''
    for (const clip of clips) {
      const clipId = uid('clip')
      lastClipId = clipId
      addMidiClip(track.id, {
        id: clipId,
        name: clip.name,
        start: clip.start,
        duration: clip.duration,
        loopLength: clip.duration,
        notes: clip.notes.map((n) => ({ ...n, id: uid('note') })),
        color,
      })
    }

    const total = cursor
    const latest = useDawStore.getState().project
    setProject({
      ...latest,
      lengthBeats: Math.max(latest.lengthBeats, total + 8),
      loopEnabled: true,
      loopStart: 0,
      loopEnd: Math.max(0.25, total),
    })
    setLoop(true, 0, total)
    setSelection({
      trackId: track.id,
      clipId: lastClipId || null,
      selectedClipIds: lastClipId ? [lastClipId] : [],
      noteIds: [],
      effectId: null,
    })
    setPianoRollOpen(true)
    setStatus(`${clips.length} section${clips.length > 1 ? 's' : ''} → Piano`)
    window.setTimeout(() => setStatus(''), 3500)
  }

  return createPortal(
    <div className="modes-overlay" role="dialog" aria-modal="true" aria-label="Modes et structure">
      <button
        type="button"
        className="modes-backdrop"
        aria-label="Fermer"
        onClick={() => {
          audioEngine.stopPreview()
          onClose()
        }}
      />
      <div className="modes-panel panel">
        <header className="modes-head">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Modes & structure</h2>
            <p className="text-[11px] text-[var(--muted)] mt-0.5">
              Choisis une évolution d’accords, assigne-la aux sections, puis applique en MIDI piano.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-compact"
            onClick={() => {
              audioEngine.stopPreview()
              onClose()
            }}
          >
            Fermer
          </button>
        </header>

        <div className="modes-body">
          <aside className="modes-lib">
            <div className="modes-section-title">Bibliothèque — du clair au sombre</div>
            <div className="modes-lib-list">
              {evolutions.map((evo) => {
                const active = selectedEvo === evo.id
                return (
                  <button
                    key={evo.id}
                    type="button"
                    className={`modes-evo ${active ? 'is-active' : ''}`}
                    onClick={() => assignEvoToActive(evo)}
                    title="Écouter et assigner à la section sélectionnée"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-sm">{evo.label}</span>
                      <span className="text-[10px] text-[var(--muted)] mono">{evo.order}</span>
                    </div>
                    <div className="text-[10px] text-[var(--muted)] mt-0.5">{evo.feel}</div>
                    <div className="modes-chords mono mt-1.5">{evo.chords.join(' · ')}</div>
                  </button>
                )
              })}
            </div>
          </aside>

          <section className="modes-struct">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="modes-section-title mb-0">Structure du morceau</div>
              <button type="button" className="btn btn-compact" onClick={addSection}>
                + Section
              </button>
            </div>

            <div className="modes-score mb-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="modes-section-title mb-0">Rythme — partition</div>
                <span className="text-[10px] text-[var(--muted)] mono">
                  {patternTotal.toFixed(patternTotal % 1 ? 2 : 0)} temps · {patternBars} mes.
                </span>
              </div>

              <div className="modes-score-palette">
                <button type="button" className="btn btn-compact" title="Ajouter une ronde" onClick={() => appendNote(beatsPerBar)}>
                  𝅝
                </button>
                <button type="button" className="btn btn-compact" title="Ajouter une blanche" onClick={() => appendNote(beatsPerBar / 2)}>
                  𝅗
                </button>
                <button type="button" className="btn btn-compact" title="Ajouter une noire" onClick={() => appendNote(beatsPerBar / 4)}>
                  ♩
                </button>
                <button type="button" className="btn btn-compact" title="Ajouter une croche" onClick={() => appendNote(beatsPerBar / 8)}>
                  ♪
                </button>
                <button type="button" className="btn btn-compact" title="Ajouter un groupe de triolets" onClick={appendTriplet}>
                  ⅓×3
                </button>
                <span className="modes-score-sep" />
                <button type="button" className="btn btn-compact" title="Couper en deux" onClick={splitSelectedCell}>
                  ÷2
                </button>
                <button type="button" className="btn btn-compact" title="Allonger" onClick={() => nudgeSelected(2)}>
                  ×2
                </button>
                <button type="button" className="btn btn-compact" title="Raccourcir" onClick={() => nudgeSelected(0.5)}>
                  ×½
                </button>
                <button type="button" className="btn btn-compact" title="Supprimer la note" onClick={removeSelectedCell}>
                  ⌫
                </button>
                <button
                  type="button"
                  className="btn btn-compact"
                  title="Effacer la partition"
                  onClick={() => setPattern(defaultRhythmPattern(beatsPerBar))}
                >
                  Reset
                </button>
              </div>

              <div className="modes-score-staff" role="list" aria-label="Partition du rythme">
                {Array.from({ length: Math.max(0, patternBars - 1) }, (_, bar) => {
                  const at = (bar + 1) * beatsPerBar
                  if (at >= patternTotal - 0.01) return null
                  return (
                    <div
                      key={`bar-${bar}`}
                      className="modes-score-barline"
                      style={{ left: `${(at / Math.max(patternTotal, 0.25)) * 100}%` }}
                    />
                  )
                })}
                {rhythmCells.map((cell, i) => {
                  const meta = rhythmNoteLabel(cell.beats, beatsPerBar)
                  const active = cell.id === selectedCellId || (!selectedCellId && i === 0)
                  return (
                    <button
                      key={cell.id}
                      type="button"
                      role="listitem"
                      className={`modes-score-note ${active ? 'is-active' : ''}`}
                      style={{ flexGrow: cell.beats, flexBasis: 0 }}
                      title={`${meta.name} · ${cell.beats} temps — double-clic pour couper`}
                      onClick={() => setSelectedCellId(cell.id)}
                      onDoubleClick={() => {
                        setSelectedCellId(cell.id)
                        const half = cell.beats / 2
                        if (half < 0.25) return
                        const idx = rhythmCells.findIndex((c) => c.id === cell.id)
                        if (idx < 0) return
                        const next = [...rhythmCells]
                        next.splice(idx, 1, makeRhythmCell(half), makeRhythmCell(half))
                        setSelectedCellId(next[idx].id)
                        setPattern(next)
                      }}
                    >
                      <span className="modes-score-glyph">{meta.glyph}</span>
                      <span className="modes-score-beats mono">
                        {cell.beats % 1 ? cell.beats.toFixed(2) : cell.beats}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="modes-score-presets">
                <span className="text-[10px] text-[var(--muted)]">Modèles</span>
                {CHORD_RHYTHMS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="btn btn-compact"
                    title={r.hint}
                    onClick={() => loadPreset(r.id)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="modes-struct-list">
              {sections.map((sec) => {
                const selected = activeSectionId === sec.id
                const preview = resolveSectionChords(sec)
                return (
                  <div
                    key={sec.id}
                    className={`modes-sec ${selected ? 'is-active' : ''}`}
                    onClick={() => setActiveSectionId(sec.id)}
                  >
                    <div className="flex items-center gap-2">
                      <select
                        value={sec.kind}
                        onChange={(e) => updateSection(sec.id, { kind: e.target.value as SectionKind })}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {SECTION_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {SECTION_LABELS[k]}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 text-[10px] text-[var(--muted)]">
                        Mesures
                        <input
                          type="number"
                          className="mono w-12"
                          min={1}
                          max={32}
                          value={sec.bars}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            updateSection(sec.id, { bars: Math.max(1, Number(e.target.value) || 1) })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-compact ml-auto"
                        title="Supprimer"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeSection(sec.id)
                        }}
                      >
                        ×
                      </button>
                    </div>
                    <textarea
                      className="modes-sec-chords mono"
                      rows={2}
                      placeholder="Cmaj9 A7(b9) Dm9 …"
                      value={sec.customChords}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        updateSection(sec.id, {
                          customChords: e.target.value,
                          progressionId: null,
                        })
                      }
                    />
                    <div className="text-[10px] text-[var(--muted)] mt-1 truncate">
                      {preview.length ? preview.join(' · ') : 'Choisis une évolution à gauche'}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="modes-footer">
              {status && <span className="text-[11px] text-[var(--muted)]">{status}</span>}
              <button type="button" className="btn btn-accent" onClick={applyToProject}>
                Appliquer → Piano
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}
