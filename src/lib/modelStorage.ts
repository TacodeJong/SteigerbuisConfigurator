import type { KlimrekConfig, SceneModel } from '../types'

const STORAGE_KEY = 'steigerbuis.savedModels.v1'
const FILE_VERSION = 1
const FILE_EXT = '.steigerbuis.json'

export interface SavedModel {
  id: string
  name: string
  savedAt: number
  scene: SceneModel
  config: KlimrekConfig
}

interface ModelFilePayload {
  version: number
  name: string
  savedAt: number
  scene: SceneModel
  config: KlimrekConfig
}

export function listSavedModels(): SavedModel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedModel[]
    if (!Array.isArray(parsed)) return []
    return parsed.slice().sort((a, b) => b.savedAt - a.savedAt)
  } catch {
    return []
  }
}

function writeAll(models: SavedModel[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(models))
}

function sanitizeFileName(name: string): string {
  const base = name.trim() || 'klimrek'
  return base.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 60)
}

export function modelFileName(name: string): string {
  return `${sanitizeFileName(name)}${FILE_EXT}`
}

function toFilePayload(model: SavedModel): ModelFilePayload {
  return {
    version: FILE_VERSION,
    name: model.name,
    savedAt: model.savedAt,
    scene: model.scene,
    config: model.config,
  }
}

/** Download model als JSON-bestand op schijf. */
export function exportModelToFile(model: SavedModel): void {
  const payload = toFilePayload(model)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = modelFileName(model.name)
  a.click()
  URL.revokeObjectURL(url)
}

function parseModelPayload(data: unknown): SavedModel {
  if (!data || typeof data !== 'object') throw new Error('Ongeldig bestand')

  const raw = data as Partial<ModelFilePayload>
  if (!raw.scene?.pipes || !Array.isArray(raw.scene.pipes)) {
    throw new Error('Geen geldig model in bestand')
  }
  if (!raw.config || typeof raw.config !== 'object') {
    throw new Error('Geen configuratie in bestand')
  }

  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Geïmporteerd model'
  const savedAt = typeof raw.savedAt === 'number' ? raw.savedAt : Date.now()

  return {
    id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    savedAt,
    scene: raw.scene,
    config: raw.config as KlimrekConfig,
  }
}

/** Lees een model van schijf (.steigerbuis.json of ruwe export). */
export async function importModelFromFile(file: File): Promise<SavedModel> {
  const text = await file.text()
  const data = JSON.parse(text) as unknown

  // Oud localStorage-formaat (array) of enkel object zonder version
  if (Array.isArray(data) && data.length > 0) {
    return parseModelPayload({ ...data[0], version: FILE_VERSION })
  }

  return parseModelPayload(data)
}

/** Voeg model toe aan de lokale recente-lijst (zelfde browser). */
export function upsertModel(model: SavedModel): void {
  const models = listSavedModels()
  const existing = models.find((m) => m.name.toLowerCase() === model.name.toLowerCase())
  const next = existing
    ? models.map((m) => (m.id === existing.id ? { ...model, id: existing.id } : m))
    : [model, ...models]
  writeAll(next)
}

/** Slaat op in browser én downloadt een bestand op schijf. */
export function saveModel(name: string, scene: SceneModel, config: KlimrekConfig): SavedModel {
  const models = listSavedModels()
  const trimmed = name.trim() || `Model ${new Date().toLocaleString('nl-NL')}`
  const existing = models.find((m) => m.name.toLowerCase() === trimmed.toLowerCase())

  const entry: SavedModel = {
    id: existing?.id ?? `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed,
    savedAt: Date.now(),
    scene,
    config,
  }

  const next = existing
    ? models.map((m) => (m.id === existing.id ? entry : m))
    : [entry, ...models]
  writeAll(next)
  exportModelToFile(entry)
  return entry
}

export function deleteModel(id: string): void {
  writeAll(listSavedModels().filter((m) => m.id !== id))
}
