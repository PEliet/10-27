import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle, Server, Trash2, X } from 'lucide-react'
import { ApiClientError, messageForApiError, normalizeChatCompletionsUrl, testModelConnection } from '../ai/api'
import { DEFAULT_CONFIG } from '../storage'
import type { ConnectionDiagnostic, ModelConfig } from '../types/game'

interface Props {
  open: boolean
  busy: boolean
  config: ModelConfig
  apiKey: string
  onClose: () => void
  onSave: (config: ModelConfig, apiKey: string) => void
  onClearKey: () => void
  onClearGame: () => void
  onClearAll: () => void
}

export function ModelSettings({
  open, busy, config, apiKey, onClose, onSave, onClearKey, onClearGame, onClearAll,
}: Props) {
  const [draft, setDraft] = useState(config)
  const [draftKey, setDraftKey] = useState(apiKey)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [diagnostic, setDiagnostic] = useState<ConnectionDiagnostic | null>(null)
  const testController = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    setDraft(config)
    setDraftKey(apiKey)
    setStatus(null)
    setDiagnostic(null)
    setShowKey(false)
  }, [open, config, apiKey])

  useEffect(() => () => testController.current?.abort(), [])

  if (!open) return null
  const disabled = busy || testing

  const changeProvider = (provider: ModelConfig['provider']) => {
    setStatus(null)
    setDiagnostic(null)
    if (provider === 'deepseek') {
      setDraft({ ...draft, provider, baseUrl: DEFAULT_CONFIG.baseUrl, model: DEFAULT_CONFIG.model, useJsonMode: true })
    } else {
      setDraft({ ...draft, provider })
    }
  }

  const runTest = async () => {
    setStatus(null)
    if (!draftKey.trim()) {
      setStatus({ ok: false, message: '请先填写 API Key。' })
      return
    }
    setTesting(true)
    const controller = new AbortController()
    testController.current = controller
    try {
      const result = await testModelConnection(draft, draftKey.trim(), controller.signal)
      setDiagnostic(result.diagnostic)
      setStatus({
        ok: true,
        message: `连接成功：${draft.provider === 'deepseek' ? 'DeepSeek' : '自定义接口'} · ${result.model}`,
      })
    } catch (error) {
      if (error instanceof ApiClientError && error.diagnostic) setDiagnostic(error.diagnostic)
      setStatus({ ok: false, message: messageForApiError(error) })
    } finally {
      if (testController.current === controller) testController.current = null
      setTesting(false)
    }
  }

  const update = <K extends keyof ModelConfig>(key: K, value: ModelConfig[K]) => {
    setStatus(null)
    setDiagnostic(null)
    setDraft((current) => ({ ...current, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="presentation">
      <section
        className="modal-panel max-h-[94dvh] w-full overflow-y-auto rounded-t-[22px] p-5 sm:max-w-2xl sm:rounded-[22px] sm:p-7"
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-settings-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="sticker bg-grape text-white"><Server size={14} /> 浏览器直连</span>
            <h2 id="model-settings-title" className="mt-3 text-2xl font-black sm:text-3xl">模型设置</h2>
            <p className="mt-1 text-sm text-ink/65">行动内容和必要游戏上下文会直接发送给你选择的 API 服务商。</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭模型设置" disabled={testing}><X /></button>
        </div>

        {busy && (
          <div className="notice mt-5 border-tangerine bg-orange-50">
            <AlertTriangle size={18} /> 游戏请求进行中，配置已锁定。请先取消请求再修改。
          </div>
        )}

        <div className="mt-6 grid gap-5">
          <fieldset disabled={disabled}>
            <legend className="label">服务商预设</legend>
            <div className="grid grid-cols-2 gap-3">
              {(['deepseek', 'custom'] as const).map((provider) => (
                <button
                  key={provider}
                  type="button"
                  onClick={() => changeProvider(provider)}
                  className={`choice ${draft.provider === provider ? 'choice-active' : ''}`}
                >
                  {provider === 'deepseek' ? 'DeepSeek' : '自定义兼容接口'}
                </button>
              ))}
            </div>
          </fieldset>

          <label>
            <span className="label">API Base URL</span>
            <input className="input" value={draft.baseUrl} disabled={disabled} onChange={(event) => update('baseUrl', event.target.value)} placeholder="https://api.example.com/v1" />
            <span className="field-help">可填基础地址、带 /v1 的地址，或完整 /chat/completions 地址。</span>
          </label>

          <label>
            <span className="label">API Key</span>
            <span className="relative block">
              <input
                className="input pr-12"
                value={draftKey}
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                disabled={disabled}
                onChange={(event) => { setStatus(null); setDraftKey(event.target.value) }}
                placeholder="只会放在 Authorization 请求头中"
              />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 hover:bg-ink/5" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? '隐藏 Key' : '显示 Key'}>
                {showKey ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </span>
          </label>

          <label>
            <span className="label">模型名称</span>
            <input className="input" value={draft.model} disabled={disabled} onChange={(event) => update('model', event.target.value)} placeholder="例如 deepseek-flash" />
            {draft.provider === 'deepseek' && <span className="field-help">截至 2026-10-28，官方文档列出 deepseek-flash 与 deepseek-v4-pro；默认使用 deepseek-flash，可按账户实际模型修改。</span>}
          </label>

          <label className="data-choice flex cursor-pointer items-start gap-3 p-4">
            <input type="checkbox" className="mt-1 size-5 accent-emerald-800" checked={draft.useJsonMode} disabled={disabled} onChange={(event) => update('useJsonMode', event.target.checked)} />
            <span>
              <b className="block">关卡蓝图优先使用 JSON 输出</b>
              <span className="text-sm text-ink/65">开启后，整局生成会请求 json_object；只有服务端明确拒绝该参数时才降级一次。连接测试和短旁白仍使用普通文本。</span>
            </span>
          </label>

          <fieldset disabled={disabled}>
            <legend className="label">Key 保存方式</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`choice cursor-pointer text-left ${!draft.rememberKey ? 'choice-active' : ''}`}>
                <input className="sr-only" type="radio" checked={!draft.rememberKey} onChange={() => update('rememberKey', false)} />
                <b>仅本次使用</b><span className="mt-1 block text-xs font-normal">只在内存中，刷新后需要重新输入。</span>
              </label>
              <label className={`choice cursor-pointer text-left ${draft.rememberKey ? 'choice-active' : ''}`}>
                <input className="sr-only" type="radio" checked={draft.rememberKey} onChange={() => update('rememberKey', true)} />
                <b>记住到本机</b><span className="mt-1 block text-xs font-normal">保存到当前浏览器 localStorage。</span>
              </label>
            </div>
            {draft.rememberKey && (
              <p className="mt-2 flex gap-2 text-sm text-tangerine"><AlertTriangle className="shrink-0" size={17} />Key 会以可读取形式保存在浏览器中，只建议在自己的设备上开启。</p>
            )}
          </fieldset>

          {status && (
            <div className={`notice ${status.ok ? 'border-mint bg-emerald-50' : 'border-tangerine bg-orange-50'}`} role="status">
              {status.ok ? <CheckCircle2 className="shrink-0" size={19} /> : <AlertTriangle className="shrink-0" size={19} />}
              <span>{status.message}</span>
            </div>
          )}

          {diagnostic && (
            <details className="data-choice p-4 text-sm">
              <summary className="cursor-pointer font-black">连接诊断（不包含 Key）</summary>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 break-all text-xs">
                <dt className="font-black">请求地址</dt><dd>{diagnostic.host}{diagnostic.path}</dd>
                <dt className="font-black">模型</dt><dd>{diagnostic.model}</dd>
                <dt className="font-black">HTTP</dt><dd>{diagnostic.httpStatus ?? '未收到'}</dd>
                <dt className="font-black">耗时</dt><dd>{diagnostic.durationMs} ms</dd>
                <dt className="font-black">结束原因</dt><dd>{diagnostic.finishReason ?? '未提供'}</dd>
                <dt className="font-black">可见字符</dt><dd>{diagnostic.contentLength ?? 0}</dd>
                <dt className="font-black">摘要</dt><dd>{diagnostic.summary}</dd>
              </dl>
            </details>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            {testing ? (
              <button className="button-secondary flex-1" onClick={() => testController.current?.abort()}><X size={18} />取消测试</button>
            ) : (
              <button className="button-secondary flex-1" onClick={runTest} disabled={busy} title="会产生少量 API 用量">
                <LoaderCircle size={18} />测试连接（少量用量）
              </button>
            )}
            <button
              className="button-primary flex-1"
              disabled={disabled}
              onClick={() => {
                try {
                  normalizeChatCompletionsUrl(draft.baseUrl)
                  if (!draft.model.trim()) throw new Error('请填写模型名称。')
                  onSave({ ...draft, baseUrl: draft.baseUrl.trim(), model: draft.model.trim() }, draftKey.trim())
                  onClose()
                } catch (error) {
                  setStatus({ ok: false, message: error instanceof Error ? error.message : '配置无效。' })
                }
              }}
            ><KeyRound size={18} />保存并使用</button>
          </div>

          <div className="border-t border-ink/10 pt-5">
            <h3 className="font-black">本地数据</h3>
            <p className="mb-3 mt-1 text-sm text-ink/60">存档、非敏感配置、凭证和界面偏好使用不同存储项；不会自动云同步。</p>
            <div className="flex flex-wrap gap-2">
              <button className="small-button" disabled={disabled} onClick={() => { onClearKey(); setDraftKey(''); setStatus({ ok: true, message: '内存和本地保存的 Key 已清除。' }) }}><Trash2 size={15} />清除 Key</button>
              <button className="small-button" disabled={disabled} onClick={onClearGame}><Trash2 size={15} />清除游戏进度</button>
              <button className="small-button text-red-700" disabled={disabled} onClick={() => { if (window.confirm('确定清除本项目管理的全部本地数据吗？')) { onClearAll(); setDraft(DEFAULT_CONFIG); setDraftKey(''); setStatus({ ok: true, message: '全部本地数据已清除。' }) } }}><Trash2 size={15} />清除全部本地数据</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
