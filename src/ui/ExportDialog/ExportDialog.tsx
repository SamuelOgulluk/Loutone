import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Project } from '@/types/project'
import {
  DEFAULT_EXPORT_OPTIONS,
  EXPORT_FORMAT_LABELS,
  type ExportFormat,
  type ExportOptions,
  exportProject,
} from '@/audio/export'

type Props = {
  open: boolean
  project: Project
  onClose: () => void
  onStatus: (message: string) => void
}

const FORMATS: ExportFormat[] = ['wav', 'mp3', 'flac']

const SAMPLE_RATES = [44100, 48000, 96000] as const

export function ExportDialog({ open, project, onClose, onStatus }: Props) {
  const [opts, setOpts] = useState<ExportOptions>({ ...DEFAULT_EXPORT_OPTIONS })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const patch = (part: Partial<ExportOptions>) => setOpts((o) => ({ ...o, ...part }))

  const setFormat = (format: ExportFormat) => {
    setOpts((o) => {
      const next = { ...o, format }
      if (format === 'flac' && o.bitDepth === 32) next.bitDepth = 24
      return next
    })
  }

  const run = async () => {
    if (busy) return
    setBusy(true)
    onStatus(`Export ${opts.format.toUpperCase()}…`)
    try {
      await exportProject(project, opts)
      onStatus(`${EXPORT_FORMAT_LABELS[opts.format]} exporté`)
      onClose()
    } catch (err) {
      console.error(err)
      const detail = err instanceof Error ? err.message : String(err)
      const short = detail.length > 72 ? `${detail.slice(0, 69)}…` : detail
      onStatus(`Échec export : ${short || 'erreur'}`)
    } finally {
      setBusy(false)
      window.setTimeout(() => onStatus(''), 5000)
    }
  }

  const wavBits = [16, 24, 32] as const
  const flacBits = [16, 24] as const

  return createPortal(
    <div className="export-overlay" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="export-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="export-dialog-head">
          <h2 id="export-dialog-title" className="text-sm font-semibold text-[var(--accent)]">
            Exporter l&apos;audio
          </h2>
          <p className="text-xs text-[var(--muted)]">Rendu offline du projet · {project.name || 'Sans titre'}</p>
        </div>

        <div className="export-dialog-body">
          <div className="export-formats" role="tablist" aria-label="Format">
            {FORMATS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={opts.format === id}
                className={`export-format-btn ${opts.format === id ? 'is-active' : ''}`}
                disabled={busy}
                onClick={() => setFormat(id)}
              >
                <span className="export-format-name">{EXPORT_FORMAT_LABELS[id]}</span>
                <span className="export-format-hint">
                  {id === 'wav' ? 'Sans perte · PCM' : id === 'mp3' ? 'Compressé · compatible partout' : 'Sans perte · compact'}
                </span>
              </button>
            ))}
          </div>

          <div className="export-options">
            <label className="export-field">
              <span>Fréquence d&apos;échantillonnage</span>
              <select
                value={opts.sampleRate}
                disabled={busy}
                onChange={(e) => patch({ sampleRate: Number(e.target.value) as ExportOptions['sampleRate'] })}
              >
                {SAMPLE_RATES.map((sr) => (
                  <option key={sr} value={sr}>
                    {sr / 1000} kHz
                  </option>
                ))}
              </select>
            </label>

            {opts.format !== 'mp3' && (
              <label className="export-field">
                <span>Profondeur (bits)</span>
                <select
                  value={opts.bitDepth}
                  disabled={busy}
                  onChange={(e) => patch({ bitDepth: Number(e.target.value) as ExportOptions['bitDepth'] })}
                >
                  {(opts.format === 'flac' ? flacBits : wavBits).map((b) => (
                    <option key={b} value={b}>
                      {b === 32 ? '32 bits (float)' : `${b} bits`}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {opts.format === 'mp3' && (
              <label className="export-field">
                <span>Débit (kbps)</span>
                <select
                  value={opts.mp3Bitrate}
                  disabled={busy}
                  onChange={(e) => patch({ mp3Bitrate: Number(e.target.value) as ExportOptions['mp3Bitrate'] })}
                >
                  {[96, 128, 160, 192, 256, 320].map((kbps) => (
                    <option key={kbps} value={kbps}>
                      {kbps} kbps{kbps === 192 ? ' (recommandé)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {opts.format === 'flac' && (
              <label className="export-field export-field-range">
                <span>Compression FLAC · {opts.flacCompression}</span>
                <input
                  type="range"
                  min={0}
                  max={8}
                  step={1}
                  value={opts.flacCompression}
                  disabled={busy}
                  onChange={(e) => patch({ flacCompression: Number(e.target.value) as ExportOptions['flacCompression'] })}
                />
                <span className="export-range-hint">0 = rapide · 8 = fichier plus petit</span>
              </label>
            )}

            {opts.format === 'wav' && (
              <p className="export-note text-xs text-[var(--muted)]">
                WAV = fichier brut non compressé, idéal pour mastering ou montage externe.
              </p>
            )}
            {opts.format === 'mp3' && (
              <p className="export-note text-xs text-[var(--muted)]">
                MP3 = perte audible possible · privilégier 192 kbps ou plus pour la musique.
              </p>
            )}
            {opts.format === 'flac' && (
              <p className="export-note text-xs text-[var(--muted)]">
                FLAC = sans perte, taille réduite par rapport au WAV.
              </p>
            )}
          </div>
        </div>

        <div className="export-dialog-foot">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void run()}>
            {busy ? 'Export…' : 'Exporter'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
