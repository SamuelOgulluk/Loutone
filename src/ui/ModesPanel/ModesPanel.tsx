import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDawStore } from '@/store/useDawStore'
import { audioEngine } from '@/audio/engine'
import { TRACK_COLORS, uid } from '@/types/project'
import {
  MODE_EVOLUTIONS,
  SECTION_KINDS,
  SECTION_LABELS,
  chordsToMidiNotes,
  defaultStructure,
  getEvolution,
  resolveSectionChords,
  type ModeEvolution,
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

  const [sections, setSections] = useState(defaultStructure)
  const [selectedEvo, setSelectedEvo] = useState(MODE_EVOLUTIONS[3]?.id ?? MODE_EVOLUTIONS[0].id)
  const [activeSectionId, setActiveSectionId] = useState(sections[1]?.id ?? sections[0].id)
  const [beatsPerChord, setBeatsPerChord] = useState(4)
  const [status, setStatus] = useState('')

  const evolutions = useMemo(
    () => [...MODE_EVOLUTIONS].sort((a, b) => a.order - b.order),
    [],
  )

  useEffect(() => {
    if (!open) audioEngine.stopPreview()
    return () => audioEngine.stopPreview()
  }, [open])

  if (!open) return null

  const updateSection = (id: string, patch: Partial<StructureSection>) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const previewEvolution = (evo: ModeEvolution) => {
    void audioEngine.previewChordProgression(evo.chords, {
      chordSec: Math.min(0.85, Math.max(0.45, 2.8 / Math.max(1, evo.chords.length))),
      octave: 3,
      instrumentId: 'piano',
    })
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
    const beatsPerBar = project.timeSignature.numerator
    let cursor = 0
    const clips: { name: string; start: number; duration: number; notes: ReturnType<typeof chordsToMidiNotes> }[] = []

    for (const section of sections) {
      const chordNames = resolveSectionChords(section)
      if (!chordNames.length) continue
      const sectionBeats = Math.max(1, section.bars) * beatsPerBar
      // Répartir les accords sur la durée de la section
      const perChord = Math.max(0.5, sectionBeats / chordNames.length)
      const notes = chordsToMidiNotes(chordNames, {
        beatsPerChord: beatsPerChord > 0 ? Math.min(beatsPerChord, perChord) : perChord,
        startBeat: 0,
        octave: 3,
        velocity: 84,
      })
      // Si beatsPerChord fixe laisse de la place, étendre pour couvrir la section
      const notesDuration = chordNames.length * (beatsPerChord > 0 ? Math.min(beatsPerChord, perChord) : perChord)
      const duration = Math.max(sectionBeats, notesDuration)
      clips.push({
        name: SECTION_LABELS[section.kind],
        start: cursor,
        duration,
        notes,
      })
      cursor += duration
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

            <label className="flex items-center gap-2 text-[11px] text-[var(--muted)] mb-3">
              Beats / accord
              <input
                type="number"
                className="mono w-14"
                min={1}
                max={8}
                value={beatsPerChord}
                onChange={(e) => setBeatsPerChord(Math.max(1, Number(e.target.value) || 4))}
              />
            </label>

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
