import { useEffect, useMemo, useState } from 'react'
import { formatKey, resolveDegreeToChord, type MusicalKey } from '@/midi/progressions'
import { parseChord } from '@/midi/chords'

const ROOTS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const QUALITIES = [
  { id: '', label: 'maj' },
  { id: 'm', label: 'min' },
  { id: '7', label: '7' },
  { id: 'maj7', label: 'maj7' },
  { id: 'm7', label: 'm7' },
  { id: 'maj9', label: 'maj9' },
  { id: 'm9', label: 'm9' },
  { id: 'sus4', label: 'sus' },
  { id: 'dim', label: 'dim' },
  { id: 'dim7', label: 'dim7' },
  { id: 'aug', label: 'aug' },
  { id: '6', label: '6' },
  { id: 'm6', label: 'm6' },
  { id: '9', label: '9' },
  { id: '7(b9)', label: '7(b9)' },
]

const DEGREE_CHIPS = [
  { id: 'I', label: 'I' },
  { id: 'ii', label: 'ii' },
  { id: 'iii', label: 'iii' },
  { id: 'IV', label: 'IV' },
  { id: 'V', label: 'V' },
  { id: 'vi', label: 'vi' },
  { id: 'vii', label: 'vii°' },
  { id: 'bVII', label: 'bVII' },
  { id: 'bIII', label: 'bIII' },
  { id: 'bVI', label: 'bVI' },
]

export function parseEvolutionText(raw: string) {
  return raw
    .split(/[-–—|/·,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

type Props = {
  musicalKey: MusicalKey
  tokens: string[]
  onChange: (tokens: string[]) => void
  onPreview: (chords: string[]) => void
  onPreviewOne?: (chord: string) => void
  onAssign: () => void
}

export function EvolutionEditor({
  musicalKey,
  tokens,
  onChange,
  onPreview,
  onPreviewOne,
  onAssign,
}: Props) {
  const [draft, setDraft] = useState(() => tokens.join(' - '))
  const [root, setRoot] = useState(musicalKey.tonic)
  const [quality, setQuality] = useState('')
  const [selected, setSelected] = useState(-1)

  useEffect(() => {
    setDraft(tokens.join(' - '))
  }, [tokens])

  useEffect(() => {
    setRoot(musicalKey.tonic)
  }, [musicalKey.tonic])

  const resolved = useMemo(
    () => tokens.map((t) => resolveDegreeToChord(t, musicalKey)),
    [tokens, musicalKey],
  )

  const chordsOfTokens = (list: string[]) =>
    list.map((t) => resolveDegreeToChord(t, musicalKey)).filter((c) => parseChord(c))

  const syncDraft = (next: string[]) => {
    onChange(next)
    setDraft(next.join(' - '))
  }

  const applyDraft = () => {
    const next = parseEvolutionText(draft)
    syncDraft(next)
    setSelected(next.length ? next.length - 1 : -1)
    return next
  }

  const previewTokens = (list: string[]) => {
    const chords = chordsOfTokens(list)
    if (chords.length) onPreview(chords)
  }

  const addChord = (token: string) => {
    const next = [...tokens, token]
    syncDraft(next)
    setSelected(next.length - 1)
    const chord = resolveDegreeToChord(token, musicalKey)
    if (chord && onPreviewOne) onPreviewOne(chord)
  }

  const addPicked = () => {
    addChord(`${root}${quality}`)
  }

  const removeAt = (index: number) => {
    const next = tokens.filter((_, i) => i !== index)
    syncDraft(next)
    setSelected(next.length ? Math.min(index, next.length - 1) : -1)
  }

  const replaceAt = (index: number, token: string) => {
    const next = tokens.map((t, i) => (i === index ? token : t))
    syncDraft(next)
    const chord = resolveDegreeToChord(token, musicalKey)
    if (chord && onPreviewOne) onPreviewOne(chord)
  }

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= tokens.length) return
    const next = [...tokens]
    ;[next[index], next[j]] = [next[j], next[index]]
    syncDraft(next)
    setSelected(j)
  }

  const validCount = resolved.filter((c) => parseChord(c)).length
  const pickedLabel = `${root}${quality || ''}` || root

  return (
    <div className="evo-editor">
      <div className="evo-head">
        <div className="modes-section-title mb-0">Éditeur d’évolution</div>
        <span className="evo-count mono">{validCount || 0} acc.</span>
      </div>
      <p className="evo-hint">
        Tape <span className="mono">C-Am-F-G</span> ou <span className="mono">I-V-vi-IV</span>, ou construis
        accord par accord.
      </p>

      <div className="evo-type-row">
        <input
          className="evo-type-input mono"
          value={draft}
          placeholder="C-Am-F-G  ou  I-V-vi-IV"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              previewTokens(applyDraft())
            }
          }}
          onBlur={applyDraft}
          aria-label="Saisie de progression"
        />
        <button
          type="button"
          className="btn btn-compact"
          onClick={() => previewTokens(applyDraft())}
        >
          OK
        </button>
      </div>

      <div className="evo-chain" role="list" aria-label="Chaîne d’accords">
        {tokens.length === 0 && <div className="evo-empty">Aucun accord — ajoute-en ci-dessous</div>}
        {tokens.map((token, i) => {
          const chord = resolved[i]
          const ok = Boolean(parseChord(chord))
          const active = selected === i
          return (
            <div key={`${token}-${i}`} className="evo-chain-item" role="listitem">
              {i > 0 && (
                <span className="evo-arrow" aria-hidden>
                  <span className="evo-arrow-line" />
                </span>
              )}
              <button
                type="button"
                className={`evo-chip ${active ? 'is-active' : ''} ${ok ? '' : 'is-bad'}`}
                title={ok ? `${token} → ${chord} (clic = sélection, double-clic = écoute)` : `Invalide : ${token}`}
                onClick={() => {
                  setSelected(i)
                  if (ok && onPreviewOne) onPreviewOne(chord)
                }}
                onDoubleClick={() => {
                  if (ok) previewTokens(tokens)
                }}
              >
                <span className="evo-chip-step">{i + 1}</span>
                <span className="evo-chip-token mono">{token}</span>
                <span className="evo-chip-resolved mono">{chord}</span>
              </button>
            </div>
          )
        })}
        <button type="button" className="evo-chip evo-chip-add" title="Ajouter la sélection" onClick={addPicked}>
          <span className="evo-chip-plus">+</span>
        </button>
      </div>

      {tokens.length > 0 && (
        <div className="evo-resolved-strip mono" title="Progression résolue">
          {resolved.join(' → ')}
        </div>
      )}

      {selected >= 0 && tokens[selected] && (
        <div className="evo-selected-bar">
          <span className="evo-selected-label mono">
            #{selected + 1} {tokens[selected]}
            <span className="evo-selected-arrow">→</span>
            {resolved[selected]}
          </span>
          <div className="evo-selected-actions">
            <button type="button" className="btn btn-compact" onClick={() => move(selected, -1)} title="À gauche">
              ←
            </button>
            <button type="button" className="btn btn-compact" onClick={() => move(selected, 1)} title="À droite">
              →
            </button>
            <button
              type="button"
              className="btn btn-compact"
              onClick={() => replaceAt(selected, `${root}${quality}`)}
              title="Remplacer par la sélection"
            >
              Remplacer
            </button>
            <button type="button" className="btn btn-compact" onClick={() => removeAt(selected)} title="Supprimer">
              ⌫
            </button>
          </div>
        </div>
      )}

      <div className="evo-picker">
        <div className="evo-picker-label">Racine</div>
        <div className="evo-picker-grid">
          {ROOTS.map((r) => (
            <button
              key={r}
              type="button"
              className={`evo-pick ${root === r ? 'is-active' : ''}`}
              onClick={() => setRoot(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="evo-picker-label">Qualité</div>
        <div className="evo-picker-grid evo-picker-qualities">
          {QUALITIES.map((q) => (
            <button
              key={q.id || 'maj'}
              type="button"
              className={`evo-pick ${quality === q.id ? 'is-active' : ''}`}
              onClick={() => setQuality(q.id)}
            >
              {q.label}
            </button>
          ))}
        </div>
        <div className="evo-picker-label">Degrés ({formatKey(musicalKey)})</div>
        <div className="evo-picker-grid">
          {DEGREE_CHIPS.map((d) => (
            <button
              key={d.id}
              type="button"
              className="evo-pick evo-pick-deg"
              title={`Ajouter ${d.label}`}
              onClick={() => addChord(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="evo-actions">
        <button type="button" className="btn btn-compact evo-add-btn" onClick={addPicked}>
          + {pickedLabel || 'maj'}
        </button>
        <button type="button" className="btn btn-compact" onClick={() => syncDraft([])}>
          Vider
        </button>
        <button
          type="button"
          className="btn btn-compact"
          disabled={!validCount}
          onClick={() => previewTokens(tokens)}
          title="Écouter"
        >
          ▶ Écouter
        </button>
        <button
          type="button"
          className="btn btn-accent"
          disabled={!validCount}
          onClick={onAssign}
          title="Assigner à la section active"
        >
          Assigner →
        </button>
      </div>
    </div>
  )
}
