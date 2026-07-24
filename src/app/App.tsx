import { useEffect } from 'react'
import { TransportBar } from '@/ui/TransportBar/TransportBar'
import { Browser } from '@/ui/Browser/Browser'
import { Arrangement } from '@/ui/Arrangement/Arrangement'
import { PianoRoll } from '@/ui/MidiEditor/PianoRoll'
import { Mixer } from '@/ui/Mixer/Mixer'
import { Inspector } from '@/ui/Inspector/Inspector'
import { ModesPanel } from '@/ui/ModesPanel/ModesPanel'
import { Split } from '@/ui/layout/Split'
import { useDawStore } from '@/store/useDawStore'
import { useKeyboardShortcuts, useTransportClock } from '@/ui/hooks/useTransport'
import { audioEngine } from '@/audio/engine'
import { preloadEssentialSamples, setSampleDecodeContext } from '@/instruments/sampleBank'
import '@/instruments'

export function App() {
  const pianoRollOpen = useDawStore((s) => s.pianoRollOpen)
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
      void preloadEssentialSamples()
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

  return (
    <div className="h-full w-full min-w-0 overflow-hidden flex flex-col gap-2 p-2">
      <TransportBar />
      {mainView === 'modes' ? (
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
          <ModesPanel />
        </div>
      ) : (
        <Split
          className="flex-1 min-h-0 min-w-0"
          axis="row"
          mode="sides-px"
          storageKey="arrange-main-v2"
          initial={[280, 280]}
          min={[200, 200]}
          max={[520, 480]}
        >
          <Split
            className="h-full"
            axis="column"
            mode="percent"
            storageKey="arrange-left"
            initial={[55, 45]}
            min={[25, 22]}
            max={[78, 75]}
          >
            <Browser />
            <Mixer />
          </Split>
          <div className="h-full min-h-0 min-w-0 overflow-hidden">
            {pianoRollOpen ? (
              <Split
                className="h-full"
                axis="column"
                mode="percent"
                storageKey="arrange-center"
                initial={[48, 52]}
                min={[25, 25]}
                max={[75, 75]}
              >
                <Arrangement />
                <PianoRoll />
              </Split>
            ) : (
              <Arrangement />
            )}
          </div>
          <Inspector />
        </Split>
      )}
    </div>
  )
}
