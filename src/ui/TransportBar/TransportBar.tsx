import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDawStore } from '@/store/useDawStore'
import { audioEngine } from '@/audio/engine'
import { togglePlay, stopTransport } from '@/ui/hooks/useTransport'
import { THEME_IDS, THEME_LABELS, applyTheme, getStoredTheme } from '@/ui/theme'
import { TRACK_COLORS, uid } from '@/types/project'
import type { WhistleRecorder } from '@/audio/whistleToMidi'

const MENU_CLOSE_MS = 180

async function loadWhistleRecorder() {
  const { WhistleRecorder } = await import('@/audio/whistleToMidi')
  return new WhistleRecorder()
}

export function TransportBar() {
  const project = useDawStore((s) => s.project)
  const playing = useDawStore((s) => s.playing)
  const positionBeat = useDawStore((s) => s.positionBeat)
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
  const assignInstrument = useDawStore((s) => s.assignInstrument)
  const addMidiClip = useDawStore((s) => s.addMidiClip)
  const setSelection = useDawStore((s) => s.setSelection)

  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const [theme, setTheme] = useState(getStoredTheme)
  const [exportStatus, setExportStatus] = useState('')
  const [exporting, setExporting] = useState(false)
  const [whistleRecording, setWhistleRecording] = useState(false)
  const [whistleStatus, setWhistleStatus] = useState('')
  const whistleRef = useRef(null as WhistleRecorder | null)
  const whistleReady = useRef(null as Promise<WhistleRecorder> | null)
  const closeTimer = useRef(0)
  const triggerRef = useRef(null as HTMLDivElement | null)

  const ensureWhistle = () => {
    if (!whistleReady.current) {
      whistleReady.current = loadWhistleRecorder().then((rec) => {
        whistleRef.current = rec
        return rec
      })
    }
    return whistleReady.current
  }

  const runExport = async (kind: 'wav' | 'mp3') => {
    if (exporting) return
    setExporting(true)
    setExportStatus(kind === 'wav' ? 'Export WAV…' : 'Export MP3…')
    try {
      if (playing) {
        audioEngine.pause()
        useDawStore.getState().setPlaying(false)
      }
      const { exportProjectMp3, exportProjectWav } = await import('@/audio/export')
      if (kind === 'wav') await exportProjectWav(project)
      else await exportProjectMp3(project)
      setExportStatus(kind === 'wav' ? 'WAV exporté' : 'MP3 exporté')
    } catch (err) {
      console.error(err)
      const detail = err instanceof Error ? err.message : String(err)
      const short = detail.length > 80 ? `${detail.slice(0, 77)}…` : detail
      setExportStatus(`Échec ${kind.toUpperCase()}: ${short || 'erreur inconnue'}`)
    } finally {
      setExporting(false)
      window.setTimeout(() => setExportStatus(''), 5000)
    }
  }

  const toggleWhistleRecord = async () => {
    const rec = await ensureWhistle()
    if (rec.isBusy) return
    if (rec.isRecording) {
      setWhistleStatus('Analyse rythme…')
      try {
        const { notes, durationBeats } = await rec.stop(project.bpm, (p) => {
          setWhistleStatus(`Analyse ${Math.round(p * 100)}%`)
        })
        setWhistleRecording(false)
        if (!notes.length) {
          setWhistleStatus('Aucune note — siffle plus fort / plus long')
          window.setTimeout(() => setWhistleStatus(''), 4000)
          return
        }
        let trackId = selection.trackId
        let track = project.tracks.find((t) => t.id === trackId)
        if (!track || track.type !== 'midi') {
          addBlankTrack('midi')
          trackId = useDawStore.getState().selection.trackId
          if (trackId) assignInstrument(trackId, 'piano', 'Sifflement')
          track = useDawStore.getState().project.tracks.find((t) => t.id === trackId)
        }
        if (!trackId || !track) {
          setWhistleStatus('Échec : pas de piste')
          window.setTimeout(() => setWhistleStatus(''), 3500)
          return
        }
        if (!track.instrumentId) assignInstrument(trackId, 'piano', track.name === 'Piste' ? 'Sifflement' : track.name)
        const clipId = uid('clip')
        const color = track.color || TRACK_COLORS[0]
        const start = positionBeat
        // Timing brut du sifflement — jamais de snap/grille
        const mapped = notes.map((n) => ({
          id: uid('note'),
          pitch: n.pitch,
          start: n.start,
          duration: n.duration,
          velocity: n.velocity,
        }))
        addMidiClip(trackId, {
          id: clipId,
          name: 'Sifflement',
          start,
          duration: Math.max(2, durationBeats),
          loopLength: Math.max(2, durationBeats),
          notes: mapped,
          color,
        })
        setSelection({
          trackId,
          clipId,
          selectedClipIds: [clipId],
          noteIds: [],
          effectId: null,
        })
        setPianoRollOpen(true)
        setWhistleStatus(`${notes.length} note${notes.length > 1 ? 's' : ''} → MIDI (timing réel)`)
        window.setTimeout(() => setWhistleStatus(''), 4000)
      } catch (err) {
        console.error(err)
        setWhistleRecording(false)
        const msg = err instanceof Error ? err.message : 'Échec conversion'
        setWhistleStatus(msg.length > 42 ? 'Échec conversion (voir console)' : msg)
        window.setTimeout(() => setWhistleStatus(''), 5000)
      }
      return
    }

    try {
      if (playing) {
        audioEngine.pause()
        useDawStore.getState().setPlaying(false)
      }
      await rec.start()
      setWhistleRecording(true)
      setWhistleStatus('Siffle… reclique pour convertir')
    } catch (err) {
      console.error(err)
      setWhistleStatus('Micro refusé')
      window.setTimeout(() => setWhistleStatus(''), 4000)
    }
  }

  useEffect(() => () => { void whistleRef.current?.cancel() }, [])

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

  const bars = Math.floor(positionBeat / project.timeSignature.numerator) + 1
  const beatInBar = Math.floor(positionBeat % project.timeSignature.numerator) + 1
  const tick = Math.floor((positionBeat % 1) * 100)

  return (
    <header className="panel flex items-center gap-3 px-3 py-2 overflow-visible">
      <div className="flex items-center gap-2 pr-3 border-r border-[var(--line)]">
        <span className="inline-flex items-center gap-1.5 text-[var(--accent)]" title="Loutone">
          <img src={`${import.meta.env.BASE_URL}loutone.svg`} alt="" width={24} height={24} className="shrink-0 rounded-[6px]" />
          <span className="text-xl font-semibold tracking-tight">Loutone</span>
        </span>
        <input
          className="bg-transparent border-none text-sm text-[var(--muted)] w-36"
          value={project.name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-1">
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
          className={`btn ${whistleRecording ? 'btn-active' : ''}`}
          title={whistleRecording ? 'Arrêter et convertir en MIDI' : 'Enregistrer un sifflement → MIDI'}
          onClick={() => void toggleWhistleRecord()}
        >
          {whistleRecording ? '■ MIDI' : '♪ Rec'}
        </button>
      </div>

      {(whistleStatus || exportStatus) && (
        <span className="text-[11px] text-[var(--muted)] mono max-w-[14rem] truncate" title={whistleStatus || exportStatus}>
          {whistleStatus || exportStatus}
        </span>
      )}

      <div className="mono text-sm px-3 py-1 rounded bg-[var(--bg-0)] border border-[var(--line)] min-w-[7.5rem] text-center">
        {String(bars).padStart(3, '0')}.{beatInBar}.{String(tick).padStart(2, '0')}
      </div>

      <label className="flex items-center gap-1 text-sm text-[var(--muted)]">
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
        className={`btn ${metronome ? 'btn-active' : ''}`}
        title={metronome ? 'Métronome activé' : 'Métronome'}
        onClick={() => setMetronome(!metronome)}
      >
        ♩
      </button>

      <label className="flex items-center gap-1 text-sm text-[var(--muted)]">
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
        className={`btn btn-accent shrink-0 ${mainView === 'modes' ? 'btn-active' : ''}`}
        title="Onglet Modes & structure"
        onClick={() => setMainView(mainView === 'modes' ? 'arrange' : 'modes')}
      >
        Modes & structure
      </button>

      <button className={`btn ${snap ? 'btn-active' : ''}`} onClick={() => setSnap(!snap)} title="Snap (S)">
        Snap
      </button>

      <label className="flex items-center gap-1 text-sm text-[var(--muted)]">
        Zoom
        <input
          type="range"
          min={12}
          max={120}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
      </label>

      <div className="flex-1" />

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
              disabled={exporting}
              title="Rendu offline PCM 16-bit stéréo"
              onClick={() => void runExport('wav')}
            >
              Exporter en WAV
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={exporting}
              title="Rendu offline puis encodage MP3 (lamejs ~192 kb/s)"
              onClick={() => void runExport('mp3')}
            >
              Exporter en MP3
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
    </header>
  )
}
