import { useEffect, useMemo, useState } from 'react'
import { useDawStore } from '@/store/useDawStore'
import { audioEngine } from '@/audio/engine'
import { TRACK_COLORS, uid } from '@/types/project'
import {
  DEFAULT_KEY,
  GROOVE_PRESETS,
  KEY_TONICS,
  MODE_EVOLUTIONS,
  SECTION_KINDS,
  SECTION_LABELS,
  cellsToStepHits,
  chordIndexForHit,
  chordsToMidiNotes,
  defaultStructure,
  evolutionChords,
  evolutionDegreesLabel,
  evolutionsByGenre,
  formatKey,
  getEvolution,
  getGroove,
  grooveToCells,
  resolveSectionChords,
  rhythmPatternTotal,
  stepHitsToCells,
  type ModeEvolution,
  type MusicalKey,
  type RhythmCell,
  type SectionKind,
  type StructureSection,
} from '@/midi/progressions'

const STEPS_PER_BAR = 16

export function ModesPanel() {
  const project = useDawStore((s) => s.project)
  const setMainView = useDawStore((s) => s.setMainView)
  const addBlankTrack = useDawStore((s) => s.addBlankTrack)
  const assignInstrument = useDawStore((s) => s.assignInstrument)
  const addMidiClip = useDawStore((s) => s.addMidiClip)
  const setSelection = useDawStore((s) => s.setSelection)
  const setPianoRollOpen = useDawStore((s) => s.setPianoRollOpen)
  const setLoop = useDawStore((s) => s.setLoop)
  const setProject = useDawStore((s) => s.setProject)

  const beatsPerBar = project.timeSignature.numerator
  const [key, setKey] = useState(DEFAULT_KEY)
  const [sections, setSections] = useState(defaultStructure)
  const [selectedEvo, setSelectedEvo] = useState(MODE_EVOLUTIONS[0]?.id ?? 'pop-clair')
  const [activeSectionId, setActiveSectionId] = useState(sections[1]?.id ?? sections[0].id)
  const [grooveId, setGrooveId] = useState('charleston')
  const [rhythmCells, setRhythmCells] = useState(() => grooveToCells(getGroove('charleston'), 4))
  const [status, setStatus] = useState('')

  const genreGroups = useMemo(() => evolutionsByGenre(), [])
  const patternBeats = useMemo(() => rhythmCells.map((c) => c.beats), [rhythmCells])
  const patternTotal = rhythmPatternTotal(rhythmCells)
  const stepState = useMemo(
    () => cellsToStepHits(rhythmCells, beatsPerBar, STEPS_PER_BAR),
    [rhythmCells, beatsPerBar],
  )

  useEffect(() => () => audioEngine.stopPreview(), [])

  const chordsOf = (evo: ModeEvolution) => evolutionChords(evo, key)

  const updateSection = (id: string, patch: Partial<StructureSection>) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const previewEvolution = (evo: ModeEvolution, pattern = patternBeats, keyOverride = key) => {
    const chords = evolutionChords(evo, keyOverride)
    if (!chords.length) return
    const slots = pattern.length ? pattern : [beatsPerBar]
    // Un cycle de grille = une passe des accords (coups en trop = re-attaque)
    const names = slots.map((_, i) => chords[chordIndexForHit(i, slots.length, chords.length)])
    const chordSecs = slots.map((beats) =>
      Math.max(0.35, (beats * 60) / Math.max(40, project.bpm) * 1.25),
    )
    void audioEngine.previewChordProgression(names, {
      chordSecs,
      gapSec: 0.03,
      octave: 3,
      instrumentId: 'piano',
    })
  }

  const applyCells = (cells: RhythmCell[], nextGrooveId?: string) => {
    setRhythmCells(cells)
    if (nextGrooveId) setGrooveId(nextGrooveId)
    const evo = getEvolution(selectedEvo)
    if (evo) previewEvolution(evo, cells.map((c) => c.beats))
  }

  const rekeySections = (nextKey: MusicalKey) => {
    setSections((prev) =>
      prev.map((s) => {
        if (!s.progressionId) return s
        const evo = getEvolution(s.progressionId)
        if (!evo) return s
        return { ...s, customChords: evolutionChords(evo, nextKey).join(' ') }
      }),
    )
  }

  const onKeyChange = (patch: Partial<MusicalKey>) => {
    const next = { ...key, ...patch }
    setKey(next)
    rekeySections(next)
    const evo = getEvolution(selectedEvo)
    if (evo) previewEvolution(evo, patternBeats, next)
  }

  const assignEvoToActive = (evo: ModeEvolution) => {
    const chords = chordsOf(evo)
    setSelectedEvo(evo.id)
    setSections((prev) =>
      prev.map((s) =>
        s.id === activeSectionId
          ? { ...s, progressionId: evo.id, customChords: chords.join(' ') }
          : s,
      ),
    )
    previewEvolution(evo)
  }

  const pickGroove = (id: string) => {
    applyCells(grooveToCells(getGroove(id), beatsPerBar), id)
  }

  const toggleStep = (index: number) => {
    if (index === 0) return
    const hits = [...stepState.hits]
    hits[index] = !hits[index]
    applyCells(stepHitsToCells(hits, beatsPerBar, STEPS_PER_BAR), 'custom')
  }

  const addSection = () => {
    const id = uid('sec')
    const evo = getEvolution(selectedEvo)
    setSections((prev) => [
      ...prev,
      {
        id,
        kind: 'couplet',
        bars: 4,
        progressionId: selectedEvo,
        customChords: evo ? evolutionChords(evo, key).join(' ') : '',
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
      const chordNames = resolveSectionChords(section, key)
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
    setMainView('arrange')
    setStatus(`${clips.length} section${clips.length > 1 ? 's' : ''} → Arrangement`)
    window.setTimeout(() => setStatus(''), 3500)
  }

  const simpleGrooves = GROOVE_PRESETS.filter((g) => g.category === 'simple')
  const groovyGrooves = GROOVE_PRESETS.filter((g) => g.category === 'groovy')

  return (
    <div className="modes-workspace panel h-full min-h-0 overflow-hidden flex flex-col">
      <header className="modes-workspace-head">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Modes & structure</h2>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">
            Onglet dédié — tonalité, grilles par genre, groove, structure.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status && <span className="text-[11px] text-[var(--muted)]">{status}</span>}
          <button type="button" className="btn btn-compact" onClick={() => setMainView('arrange')}>
            ← Arrangement
          </button>
          <button type="button" className="btn btn-accent" onClick={applyToProject}>
            Appliquer → Piano
          </button>
        </div>
      </header>

      <div className="modes-workspace-body">
        <aside className="modes-lib">
          <div className="modes-keybar">
            <div className="modes-section-title mb-0">Tonalité</div>
            <div className="modes-key-controls">
              <select
                className="modes-key-tonic"
                value={key.tonic}
                onChange={(e) => onKeyChange({ tonic: e.target.value })}
                aria-label="Tonalité"
              >
                {KEY_TONICS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <div className="modes-key-mode">
                <button
                  type="button"
                  className={`btn btn-compact ${key.mode === 'maj' ? 'btn-active' : ''}`}
                  onClick={() => onKeyChange({ mode: 'maj' })}
                >
                  maj
                </button>
                <button
                  type="button"
                  className={`btn btn-compact ${key.mode === 'min' ? 'btn-active' : ''}`}
                  onClick={() => onKeyChange({ mode: 'min' })}
                >
                  min
                </button>
              </div>
              <span className="modes-key-badge mono">{formatKey(key)}</span>
            </div>
          </div>

          <div className="modes-section-title">Bibliothèque — par genre</div>
          <div className="modes-lib-list">
            {genreGroups.map((group) => (
              <div key={group.genre} className="modes-genre">
                <div className="modes-genre-title">{group.label}</div>
                {group.items.map((evo) => {
                  const active = selectedEvo === evo.id
                  const chords = chordsOf(evo)
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
                      <div className="modes-degrees mono mt-1.5">{evolutionDegreesLabel(evo)}</div>
                      <div className="modes-chords mono mt-1">{chords.join(' · ')}</div>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </aside>

        <section className="modes-struct">
          <div className="modes-groove-block">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="modes-section-title mb-0">Groove des accords</div>
              <span className="text-[10px] text-[var(--muted)] mono">
                {patternTotal.toFixed(patternTotal % 1 ? 2 : 0)} temps
              </span>
            </div>

            <div className="modes-groove-label">Simple</div>
            <div className="modes-groove-grid">
              {simpleGrooves.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`modes-groove-card ${grooveId === g.id ? 'is-active' : ''}`}
                  onClick={() => pickGroove(g.id)}
                >
                  <span className="font-medium text-sm">{g.label}</span>
                  <span className="text-[10px] text-[var(--muted)]">{g.feel}</span>
                  <span className="modes-groove-dots" aria-hidden>
                    {scaleDots(g.beats)}
                  </span>
                </button>
              ))}
            </div>

            <div className="modes-groove-label">Groovy</div>
            <div className="modes-groove-grid">
              {groovyGrooves.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`modes-groove-card ${grooveId === g.id ? 'is-active' : ''}`}
                  onClick={() => pickGroove(g.id)}
                >
                  <span className="font-medium text-sm">{g.label}</span>
                  <span className="text-[10px] text-[var(--muted)]">{g.feel}</span>
                  <span className="modes-groove-dots" aria-hidden>
                    {scaleDots(g.beats)}
                  </span>
                </button>
              ))}
            </div>

            <div className="modes-step-wrap">
              <div className="modes-section-title mb-1">Grille (clic = changement d’accord)</div>
              <div className="modes-step-grid" style={{ gridTemplateColumns: `repeat(${STEPS_PER_BAR}, minmax(0, 1fr))` }}>
                {stepState.hits.map((on, i) => {
                  const beatInBar = i % STEPS_PER_BAR
                  const isBarStart = beatInBar === 0
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`modes-step ${on ? 'is-on' : ''} ${isBarStart ? 'is-bar' : ''}`}
                      title={i === 0 ? 'Départ (fixe)' : on ? 'Retirer' : 'Ajouter un coup'}
                      onClick={() => toggleStep(i)}
                    />
                  )
                })}
              </div>
              <p className="text-[10px] text-[var(--muted)] mt-1.5">
                16 pas / mesure · un cycle = une passe de la grille (sans recommencer les accords au milieu)
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 mb-2 mt-3">
            <div className="modes-section-title mb-0">Structure du morceau</div>
            <button type="button" className="btn btn-compact" onClick={addSection}>
              + Section
            </button>
          </div>

          <div className="modes-struct-list">
            {sections.map((sec) => {
              const selected = activeSectionId === sec.id
              const preview = resolveSectionChords(sec, key)
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
        </section>
      </div>
    </div>
  )
}

function scaleDots(beats: number[]) {
  return beats.map((b, i) => (
    <span key={i} className="modes-groove-dot" style={{ flexGrow: b, flexBasis: 0 }} />
  ))
}
