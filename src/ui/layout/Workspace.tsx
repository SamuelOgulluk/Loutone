import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useDawStore } from '@/store/useDawStore'
import {
  PANEL_META,
  PANEL_IDS,
  SLOT_IDS,
  SLOT_LABELS,
  applyUserHidden,
  clampSides,
  defaultStored,
  fitToViewport,
  loadStored,
  panelInSlots,
  saveStored,
  stripPanel,
  type PanelId,
  type SlotId,
  type StoredLayout,
} from './workspace'

const DND = 'application/x-loutone-panel'

function readDraggedPanel(e: React.DragEvent) {
  const id = (e.dataTransfer.getData(DND) || e.dataTransfer.getData('text/plain')) as PanelId
  return PANEL_IDS.includes(id) ? id : null
}

function startPanelDrag(id: PanelId, e: React.DragEvent) {
  e.dataTransfer.setData(DND, id)
  e.dataTransfer.setData('text/plain', id)
  e.dataTransfer.effectAllowed = 'move'
}

type WorkspaceApi = {
  editMode: boolean
  setEditMode: (v: boolean) => void
  visible: Record<SlotId, PanelId | null>
  overflow: PanelId[]
  autoHidden: PanelId[]
  hidePanel: (id: PanelId) => void
  showPanel: (id: PanelId, slot?: SlotId) => void
  movePanelToSlot: (id: PanelId, slot: SlotId) => void
  swapSlots: (a: SlotId, b: SlotId) => void
  resetLayout: () => void
}

const Ctx = createContext<WorkspaceApi | null>(null)

export function useWorkspace() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWorkspace hors provider')
  return ctx
}

export function useWorkspaceOptional() {
  return useContext(Ctx)
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const pianoRollOpen = useDawStore((s) => s.pianoRollOpen)
  const setPianoRollOpen = useDawStore((s) => s.setPianoRollOpen)
  const [stored, setStored] = useState<StoredLayout>(defaultStored)
  const [editMode, setEditMode] = useState(false)
  const [box, setBox] = useState(() => ({
    w: typeof window === 'undefined' ? 1280 : window.innerWidth,
    h: typeof window === 'undefined' ? 800 : window.innerHeight,
  }))
  const wrapRef = useRef(null as HTMLDivElement | null)

  useEffect(() => {
    setStored(loadStored())
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditMode(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useLayoutEffect(() => {
    const el = wrapRef.current
    const apply = () => {
      const r = el?.getBoundingClientRect()
      const w = r && r.width > 40 ? r.width : window.innerWidth
      const h = r && r.height > 40 ? r.height : window.innerHeight
      setBox({ w, h })
    }
    apply()
    if (!el) return
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    window.addEventListener('resize', apply)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [])

  const fitted = useMemo(() => {
    const slotted = applyUserHidden(stored.slots, stored.hidden, pianoRollOpen)
    return fitToViewport(slotted, box.w, box.h, stored.pinned)
  }, [stored.slots, stored.hidden, stored.pinned, pianoRollOpen, box.w, box.h])

  const overflow = useMemo(() => {
    const visible = new Set(SLOT_IDS.map((s) => fitted.slots[s]).filter(Boolean) as PanelId[])
    const list: PanelId[] = []
    for (const id of PANEL_IDS) {
      if (id === 'arrange') continue
      if (id === 'piano' && !pianoRollOpen) continue
      if (!visible.has(id)) list.push(id)
    }
    return list
  }, [fitted.slots, pianoRollOpen])

  const hidePanel = useCallback(
    (id: PanelId) => {
      if (id === 'arrange') return
      if (id === 'piano') setPianoRollOpen(false)
      setStored((prev) => ({
        ...prev,
        slots: stripPanel(prev.slots, id),
        hidden: prev.hidden.includes(id) ? prev.hidden : [...prev.hidden, id],
        pinned: prev.pinned.filter((p) => p !== id),
      }))
    },
    [setPianoRollOpen],
  )

  const movePanelToSlot = useCallback(
    (id: PanelId, slot: SlotId) => {
      if (id === 'piano') setPianoRollOpen(true)
      setStored((prev) => {
        let slots = { ...prev.slots }
        const from = panelInSlots(slots, id)
        const occupant = slots[slot]
        let hidden = prev.hidden.filter((h) => h !== id)
        const pinned = prev.pinned.includes(id) ? prev.pinned : [...prev.pinned, id]
        if (from) {
          slots[from] = occupant
          slots[slot] = id
        } else {
          slots[slot] = id
          if (occupant && occupant !== id) {
            const pref = PANEL_META[occupant].preferred
            if (pref !== slot && !panelInSlots(slots, occupant) && !slots[pref]) {
              slots[pref] = occupant
            } else if (occupant === 'arrange') {
              const empty = SLOT_IDS.find((s) => s !== slot && !slots[s])
              if (empty) slots[empty] = occupant
            } else if (!panelInSlots(slots, occupant)) {
              hidden = hidden.includes(occupant) ? hidden : [...hidden, occupant]
            }
          }
        }
        if (!Object.values(slots).includes('arrange')) {
          const empty = SLOT_IDS.find((s) => !slots[s]) ?? 'center'
          slots[empty] = 'arrange'
        }
        return { ...prev, slots, hidden, pinned }
      })
    },
    [setPianoRollOpen],
  )

  const showPanel = useCallback(
    (id: PanelId, slot?: SlotId) => {
      const target = slot ?? PANEL_META[id].preferred
      movePanelToSlot(id, target)
    },
    [movePanelToSlot],
  )

  const swapSlots = useCallback((a: SlotId, b: SlotId) => {
    if (a === b) return
    setStored((prev) => {
      const slots = { ...prev.slots, [a]: prev.slots[b], [b]: prev.slots[a] }
      if (!Object.values(slots).includes('arrange')) slots.center = 'arrange'
      return { ...prev, slots }
    })
  }, [])

  const resetLayout = useCallback(() => {
    setStored(defaultStored())
    setPianoRollOpen(true)
  }, [setPianoRollOpen])

  const api = useMemo<WorkspaceApi>(
    () => ({
      editMode,
      setEditMode,
      visible: fitted.slots,
      overflow,
      autoHidden: fitted.autoHidden,
      hidePanel,
      showPanel,
      movePanelToSlot,
      swapSlots,
      resetLayout,
    }),
    [editMode, fitted, overflow, hidePanel, showPanel, movePanelToSlot, swapSlots, resetLayout],
  )

  return (
    <Ctx.Provider value={api}>
      <div ref={wrapRef} className="ws-root">
        {children}
      </div>
    </Ctx.Provider>
  )
}

export function WorkspaceGrid({
  panes,
}: {
  panes: Record<PanelId, ReactNode>
}) {
  const { visible, editMode, hidePanel, movePanelToSlot } = useWorkspace()
  const wrapRef = useRef(null as HTMLDivElement | null)
  const [gridW, setGridW] = useState(1200)
  const [sizes, setSizes] = useState(() => {
    const s = loadStored()
    return { leftPx: s.leftPx, rightPx: s.rightPx, bottomPct: s.bottomPct }
  })
  const [dropSlot, setDropSlot] = useState(null as SlotId | null)
  const drag = useRef(null as null | { kind: 'left' | 'right' | 'bottom'; start: number; left: number; right: number; pct: number })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const apply = () => setGridW(el.getBoundingClientRect().width)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current
      const wrap = wrapRef.current
      if (!d || !wrap) return
      const r = wrap.getBoundingClientRect()
      if (d.kind === 'bottom') {
        const y = e.clientY - r.top
        const pct = 100 - (y / r.height) * 100
        setSizes((s) => ({ ...s, bottomPct: Math.max(22, Math.min(70, pct)) }))
        return
      }
      if (d.kind === 'left') {
        setSizes((s) => ({ ...s, leftPx: Math.max(168, Math.min(420, d.left + (e.clientX - d.start))) }))
        return
      }
      setSizes((s) => ({ ...s, rightPx: Math.max(168, Math.min(420, d.right - (e.clientX - d.start))) }))
    }
    const onUp = () => {
      if (!drag.current) return
      drag.current = null
      document.body.classList.remove('is-splitting-row', 'is-splitting-col')
      setSizes((s) => {
        const cur = loadStored()
        saveStored({ ...cur, leftPx: s.leftPx, rightPx: s.rightPx, bottomPct: s.bottomPct })
        return s
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  const startDrag = (kind: 'left' | 'right' | 'bottom', e: React.PointerEvent) => {
    e.preventDefault()
    drag.current = {
      kind,
      start: kind === 'bottom' ? e.clientY : e.clientX,
      left: sizes.leftPx,
      right: sizes.rightPx,
      pct: sizes.bottomPct,
    }
    document.body.classList.add(kind === 'bottom' ? 'is-splitting-col' : 'is-splitting-row')
  }

  const onSlotDragOver = (slot: SlotId, e: React.DragEvent) => {
    if (![...e.dataTransfer.types].includes(DND) && ![...e.dataTransfer.types].includes('text/plain')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropSlot(slot)
  }

  const onSlotDrop = (slot: SlotId, e: React.DragEvent) => {
    e.preventDefault()
    setDropSlot(null)
    const id = readDraggedPanel(e)
    if (id) movePanelToSlot(id, slot)
  }

  const sides = clampSides(gridW, !!visible.left, !!visible.right, sizes.leftPx, sizes.rightPx)
  const hasBottom = !!visible.bottom

  const renderSlot = (slot: SlotId) => {
    const id = visible[slot]
    const empty = !id
    return (
      <div
        className={`ws-slot ws-slot-${slot} ${editMode ? 'is-edit' : ''} ${dropSlot === slot ? 'is-drop' : ''} ${empty ? 'is-empty' : ''}`}
        onDragOver={(e) => onSlotDragOver(slot, e)}
        onDragLeave={() => setDropSlot((s) => (s === slot ? null : s))}
        onDrop={(e) => onSlotDrop(slot, e)}
      >
        {editMode && (
          <div className="ws-chrome">
            {id ? (
              <span
                className="ws-chrome-drag"
                draggable
                title="Glisser vers un autre emplacement"
                onDragStart={(e) => startPanelDrag(id, e)}
                onDragEnd={() => setDropSlot(null)}
              >
                <span className="ws-grip" aria-hidden>⠿</span>
                <span className="ws-chrome-title">{PANEL_META[id].label}</span>
              </span>
            ) : (
              <span className="ws-chrome-title">Emplacement vide</span>
            )}
            {id && id !== 'arrange' && (
              <button type="button" className="ws-chrome-hide" title="Masquer" onClick={(e) => { e.stopPropagation(); hidePanel(id) }}>
                ×
              </button>
            )}
          </div>
        )}
        {id ? (
          <div className="ws-slot-body">{panes[id]}</div>
        ) : editMode ? (
          <div className="ws-empty">Déposer une fenêtre</div>
        ) : null}
      </div>
    )
  }

  return (
    <div ref={wrapRef} className={`ws-grid ${editMode ? 'is-editing' : ''}`}>
      {visible.left && (
        <>
          <div className="ws-col ws-col-side" style={{ width: sides.left }}>
            {renderSlot('left')}
          </div>
          <button type="button" className="split-handle split-handle-row" aria-label="Redimensionner" onPointerDown={(e) => startDrag('left', e)} />
        </>
      )}
      <div className="ws-col ws-col-center">
        <div className="ws-center-stack">
          {renderSlot('center')}
          {hasBottom && (
            <button type="button" className="split-handle split-handle-column" aria-label="Redimensionner" onPointerDown={(e) => startDrag('bottom', e)} />
          )}
          {hasBottom && (
            <div className="ws-bottom-wrap" style={{ flex: `0 0 ${sizes.bottomPct}%` }}>
              {renderSlot('bottom')}
            </div>
          )}
        </div>
      </div>
      {visible.right && (
        <>
          <button type="button" className="split-handle split-handle-row" aria-label="Redimensionner" onPointerDown={(e) => startDrag('right', e)} />
          <div className="ws-col ws-col-side" style={{ width: sides.right }}>
            {renderSlot('right')}
          </div>
        </>
      )}
    </div>
  )
}

export function LayoutDock() {
  const {
    setEditMode,
    overflow,
    autoHidden,
    visible,
    showPanel,
    movePanelToSlot,
    resetLayout,
  } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const [dropSlot, setDropSlot] = useState(null as SlotId | null)
  const btnRef = useRef(null as HTMLButtonElement | null)
  const crowded = overflow.length > 0

  const place = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setMenuPos({ top: r.bottom + 4, left: Math.min(r.right, window.innerWidth - 16) })
  }

  const closeDock = useCallback(() => {
    setOpen(false)
    setEditMode(false)
    setDropSlot(null)
  }, [setEditMode])

  useEffect(() => {
    if (!open) return
    place()
    const on = () => place()
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (btnRef.current?.contains(t)) return
      if (t.closest?.('.ws-dock-panel')) return
      if (t.closest?.('.ws-chrome, .ws-empty, .ws-slot.is-edit')) return
      closeDock()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDock()
    }
    window.addEventListener('resize', on)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', on)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, closeDock])

  const onMapOver = (slot: SlotId, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropSlot(slot)
  }

  const onMapDrop = (slot: SlotId, e: React.DragEvent) => {
    e.preventDefault()
    setDropSlot(null)
    const id = readDraggedPanel(e)
    if (id) movePanelToSlot(id, slot)
  }

  const renderMapSlot = (slot: SlotId, wide?: boolean) => {
    const panel = visible[slot]
    return (
      <div
        key={slot}
        className={`ws-map-slot ${wide ? 'is-wide' : ''} ${!panel ? 'is-void' : ''} ${dropSlot === slot ? 'is-drop' : ''}`}
        onDragOver={(e) => onMapOver(slot, e)}
        onDragLeave={() => setDropSlot((s) => (s === slot ? null : s))}
        onDrop={(e) => onMapDrop(slot, e)}
      >
        <span className="ws-map-cap">{SLOT_LABELS[slot]}</span>
        {panel ? (
          <span
            className="ws-map-chip"
            draggable
            onDragStart={(e) => startPanelDrag(panel, e)}
            onDragEnd={() => setDropSlot(null)}
          >
            {PANEL_META[panel].label}
          </span>
        ) : (
          <span className="ws-map-empty">Déposer ici</span>
        )}
      </div>
    )
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`btn btn-compact ws-dock-btn ${open ? 'btn-active' : ''} ${crowded ? 'is-crowded' : ''}`}
        title={crowded ? `${overflow.length} fenêtre${overflow.length > 1 ? 's' : ''} hors écran — réorganiser` : 'Disposer les fenêtres'}
        aria-expanded={open}
        onClick={() => {
          if (open) {
            closeDock()
            return
          }
          setOpen(true)
          setEditMode(true)
          place()
        }}
      >
        <span className="ws-dock-icon" aria-hidden>▦</span>
        {crowded && <span className="ws-dock-badge">{overflow.length}</span>}
      </button>
      {open &&
        createPortal(
          <div
            className="ws-dock-panel tb-menu-panel"
            role="dialog"
            aria-label="Disposition des fenêtres"
            style={{ top: menuPos.top, left: menuPos.left, transform: 'translateX(-100%)' }}
          >
            <div className="tb-menu-hint">Disposition</div>
            <p className="ws-dock-help">
              Glisse une fenêtre sur Gauche, Centre, Droite ou Bas pour la déplacer.
              {crowded ? ' Les fenêtres hors écran se glissent aussi sur cette carte.' : ''}
            </p>
            <div className="ws-map">
              <div className="ws-map-row">
                {renderMapSlot('left')}
                {renderMapSlot('center', true)}
                {renderMapSlot('right')}
              </div>
              <div className="ws-map-row">
                <span className="ws-map-spacer" />
                {renderMapSlot('bottom', true)}
                <span className="ws-map-spacer" />
              </div>
            </div>
            {overflow.length > 0 && (
              <>
                <div className="tb-menu-sep" />
                <div className="tb-menu-hint">Hors écran</div>
                <div className="ws-tray">
                  {overflow.map((id) => (
                    <div
                      key={id}
                      role="button"
                      tabIndex={0}
                      className="ws-tray-chip"
                      draggable
                      title={`Glisser ${PANEL_META[id].label} sur la carte, ou cliquer pour l’afficher`}
                      onDragStart={(e) => startPanelDrag(id, e)}
                      onDragEnd={() => setDropSlot(null)}
                      onClick={() => showPanel(id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          showPanel(id)
                        }
                      }}
                    >
                      <span>{PANEL_META[id].label}</span>
                      {autoHidden.includes(id) && (
                        <span className="ws-tray-note">masqué faute de place</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="tb-menu-sep" />
            <button type="button" onClick={() => resetLayout()}>
              Disposition par défaut
            </button>
            <button type="button" onClick={closeDock}>
              Fermer
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}
