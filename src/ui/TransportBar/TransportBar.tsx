import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDawStore } from '@/store/useDawStore'
import { audioEngine } from '@/audio/engine'
import { togglePlay, stopTransport } from '@/ui/hooks/useTransport'
import { THEME_IDS, THEME_LABELS, applyTheme, getStoredTheme } from '@/ui/theme'
import { LayoutDock } from '@/ui/layout/Workspace'
import { ExportDialog } from '@/ui/ExportDialog/ExportDialog'
import { PositionBubbles } from '@/ui/TransportBar/PositionBubbles'
import { uid } from '@/types/project'
import type { VoiceRecorder } from '@/audio/voiceRecorder'
import { MicCaptureError } from '@/audio/voiceRecorder'

const MENU_CLOSE_MS = 180

async function loadVoiceRecorder() {
  const { VoiceRecorder } = await import('@/audio/voiceRecorder')
  return new VoiceRecorder()
}

export function TransportBar() {
  const project = useDawStore((s) => s.project)
  const playing = useDawStore((s) => s.playing)
  const positionBeat = useDawStore((s) => s.positionBeat)
  const setPositionBeat = useDawStore((s) => s.setPositionBeat)
  const snap = useDawStore((s) => s.snap)
  const zoom = useDawStore((s) => s.zoom)
  const pianoRollOpen = useDawStore((s) => s.pianoRollOpen)
  const selection = useDawStore((s) => s.selection)
  const setBpm = useDawStore((s) => s.setBpm)
  const setTimeSignature = useDawStore((s) => s.setTimeSignature)
  const setLoop = useDawStore((s) => s.setLoop)
  const setSnap = useDawStore((s) => s.setSnap)
  const setZoom = useDawStore((s) => s.setZoom)
  const setMetronome = useDawStore((s) => s.setMetronome)
  const metronome = useDawStore((s) => s.metronome)
  const setPianoRollOpen = useDawStore((s) => s.setPianoRollOpen)
  const mainView = useDawStore((s) => s.mainView)
  const setMainView = useDawStore((s) => s.setMainView)
  const setName = useDawStore((s) => s.setName)
  const newProject = useDawStore((s) => s.newProject)
  const loadDemo = useDawStore((s) => s.loadDemo)
  const setProject = useDawStore((s) => s.setProject)
  const addBlankTrack = useDawStore((s) => s.addBlankTrack)
  const addAudioClip = useDawStore((s) => s.addAudioClip)
  const setSelection = useDawStore((s) => s.setSelection)

  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const [theme, setTheme] = useState(getStoredTheme)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
  const [voiceRecording, setVoiceRecording] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState('')
  const voiceRef = useRef(null as VoiceRecorder | null)
  const voiceReady = useRef(null as Promise<VoiceRecorder> | null)
  const recordStartBeatRef = useRef(0)
  const levelTimerRef = useRef(0)
  const closeTimer = useRef(0)
  const triggerRef = useRef(null as HTMLDivElement | null)

  const ensureVoice = () => {
    if (!voiceReady.current) {
      voiceReady.current = loadVoiceRecorder().then((rec) => {
        voiceRef.current = rec
        return rec
      })
    }
    return voiceReady.current
  }

  const openExportDialog = () => {
    if (playing) {
      audioEngine.pause()
      useDawStore.getState().setPlaying(false)
    }
    setExportDialogOpen(true)
    setMenuOpen(false)
  }

  const micStatusFromError = (err: unknown) => {
    if (err instanceof MicCaptureError) return err.message
    if (err instanceof DOMException) return micErrorFromDom(err)
    const msg = err instanceof Error ? err.message : String(err)
    return msg.length > 60 ? 'Échec enregistrement (voir console)' : msg || 'Échec enregistrement'
  }

  const micErrorFromDom = (err: DOMException) => {
    if (err.name === 'NotAllowedError') return 'Micro refusé — autorise l’accès dans le navigateur'
    if (err.name === 'NotFoundError') return 'Aucun micro détecté'
    return err.message || 'Micro indisponible'
  }

  const stopLevelMeter = () => {
    if (levelTimerRef.current) {
      window.clearInterval(levelTimerRef.current)
      levelTimerRef.current = 0
    }
  }

  const startLevelMeter = () => {
    stopLevelMeter()
    levelTimerRef.current = window.setInterval(() => {
      const rec = voiceRef.current
      if (!rec?.isRecording) return
      const lvl = rec.getInputLevel()
      const bars = Math.round(lvl * 12)
      const meter = bars > 0 ? '▮'.repeat(bars) : '…'
      setVoiceStatus(`Rec ${meter}`)
    }, 120)
  }

  const toggleVoiceRecord = async () => {
    const rec = await ensureVoice()
    if (rec.isRecording) {
      stopLevelMeter()
      try {
        const buffer = await rec.stop()
        setVoiceRecording(false)
        if (!buffer) {
          setVoiceStatus('Aucun audio capturé')
          window.setTimeout(() => setVoiceStatus(''), 4000)
          return
        }
        let trackId = selection.trackId
        let track = project.tracks.find((t) => t.id === trackId)
        if (!track || track.type !== 'audio') {
          addBlankTrack('audio')
          trackId = useDawStore.getState().selection.trackId
          track = useDawStore.getState().project.tracks.find((t) => t.id === trackId)
        }
        if (!trackId || !track) {
          setVoiceStatus('Échec : pas de piste audio')
          window.setTimeout(() => setVoiceStatus(''), 3500)
          return
        }
        const key = uid('buf')
        audioEngine.setBuffer(key, buffer)
        const start = recordStartBeatRef.current
        const duration = Math.max(0.25, (buffer.duration * project.bpm) / 60)
        const clipId = uid('clip')
        addAudioClip(trackId, {
          id: clipId,
          name: 'Voix',
          start,
          duration,
          loopLength: duration,
          offset: 0,
          bufferKey: key,
          color: track.color,
        })
        setSelection({
          trackId,
          clipId,
          selectedClipIds: [clipId],
          noteIds: [],
          effectId: null,
        })
        setVoiceStatus('Voix enregistrée — clic droit sur le clip → MIDI')
        window.setTimeout(() => setVoiceStatus(''), 5000)
      } catch (err) {
        console.error(err)
        setVoiceRecording(false)
        setVoiceStatus(micStatusFromError(err))
        window.setTimeout(() => setVoiceStatus(''), 6000)
      }
      return
    }

    try {
      if (playing) {
        audioEngine.pause()
        useDawStore.getState().setPlaying(false)
      }
      await audioEngine.resume()
      recordStartBeatRef.current = positionBeat
      await rec.start()
      setVoiceRecording(true)
      setVoiceStatus('Rec …')
      startLevelMeter()
    } catch (err) {
      console.error(err)
      stopLevelMeter()
      setVoiceRecording(false)
      setVoiceStatus(micStatusFromError(err))
      window.setTimeout(() => setVoiceStatus(''), 6000)
    }
  }

  useEffect(() => {
    return () => {
      stopLevelMeter()
      void voiceRef.current?.cancel()
    }
  }, [])

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = 0
    }
  }

  const openMenu = () => {
    clearCloseTimer()
    setMenuOpen(true)
  }

  const scheduleCloseMenu = () => {
    clearCloseTimer()
    closeTimer.current = window.setTimeout(() => setMenuOpen(false), MENU_CLOSE_MS)
  }

  const updateMenuPos = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setMenuPos({ top: r.bottom + 2, left: r.right })
  }

  useLayoutEffect(() => {
    if (!menuOpen) return
    updateMenuPos()
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const onReposition = () => updateMenuPos()
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [menuOpen])

  useEffect(() => () => clearCloseTimer(), [])

  return (
    <header className="panel tb">
      <div className="tb-brand">
        <span className="inline-flex items-center gap-1.5 text-[var(--accent)]" title="Loutone">
          <img src={`${import.meta.env.BASE_URL}loutone.svg`} alt="" width={24} height={24} className="shrink-0 rounded-[6px]" />
          <span className="tb-brand-name text-xl font-semibold tracking-tight">Loutone</span>
        </span>
        <input
          className="tb-project-name bg-transparent border-none text-sm text-[var(--muted)] w-36"
          value={project.name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="tb-cluster tb-transport">
        <button className="btn" title="Stop" onClick={() => void stopTransport()}>■</button>
        <button className={`btn ${playing ? 'btn-active' : 'btn-accent'}`} title="Play (Space)" onClick={() => void togglePlay()}>
          {playing ? '❚❚' : '▶'}
        </button>
        <button
          className={`btn ${project.loopEnabled ? 'btn-active' : ''}`}
          title={project.loopEnabled ? 'Boucle activée' : 'Boucle désactivée'}
          onClick={() => setLoop(!project.loopEnabled)}
        >
          ↻
        </button>
        <button
          type="button"
          className={`btn ${voiceRecording ? 'btn-active' : ''}`}
          title={voiceRecording ? 'Arrêter l\'enregistrement vocal' : 'Enregistrer la voix'}
          onClick={() => void toggleVoiceRecord()}
        >
          {voiceRecording ? '■ Rec' : '🎤 Rec'}
        </button>
      </div>

      {(voiceStatus || exportStatus) && (
        <span className="text-[11px] text-[var(--muted)] mono max-w-[14rem] truncate" title={voiceStatus || exportStatus}>
          {voiceStatus || exportStatus}
        </span>
      )}

      <PositionBubbles
        positionBeat={positionBeat}
        beatsPerBar={project.timeSignature.numerator}
        onSeek={setPositionBeat}
      />

      <label className="tb-hide-md flex items-center gap-1 text-sm text-[var(--muted)]">
        BPM
        <input
          type="number"
          className="mono w-16"
          value={project.bpm}
          min={20}
          max={300}
          onChange={(e) => setBpm(Number(e.target.value))}
        />
      </label>

      <button
        type="button"
        className={`btn tb-hide-md ${metronome ? 'btn-active' : ''}`}
        title={metronome ? 'Métronome activé' : 'Métronome'}
        onClick={() => setMetronome(!metronome)}
      >
        ♩
      </button>

      <label className="tb-hide-lg flex items-center gap-1 text-sm text-[var(--muted)]">
        Mesure
        <select
          value={`${project.timeSignature.numerator}/${project.timeSignature.denominator}`}
          onChange={(e) => {
            const [n, d] = e.target.value.split('/').map(Number)
            setTimeSignature(n, d)
          }}
        >
          <option value="4/4">4/4</option>
          <option value="3/4">3/4</option>
          <option value="6/8">6/8</option>
          <option value="5/4">5/4</option>
          <option value="7/8">7/8</option>
        </select>
      </label>

      <button
        type="button"
        className={`btn btn-accent shrink-0 tb-modes ${mainView === 'modes' ? 'btn-active' : ''}`}
        title="Onglet Modes & structure"
        onClick={() => setMainView(mainView === 'modes' ? 'arrange' : 'modes')}
      >
        Modes
      </button>

      <button className={`btn tb-hide-md ${snap ? 'btn-active' : ''}`} onClick={() => setSnap(!snap)} title="Snap (S)">
        Snap
      </button>

      <label className="tb-hide-lg flex items-center gap-1 text-sm text-[var(--muted)]">
        Zoom
        <input
          type="range"
          min={12}
          max={120}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
      </label>

      <div className="flex-1 min-w-2" />

      <LayoutDock />

      <div
        ref={triggerRef}
        className="tb-menu"
        onMouseEnter={openMenu}
        onMouseLeave={scheduleCloseMenu}
      >
        <button
          type="button"
          className={`btn btn-compact ${menuOpen ? 'btn-active' : ''}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Fichier et actions"
        >
          Fichier ▾
        </button>
      </div>

      {menuOpen &&
        createPortal(
          <div
            className="tb-menu-panel"
            role="menu"
            style={{ top: menuPos.top, left: menuPos.left, transform: 'translateX(-100%)' }}
            onMouseEnter={openMenu}
            onMouseLeave={scheduleCloseMenu}
          >
            <button
              type="button"
              role="menuitem"
              className={pianoRollOpen ? 'tb-menu-active' : ''}
              title="Afficher / masquer l'éditeur MIDI (piano roll)"
              onClick={() => setPianoRollOpen(!pianoRollOpen)}
            >
              Éditeur MIDI
            </button>
            <button type="button" role="menuitem" onClick={() => newProject()} title="Nouveau (Ctrl+N)">
              Nouveau
            </button>
            <button type="button" role="menuitem" onClick={() => loadDemo()}>
              Démo
            </button>
            <button
              type="button"
              role="menuitem"
              title="Importer un projet JSON (Ctrl+O)"
              onClick={async () => {
                const { loadProjectFromFile } = await import('@/project/io')
                const p = await loadProjectFromFile()
                if (p) setProject(p)
              }}
            >
              Importer un projet
            </button>
            <button
              type="button"
              role="menuitem"
              className="tb-menu-accent"
              title="Sauver (Ctrl+S)"
              onClick={async () => {
                const { saveProjectToFile } = await import('@/project/io')
                await saveProjectToFile(project)
              }}
            >
              Sauver
            </button>
            <button
              type="button"
              role="menuitem"
              title="Exporter l'audio (WAV, MP3, FLAC…)"
              onClick={openExportDialog}
            >
              Exporter…
            </button>
            {exportStatus ? (
              <span className="tb-menu-hint" role="status">
                {exportStatus}
              </span>
            ) : null}
            <button
              type="button"
              role="menuitem"
              title="Retour au début (Home)"
              onClick={() => {
                audioEngine.seek(0)
                useDawStore.getState().setPositionBeat(0)
              }}
            >
              Début
            </button>
            <div className="tb-menu-sep" />
            <div className="tb-menu-theme-slot">
              <span className="tb-menu-hint">Transport</span>
              <label className="tb-menu-field">
                BPM
                <input
                  type="number"
                  className="mono w-16"
                  value={project.bpm}
                  min={20}
                  max={300}
                  onChange={(e) => setBpm(Number(e.target.value))}
                />
              </label>
              <label className="tb-menu-field">
                Mesure
                <select
                  value={`${project.timeSignature.numerator}/${project.timeSignature.denominator}`}
                  onChange={(e) => {
                    const [n, d] = e.target.value.split('/').map(Number)
                    setTimeSignature(n, d)
                  }}
                >
                  <option value="4/4">4/4</option>
                  <option value="3/4">3/4</option>
                  <option value="6/8">6/8</option>
                  <option value="5/4">5/4</option>
                  <option value="7/8">7/8</option>
                </select>
              </label>
              <button type="button" role="menuitem" className={snap ? 'tb-menu-active' : ''} onClick={() => setSnap(!snap)}>
                Snap
              </button>
              <button type="button" role="menuitem" className={metronome ? 'tb-menu-active' : ''} onClick={() => setMetronome(!metronome)}>
                Métronome
              </button>
            </div>
            <div className="tb-menu-sep" />
            <div className="tb-menu-theme-slot">
              <span className="tb-menu-hint">Thème</span>
              {THEME_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={theme === id}
                  className={theme === id ? 'tb-menu-active' : ''}
                  onClick={() => setTheme(applyTheme(id))}
                >
                  {THEME_LABELS[id]}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}

      <ExportDialog
        open={exportDialogOpen}
        project={project}
        onClose={() => setExportDialogOpen(false)}
        onStatus={setExportStatus}
      />
    </header>
  )
}
