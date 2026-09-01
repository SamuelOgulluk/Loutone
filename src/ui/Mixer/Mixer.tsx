import { useDawStore } from '@/store/useDawStore'

export function Mixer() {
  const project = useDawStore((s) => s.project)
  const meters = useDawStore((s) => s.meters)
  const updateTrack = useDawStore((s) => s.updateTrack)
  const setSelection = useDawStore((s) => s.setSelection)
  const selection = useDawStore((s) => s.selection)

  return (
    <section className="panel h-full flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--line)]">
        <h2 className="text-sm font-semibold text-[var(--accent)]">Mixer</h2>
      </div>
      <div className="flex-1 overflow-x-auto flex gap-2 p-2 items-stretch">
        {project.tracks.map((track) => {
          const peak = meters[track.id] ?? 0
          return (
            <div
              key={track.id}
              className={`w-20 shrink-0 flex flex-col items-center gap-1 p-2 rounded border ${selection.trackId === track.id ? 'border-[var(--accent)] bg-[var(--bg-3)]' : 'border-[var(--line)] bg-[var(--bg-2)]'}`}
              onClick={() => setSelection({ trackId: track.id })}
            >
              <div className="text-[10px] truncate w-full text-center">{track.name}</div>
              <div className="meter w-3 flex-1 min-h-[80px] relative">
                <div className="meter-fill" style={{ height: `${Math.min(100, peak * 100)}%` }} />
              </div>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.01}
                value={track.volume}
                className="w-full"
                onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })}
                title="Volume"
              />
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={track.pan}
                className="w-full"
                onChange={(e) => updateTrack(track.id, { pan: Number(e.target.value) })}
                title="Pan"
              />
              <div className="flex gap-1">
                <button
                  className={`btn px-1.5 py-0.5 text-[10px] ${track.mute ? 'btn-active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { mute: !track.mute }) }}
                >
                  M
                </button>
                <button
                  className={`btn px-1.5 py-0.5 text-[10px] ${track.solo ? 'btn-active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { solo: !track.solo }) }}
                >
                  S
                </button>
              </div>
            </div>
          )
        })}
        <div className="w-20 shrink-0 flex flex-col items-center gap-1 p-2 rounded border border-[var(--line)] bg-[var(--bg-0)]">
          <div className="text-[10px] text-[var(--accent)]">Master</div>
          <div className="meter w-3 flex-1 min-h-[80px]">
            <div className="meter-fill" style={{ height: `${Math.min(100, (meters.master ?? 0) * 100)}%` }} />
          </div>
        </div>
      </div>
    </section>
  )
}
