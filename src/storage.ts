import { z } from 'zod'
import { parseSavedGame } from './game/state'
import type { GameState, ModelConfig, UiPreferences } from './types/game'

export const STORAGE_KEYS = {
  config: 'broken-power:model-config:v1',
  credential: 'broken-power:model-key:v1',
  game: 'broken-power:game:v3',
  legacyGameV2: 'broken-power:game:v2',
  legacyGameV1: 'broken-power:game:v1',
  themeHistory: 'broken-power:theme-history:v1',
  ui: 'broken-power:ui:v1',
} as const

export const DEFAULT_CONFIG: ModelConfig = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  useJsonMode: true,
  rememberKey: false,
}

export const DEFAULT_UI: UiPreferences = { abilityExpanded: true, soundEnabled: false }

const modelConfigSchema = z.object({
  provider: z.enum(['deepseek', 'custom']),
  baseUrl: z.string().min(1).max(500),
  model: z.string().min(1).max(160),
  useJsonMode: z.boolean(),
  rememberKey: z.boolean(),
})

const uiSchema = z.object({ abilityExpanded: z.boolean(), soundEnabled: z.boolean() })

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function loadModelConfig(): ModelConfig {
  const parsed = modelConfigSchema.safeParse(readJson(STORAGE_KEYS.config))
  return parsed.success ? parsed.data : DEFAULT_CONFIG
}

export function saveModelConfig(config: ModelConfig) {
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(modelConfigSchema.parse(config)))
}

export function loadRememberedKey() {
  return localStorage.getItem(STORAGE_KEYS.credential) ?? ''
}

export function saveRememberedKey(key: string) {
  if (key) localStorage.setItem(STORAGE_KEYS.credential, key)
  else localStorage.removeItem(STORAGE_KEYS.credential)
}

export function clearCredential() {
  localStorage.removeItem(STORAGE_KEYS.credential)
}

export function loadGame(): GameState | null {
  return parseSavedGame(readJson(STORAGE_KEYS.game))
}

export function hasLegacyGame() {
  return localStorage.getItem(STORAGE_KEYS.legacyGameV2) !== null || localStorage.getItem(STORAGE_KEYS.legacyGameV1) !== null
}

export function saveGame(state: GameState) {
  localStorage.setItem(STORAGE_KEYS.game, JSON.stringify(state))
}

export function clearGame() {
  localStorage.removeItem(STORAGE_KEYS.game)
  localStorage.removeItem(STORAGE_KEYS.legacyGameV2)
  localStorage.removeItem(STORAGE_KEYS.legacyGameV1)
}

export function loadRecentThemes() {
  const value = readJson(STORAGE_KEYS.themeHistory)
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 5) : []
}

export function rememberTheme(summary: string) {
  const themes = [summary.slice(0, 120), ...loadRecentThemes().filter((item) => item !== summary)].slice(0, 5)
  localStorage.setItem(STORAGE_KEYS.themeHistory, JSON.stringify(themes))
}

export function loadUi(): UiPreferences {
  const parsed = uiSchema.safeParse(readJson(STORAGE_KEYS.ui))
  return parsed.success ? parsed.data : DEFAULT_UI
}

export function saveUi(ui: UiPreferences) {
  localStorage.setItem(STORAGE_KEYS.ui, JSON.stringify(uiSchema.parse(ui)))
}

export function clearAllManagedData() {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key))
}
