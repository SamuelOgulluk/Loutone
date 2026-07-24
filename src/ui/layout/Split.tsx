import { Children, useEffect, useRef, useState } from 'react'

type SplitProps = {
  axis?: 'row' | 'column'
  storageKey: string
  /** Pour row+px : largeurs des panneaux latéraux. Pour percent : parts qui somment ~100. */
  initial: number[]
  min?: number[]
  max?: number[]
  /** px = panneaux latéraux en pixels (le centre flex). percent = flex-basis %. */
  mode?: 'sides-px' | 'percent'
  className?: string
  children: React.ReactNode
}

const PREFIX = 'lutra-split:'

function load(key: string, fallback: number[]) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length !== fallback.length) return fallback
    return parsed.map((n, i) => (Number.isFinite(Number(n)) ? Number(n) : fallback[i]))
  } catch {
    return fallback
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

export function Split({
  axis = 'row',
  storageKey,
  initial,
  min,
  max,
  mode = 'percent',
  className = '',
  children,
}: SplitProps) {
  const panes = Children.toArray(children).filter(Boolean)
  const count = panes.length
  const mins = min ?? initial.map(() => (mode === 'percent' ? 15 : 140))
  const maxs = max ?? initial.map(() => (mode === 'percent' ? 85 : 520))
  const [sizes, setSizes] = useState(() => load(storageKey, initial))
  const wrapRef = useRef(null as HTMLDivElement | null)
  const dragRef = useRef(
    null as null | { index: number; startPos: number; startSizes: number[] },
  )

  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + storageKey, JSON.stringify(sizes))
    } catch {
      /* */
    }
  }, [sizes, storageKey])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current
      const wrap = wrapRef.current
      if (!drag || !wrap) return
      const rect = wrap.getBoundingClientRect()
      const total = axis === 'row' ? rect.width : rect.height
      if (total < 1) return
      const pos = axis === 'row' ? e.clientX : e.clientY
      const delta = pos - drag.startPos
      const next = [...drag.startSizes]
      const i = drag.index

      if (mode === 'sides-px') {
        // index 0 = bord gauche ; sinon bord droit (dernier)
        if (i === 0) {
          next[0] = clamp(drag.startSizes[0] + delta, mins[0], maxs[0])
        } else {
          const rightIdx = next.length - 1
          next[rightIdx] = clamp(drag.startSizes[rightIdx] - delta, mins[rightIdx], maxs[rightIdx])
        }
      } else {
        const deltaPct = (delta / total) * 100
        const j = i + 1
        const sum = drag.startSizes[i] + drag.startSizes[j]
        let left = clamp(drag.startSizes[i] + deltaPct, mins[i], maxs[i])
        let right = sum - left
        if (right < mins[j]) {
          right = mins[j]
          left = sum - right
        }
        if (right > maxs[j]) {
          right = maxs[j]
          left = sum - right
        }
        next[i] = left
        next[j] = right
      }
      setSizes(next)
    }
    const onUp = () => {
      dragRef.current = null
      document.body.classList.remove('is-splitting-row', 'is-splitting-col')
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [axis, maxs, mins, mode])

  const startDrag = (index: number, e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    dragRef.current = {
      index,
      startPos: axis === 'row' ? e.clientX : e.clientY,
      startSizes: [...sizes],
    }
    document.body.classList.add(axis === 'row' ? 'is-splitting-row' : 'is-splitting-col')
  }

  return (
    <div ref={wrapRef} className={`split split-${axis} ${className}`}>
      {panes.map((child, i) => {
        const isSide =
          mode === 'sides-px' && count === 3 && (i === 0 || i === 2)
        const sideSize = i === 0 ? sizes[0] : sizes[sizes.length - 1]
        const style =
          mode === 'percent'
            ? {
                flexGrow: 0,
                flexShrink: 0,
                flexBasis: `${sizes[i]}%`,
                maxHeight: axis === 'column' ? `${sizes[i]}%` : undefined,
                maxWidth: axis === 'row' ? `${sizes[i]}%` : undefined,
              }
            : isSide
              ? {
                  flexGrow: 0,
                  flexShrink: 0,
                  flexBasis: `${sideSize}px`,
                  width: axis === 'row' ? `${sideSize}px` : undefined,
                  height: axis === 'column' ? `${sideSize}px` : undefined,
                }
              : { flex: '1 1 0%' }

        return (
          <div key={i} className="contents">
            <div className="split-pane min-h-0 min-w-0 overflow-hidden" style={style}>
              {child}
            </div>
            {i < count - 1 && (
              <button
                type="button"
                className={`split-handle split-handle-${axis}`}
                aria-label="Redimensionner le panneau"
                title="Glisser pour redimensionner"
                onPointerDown={(e) => startDrag(i, e)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
