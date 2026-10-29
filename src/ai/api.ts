import type { ConnectionDiagnostic, ModelConfig } from '../types/game'

export type ApiErrorKind =
  | 'configuration' | 'auth' | 'balance' | 'not-found' | 'rate-limit' | 'server'
  | 'timeout' | 'cancelled' | 'network' | 'non-json' | 'no-choices' | 'empty-content'
  | 'truncated' | 'response-format' | 'http'

export class ApiClientError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly status?: number,
    public readonly diagnostic?: ConnectionDiagnostic,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

export function normalizeChatCompletionsUrl(input: string) {
  const trimmed = input.trim()
  if (!trimmed) throw new ApiClientError('configuration', '请填写 API Base URL。')
  let url: URL
  try { url = new URL(trimmed) } catch { throw new ApiClientError('configuration', 'API 地址格式不正确，请填写完整的 http(s) 地址。') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new ApiClientError('configuration', 'API 地址只支持 http 或 https。')
  if (url.username || url.password) throw new ApiClientError('configuration', '请勿在 API 地址中放入用户名或密钥。')
  url.search = ''
  url.hash = ''
  let path = url.pathname.replace(/\/+$/, '')
  if (!/\/chat\/completions$/i.test(path)) path = `${path}/chat/completions`
  url.pathname = path.replace(/\/{2,}/g, '/')
  return url.toString().replace(/\/$/, '')
}

function endpointParts(endpoint: string) {
  const url = new URL(endpoint)
  return { host: url.host, path: url.pathname }
}

function safeErrorText(value: unknown) {
  if (typeof value === 'string') return value.slice(0, 320)
  if (!value || typeof value !== 'object') return ''
  const body = value as { error?: { message?: unknown }; message?: unknown }
  const message = body.error?.message ?? body.message
  return typeof message === 'string' ? message.slice(0, 320) : ''
}

function makeDiagnostic(
  config: ModelConfig,
  endpoint: string,
  startedAt: number,
  values: Partial<ConnectionDiagnostic> & Pick<ConnectionDiagnostic, 'ok' | 'summary'>,
): ConnectionDiagnostic {
  const { host, path } = endpointParts(endpoint)
  return {
    host, path, model: config.model.trim(), durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    ...values,
  }
}

function httpError(status: number, detail: string, diagnostic: ConnectionDiagnostic) {
  const suffix = detail ? ` 服务端提示：${detail}` : ''
  if (status === 401 || status === 403) return new ApiClientError('auth', `认证失败，请检查 API Key。${suffix}`, status, diagnostic)
  if (status === 402) return new ApiClientError('balance', `账户余额不足，请到服务商控制台检查余额。${suffix}`, status, diagnostic)
  if (status === 404) return new ApiClientError('not-found', `接口路径或模型名称可能不正确。${suffix}`, status, diagnostic)
  if (status === 429) return new ApiClientError('rate-limit', `请求过快或已达到额度限制，请稍后手动重试。${suffix}`, status, diagnostic)
  if (status >= 500) return new ApiClientError('server', `模型服务暂时异常（${status}），请稍后手动重试。${suffix}`, status, diagnostic)
  return new ApiClientError('http', `请求失败（HTTP ${status}）。${suffix}`, status, diagnostic)
}

export interface Message { role: 'system' | 'user' | 'assistant'; content: string }
interface CompletionOptions {
  config: ModelConfig
  apiKey: string
  messages: Message[]
  maxTokens: number
  signal?: AbortSignal
  timeoutMs?: number
  responseFormat?: boolean
}

interface CompletionResult { content: string; model: string; diagnostic: ConnectionDiagnostic }

async function fetchCompletion(options: CompletionOptions): Promise<CompletionResult> {
  const { config, apiKey, messages, maxTokens, signal, timeoutMs = 16_000, responseFormat = false } = options
  if (!apiKey.trim()) throw new ApiClientError('configuration', '尚未配置 API Key。')
  if (!config.model.trim()) throw new ApiClientError('configuration', '请填写模型名称。')
  const endpoint = normalizeChatCompletionsUrl(config.baseUrl)
  const startedAt = performance.now()
  const controller = new AbortController()
  let timedOut = false
  const timeout = globalThis.setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  const abortFromCaller = () => controller.abort()
  signal?.addEventListener('abort', abortFromCaller, { once: true })
  try {
    const body: Record<string, unknown> = {
      model: config.model.trim(), messages, stream: false, max_tokens: maxTokens,
    }
    if (responseFormat) body.response_format = { type: 'json_object' }
    // DeepSeek 当前文档显示思考模式默认开启；短叙事与连接测试显式关闭，避免推理占满输出预算。
    if (config.provider === 'deepseek') body.thinking = { type: 'disabled' }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const raw = await response.text()
    if (!response.ok) {
      let payload: unknown = raw
      try { payload = raw ? JSON.parse(raw) : null } catch { /* keep safe short text */ }
      const diagnostic = makeDiagnostic(config, endpoint, startedAt, { ok: false, httpStatus: response.status, summary: `HTTP ${response.status}` })
      throw httpError(response.status, safeErrorText(payload), diagnostic)
    }
    let payload: unknown
    try { payload = JSON.parse(raw) } catch {
      const diagnostic = makeDiagnostic(config, endpoint, startedAt, { ok: false, httpStatus: response.status, summary: '成功响应不是 JSON' })
      throw new ApiClientError('non-json', '服务返回 HTTP 200，但正文不是可解析的 JSON。请确认这是 Chat Completions 接口。', response.status, diagnostic)
    }
    if (!payload || typeof payload !== 'object' || !('choices' in payload) || !Array.isArray((payload as { choices: unknown }).choices)) {
      const diagnostic = makeDiagnostic(config, endpoint, startedAt, { ok: false, httpStatus: response.status, summary: '响应缺少 choices 数组' })
      throw new ApiClientError('no-choices', '服务响应缺少 choices 数组，可能不是 OpenAI Chat Completions 格式。', response.status, diagnostic)
    }
    const choices = (payload as { choices: unknown[] }).choices
    if (!choices.length) {
      const diagnostic = makeDiagnostic(config, endpoint, startedAt, { ok: false, httpStatus: response.status, summary: 'choices 为空' })
      throw new ApiClientError('no-choices', '服务返回了空 choices，无法提取模型回答。', response.status, diagnostic)
    }
    const choice = choices[0]
    if (!choice || typeof choice !== 'object') {
      const diagnostic = makeDiagnostic(config, endpoint, startedAt, { ok: false, httpStatus: response.status, summary: 'choices[0] 结构异常' })
      throw new ApiClientError('response-format', 'choices[0] 结构异常。', response.status, diagnostic)
    }
    const item = choice as { finish_reason?: unknown; message?: unknown }
    const finishReason = typeof item.finish_reason === 'string' ? item.finish_reason : null
    if (!item.message || typeof item.message !== 'object') {
      const diagnostic = makeDiagnostic(config, endpoint, startedAt, { ok: false, httpStatus: response.status, finishReason, summary: 'message 结构异常' })
      throw new ApiClientError('response-format', '响应缺少 choices[0].message。', response.status, diagnostic)
    }
    const message = item.message as { content?: unknown; reasoning_content?: unknown }
    const content = typeof message.content === 'string' ? message.content.trim() : ''
    const reasoningPresent = typeof message.reasoning_content === 'string' && message.reasoning_content.trim().length > 0
    const baseDiagnostic = { httpStatus: response.status, finishReason, contentLength: content.length }
    if (finishReason === 'length') {
      const diagnostic = makeDiagnostic(config, endpoint, startedAt, { ...baseDiagnostic, ok: false, summary: '输出被截断' })
      throw new ApiClientError('truncated', `模型输出被 max_tokens 截断（已收到 ${content.length} 个可见字符），未采用这段不完整内容。`, response.status, diagnostic)
    }
    if (!content) {
      const summary = reasoningPresent ? '只有 reasoning_content，最终 content 为空' : `最终 content 为空（finish_reason=${finishReason ?? '未知'}）`
      const diagnostic = makeDiagnostic(config, endpoint, startedAt, { ...baseDiagnostic, ok: false, summary })
      const messageText = reasoningPresent
        ? '模型生成了 reasoning_content，但最终 content 为空；思维内容不能替代最终回答。已明确关闭 DeepSeek 思考模式，请检查模型兼容性或提高输出额度。'
        : '模型最终 content 为空。DeepSeek 官方说明 JSON Output 偶尔可能返回空内容；本次请求未使用 JSON 模式，请检查模型名称、finish_reason 与服务状态。'
      throw new ApiClientError('empty-content', messageText, response.status, diagnostic)
    }
    if (finishReason && !['stop', 'content_filter'].includes(finishReason)) {
      const diagnostic = makeDiagnostic(config, endpoint, startedAt, { ...baseDiagnostic, ok: false, summary: `异常结束原因：${finishReason}` })
      throw new ApiClientError('response-format', `模型未正常结束（finish_reason=${finishReason}）。`, response.status, diagnostic)
    }
    const payloadRecord = payload as Record<string, unknown>
    const model = typeof payloadRecord.model === 'string' ? payloadRecord.model : config.model
    const diagnostic = makeDiagnostic(config, endpoint, startedAt, { ...baseDiagnostic, ok: true, summary: '响应正常' })
    return { content, model, diagnostic }
  } catch (error) {
    if (error instanceof ApiClientError) throw error
    if (controller.signal.aborted) {
      const summary = timedOut ? '请求超时' : '用户取消'
      const diagnostic = makeDiagnostic(config, endpoint, startedAt, { ok: false, summary })
      if (timedOut) throw new ApiClientError('timeout', `请求超过 ${Math.round(timeoutMs / 1000)} 秒，已停止等待；不会自动重试。`, undefined, diagnostic)
      throw new ApiClientError('cancelled', '请求已取消。', undefined, diagnostic)
    }
    const diagnostic = makeDiagnostic(config, endpoint, startedAt, { ok: false, summary: '浏览器网络错误' })
    if (error instanceof TypeError) throw new ApiClientError('network', '浏览器未能读取响应。可能是网络、地址或跨域限制；请检查 Base URL、网络与浏览器控制台。', undefined, diagnostic)
    throw new ApiClientError('network', '网络请求失败，请检查连接。', undefined, diagnostic)
  } finally {
    globalThis.clearTimeout(timeout)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}

export async function testModelConnection(config: ModelConfig, apiKey: string, signal?: AbortSignal) {
  const result = await fetchCompletion({
    config, apiKey, signal, maxTokens: 64, timeoutMs: 15_000,
    messages: [
      { role: 'system', content: '这是连接测试。不要思考过程，只输出 OK。' },
      { role: 'user', content: '只回复两个字符：OK' },
    ],
  })
  return { model: result.model, endpoint: normalizeChatCompletionsUrl(config.baseUrl), diagnostic: result.diagnostic }
}

function responseFormatUnsupported(error: unknown) {
  return error instanceof ApiClientError
    && error.status === 400
    && /response[_ -]?format|json[_ -]?object|不支持|unsupported|unknown parameter/i.test(error.message)
}

export async function requestBlueprintCompletion(
  config: ModelConfig,
  apiKey: string,
  messages: Message[],
  signal?: AbortSignal,
) {
  const useResponseFormat = config.useJsonMode
  try {
    return await fetchCompletion({
      config, apiKey, messages, signal, maxTokens: 8000, timeoutMs: 90_000, responseFormat: useResponseFormat,
    })
  } catch (error) {
    // 只在服务端明确拒绝 response_format 时做一次兼容降级；其他错误不自动重试，避免重复计费。
    if (!useResponseFormat || !responseFormatUnsupported(error) || signal?.aborted) throw error
    return fetchCompletion({
      config, apiKey, messages, signal, maxTokens: 8000, timeoutMs: 90_000, responseFormat: false,
    })
  }
}

export async function generateTurnNarration(config: ModelConfig, apiKey: string, input: { level: string; cardSummary: string; threatSummary: string; hp: number; progress: string }, signal?: AbortSignal) {
  return fetchCompletion({
    config, apiKey, signal, maxTokens: 120, timeoutMs: 10_000,
    messages: [
      { role: 'system', content: '你为轻松、略荒诞的策略小游戏写一句已结算回合反馈，20—50字。先写具体动作或后果，中文自然简洁，轻微幽默；不重复界面数值，不修改胜负与规则，不替玩家表达情绪，不说教，不输出思考过程。禁用：命运的齿轮、真正的挑战才刚刚开始、空气中弥漫着、你能否、智慧与勇气、未知的旅程、作为AI。' },
      { role: 'user', content: `关卡：${input.level}\n已结算卡牌：${input.cardSummary}\n已结算威胁：${input.threatSummary}\n当前生命：${input.hp}\n当前进度：${input.progress}` },
    ],
  })
}

export function messageForApiError(error: unknown) {
  return error instanceof ApiClientError ? error.message : '发生了未知模型错误。'
}
