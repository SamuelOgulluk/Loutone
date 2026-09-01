export const PANEL_IDS = ['browser', 'arrange', 'piano', 'inspector'] as const
export type PanelId = (typeof PANEL_IDS)[number]

export const SLOT_IDS = ['left', 'center', 'right', 'bottom'] as const
export type SlotId = (typeof SLOT_IDS)[number]

export const PANEL_META: Record<
  PanelId,
  { label: string; short: string; preferred: SlotId; required?: boolean }
> = {
  browser: { label: 'Browser', short: 'Br', preferred: 'left' },
  arrange: { label: 'Arrangement', short: 'Arr', preferred: 'center', required: true },
  piano: { label: 'Piano roll', short: 'MIDI', preferred: 'bottom' },
  inspector: { label: 'Inspector', short: 'Insp', preferred: 'right' },
}

export const DEFAULT_SLOTS: Record<SlotId, PanelId | null> = {
  left: 'browser',
  center: 'arrange',
  right: 'inspector',
  bottom: 'piano',
}

export const SIDE_MIN = 168
export const SIDE_MAX = 420
export const CENTER_MIN = 380
export const BOTTOM_MIN = 140
export const TOP_CHROME = 52

const STORAGE = 'loutone-workspace-v1'

export type StoredLayout = {
  slots: Record<SlotId, PanelId | null>
  hidden: PanelId[]
  pinned: PanelId[]
  leftPx: number
  rightPx: number
  bottomPct: number
}

export function defaultStored(): StoredLayout {
  return {
    slots: { ...DEFAULT_SLOTS },
    hidden: [],
    pinned: [],
    leftPx: 220,
    rightPx: 260,
    bottomPct: 46,
  }
}

export function loadStored(): StoredLayout {
  const fallback = defaultStored()
  try {
    const raw = localStorage.getItem(STORAGE)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<StoredLayout>
    const slots = { ...fallback.slots, ...(parsed.slots ?? {}) }
    for (const id of SLOT_IDS) {
      const v = slots[id]
      if (v && !PANEL_IDS.includes(v)) slots[id] = fallback.slots[id]
    }
    if (!Object.values(slots).includes('arrange')) slots.center = 'arrange'
    const hidden = (parsed.hidden ?? []).filter((id): id is PanelId => PANEL_IDS.includes(id) && id !== 'arrange')
    const pinned = (parsed.pinned ?? []).filter((id): id is PanelId => PANEL_IDS.includes(id))
    return {
      slots,
      hidden,
      pinned,
      leftPx: Number.isFinite(parsed.leftPx) ? Number(parsed.leftPx) : fallback.leftPx,
      rightPx: Number.isFinite(parsed.rightPx) ? Number(parsed.rightPx) : fallback.rightPx,
      bottomPct: Number.isFinite(parsed.bottomPct) ? Number(parsed.bottomPct) : fallback.bottomPct,
    }
  } catch {
    return fallback
  }
}

export function saveStored(layout: StoredLayout) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(layout))
  } catch {
    /* */
  }
}

export function panelInSlots(slots: Record<SlotId, PanelId | null>, id: PanelId) {
  return SLOT_IDS.find((s) => slots[s] === id) ?? null
}

export function stripPanel(slots: Record<SlotId, PanelId | null>, id: PanelId) {
  const next = { ...slots }
  for (const s of SLOT_IDS) if (next[s] === id) next[s] = null
  return next
}

export function applyUserHidden(
  slots: Record<SlotId, PanelId | null>,
  hidden: PanelId[],
  pianoWanted: boolean,
) {
  let next = { ...slots }
  for (const id of hidden) next = stripPanel(next, id)
  if (!pianoWanted) next = stripPanel(next, 'piano')
  if (!Object.values(next).includes('arrange')) next.center = 'arrange'
  return next
}

export function fitToViewport(
  slots: Record<SlotId, PanelId | null>,
  width: number,
  height: number,
  pinned: PanelId[] = [],
) {
  const next = { ...slots }
  const autoHidden: PanelId[] = []
  const pin = new Set(pinned)

  const take = (slot: SlotId) => {
    const id = next[slot]
    if (!id || id === 'arrange' || pin.has(id)) return false
    autoHidden.push(id)
    next[slot] = null
    return true
  }

  const usedW = () => (next.left ? SIDE_MIN : 0) + (next.right ? SIDE_MIN : 0) + CENTER_MIN + 12
  if (width < 1080) take('left')
  if (width < 900) take('right')
  const hideOrder: SlotId[] = ['left', 'right']
  while (usedW() > width) {
    const slot = hideOrder.find((s) => next[s] && next[s] !== 'arrange')
    if (!slot) break
    take(slot)
  }

  const usedH = () => TOP_CHROME + 220 + (next.bottom ? BOTTOM_MIN : 0)
  if ((usedH() > height || width < 640) && next.bottom && next.bottom !== 'arrange') take('bottom')

  if (!Object.values(next).includes('arrange')) {
    if (next.center && next.center !== 'arrange') autoHidden.push(next.center)
    next.center = 'arrange'
  }

  return { slots: next, autoHidden }
}

export function clampSides(width: number, leftOn: boolean, rightOn: boolean, leftPx: number, rightPx: number) {
  let left = leftOn ? leftPx : 0
  let right = rightOn ? rightPx : 0
  const extra = left + right + CENTER_MIN - width
  if (extra > 0) {
    if (leftOn && rightOn) {
      const lCut = extra * (left / (left + right))
      left = Math.max(SIDE_MIN, left - lCut)
      right = Math.max(SIDE_MIN, width - left - CENTER_MIN)
    } else if (leftOn) {
      left = Math.max(SIDE_MIN, Math.min(left, width - CENTER_MIN))
    } else if (rightOn) {
      right = Math.max(SIDE_MIN, Math.min(right, width - CENTER_MIN))
    }
  }
  left = leftOn ? Math.min(SIDE_MAX, Math.max(SIDE_MIN, left)) : 0
  right = rightOn ? Math.min(SIDE_MAX, Math.max(SIDE_MIN, right)) : 0
  if (left + right + CENTER_MIN > width) {
    const room = Math.max(0, width - CENTER_MIN)
    if (leftOn && rightOn) {
      left = Math.max(SIDE_MIN, Math.floor(room * (left / (left + right || 1))))
      right = Math.max(0, room - left)
    } else if (leftOn) left = room
    else if (rightOn) right = room
  }
  return { left, right }
}
