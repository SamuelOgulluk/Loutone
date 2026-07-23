import { useEffect, useRef } from 'react'
import { useDawStore } from '@/store/useDawStore'
import { audioEngine } from '@/audio/engine'
import { saveProjectToFile, loadProjectFromFile } from '@/project/io'
import { quantizeBeats } from '@/midi/chords'

export function useTransportClock() {
  const setPositionBeat = useDawStore((s) => s.setPositionBeat)
  const setMeters = useDawStore((s) => s.setMeters)
  const last = useRef(performance.now())

  useEffect(() => {
    audioEngine.setPositionCallback((beat) => setPositionBeat(beat))
    audioEngine.syncProject(useDawStore.getState().project)
    let raf = 0
    const loop = (t: number) => {
      const dt = (t - last.current) / 1000
      last.current = t
      audioEngine.tickFallback(dt)
      setMeters(audioEngine.readMeters())
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [setPositionBeat, setMeters])
}

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return Boolean(el.closest('[contenteditable="true"]'))
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const state = useDawStore.getState()
      const mod = e.ctrlKey || e.metaKey

      if (e.code === 'Space') {
        e.preventDefault()
        await togglePlay()
        return
      }
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) state.redo()
        else state.undo()
        return
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        state.redo()
        return
      }
      if (e.key === 's' || e.key === 'S') {
        if (mod) {
          e.preventDefault()
          await saveProjectToFile(state.project)
          return
        }
        state.setSnap(!state.snap)
        return
      }
      if (e.key === 'q' || e.key === 'Q') {
        state.quantizeSelected()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selection.trackId && state.selection.clipId && state.selection.noteIds.length) {
          state.removeNotes(state.selection.trackId, state.selection.clipId, state.selection.noteIds)
        } else if (state.selection.selectedClipIds.length || state.selection.clipId) {
          state.removeSelectedClips()
        }
        return
      }
      if (mod && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault()
        if (state.selection.noteIds.length && state.copySelectedNotes()) return
        state.copySelectedClips()
        return
      }
      if (mod && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault()
        if (state.selection.noteIds.length && state.cutSelectedNotes()) return
        state.cutSelectedClips()
        return
      }
      if (mod && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault()
        if (state.lastClipboard === 'notes') {
          if (state.pasteNotes()) return
        }
        state.pasteClips()
        return
      }
      if (mod && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        state.duplicateSelectedClips()
        return
      }
      if (e.key === 'Home') {
        audioEngine.seek(0)
        state.setPositionBeat(0)
        return
      }
      if (mod && e.key === 'o') {
        e.preventDefault()
        const p = await loadProjectFromFile()
        if (p) state.setProject(p)
        return
      }
      if (mod && e.key === 'n') {
        e.preventDefault()
        state.newProject()
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export async function togglePlay() {
  const state = useDawStore.getState()
  await audioEngine.resume()
  if (state.playing) {
    audioEngine.pause()
    state.setPlaying(false)
  } else {
    audioEngine.syncProject(state.project)
    await audioEngine.play(state.positionBeat)
    state.setPlaying(true)
  }
}

export async function stopTransport() {
  const state = useDawStore.getState()
  audioEngine.stop()
  state.setPlaying(false)
  state.setPositionBeat(0)
}

export function snapBeat(beat: number) {
  const { snap, quantizeDivision } = useDawStore.getState()
  if (!snap) return beat
  return quantizeBeats(beat, quantizeDivision, 1)
}
