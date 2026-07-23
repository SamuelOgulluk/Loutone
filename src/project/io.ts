import type { Project } from '@/types/project'

export function serializeProject(project: Project) {
  return JSON.stringify(project, null, 2)
}

export function deserializeProject(json: string): Project {
  const data = JSON.parse(json) as Project
  if (!data || data.version !== 1 || !Array.isArray(data.tracks)) {
    throw new Error('Projet invalide')
  }
  data.tracks = data.tracks.map((t) => ({
    ...t,
    automation: Array.isArray(t.automation) ? t.automation : [],
    effects: t.effects ?? [],
    midiClips: (t.midiClips ?? []).map((c) => ({
      ...c,
      loopLength: c.loopLength && c.loopLength > 0 ? c.loopLength : c.duration,
    })),
    audioClips: (t.audioClips ?? []).map((c) => ({
      ...c,
      loopLength: c.loopLength && c.loopLength > 0 ? c.loopLength : c.duration,
    })),
  }))
  return data
}

export async function saveProjectToFile(project: Project) {
  const json = serializeProject(project)
  try {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    const path = await save({
      defaultPath: `${project.name || 'projet'}.softdaw.json`,
      filters: [{ name: 'Otty', extensions: ['softdaw.json', 'json'] }],
    })
    if (!path) return false
    await writeTextFile(path, json)
    return true
  } catch {
    downloadBlob(new Blob([json], { type: 'application/json' }), `${project.name || 'projet'}.softdaw.json`)
    return true
  }
}

export async function loadProjectFromFile(): Promise<Project | null> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    const path = await open({
      multiple: false,
      filters: [{ name: 'Otty', extensions: ['softdaw.json', 'json'] }],
    })
    if (!path || Array.isArray(path)) return null
    const text = await readTextFile(path)
    return deserializeProject(text)
  } catch {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json,.softdaw.json'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) {
          resolve(null)
          return
        }
        try {
          resolve(deserializeProject(await file.text()))
        } catch {
          resolve(null)
        }
      }
      input.click()
    })
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
