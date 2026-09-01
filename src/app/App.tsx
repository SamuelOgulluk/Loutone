import { lazy, Suspense, useEffect } from 'react'
import { TransportBar } from '@/ui/TransportBar/TransportBar'
import { Browser } from '@/ui/Browser/Browser'
import { Arrangement } from '@/ui/Arrangement/Arrangement'
import { Inspector } from '@/ui/Inspector/Inspector'
import { WorkspaceGrid, WorkspaceProvider } from '@/ui/layout/Workspace'
import { useDawStore } from '@/store/useDawStore'
import { useKeyboardShortcuts, useTransportClock } from '@/ui/hooks/useTransport'
import { audioEngine } from '@/audio/engine'
import { preloadEssentialSamples, setSampleDecodeContext } from '@/instruments/sampleBank'
import '@/instruments'

const ModesPanel = lazy(() =>
  import('@/ui/ModesPanel/ModesPanel').then((m) => ({ default: m.ModesPanel })),
)
const PianoRoll = lazy(() =>
  import('@/ui/MidiEditor/PianoRoll').then((m) => ({ default: m.PianoRoll })),
)

function scheduleIdle(fn: () => void) {
  const ric = window.requestIdleCallback
  if (typeof ric === 'function') {
    ric(() => fn(), { timeout: 2500 })
    return
  }
  window.setTimeout(fn, 400)
}

export function App() {
  const mainView = useDawStore((s) => s.mainView)
  useTransportClock()
  useKeyboardShortcuts()

  useEffect(() => {
    const unlock = () => {
      void audioEngine.resume().then(() => audioEngine.ensurePlaceholderTone())
      window.removeEventListener('pointerdown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    void audioEngine.init().then(() => {
      if (audioEngine.ctx) setSampleDecodeContext(audioEngine.ctx)
      void audioEngine.ensurePlaceholderTone()
      scheduleIdle(() => {
        void preloadEssentialSamples()
      })
    })
    audioEngine.syncProject(useDawStore.getState().project)
    const first = useDawStore.getState().project.tracks[0]
    if (first) {
      useDawStore.getState().setSelection({
        trackId: first.id,
        clipId: first.midiClips[0]?.id ?? null,
        selectedClipIds: first.midiClips[0] ? [first.midiClips[0].id] : [],
        noteIds: [],
      })
    }
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  useEffect(() => {
    scheduleIdle(() => {
      void import('@/ui/MidiEditor/PianoRoll')
      void import('@/ui/ModesPanel/ModesPanel')
    })
  }, [])

  return (
    <WorkspaceProvider>
      <TransportBar />
      {mainView === 'modes' ? (
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
          <Suspense fallback={<div className="panel h-full" />}>
            <ModesPanel />
          </Suspense>
        </div>
      ) : (
        <WorkspaceGrid
          panes={{
            browser: <Browser />,
            arrange: <Arrangement />,
            piano: (
              <Suspense fallback={<div className="panel h-full" />}>
                <PianoRoll />
              </Suspense>
            ),
            inspector: <Inspector />,
          }}
        />
      )}
    </WorkspaceProvider>
  )
}
