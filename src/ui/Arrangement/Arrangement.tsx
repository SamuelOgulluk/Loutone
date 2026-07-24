import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useDawStore } from '@/store/useDawStore'
import { audioEngine } from '@/audio/engine'
import { EFFECT_CATALOG, EFFECT_DND_MIME } from '@/audio/effects'
import { INSTRUMENT_DND_MIME, isInstrumentDragEvent, parseInstrumentDragPayload, getInstrument } from '@/instruments'
import { AUTOMATION_LANE_H, automationModeLabel } from '@/audio/automation'
import { snapBeat } from '@/ui/hooks/useTransport'
import { clipLoopLength, uid } from '@/types/project'
import type { AudioClip, AutomationTargetMode, EffectType, MidiClip, Track } from '@/types/project'
import { AutomationLaneView } from './AutomationLane'

const FX_SHORT = Object.fromEntries(EFFECT_CATALOG.map((e) => [e.type, e.short])) as Record<EffectType, string>
const FX_TYPES = new Set(EFFECT_CATALOG.map((e) => e.type))
const TRACK_COMPACT_H = 22
const TRACK_DEFAULT_H = 64

type LoopDrag =
  | { mode: 'create'; originBeat: number; previewStart: number; previewEnd: number; moved: boolean }
  | { mode: 'start' | 'end' | 'move'; originBeat: number; startLoop: number; endLoop: number }

type MarqueeState = {
  x0: number
  y0: number
  x1: number
  y1: number
}

type ContextMenuState = {
  x: number
  y: number
  trackId: string | null
  clipId: string | null
}

type ClipDrag = {
  clipIds: string[]
  originStarts: Record<string, number>
  originBeat: number
  kind: 'midi' | 'audio'
}

type ClipResize = {
  trackId: string
  clipId: string
  kind: 'midi' | 'audio'
}

type ClipLoopStretch = {
  trackId: string
  clipId: string
  kind: 'midi' | 'audio'
  originDuration: number
  originClientX: number
}

const LOOP_DRAG_THRESHOLD_PX = 4
const MARQUEE_THRESHOLD_PX = 3
const ZOOM_MIN = 12
const ZOOM_MAX = 120
const ZOOM_WHEEL_FACTOR = 1.12

export function Arrangement() {
  const project = useDawStore((s) => s.project)
  const zoom = useDawStore((s) => s.zoom)
  const positionBeat = useDawStore((s) => s.positionBeat)
  const selection = useDawStore((s) => s.selection)
  const clipClipboard = useDawStore((s) => s.clipClipboard)
  const setSelection = useDawStore((s) => s.setSelection)
  const selectClips = useDawStore((s) => s.selectClips)
  const toggleClipSelection = useDawStore((s) => s.toggleClipSelection)
  const updateTrack = useDawStore((s) => s.updateTrack)
  const updateMidiClip = useDawStore((s) => s.updateMidiClip)
  const updateAudioClip = useDawStore((s) => s.updateAudioClip)
  const addAudioClip = useDawStore((s) => s.addAudioClip)
  const removeTrack = useDawStore((s) => s.removeTrack)
  const setPositionBeat = useDawStore((s) => s.setPositionBeat)
  const setLoop = useDawStore((s) => s.setLoop)
  const setZoom = useDawStore((s) => s.setZoom)
  const cutSelectedClips = useDawStore((s) => s.cutSelectedClips)
  const copySelectedClips = useDawStore((s) => s.copySelectedClips)
  const pasteClips = useDawStore((s) => s.pasteClips)
  const duplicateSelectedClips = useDawStore((s) => s.duplicateSelectedClips)
  const removeSelectedClips = useDawStore((s) => s.removeSelectedClips)
  const splitSelectedClipsAtPlayhead = useDawStore((s) => s.splitSelectedClipsAtPlayhead)
  const addEffect = useDawStore((s) => s.addEffect)
  const addBlankTrack = useDawStore((s) => s.addBlankTrack)
  const assignInstrument = useDawStore((s) => s.assignInstrument)
  const automationTarget = useDawStore((s) => s.automationTarget)
  const automationOpenIds = useDawStore((s) => s.automationOpenIds)
  const setAutomationTarget = useDawStore((s) => s.setAutomationTarget)
  const toggleAutomationOpen = useDawStore((s) => s.toggleAutomationOpen)

  const scrollRef = useRef<HTMLDivElement>(null)
  const zoomScrollLeftRef = useRef<number | null>(null)
  const [fxDropTrackId, setFxDropTrackId] = useState<string | null>(null)
  const lanesRef = useRef<HTMLDivElement>(null)
  const rulerRef = useRef<HTMLDivElement>(null)
  const loopDragRef = useRef<LoopDrag | null>(null)
  const marqueeRef = useRef<MarqueeState | null>(null)
  const clipDragRef = useRef<ClipDrag | null>(null)
  const resizeRef = useRef<ClipResize | null>(null)
  const loopStretchRef = useRef<ClipLoopStretch | null>(null)
  const heightMemoryRef = useRef(new Map<string, number>())

  const [loopDrag, setLoopDrag] = useState<LoopDrag | null>(null)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const marqueeAdditiveRef = useRef(false)

  const updateLoopDrag = (next: LoopDrag | null) => {
    loopDragRef.current = next
    setLoopDrag(next)
  }

  const toggleTrackCompact = (track: Track) => {
    const compact = track.height <= TRACK_COMPACT_H + 2
    if (compact) {
      const prev = heightMemoryRef.current.get(track.id) ?? TRACK_DEFAULT_H
      updateTrack(track.id, { height: Math.max(TRACK_COMPACT_H + 8, prev) })
      return
    }
    heightMemoryRef.current.set(track.id, track.height)
    updateTrack(track.id, { height: TRACK_COMPACT_H })
  }

  const beats = Math.max(project.lengthBeats, project.loopEnd + 8)
  const width = beats * zoom
  const barW = project.timeSignature.numerator * zoom
  const selectedSet = new Set(selection.selectedClipIds)

  const beatFromClientX = useCallback(
    (clientX: number) => {
      const ruler = rulerRef.current
      if (!ruler) return 0
      const rect = ruler.getBoundingClientRect()
      const x = clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0)
      return Math.max(0, x / zoom)
    },
    [zoom],
  )

  const lanePointFromClient = useCallback((clientX: number, clientY: number) => {
    const lanes = lanesRef.current
    if (!lanes) return { x: 0, y: 0 }
    const rect = lanes.getBoundingClientRect()
    return {
      x: clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0),
      y: clientY - rect.top + (scrollRef.current?.scrollTop ?? 0),
    }
  }, [])

  let displayLoopStart = project.loopStart
  let displayLoopEnd = project.loopEnd
  if (loopDrag?.mode === 'create') {
    displayLoopStart = Math.min(loopDrag.previewStart, loopDrag.previewEnd)
    displayLoopEnd = Math.max(loopDrag.previewStart, loopDrag.previewEnd)
  } else if (loopDrag?.mode === 'start') {
    displayLoopStart = Math.min(snapBeat(loopDrag.startLoop), loopDrag.endLoop - 0.25)
    displayLoopEnd = loopDrag.endLoop
  } else if (loopDrag?.mode === 'end') {
    displayLoopStart = loopDrag.startLoop
    displayLoopEnd = Math.max(snapBeat(loopDrag.endLoop), loopDrag.startLoop + 0.25)
  } else if (loopDrag?.mode === 'move') {
    displayLoopStart = Math.max(0, loopDrag.startLoop)
    displayLoopEnd = displayLoopStart + (loopDrag.endLoop - loopDrag.startLoop)
  }
  const loopWidthPx = Math.max(1, (displayLoopEnd - displayLoopStart) * zoom)

  const commitLoop = (start: number, end: number) => {
    const a = Math.max(0, Math.min(start, end))
    const b = Math.max(a + 0.25, Math.max(start, end))
    setLoop(project.loopEnabled, snapBeat(a), snapBeat(b))
  }

  const onRulerPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    setContextMenu(null)
    const beat = beatFromClientX(e.clientX)
    rulerRef.current?.setPointerCapture(e.pointerId)
    updateLoopDrag({ mode: 'create', originBeat: beat, previewStart: beat, previewEnd: beat, moved: false })
  }

  const onLoopHandleDown = (mode: 'start' | 'end' | 'move', e: PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (e.button !== 0) return
    const beat = beatFromClientX(e.clientX)
    rulerRef.current?.setPointerCapture(e.pointerId)
    updateLoopDrag({
      mode,
      originBeat: beat,
      startLoop: project.loopStart,
      endLoop: project.loopEnd,
    })
  }

  const onRulerPointerMove = (e: PointerEvent) => {
    const drag = loopDragRef.current
    if (!drag) return
    const beat = beatFromClientX(e.clientX)
    if (drag.mode === 'create') {
      const dx = Math.abs(beat - drag.originBeat) * zoom
      updateLoopDrag({
        ...drag,
        previewStart: drag.originBeat,
        previewEnd: beat,
        moved: drag.moved || dx >= LOOP_DRAG_THRESHOLD_PX,
      })
      return
    }
    const delta = beat - drag.originBeat
    if (drag.mode === 'start') {
      updateLoopDrag({ ...drag, startLoop: drag.startLoop + delta, originBeat: beat })
    } else if (drag.mode === 'end') {
      updateLoopDrag({ ...drag, endLoop: drag.endLoop + delta, originBeat: beat })
    } else {
      const len = drag.endLoop - drag.startLoop
      const nextStart = Math.max(0, drag.startLoop + delta)
      updateLoopDrag({ ...drag, startLoop: nextStart, endLoop: nextStart + len, originBeat: beat })
    }
  }

  const onRulerPointerUp = () => {
    const drag = loopDragRef.current
    if (!drag) return
    updateLoopDrag(null)
    if (drag.mode === 'create') {
      if (!drag.moved) {
        const beat = snapBeat(drag.originBeat)
        audioEngine.seek(beat)
        setPositionBeat(beat)
      } else {
        commitLoop(drag.previewStart, drag.previewEnd)
      }
    } else if (drag.mode === 'start') {
      commitLoop(Math.min(drag.startLoop, drag.endLoop - 0.25), drag.endLoop)
    } else if (drag.mode === 'end') {
      commitLoop(drag.startLoop, Math.max(drag.endLoop, drag.startLoop + 0.25))
    } else {
      const len = drag.endLoop - drag.startLoop
      const start = Math.max(0, drag.startLoop)
      commitLoop(start, start + len)
    }
    useDawStore.getState().endHistoryGesture()
  }

  const clipsIntersectingMarquee = useCallback(
    (box: MarqueeState) => {
      const left = Math.min(box.x0, box.x1)
      const right = Math.max(box.x0, box.x1)
      const top = Math.min(box.y0, box.y1)
      const bottom = Math.max(box.y0, box.y1)
      const ids: string[] = []
      let y = 0
      let focusTrack: string | null = null
      const openSet = new Set(automationOpenIds)
      for (const track of project.tracks) {
        const trackTop = y
        const trackBottom = y + track.height
        const laneOverlap = trackBottom > top && trackTop < bottom
        if (laneOverlap) {
          for (const clip of [...track.midiClips, ...track.audioClips]) {
            const clipLeft = clip.start * zoom
            const clipRight = clipLeft + Math.max(8, clip.duration * zoom)
            const clipTop = trackTop + 4
            const clipBottom = trackBottom - 4
            if (clipRight > left && clipLeft < right && clipBottom > top && clipTop < bottom) {
              ids.push(clip.id)
              focusTrack = track.id
            }
          }
        }
        y += track.height + (openSet.has(track.id) ? AUTOMATION_LANE_H : 0)
      }
      return { ids, focusTrack }
    },
    [project.tracks, zoom, automationOpenIds],
  )

  const onDropAudio = useCallback(
    async (track: Track, e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer.getData(EFFECT_DND_MIME)) return
      if (track.type !== 'audio') return
      const file = e.dataTransfer.files?.[0]
      if (!file || !/\.(wav|mp3|ogg|flac|m4a)$/i.test(file.name)) return
      const key = uid('buf')
      const buffer = await audioEngine.loadAudioFile(key, file)
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const x = e.clientX - rect.left
      const start = snapBeat(Math.max(0, x / zoom))
      const duration = (buffer.duration * project.bpm) / 60
      addAudioClip(track.id, {
        name: file.name,
        start,
        duration,
        loopLength: duration,
        offset: 0,
        bufferKey: key,
        color: track.color,
      })
    },
    [addAudioClip, project.bpm, zoom],
  )

  const isEffectDrag = (e: DragEvent) => e.dataTransfer.types.includes(EFFECT_DND_MIME)
  const isInstrumentDrag = (e: DragEvent) => isInstrumentDragEvent(e)

  const readInstrumentDrop = (e: DragEvent) => {
    const custom = e.dataTransfer.getData(INSTRUMENT_DND_MIME)
    const plain = e.dataTransfer.getData('text/plain')
    return parseInstrumentDragPayload(custom || plain)
  }

  const onTrackFxDragOver = (trackId: string, e: DragEvent) => {
    if (!isEffectDrag(e) && !isInstrumentDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    setFxDropTrackId(trackId)
  }

  const onTrackFxDragLeave = (e: DragEvent) => {
    const related = e.relatedTarget as Node | null
    if (related && (e.currentTarget as HTMLElement).contains(related)) return
    setFxDropTrackId(null)
  }

  const onTrackFxDrop = (trackId: string, e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setFxDropTrackId(null)
    const inst = readInstrumentDrop(e)
    if (inst?.id) {
      assignInstrument(trackId, inst.id, inst.name)
      return
    }
    const raw = e.dataTransfer.getData(EFFECT_DND_MIME) || e.dataTransfer.getData('text/plain')
    if (!raw || !FX_TYPES.has(raw as EffectType)) return
    addEffect(trackId, raw as EffectType)
  }

  const selectEffectOnTrack = (track: Track, effectId: string) => {
    setSelection({
      trackId: track.id,
      clipId: track.midiClips[0]?.id ?? track.audioClips[0]?.id ?? null,
      selectedClipIds: track.midiClips[0] || track.audioClips[0]
        ? [track.midiClips[0]?.id ?? track.audioClips[0]!.id]
        : [],
      noteIds: [],
      effectId,
    })
  }

  const beginClipDrag = (trackId: string, clip: MidiClip | AudioClip, kind: 'midi' | 'audio', e: PointerEvent) => {
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    let clipIds = selection.selectedClipIds
    if (additive) {
      toggleClipSelection(clip.id, trackId)
      clipIds = useDawStore.getState().selection.selectedClipIds
    } else if (!selectedSet.has(clip.id)) {
      selectClips([clip.id], trackId, clip.id)
      clipIds = [clip.id]
    } else {
      setSelection({ trackId, clipId: clip.id, noteIds: [] })
    }
    const originStarts: Record<string, number> = {}
    for (const id of clipIds) {
      for (const t of project.tracks) {
        const c = t.midiClips.find((m) => m.id === id) ?? t.audioClips.find((a) => a.id === id)
        if (c) originStarts[id] = c.start
      }
    }
    if (!originStarts[clip.id]) originStarts[clip.id] = clip.start
    const drag: ClipDrag = {
      clipIds: Object.keys(originStarts),
      originStarts,
      originBeat: beatFromClientX(e.clientX),
      kind,
    }
    clipDragRef.current = drag
  }

  const onLanePointerDown = (track: Track, e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-clip]')) return
    if ((e.target as HTMLElement).closest('[data-auto-lane]')) return
    setContextMenu(null)
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const beat = snapBeat(beatFromClientX(e.clientX))
      audioEngine.seek(beat)
      setPositionBeat(beat)
      return
    }
    const pt = lanePointFromClient(e.clientX, e.clientY)
    const next = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y }
    marqueeRef.current = next
    marqueeAdditiveRef.current = e.shiftKey
    setMarquee(next)
    lanesRef.current?.setPointerCapture(e.pointerId)
    if (!marqueeAdditiveRef.current) {
      selectClips([], track.id, null)
    }
  }

  const onVoidPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    setContextMenu(null)
    const beat = snapBeat(beatFromClientX(e.clientX))
    audioEngine.seek(beat)
    setPositionBeat(beat)
    selectClips([], null, null)
    setSelection({
      trackId: null,
      clipId: null,
      selectedClipIds: [],
      noteIds: [],
      effectId: null,
    })
  }

  const onLaneContextMenu = (track: Track, e: MouseEvent, clipId: string | null = null) => {
    e.preventDefault()
    e.stopPropagation()
    if (clipId) {
      if (!selectedSet.has(clipId)) selectClips([clipId], track.id, clipId)
      else setSelection({ trackId: track.id, clipId, noteIds: [], selectedClipIds: selection.selectedClipIds })
    } else {
      setSelection({ trackId: track.id })
    }
    setContextMenu({ x: e.clientX, y: e.clientY, trackId: track.id, clipId })
  }

  const onPointerMove = (e: PointerEvent) => {
    if (loopDragRef.current) {
      onRulerPointerMove(e)
      return
    }
    if (marqueeRef.current) {
      const pt = lanePointFromClient(e.clientX, e.clientY)
      const next = { ...marqueeRef.current, x1: pt.x, y1: pt.y }
      marqueeRef.current = next
      setMarquee(next)
      return
    }
    const stretch = loopStretchRef.current
    if (stretch) {
      const dx = (e.clientX - stretch.originClientX) / zoom
      const duration = Math.max(0.25, snapBeat(stretch.originDuration + dx))
      if (stretch.kind === 'midi') updateMidiClip(stretch.trackId, stretch.clipId, { duration })
      else updateAudioClip(stretch.trackId, stretch.clipId, { duration })
      return
    }
    const drag = clipDragRef.current
    if (drag) {
      const beat = beatFromClientX(e.clientX)
      const rawDelta = beat - drag.originBeat
      for (const id of drag.clipIds) {
        const origin = drag.originStarts[id]
        if (origin === undefined) continue
        const start = Math.max(0, snapBeat(origin + rawDelta))
        for (const t of project.tracks) {
          if (t.midiClips.some((c) => c.id === id)) updateMidiClip(t.id, id, { start })
          if (t.audioClips.some((c) => c.id === id)) updateAudioClip(t.id, id, { start })
        }
      }
      return
    }
    const resize = resizeRef.current
    if (resize) {
      const track = project.tracks.find((t) => t.id === resize.trackId)
      if (!track) return
      const clip =
        resize.kind === 'midi'
          ? track.midiClips.find((c) => c.id === resize.clipId)
          : track.audioClips.find((c) => c.id === resize.clipId)
      if (!clip) return
      const end = snapBeat(Math.max(clip.start + 0.25, beatFromClientX(e.clientX)))
      const duration = end - clip.start
      if (resize.kind === 'midi') updateMidiClip(resize.trackId, resize.clipId, { duration })
      else updateAudioClip(resize.trackId, resize.clipId, { duration })
    }
  }

  const endPointerInteractions = () => {
    if (marqueeRef.current) {
      const box = marqueeRef.current
      const dx = Math.abs(box.x1 - box.x0)
      const dy = Math.abs(box.y1 - box.y0)
      if (dx >= MARQUEE_THRESHOLD_PX || dy >= MARQUEE_THRESHOLD_PX) {
        const { ids, focusTrack } = clipsIntersectingMarquee(box)
        const merged = marqueeAdditiveRef.current
          ? [...new Set([...selection.selectedClipIds, ...ids])]
          : ids
        selectClips(merged, focusTrack ?? selection.trackId, merged[merged.length - 1] ?? null)
      }
      marqueeRef.current = null
      setMarquee(null)
    }
    clipDragRef.current = null
    resizeRef.current = null
    loopStretchRef.current = null
    useDawStore.getState().endHistoryGesture()
  }

  useEffect(() => {
    const clear = () => setFxDropTrackId(null)
    window.addEventListener('dragend', clear)
    return () => window.removeEventListener('dragend', clear)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const oldZoom = useDawStore.getState().zoom
      const factor = e.deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, oldZoom * factor))
      if (next === oldZoom) return
      const offsetX = e.clientX - el.getBoundingClientRect().left
      const beat = (el.scrollLeft + offsetX) / oldZoom
      zoomScrollLeftRef.current = beat * next - offsetX
      setZoom(next)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setZoom])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [contextMenu])

  useLayoutEffect(() => {
    const target = zoomScrollLeftRef.current
    if (target == null) return
    zoomScrollLeftRef.current = null
    if (scrollRef.current) scrollRef.current.scrollLeft = target
  }, [zoom])

  useLayoutEffect(() => {
    const el = contextMenuRef.current
    if (!el || !contextMenu) return
    const pad = 8
    const w = el.offsetWidth
    const h = el.offsetHeight
    let left = contextMenu.x
    let top = contextMenu.y
    if (left + w > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - w - pad)
    if (top + h > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - h - pad)
    left = Math.max(pad, left)
    top = Math.max(pad, top)
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [contextMenu])

  const runMenu = (action: string) => {
    setContextMenu(null)
    if (action === 'cut') cutSelectedClips()
    else if (action === 'copy') copySelectedClips()
    else if (action === 'paste') pasteClips()
    else if (action === 'duplicate') duplicateSelectedClips()
    else if (action === 'delete') removeSelectedClips()
    else if (action === 'split') splitSelectedClipsAtPlayhead()
  }

  const hasSelection = selection.selectedClipIds.length > 0 || !!selection.clipId
  const canPaste = clipClipboard.items.length > 0
  const selectedIds = selection.selectedClipIds.length
    ? selection.selectedClipIds
    : selection.clipId
      ? [selection.clipId]
      : []
  const canSplitAtPlayhead = selectedIds.some((id) => {
    for (const track of project.tracks) {
      const clip = track.midiClips.find((c) => c.id === id) ?? track.audioClips.find((c) => c.id === id)
      if (!clip) continue
      const rel = positionBeat - clip.start
      return rel > 0.001 && rel < clip.duration - 0.001
    }
    return false
  })
  const splitDisabledReason = !selectedIds.length
    ? 'Aucune sélection'
    : !canSplitAtPlayhead
      ? "La barre de lecture n'est pas sur les clips sélectionnés"
      : undefined

  const autoModes: AutomationTargetMode[] = ['volume', 'effect', 'instrument']
  const openSet = new Set(automationOpenIds)
  const tracksHeight = project.tracks.reduce(
    (sum, track) => sum + track.height + (openSet.has(track.id) ? AUTOMATION_LANE_H : 0),
    0,
  )

  return (
    <section
      className="panel flex flex-col h-full min-w-0 overflow-hidden"
      onPointerMove={onPointerMove}
      onPointerUp={endPointerInteractions}
      onPointerCancel={endPointerInteractions}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-2 border-b border-[var(--line)] flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[var(--accent)]">Arrangement</h2>
          <p className="text-xs text-[var(--muted)]">+ Piste → glisser un instrument · Ctrl+Z/Y · Ctrl+C/V · Ctrl+clic · A : automation</p>
        </div>
      </div>
      <div className="flex flex-1 min-h-0 min-w-0">
        <div className="w-60 shrink-0 border-r border-[var(--line)] overflow-y-auto">
          <div className="h-7 border-b border-[var(--line)] flex items-center px-1 gap-0.5">
            {autoModes.map((mode) => (
              <button
                key={mode}
                type="button"
                className={`arr-auto-mode ${automationTarget === mode ? 'is-active' : ''}`}
                title={`Automation : ${automationModeLabel(mode)}`}
                onClick={() => setAutomationTarget(mode)}
              >
                {automationModeLabel(mode)}
              </button>
            ))}
          </div>
          {project.tracks.map((track) => {
            const autoOpen = openSet.has(track.id)
            const compact = track.height <= TRACK_COMPACT_H + 2
            const rowH = track.height + (autoOpen ? AUTOMATION_LANE_H : 0)
            return (
            <div
              key={track.id}
              className={`arr-track-head flex flex-col border-b border-[var(--line)] ${selection.trackId === track.id ? 'bg-[var(--bg-3)]' : ''} ${fxDropTrackId === track.id ? 'arr-track-drop' : ''} ${compact ? 'is-compact' : ''}`}
              style={{ height: rowH }}
              title={compact ? 'Double-clic pour agrandir' : 'Double-clic pour compacter'}
              onClick={() =>
                setSelection({
                  trackId: track.id,
                  clipId: track.midiClips[0]?.id ?? track.audioClips[0]?.id ?? null,
                  selectedClipIds: track.midiClips[0] || track.audioClips[0]
                    ? [track.midiClips[0]?.id ?? track.audioClips[0]!.id]
                    : [],
                  noteIds: [],
                  effectId: null,
                })
              }
              onDoubleClick={(e) => {
                if ((e.target as HTMLElement).closest('button, input')) return
                e.preventDefault()
                toggleTrackCompact(track)
              }}
              onDragOver={(e) => onTrackFxDragOver(track.id, e)}
              onDragLeave={onTrackFxDragLeave}
              onDrop={(e) => onTrackFxDrop(track.id, e)}
            >
              <div className="flex items-center gap-1.5 px-2 flex-1 min-h-0" style={{ height: track.height }}>
              <span className="w-1 self-stretch my-1.5 rounded-sm shrink-0" style={{ background: track.color }} />
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                <div className="flex items-center gap-1 min-w-0">
                  <div className="text-xs font-medium truncate leading-tight flex-1 min-w-0" title={track.name}>
                    {track.name}
                  </div>
                  {track.effects.length > 0 && (
                    <div className="arr-fx-chips shrink-0">
                      {track.effects.map((fx) => (
                        <button
                          key={fx.id}
                          type="button"
                          title={EFFECT_CATALOG.find((c) => c.type === fx.type)?.label ?? fx.type}
                          className={`arr-fx-chip ${selection.effectId === fx.id ? 'is-active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            selectEffectOnTrack(track, fx.id)
                          }}
                        >
                          {FX_SHORT[fx.type]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="arr-track-meta flex items-center gap-1 min-w-0">
                  <span className="text-[10px] text-[var(--muted)] mono truncate min-w-0 max-w-[4.5rem]" title={
                    track.type === 'midi'
                      ? track.instrumentId
                        ? getInstrument(track.instrumentId)?.name ?? track.instrumentId
                        : 'vide'
                      : 'audio'
                  }>
                    {track.type === 'midi'
                      ? track.instrumentId
                        ? getInstrument(track.instrumentId)?.name ?? track.instrumentId
                        : 'vide'
                      : 'audio'}
                  </span>
                  <div
                    className="arr-track-mix flex flex-col gap-0.5 flex-1 min-w-[4.5rem]"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <label className="arr-mix-row" title={`Volume ${track.volume.toFixed(2)}`}>
                      <span>Vol</span>
                      <input
                        type="range"
                        min={0}
                        max={1.5}
                        step={0.01}
                        value={track.volume}
                        onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })}
                      />
                    </label>
                    <label className="arr-mix-row" title={`Pan ${track.pan.toFixed(2)}`}>
                      <span>Pan</span>
                      <input
                        type="range"
                        min={-1}
                        max={1}
                        step={0.01}
                        value={track.pan}
                        onChange={(e) => updateTrack(track.id, { pan: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      title="Automation"
                      className={`btn arr-track-btn ${autoOpen ? 'btn-active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleAutomationOpen(track.id) }}
                    >
                      A
                    </button>
                    <button
                      type="button"
                      title="Mute"
                      className={`btn arr-track-btn ${track.mute ? 'btn-active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { mute: !track.mute }) }}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      title="Solo"
                      className={`btn arr-track-btn ${track.solo ? 'btn-active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { solo: !track.solo }) }}
                    >
                      S
                    </button>
                    <button
                      type="button"
                      title="Supprimer"
                      className="btn arr-track-btn"
                      onClick={(e) => { e.stopPropagation(); removeTrack(track.id) }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
              </div>
              {autoOpen && (
                <div className="arr-auto-head-label px-2 truncate" style={{ height: AUTOMATION_LANE_H }}>
                  {automationModeLabel(automationTarget)}
                </div>
              )}
            </div>
            )
          })}
          <div className="p-1.5 space-y-1 border-t border-[var(--line)] sticky bottom-0 bg-[var(--bg-1)]">
            <button
              type="button"
              className="btn btn-compact w-full justify-start"
              title="Créer une piste MIDI vierge"
              onClick={() => addBlankTrack('midi')}
            >
              + Piste
            </button>
            <button
              type="button"
              className="btn btn-compact w-full justify-start"
              title="Créer une piste audio vierge"
              onClick={() => addBlankTrack('audio')}
            >
              + Audio
            </button>
          </div>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-auto relative">
          <div className="relative" style={{ width, minHeight: '100%' }}>
            <div
              ref={rulerRef}
              className="sticky top-0 z-10 h-7 border-b border-[var(--line)] bg-[var(--bg-1)] cursor-pointer"
              title="Cliquer : seek · Glisser : définir la boucle"
              onPointerDown={onRulerPointerDown}
              onPointerMove={onRulerPointerMove}
              onPointerUp={onRulerPointerUp}
              onPointerCancel={onRulerPointerUp}
            >
              {Array.from({ length: Math.ceil(beats / project.timeSignature.numerator) }, (_, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-l border-[var(--line)] mono text-[10px] text-[var(--muted)] pl-1 pointer-events-none"
                  style={{ left: i * barW }}
                >
                  {i + 1}
                </div>
              ))}
              <div
                className={`loop-brace absolute top-0 bottom-0 z-[1] ${project.loopEnabled ? '' : 'loop-brace-off'}`}
                style={{ left: displayLoopStart * zoom, width: loopWidthPx }}
                title="Définir la boucle"
              >
                <div
                  className="loop-handle loop-handle-left"
                  onPointerDown={(e) => onLoopHandleDown('start', e)}
                />
                <div
                  className="loop-brace-body"
                  onPointerDown={(e) => onLoopHandleDown('move', e)}
                />
                <div
                  className="loop-handle loop-handle-right"
                  onPointerDown={(e) => onLoopHandleDown('end', e)}
                />
              </div>
            </div>
            <div
              className={`loop-region absolute top-7 bottom-0 ${project.loopEnabled ? '' : 'loop-region-off'}`}
              style={{ left: displayLoopStart * zoom, width: loopWidthPx }}
            />
            <div
              ref={lanesRef}
              className="relative z-[1]"
              style={{ minHeight: `max(12rem, calc(100% - 1.75rem))` }}
              onPointerMove={onPointerMove}
              onPointerUp={endPointerInteractions}
            >
              {project.tracks.map((track) => {
                const autoOpen = openSet.has(track.id)
                const rowH = track.height + (autoOpen ? AUTOMATION_LANE_H : 0)
                return (
                <div
                  key={track.id}
                  data-lane
                  className="relative border-b border-[var(--line)]"
                  style={{ height: rowH, width }}
                >
                  <div
                    className="relative"
                    style={{ height: track.height, width }}
                    onDragOver={(e) => {
                      if (isEffectDrag(e) || isInstrumentDrag(e)) {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'copy'
                        setFxDropTrackId(track.id)
                        return
                      }
                      e.preventDefault()
                    }}
                    onDragLeave={onTrackFxDragLeave}
                    onDrop={(e) => {
                      const inst = readInstrumentDrop(e)
                      if (inst?.id) {
                        e.preventDefault()
                        e.stopPropagation()
                        setFxDropTrackId(null)
                        assignInstrument(track.id, inst.id, inst.name)
                        return
                      }
                      const raw = e.dataTransfer.getData(EFFECT_DND_MIME) || e.dataTransfer.getData('text/plain')
                      if (raw && FX_TYPES.has(raw as EffectType)) {
                        e.preventDefault()
                        setFxDropTrackId(null)
                        addEffect(track.id, raw as EffectType)
                        return
                      }
                      void onDropAudio(track, e)
                    }}
                    onPointerDown={(e) => onLanePointerDown(track, e)}
                    onContextMenu={(e) => onLaneContextMenu(track, e)}
                  >
                  {Array.from({ length: Math.ceil(beats) }, (_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 pointer-events-none"
                      style={{
                        left: i * zoom,
                        borderLeft: `1px solid ${i % project.timeSignature.numerator === 0 ? '#4a4035' : '#2a241e'}`,
                      }}
                    />
                  ))}
                  {track.midiClips.map((clip) => (
                    <ArrangementClip
                      key={clip.id}
                      track={track}
                      clip={clip}
                      kind="midi"
                      zoom={zoom}
                      compact={track.height <= TRACK_COMPACT_H + 8}
                      selected={selectedSet.has(clip.id)}
                      onSelectPointerDown={(e) => {
                        e.stopPropagation()
                        if (e.button !== 0) return
                        setContextMenu(null)
                        beginClipDrag(track.id, clip, 'midi', e)
                        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                      }}
                      onResizeDown={(e) => {
                        e.stopPropagation()
                        const next = { trackId: track.id, clipId: clip.id, kind: 'midi' as const }
                        resizeRef.current = next
                      }}
                      onLoopStretchDown={(e) => {
                        e.stopPropagation()
                        const next = {
                          trackId: track.id,
                          clipId: clip.id,
                          kind: 'midi' as const,
                          originDuration: clip.duration,
                          originClientX: e.clientX,
                        }
                        loopStretchRef.current = next
                        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                      }}
                      onContextMenu={(e) => onLaneContextMenu(track, e, clip.id)}
                    />
                  ))}
                  {track.audioClips.map((clip) => (
                    <ArrangementClip
                      key={clip.id}
                      track={track}
                      clip={clip}
                      kind="audio"
                      zoom={zoom}
                      compact={track.height <= TRACK_COMPACT_H + 8}
                      selected={selectedSet.has(clip.id)}
                      onSelectPointerDown={(e) => {
                        e.stopPropagation()
                        if (e.button !== 0) return
                        setContextMenu(null)
                        beginClipDrag(track.id, clip, 'audio', e)
                        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                      }}
                      onResizeDown={(e) => {
                        e.stopPropagation()
                        const next = { trackId: track.id, clipId: clip.id, kind: 'audio' as const }
                        resizeRef.current = next
                      }}
                      onLoopStretchDown={(e) => {
                        e.stopPropagation()
                        const next = {
                          trackId: track.id,
                          clipId: clip.id,
                          kind: 'audio' as const,
                          originDuration: clip.duration,
                          originClientX: e.clientX,
                        }
                        loopStretchRef.current = next
                        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                      }}
                      onContextMenu={(e) => onLaneContextMenu(track, e, clip.id)}
                    />
                  ))}
                  </div>
                  {autoOpen && (
                    <AutomationLaneView track={track} width={width} zoom={zoom} beats={beats} />
                  )}
                </div>
                )
              })}
              <div
                className="arr-lanes-void absolute left-0 right-0 bottom-0 cursor-text"
                style={{ top: tracksHeight, width, minHeight: 80 }}
                title="Cliquer pour placer la tête de lecture"
                onPointerDown={onVoidPointerDown}
              />
              {marquee && (
                <div
                  className="arr-marquee pointer-events-none absolute z-30"
                  style={{
                    left: Math.min(marquee.x0, marquee.x1),
                    top: Math.min(marquee.y0, marquee.y1),
                    width: Math.abs(marquee.x1 - marquee.x0),
                    height: Math.abs(marquee.y1 - marquee.y0),
                  }}
                />
              )}
            </div>
            <div
              className="playhead absolute top-0 bottom-0 w-px bg-[var(--accent)] z-20 pointer-events-none"
              style={{ left: positionBeat * zoom }}
            />
          </div>
        </div>
      </div>
      {contextMenu &&
        createPortal(
          <div
            ref={contextMenuRef}
            className="arr-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button type="button" disabled={!hasSelection} onClick={() => runMenu('cut')}>Couper</button>
            <button type="button" disabled={!hasSelection} onClick={() => runMenu('copy')}>Copier</button>
            <button type="button" disabled={!canPaste} onClick={() => runMenu('paste')}>Coller</button>
            <div className="arr-context-sep" />
            <button type="button" disabled={!hasSelection} onClick={() => runMenu('duplicate')}>Dupliquer</button>
            <button
              type="button"
              disabled={!canSplitAtPlayhead}
              title={splitDisabledReason}
              onClick={() => runMenu('split')}
            >
              Diviser à la barre de lecture
            </button>
            <div className="arr-context-sep" />
            <button type="button" disabled={!hasSelection} onClick={() => runMenu('delete')}>Supprimer</button>
          </div>,
          document.body,
        )}
    </section>
  )
}

function ArrangementClip({
  track,
  clip,
  kind,
  zoom,
  compact,
  selected,
  onSelectPointerDown,
  onResizeDown,
  onLoopStretchDown,
  onContextMenu,
}: {
  track: Track
  clip: MidiClip | AudioClip
  kind: 'midi' | 'audio'
  zoom: number
  compact?: boolean
  selected: boolean
  onSelectPointerDown: (e: PointerEvent<HTMLDivElement>) => void
  onResizeDown: (e: PointerEvent<HTMLDivElement>) => void
  onLoopStretchDown: (e: PointerEvent<HTMLDivElement>) => void
  onContextMenu: (e: MouseEvent) => void
}) {
  const loopLen = clipLoopLength(clip)
  const iterations = Math.max(1, Math.ceil(clip.duration / loopLen))
  const mix = kind === 'midi' ? 55 : 45
  const label =
    compact && clip.name && clip.name !== track.name
      ? `${track.name} · ${clip.name}`
      : compact
        ? track.name
        : clip.name

  return (
    <div
      data-clip
      className={`arr-clip absolute rounded-sm overflow-hidden cursor-grab ${compact ? 'arr-clip-compact top-px bottom-px' : 'top-1 bottom-1'} ${selected ? 'arr-clip-selected' : ''}`}
      style={{
        left: clip.start * zoom,
        width: Math.max(8, clip.duration * zoom),
        background: `color-mix(in srgb, ${clip.color ?? track.color} ${mix}%, #1a1714)`,
        border: `1px solid ${track.color}`,
      }}
      onPointerDown={onSelectPointerDown}
      onContextMenu={onContextMenu}
    >
      <div
        className="arr-clip-loop-handle"
        title="Étirer en boucle"
        onPointerDown={onLoopStretchDown}
      />
      {iterations > 1 &&
        Array.from({ length: iterations - 1 }, (_, i) => (
          <div
            key={i}
            className="arr-clip-loop-mark pointer-events-none"
            style={{ left: (i + 1) * loopLen * zoom }}
          />
        ))}
      {kind === 'midi' && (
        <MiniNotes
          notes={(clip as MidiClip).notes}
          duration={clip.duration}
          loopLength={loopLen}
          dense={Boolean(compact)}
        />
      )}
      <div
        className={`arr-clip-label relative z-[1] truncate ${compact ? 'arr-clip-label-compact' : ''}`}
        title={label}
      >
        {label}
      </div>
      <div
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-black/20 z-[2]"
        onPointerDown={onResizeDown}
      />
    </div>
  )
}

function MiniNotes({
  notes,
  duration,
  loopLength,
  dense,
}: {
  notes: { start: number; pitch: number; duration: number }[]
  duration: number
  loopLength: number
  dense?: boolean
}) {
  if (!notes.length) return null
  const minP = Math.min(...notes.map((n) => n.pitch))
  const maxP = Math.max(...notes.map((n) => n.pitch))
  const range = Math.max(1, maxP - minP)
  const loopLen = Math.max(0.25, loopLength)
  const iterations = Math.max(1, Math.ceil(duration / loopLen))
  const drawn: { start: number; duration: number; pitch: number; key: string }[] = []
  for (let iter = 0; iter < iterations; iter++) {
    for (const n of notes) {
      if (n.start >= loopLen) continue
      const start = iter * loopLen + n.start
      if (start >= duration) continue
      drawn.push({
        start,
        duration: Math.min(n.duration, duration - start),
        pitch: n.pitch,
        key: `${iter}-${n.start}-${n.pitch}`,
      })
    }
  }
  const noteH = dense ? 3 : 2
  const ySpan = dense ? 92 : 80
  return (
    <div
      className={`absolute inset-x-0 pointer-events-none ${dense ? 'inset-y-0 opacity-90' : 'bottom-0 top-4 opacity-70'}`}
    >
      {drawn.slice(0, dense ? 280 : 160).map((n) => (
        <div
          key={n.key}
          className="absolute bg-[var(--text)]/65 rounded-[1px]"
          style={{
            left: `${(n.start / duration) * 100}%`,
            width: `${Math.max(0.8, (n.duration / duration) * 100)}%`,
            bottom: `${((n.pitch - minP) / range) * ySpan}%`,
            height: noteH,
          }}
        />
      ))}
    </div>
  )
}
