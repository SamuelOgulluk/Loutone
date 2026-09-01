import { useEffect, useRef } from 'react'
import { useDawStore } from '@/store/useDawStore'
import { EFFECT_CATALOG } from '@/audio/effects'
import type { EffectType, TrackEffect } from '@/types/project'

const FX_LABELS = Object.fromEntries(EFFECT_CATALOG.map((e) => [e.type, e.label])) as Record<
  EffectType,
  string
>

export function Inspector() {
  const project = useDawStore((s) => s.project)
  const selection = useDawStore((s) => s.selection)
  const updateTrack = useDawStore((s) => s.updateTrack)
  const addEffect = useDawStore((s) => s.addEffect)
  const updateEffect = useDawStore((s) => s.updateEffect)
  const removeEffect = useDawStore((s) => s.removeEffect)
  const moveEffect = useDawStore((s) => s.moveEffect)
  const setLoop = useDawStore((s) => s.setLoop)
  const setSelection = useDawStore((s) => s.setSelection)

  const track = project.tracks.find((t) => t.id === selection.trackId)
  const fxListRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!selection.effectId || !fxListRef.current) return
    const el = fxListRef.current.querySelector(`[data-fx-id="${selection.effectId}"]`)
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selection.effectId, selection.trackId])

  return (
    <section className="panel h-full flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--line)]">
        <h2 className="text-sm font-semibold text-[var(--accent)]">Inspector</h2>
        <p className="text-xs text-[var(--muted)]">{track ? track.name : 'Projet'}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4 text-sm">
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">Transport</div>
          <label className="flex items-center justify-between gap-2">
            Boucle
            <input
              type="checkbox"
              checked={project.loopEnabled}
              onChange={(e) => setLoop(e.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            Début
            <input
              type="number"
              className="w-20 mono"
              value={project.loopStart}
              step={0.25}
              onChange={(e) => setLoop(project.loopEnabled, Number(e.target.value), project.loopEnd)}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            Fin
            <input
              type="number"
              className="w-20 mono"
              value={project.loopEnd}
              step={0.25}
              onChange={(e) => setLoop(project.loopEnabled, project.loopStart, Number(e.target.value))}
            />
          </label>
        </div>

        {track && (
          <>
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">Piste</div>
              <label className="flex items-center justify-between gap-2">
                Nom
                <input
                  className="w-28"
                  value={track.name}
                  onChange={(e) => updateTrack(track.id, { name: e.target.value })}
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                Hauteur
                <input
                  type="range"
                  min={40}
                  max={140}
                  value={track.height}
                  onChange={(e) => updateTrack(track.id, { height: Number(e.target.value) })}
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                Arm
                <input
                  type="checkbox"
                  checked={track.arm}
                  onChange={(e) => updateTrack(track.id, { arm: e.target.checked })}
                />
              </label>
            </div>

            <div className="space-y-2" ref={fxListRef}>
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">Effets</div>
                <select
                  className="text-xs"
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return
                    addEffect(track.id, e.target.value as EffectType)
                    e.target.value = ''
                  }}
                >
                  <option value="" disabled>+ effet</option>
                  {EFFECT_CATALOG.map((fx) => (
                    <option key={fx.type} value={fx.type}>
                      {fx.label}
                    </option>
                  ))}
                </select>
              </div>
              {track.effects.map((fx) => (
                <EffectEditor
                  key={fx.id}
                  fx={fx}
                  selected={selection.effectId === fx.id}
                  onSelect={() => setSelection({ effectId: fx.id })}
                  onUpdate={(params) => updateEffect(track.id, fx.id, params)}
                  onRemove={() => removeEffect(track.id, fx.id)}
                  onMove={(dir) => moveEffect(track.id, fx.id, dir)}
                />
              ))}
              {!track.effects.length && (
                <div className="text-xs text-[var(--muted)]">Aucun effet</div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function EffectEditor({
  fx,
  selected,
  onSelect,
  onUpdate,
  onRemove,
  onMove,
}: {
  fx: TrackEffect
  selected: boolean
  onSelect: () => void
  onUpdate: (params: Partial<TrackEffect['params']>) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  const p = fx.params as Record<string, number | boolean>
  return (
    <div
      data-fx-id={fx.id}
      className={`rounded border p-2 space-y-1.5 ${selected ? 'insp-fx-selected' : 'border-[var(--line)] bg-[var(--bg-2)]'}`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-1">
        <span className="font-medium text-xs flex-1">{FX_LABELS[fx.type]}</span>
        <button className="btn px-1 py-0 text-[10px]" onClick={(e) => { e.stopPropagation(); onMove(-1) }}>↑</button>
        <button className="btn px-1 py-0 text-[10px]" onClick={(e) => { e.stopPropagation(); onMove(1) }}>↓</button>
        <button className="btn px-1 py-0 text-[10px]" onClick={(e) => { e.stopPropagation(); onRemove() }}>×</button>
      </div>
      {'enabled' in p && (
        <label className="flex items-center justify-between text-xs" onClick={(e) => e.stopPropagation()}>
          Actif
          <input
            type="checkbox"
            checked={Boolean(p.enabled)}
            onChange={(e) => onUpdate({ enabled: e.target.checked } as Partial<TrackEffect['params']>)}
          />
        </label>
      )}
      {Object.entries(p).map(([key, val]) => {
        if (key === 'enabled' || typeof val === 'boolean') return null
        const ranges: Record<string, { min: number; max: number; step: number }> = {
          mix: { min: 0, max: 1, step: 0.01 },
          decay: { min: 0.2, max: 6, step: 0.1 },
          time: { min: 0.05, max: 1.5, step: 0.01 },
          feedback: { min: 0, max: 0.95, step: 0.01 },
          threshold: { min: -60, max: 0, step: 1 },
          ratio: { min: 1, max: 20, step: 0.1 },
          attack: { min: 0.001, max: 0.5, step: 0.001 },
          release: { min: 0.01, max: 1, step: 0.01 },
          low: { min: -12, max: 12, step: 0.5 },
          mid: { min: -12, max: 12, step: 0.5 },
          high: { min: -12, max: 12, step: 0.5 },
          amount: { min: 0, max: 1, step: 0.01 },
          speed: { min: 0, max: 1, step: 0.01 },
          carrier: { min: 0, max: 1, step: 0.01 },
          depth: { min: 0, max: 1, step: 0.01 },
          frequency: { min: 0, max: 1, step: 0.01 },
          rate: { min: 0, max: 1, step: 0.01 },
          drive: { min: 0, max: 1, step: 0.01 },
          tone: { min: 0, max: 1, step: 0.01 },
          bits: { min: 2, max: 16, step: 1 },
          cutoff: { min: 0, max: 1, step: 0.01 },
          resonance: { min: 0, max: 1, step: 0.01 },
          wow: { min: 0, max: 1, step: 0.01 },
          crush: { min: 0, max: 1, step: 0.01 },
        }
        const r = ranges[key] ?? { min: 0, max: 1, step: 0.01 }
        return (
          <label key={key} className="flex items-center justify-between gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
            <span className="text-[var(--muted)] w-16">{key}</span>
            <input
              type="range"
              className="flex-1"
              min={r.min}
              max={r.max}
              step={r.step}
              value={val}
              onChange={(e) => onUpdate({ [key]: Number(e.target.value) } as Partial<TrackEffect['params']>)}
            />
            <span className="mono w-10 text-right text-[10px]">{Number(val).toFixed(2)}</span>
          </label>
        )
      })}
    </div>
  )
}
