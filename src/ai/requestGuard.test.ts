import { describe, expect, it } from 'vitest'
import { shouldApplyResponse } from './requestGuard'

describe('request response guard', () => {
  const response = { id: 'request-a', runId: 'run-a' }

  it('accepts only the active request from the current game', () => {
    expect(shouldApplyResponse(response, response, 'run-a')).toBe(true)
  })

  it('ignores a response after cancellation', () => {
    expect(shouldApplyResponse(null, response, 'run-a')).toBe(false)
  })

  it('ignores a response that belongs to an older game', () => {
    expect(shouldApplyResponse(response, response, 'run-b')).toBe(false)
  })

  it('ignores a superseded request in the same game', () => {
    expect(shouldApplyResponse({ id: 'request-b', runId: 'run-a' }, response, 'run-a')).toBe(false)
  })
})
