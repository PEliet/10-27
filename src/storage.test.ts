import { beforeEach, describe, expect, it } from 'vitest'
import { clearAllManagedData, clearCredential, saveRememberedKey, STORAGE_KEYS } from './storage'

describe('managed local storage', () => {
  beforeEach(() => localStorage.clear())

  it('clears a remembered key completely', () => {
    saveRememberedKey('sk-local-test')
    clearCredential()
    expect(localStorage.getItem(STORAGE_KEYS.credential)).toBeNull()
  })

  it('clears only the project-managed keys', () => {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.setItem(key, 'value'))
    localStorage.setItem('unrelated-key', 'keep')
    clearAllManagedData()
    Object.values(STORAGE_KEYS).forEach((key) => expect(localStorage.getItem(key)).toBeNull())
    expect(localStorage.getItem('unrelated-key')).toBe('keep')
  })
})
