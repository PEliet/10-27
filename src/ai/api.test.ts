import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, normalizeChatCompletionsUrl, requestBlueprintCompletion, testModelConnection } from './api'
import type { ModelConfig } from '../types/game'

const config: ModelConfig = { provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', useJsonMode: true, rememberKey: false }
const okPayload = { model: 'deepseek-flash', choices: [{ finish_reason: 'stop', message: { content: 'OK', reasoning_content: null } }] }

afterEach(() => vi.unstubAllGlobals())

describe('DeepSeek URL normalization', () => {
  it.each([
    ['https://api.deepseek.com', 'https://api.deepseek.com/chat/completions'],
    ['https://api.deepseek.com/v1/', 'https://api.deepseek.com/v1/chat/completions'],
    ['https://example.com/v1/chat/completions/', 'https://example.com/v1/chat/completions'],
  ])('normalizes %s', (input, expected) => expect(normalizeChatCompletionsUrl(input)).toBe(expected))
})

describe('completion response diagnostics', () => {
  it('sends a non-stream request, disables DeepSeek thinking and keeps the key out of body/URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(okPayload), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await testModelConnection(config, 'sk-secret')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(url).not.toContain('sk-secret')
    expect(init.body).not.toContain('sk-secret')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-secret')
    expect(body).toMatchObject({ stream: false, max_tokens: 64, thinking: { type: 'disabled' } })
    expect(body).not.toHaveProperty('response_format')
    expect(result.diagnostic).toMatchObject({ ok: true, httpStatus: 200, finishReason: 'stop', contentLength: 2 })
  })

  it('reports missing choices distinctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: 'x' }), { status: 200 })))
    await expect(testModelConnection(config, 'sk-test')).rejects.toMatchObject({ kind: 'no-choices' })
  })

  it('does not substitute reasoning_content for empty final content', async () => {
    const payload = { choices: [{ finish_reason: 'stop', message: { content: '', reasoning_content: 'hidden reasoning' } }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })))
    await expect(testModelConnection(config, 'sk-test')).rejects.toMatchObject({ kind: 'empty-content' })
  })

  it('reports truncation instead of calling it empty content', async () => {
    const payload = { choices: [{ finish_reason: 'length', message: { content: 'partial' } }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })))
    await expect(testModelConnection(config, 'sk-test')).rejects.toMatchObject({ kind: 'truncated' })
  })

  it('reports a non-JSON successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>wrong endpoint</html>', { status: 200 })))
    await expect(testModelConnection(config, 'sk-test')).rejects.toMatchObject({ kind: 'non-json' })
  })

  it('keeps status and safe diagnostic on authentication failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'invalid token' } }), { status: 401 })))
    try { await testModelConnection(config, 'sk-test') } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError)
      expect(error).toMatchObject({ kind: 'auth', status: 401, diagnostic: { httpStatus: 401, host: 'api.deepseek.com' } })
    }
  })
})

describe('structured blueprint requests', () => {
  const messages = [{ role: 'user' as const, content: '输出 JSON' }]

  it('uses json_object for blueprint generation when enabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...okPayload, choices: [{ finish_reason: 'stop', message: { content: '{}' } }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await requestBlueprintCompletion(config, 'sk-test', messages)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body).toMatchObject({ response_format: { type: 'json_object' }, max_tokens: 8000, stream: false })
  })

  it('falls back once only when the server explicitly rejects response_format', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'unsupported response_format json_object' } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...okPayload, choices: [{ finish_reason: 'stop', message: { content: '{}' } }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await requestBlueprintCompletion(config, 'sk-test', messages)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).not.toHaveProperty('response_format')
  })

  it('does not retry arbitrary service failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'temporary failure' } }), { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(requestBlueprintCompletion(config, 'sk-test', messages)).rejects.toMatchObject({ kind: 'server' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports a truncated blueprint without silently retrying a potentially billed request', async () => {
    const payload = { choices: [{ finish_reason: 'length', message: { content: '{"schemaVersion":1' } }] }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(requestBlueprintCompletion(config, 'sk-test', messages)).rejects.toMatchObject({ kind: 'truncated' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
