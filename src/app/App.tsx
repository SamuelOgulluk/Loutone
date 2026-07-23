import { useEffect } from 'react'
import { TransportBar } from '@/ui/TransportBar/TransportBar'
import { Browser } from '@/ui/Browser/Browser'
import { Arrangement } from '@/ui/Arrangement/Arrangement'
import { PianoRoll } from '@/ui/MidiEditor/PianoRoll'
import { Mixer } from '@/ui/Mixer/Mixer'
import { Inspector } from '@/ui/Inspector/Inspector'
import { useDawStore } from '@/store/useDawStore'
import { useKeyboardShortcuts, useTransportClock } from '@/ui/hooks/useTransport'
import { audioEngine } from '@/audio/engine'
import { preloadEssentialSamples, setSampleDecodeContext } from '@/instruments/sampleBank'
import '@/instruments'

export function App() {
  const pianoRollOpen = useDawStore((s) => s.pianoRollOpen)
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
      <div className="flex-1 min-h-0 min-w-0 w-full overflow-hidden grid grid-cols-[200px_minmax(0,1fr)_260px] gap-2">
        <div className="min-h-0 min-w-0 overflow-hidden">
          <Browser />
        </div>
        <div className="min-h-0 min-w-0 overflow-hidden flex flex-col gap-2">
          <div className={pianoRollOpen ? 'h-[48%] min-h-0 min-w-0 overflow-hidden' : 'flex-1 min-h-0 min-w-0 overflow-hidden'}>
            <Arrangement />
          </div>
          {pianoRollOpen && (
            <div className="h-[52%] min-h-0 min-w-0 overflow-hidden">
              <PianoRoll />
            </div>
          )}
        </div>
        <div className="min-h-0 min-w-0 overflow-hidden flex flex-col gap-2">
          <div className="flex-[3] min-h-0 min-w-0 overflow-hidden">
            <Inspector />
          </div>
          <div className="flex-[2] min-h-0 min-w-0 overflow-hidden">
            <Mixer />
          </div>
        </div>
      </div>
    </div>
  )
}
