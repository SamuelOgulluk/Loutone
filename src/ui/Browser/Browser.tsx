import { useState, type DragEvent } from 'react'
import { listInstrumentsByCategory, INSTRUMENT_DND_MIME, encodeInstrumentDrag } from '@/instruments'
import { EFFECT_CATALOG, EFFECT_DND_MIME, EFFECT_GROUPS } from '@/audio/effects'
import { useDawStore } from '@/store/useDawStore'
import type { InstrumentCategory } from '@/instruments'
import type { EffectType } from '@/types/project'

type TopTab = 'instruments' | 'effects'

export function Browser() {
  const assignInstrument = useDawStore((s) => s.assignInstrument)
  const addEffectToSelectedTrack = useDawStore((s) => s.addEffectToSelectedTrack)
  const selectedTrackId = useDawStore((s) => s.selection.trackId)
  const selectedTrack = useDawStore((s) => s.project.tracks.find((t) => t.id === s.selection.trackId) ?? null)
  const categories = listInstrumentsByCategory()
  const [tab, setTab] = useState<TopTab>('instruments')
  const [openCats, setOpenCats] = useState<Set<InstrumentCategory>>(() => new Set(['guitar', 'keys']))
  const [openFxGroups, setOpenFxGroups] = useState<Set<string>>(() => new Set(['Voix', 'Modulation']))

  const toggleCat = (cat: InstrumentCategory) => {
    setOpenCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const toggleFxGroup = (group: string) => {
    setOpenFxGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  const onEffectDragStart = (type: EffectType, e: DragEvent) => {
    e.dataTransfer.setData(EFFECT_DND_MIME, type)
    e.dataTransfer.setData('text/plain', type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const onInstrumentDragStart = (id: string, name: string, e: DragEvent) => {
    const payload = JSON.stringify({ id, name })
    e.dataTransfer.setData(INSTRUMENT_DND_MIME, payload)
    e.dataTransfer.setData('text/plain', encodeInstrumentDrag(id, name))
    e.dataTransfer.effectAllowed = 'copy'
  }

  const onInstrumentClick = (id: string, name: string) => {
    if (!selectedTrackId) return
    assignInstrument(selectedTrackId, id, name)
  }

  return (
    <aside className="panel flex flex-col h-full overflow-hidden">
      <div className="px-2.5 py-1.5 border-b border-[var(--line)]">
        <h2 className="text-sm font-semibold tracking-wide text-[var(--accent)]">Browser</h2>
        <div className="browser-tabs mt-1.5">
          <button
            type="button"
            className={`browser-tab ${tab === 'instruments' ? 'is-active' : ''}`}
            onClick={() => setTab('instruments')}
          >
            Instruments
          </button>
          <button
            type="button"
            className={`browser-tab ${tab === 'effects' ? 'is-active' : ''}`}
            onClick={() => setTab('effects')}
          >
            Effets
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {tab === 'instruments' && (
          <>
            <p className="text-[10px] text-[var(--muted)] px-1 leading-tight mb-1">
              Samples MP3 (CDN) · glisser / clic
              {selectedTrackId ? ' = piste sélectionnée' : ' · + Piste d’abord'}
            </p>

            {categories.map((group) => {
              const open = openCats.has(group.category)
              return (
                <div key={group.category} className="browser-acc">
                  <button
                    type="button"
                    className="browser-acc-head"
                    onClick={() => toggleCat(group.category)}
                    aria-expanded={open}
                  >
                    <span className="browser-acc-chevron">{open ? '▾' : '▸'}</span>
                    <span>{group.label}</span>
                    <span className="browser-acc-count">{group.instruments.length}</span>
                  </button>
                  {open && (
                    <div className="browser-acc-body space-y-0.5">
                      {group.instruments.map((inst) => (
                        <button
                          key={inst.id}
                          type="button"
                          className="btn btn-compact w-full justify-start text-left"
                          draggable
                          title={
                            selectedTrack
                              ? `Assigner à « ${selectedTrack.name} »`
                              : 'Glisser sur une piste'
                          }
                          onDragStart={(e) => onInstrumentDragStart(inst.id, inst.name, e)}
                          onClick={() => onInstrumentClick(inst.id, inst.name)}
                        >
                          {inst.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {tab === 'effects' && (
          <section className="space-y-1">
            <div className="browser-section-label">Chaîne FX</div>
            <p className="text-[10px] text-[var(--muted)] px-1 leading-tight mb-1">
              Glisser sur une piste
              {selectedTrackId ? ' · clic = piste sélectionnée' : ''}
            </p>
            {EFFECT_GROUPS.map((group) => {
              const items = EFFECT_CATALOG.filter((fx) => fx.group === group)
              const open = openFxGroups.has(group)
              return (
                <div key={group} className="browser-acc">
                  <button
                    type="button"
                    className="browser-acc-head"
                    onClick={() => toggleFxGroup(group)}
                    aria-expanded={open}
                  >
                    <span className="browser-acc-chevron">{open ? '▾' : '▸'}</span>
                    <span>{group}</span>
                    <span className="browser-acc-count">{items.length}</span>
                  </button>
                  {open && (
                    <div className="browser-acc-body space-y-0.5">
                      {items.map((fx) => (
                        <button
                          key={fx.type}
                          type="button"
                          className="btn btn-compact w-full justify-start text-left"
                          draggable
                          onDragStart={(e) => onEffectDragStart(fx.type, e)}
                          onClick={() => {
                            if (!selectedTrackId) return
                            addEffectToSelectedTrack(fx.type)
                          }}
                        >
                          + {fx.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        )}
      </div>

      <div className="px-2 py-1.5 border-t border-[var(--line)] text-[10px] text-[var(--muted)] mono leading-tight">
        Space play · S snap · Q quantize
      </div>
    </aside>
  )
}
