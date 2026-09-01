import { useRef, type PointerEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { useDawStore } from '@/store/useDawStore'
import { snapBeat } from '@/ui/hooks/useTransport'
import {
  AUTOMATION_LANE_H,
  findLane,
  laneTitle,
  resolveAutomationTarget,
  sortPoints,
} from '@/audio/automation'
import type { AutomationPoint, Track } from '@/types/project'

type Props = {
  track: Track
  width: number
  zoom: number
  beats: number
}

export function AutomationLaneView({ track, width, zoom, beats }: Props) {
  const automationTarget = useDawStore((s) => s.automationTarget)
  const addAutomationPoint = useDawStore((s) => s.addAutomationPoint)
  const updateAutomationPoint = useDawStore((s) => s.updateAutomationPoint)
  const removeAutomationPoint = useDawStore((s) => s.removeAutomationPoint)
  const endHistoryGesture = useDawStore((s) => s.endHistoryGesture)
  const laneRef = useRef<HTMLDivElement>(null)
  const dragIdRef = useRef<string | null>(null)

  const target = resolveAutomationTarget(track, automationTarget)
  const lane = target ? findLane(track, target) : null
  const points = sortPoints(lane?.points ?? [])
  const h = AUTOMATION_LANE_H
  const title = laneTitle(track, target)

  const beatFromX = (clientX: number) => {
    const el = laneRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, (clientX - rect.left) / zoom)
  }

  const valueFromY = (clientY: number) => {
    const el = laneRef.current
    if (!el) return 0.5
    const rect = el.getBoundingClientRect()
    const y = clientY - rect.top
    return Math.max(0, Math.min(1, 1 - y / rect.height))
  }

  const onLaneDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-auto-point]')) return
    if (!target) return
    e.stopPropagation()
    e.preventDefault()
    const beat = snapBeat(beatFromX(e.clientX))
    const value = valueFromY(e.clientY)
    addAutomationPoint(track.id, beat, value)
  }

  const onPointDown = (point: AutomationPoint, e: PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    dragIdRef.current = point.id
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointMove = (e: PointerEvent) => {
    const id = dragIdRef.current
    if (!id) return
    e.stopPropagation()
    updateAutomationPoint(
      track.id,
      id,
      { beat: snapBeat(beatFromX(e.clientX)), value: valueFromY(e.clientY) },
      true,
    )
  }

  const onPointUp = () => {
    if (!dragIdRef.current) return
    dragIdRef.current = null
    endHistoryGesture()
  }

  const onPointDoubleClick = (pointId: string, e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    removeAutomationPoint(track.id, pointId)
  }

  const onPointKeyDown = (pointId: string, e: KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      e.stopPropagation()
      removeAutomationPoint(track.id, pointId)
    }
  }

  const poly = points
    .map((p) => `${p.beat * zoom},${(1 - p.value) * (h - 4) + 2}`)
    .join(' ')

  return (
    <div
      ref={laneRef}
      className="arr-auto-lane relative border-t border-[var(--line)]"
      style={{ height: h, width }}
      data-auto-lane
      onPointerDown={onLaneDown}
      title={!target ? 'Ajoutez un effet (onglet Effets) puis choisissez Auto → FX' : `${title} — clic : point · glisser · double-clic : supprimer`}
    >
      <div className="arr-auto-label pointer-events-none absolute left-1 top-0.5 z-[1]">{title}</div>
      <svg className="absolute inset-0 pointer-events-none" width={width} height={h}>
        <line
          x1={0}
          y1={h / 2}
          x2={beats * zoom}
          y2={h / 2}
          stroke="var(--line)"
          strokeDasharray="3 4"
          strokeWidth={1}
        />
        {points.length > 1 && (
          <polyline
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={poly}
          />
        )}
      </svg>
      {points.map((p) => (
        <button
          key={p.id}
          type="button"
          data-auto-point
          className="arr-auto-point"
          style={{
            left: p.beat * zoom,
            top: (1 - p.value) * (h - 4) + 2,
          }}
          onPointerDown={(e) => onPointDown(p, e)}
          onPointerMove={onPointMove}
          onPointerUp={onPointUp}
          onPointerCancel={onPointUp}
          onDoubleClick={(e) => onPointDoubleClick(p.id, e)}
          onKeyDown={(e) => onPointKeyDown(p.id, e)}
          title={`${p.beat.toFixed(2)} · ${Math.round(p.value * 100)}%`}
        />
      ))}
      {!target && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-[var(--muted)] pointer-events-none px-2 text-center">
          {automationTarget === 'effect'
            ? 'Ajoutez un effet à la piste'
            : 'Ouvrez Auto → Vol ou Inst'}
        </div>
      )}
    </div>
  )
}
