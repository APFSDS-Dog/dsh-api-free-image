/**
 * dsh-api-free-image · Client 半（设置卡片）
 *
 * 座位于 `plugins.bundle.config`（按本包的 package name 派发），也就是
 * DSH 设置 → 插件 → API免费生图 这一页里、描述文字下面那块“自己的配置”。
 *
 * 卡片能做三件事：
 *   1. 填 / 清除 API Key（POST 到 Host 的 /api/key）；
 *   2. 看配额与当前模型；
 *   3. 改图片保存位置 —— 调的是 DSH 自带的 `uiWorkspace.pickDirectory()`，
 *      桌面端会弹系统原生文件夹选择框（Windows: IFileOpenDialog）。
 *
 * 样式只用宿主主题变量（--dsw-alias-*），不引任何 primitives 包，所以主题
 * 切换与深色模式跟随宿主，宿主改版也最多是“长得不太像”，不会白屏。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { PLUGIN_DISPLAY_NAME, PLUGIN_ID, SIGNUP_URL } from '../config.js'

const API_BASE = `/${PLUGIN_ID}/api`
/** 兜底链接：Host 状态还没回来时也能点。 */
const FALLBACK_SIGNUP_URL = SIGNUP_URL

interface StatusPayload {
  ok: boolean
  configured: boolean
  source: 'file' | 'env' | 'none'
  maskedKey: string
  envName: string
  provider: { id: string; label: string; model: string; signupUrl: string }
  limits: { ipm: number; ipd: number }
  usage: { date: string; todayCount: number; minuteCount: number; remainingToday: number }
  output: { dir: string; source: 'default' | 'custom'; defaultDir: string; todayImageDir: string }
  /** 界面偏好：说明（README 那段）是不是收起了。 */
  ui?: { hideDocs?: boolean }
}

const zh: Record<string, string> = {
  title: PLUGIN_DISPLAY_NAME,
  hint: '输入你的 API Key，',
  link: '去注册获取',
  signupNote: '通过此链接注册可支持本插件开发',
  placeholder: 'sk-...',
  save: '保存',
  saving: '保存中…',
  saved: '✅ 已保存，现在可以直接让我画图了',
  cleared: '🗑 已清除本地保存的 Key',
  clear: '清除',
  configured: '已配置',
  notConfigured: '未配置',
  sourceFile: '来源：设置卡片',
  sourceEnv: '来源：环境变量',
  quota: '今日 {today}/{ipd} 张 · 本分钟 {minute}/{ipm} 张',
  remaining: '今日还剩 {remaining} 张',
  modelNote: '模型锁定为 {model}（免费）；不提供 model 参数，防止误调收费模型。',
  saveLocation: '保存位置',
  changeLocation: '更改保存位置',
  resetLocation: '恢复默认',
  picking: '等待选择…',
  hideDocs: '收起说明',
  showDocs: '显示说明',
  hideDocsTitle: '把上面那段说明收起来（下次进来还是收起的）',
  showDocsTitle: '把说明展开',
  docsFailed: '切换说明显示失败：{error}',
  locationSaved: '✅ 保存位置已更新',
  locationReset: '✅ 已恢复默认保存位置',
  loadFailed: '读取本地状态失败：{error}',
  saveFailed: '保存失败：{error}',
  locationFailed: '更改保存位置失败：{error}',
  pickerUnavailable: '当前宿主没有文件夹选择器，请手动填写路径后保存。',
  emptyLocation: '请在设置里选择一个文件夹',
}

const en: Record<string, string> = {
  title: 'API free image generation',
  hint: 'Paste your API key, ',
  link: 'get one here',
  signupNote: 'Signing up through this link supports this plugin',
  placeholder: 'sk-...',
  save: 'Save',
  saving: 'Saving…',
  saved: '✅ Saved — image generation is ready',
  cleared: '🗑 Local key removed',
  clear: 'Clear',
  configured: 'Configured',
  notConfigured: 'Not configured',
  sourceFile: 'Source: settings card',
  sourceEnv: 'Source: environment variable',
  quota: 'Today {today}/{ipd} · This minute {minute}/{ipm}',
  remaining: '{remaining} left today',
  modelNote: 'Model is locked to {model} (free); there is no model parameter on purpose.',
  saveLocation: 'Save location',
  changeLocation: 'Change folder',
  resetLocation: 'Use default',
  picking: 'Waiting for the picker…',
  hideDocs: 'Hide docs',
  showDocs: 'Show docs',
  hideDocsTitle: 'Fold the docs above; it stays folded next time',
  showDocsTitle: 'Unfold the docs',
  docsFailed: 'Could not toggle the docs: {error}',
  locationSaved: '✅ Save location updated',
  locationReset: '✅ Back to the default folder',
  loadFailed: 'Could not read local status: {error}',
  saveFailed: 'Save failed: {error}',
  locationFailed: 'Could not change the save location: {error}',
  pickerUnavailable: 'This host has no folder picker; type a path and save instead.',
  emptyLocation: 'Pick a folder in the settings first',
}

type Translate = (key: string, vars?: Record<string, string | number>) => string

const CSS = `
.kfi{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-2,transparent);color:var(--dsw-alias-label-primary);box-sizing:border-box}
.kfi-head{display:flex;align-items:center;gap:8px;justify-content:space-between}
.kfi-headRight{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.kfi-docsBtn{display:inline-flex;align-items:center;gap:5px}
.kfi-docsBtn svg{width:11px;height:11px;flex:0 0 auto;opacity:.85}
.kfi-title{display:flex;align-items:center;gap:8px;font-size:14px;line-height:20px;font-weight:600}
.kfi-mark{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:7px;background:linear-gradient(135deg,#4b8dff,#8f5bff);color:#fff;flex:0 0 auto}
.kfi-badge{display:inline-flex;align-items:center;gap:4px;font-size:12px;line-height:16px;padding:1px 8px;border-radius:6px;white-space:nowrap}
.kfi-badge[data-on="true"]{color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-state-success-tertiary,rgba(0,160,90,.12))}
.kfi-badge[data-on="false"]{color:var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-state-warn-tertiary,rgba(230,140,0,.12))}
.kfi-hint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.kfi-link{color:var(--dsw-alias-state-business-primary);text-decoration:none}
.kfi-link:hover{text-decoration:underline}
.kfi-signupNote{margin:2px 0 0;font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary)}
.kfi-form{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.kfi-input{flex:1 1 220px;min-width:0;height:32px;padding:0 10px;font-size:13px;font-family:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1,transparent);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,8px);outline:none;transition:border-color 120ms ease}
.kfi-input::placeholder{color:var(--dsw-alias-label-tertiary)}
.kfi-input:focus{border-color:var(--dsw-alias-state-business-primary)}
.kfi-btn{height:32px;padding:0 14px;font-size:13px;font-family:inherit;border-radius:var(--dsw-radius-md,8px);border:1px solid transparent;cursor:pointer;transition:opacity 120ms ease,transform 120ms cubic-bezier(0.23,1,0.32,1);white-space:nowrap}
.kfi-btn:active{transform:scale(.97)}
.kfi-btn[data-variant="primary"]{background:var(--dsw-alias-state-business-primary);color:#fff}
.kfi-btn[data-variant="ghost"]{background:transparent;color:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-border-l2)}
.kfi-btn[data-variant="ghost"]:hover{color:var(--dsw-alias-label-primary)}
.kfi-btn[data-size="sm"]{height:26px;padding:0 10px;font-size:12px}
.kfi-btn:disabled{opacity:.45;cursor:default;transform:none}
.kfi-btn:focus-visible,.kfi-input:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.kfi-loc{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1)}
.kfi-locLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);flex:0 0 auto}
.kfi-path{flex:1 1 200px;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.08));border-radius:6px;padding:2px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
.kfi-meta{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.kfi-meta b{font-weight:600;color:var(--dsw-alias-label-secondary)}
.kfi-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.kfi-msg{font-size:12px;line-height:18px;word-break:break-word}
.kfi-msg[data-kind="ok"]{color:var(--dsw-alias-state-success-primary)}
.kfi-msg[data-kind="error"]{color:var(--dsw-alias-state-error-primary)}
/* 说明收起：只隐藏「紧挨着我们设置卡片」的那一个说明文档块（宿主渲染的 README），
   用 :has() 锁定关系，别的插件页的说明不受影响。 */
html.kfi-hide-docs section[data-detail-document]:has(+ section[data-plugin-config] .kfi){display:none!important}
`

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(vars[key] ?? `{${key}}`))
}

async function fetchStatus(): Promise<StatusPayload> {
  const response = await fetch(`${API_BASE}/status`, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const payload = (await response.json()) as StatusPayload & { error?: string }
  if (payload.ok !== true) throw new Error(payload.error ?? 'unknown error')
  return payload
}

interface CardProps {
  t: Translate
  /** DSH 的文件夹选择器：返回选中的目录，用户取消时返回 null。 */
  pick?: () => Promise<string | null>
  view?: 'summary' | 'page'
}

type Busy = null | 'key' | 'dir' | 'docs'

export function ApiFreeImageCard({ t, pick }: CardProps): JSX.Element {
  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  /** 说明（宿主渲染的 README）是否收起；真实值以 Host 存的为准。 */
  const [hideDocs, setHideDocs] = useState(false)
  const aliveRef = useRef(true)

  const refresh = useCallback(async () => {
    const next = await fetchStatus()
    if (aliveRef.current) setStatus(next)
    return next
  }, [])

  useEffect(() => {
    aliveRef.current = true
    refresh().catch((error: unknown) => {
      if (!aliveRef.current) return
      setMessage({
        kind: 'error',
        text: fill(t('loadFailed'), { error: error instanceof Error ? error.message : String(error) }),
      })
    })
    return () => {
      aliveRef.current = false
    }
  }, [refresh, t])

  // Host 的状态回来了就跟着它（卡片重开、别处改过都以 Host 为准）。
  useEffect(() => {
    if (status === null) return
    setHideDocs(status.ui?.hideDocs === true)
  }, [status])

  // 把「收起说明」落到页面上：靠 <html> 上的一个类，配合 CSS 隐藏宿主的说明文档块。
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('kfi-hide-docs', hideDocs)
    return () => {
      root.classList.remove('kfi-hide-docs')
    }
  }, [hideDocs])

  const submitKey = useCallback(
    async (value: string) => {
      setBusy('key')
      setMessage(null)
      try {
        const response = await fetch(`${API_BASE}/key`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ apiKey: value }),
        })
        const payload = (await response.json()) as { ok?: boolean; error?: string }
        if (payload.ok !== true) throw new Error(payload.error ?? `HTTP ${response.status}`)
        await refresh()
        if (aliveRef.current) {
          setDraft('')
          setMessage({ kind: 'ok', text: value.trim() === '' ? t('cleared') : t('saved') })
        }
      } catch (error) {
        if (aliveRef.current) {
          setMessage({
            kind: 'error',
            text: fill(t('saveFailed'), { error: error instanceof Error ? error.message : String(error) }),
          })
        }
      } finally {
        if (aliveRef.current) setBusy(null)
      }
    },
    [refresh, t],
  )

  /** 收起 / 展开说明：先动界面（跟手），再把选择存进 Host。 */
  const toggleDocs = useCallback(async () => {
    const next = !hideDocs
    setHideDocs(next)
    setBusy('docs')
    setMessage(null)
    try {
      const response = await fetch(`${API_BASE}/ui-prefs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hideDocs: next }),
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string; ui?: { hideDocs?: boolean } }
      if (payload.ok !== true) throw new Error(payload.error ?? `HTTP ${response.status}`)
      if (aliveRef.current && typeof payload.ui?.hideDocs === 'boolean') setHideDocs(payload.ui.hideDocs)
    } catch (error) {
      if (aliveRef.current) {
        setHideDocs(!next)
        setMessage({
          kind: 'error',
          text: fill(t('docsFailed'), { error: error instanceof Error ? error.message : String(error) }),
        })
      }
    } finally {
      if (aliveRef.current) setBusy(null)
    }
  }, [hideDocs, t])

  /** 弹出系统文件夹选择框 → 把结果存进 Host。 */
  const chooseLocation = useCallback(async () => {
    if (pick === undefined) {
      setMessage({ kind: 'error', text: t('pickerUnavailable') })
      return
    }
    setBusy('dir')
    setMessage(null)
    try {
      const picked = await pick()
      // 用户按了取消：什么都不做，也不要弹“失败”。
      if (picked === null) return
      const response = await fetch(`${API_BASE}/output-dir`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outputDir: picked }),
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string }
      if (payload.ok !== true) throw new Error(payload.error ?? `HTTP ${response.status}`)
      await refresh()
      if (aliveRef.current) setMessage({ kind: 'ok', text: t('locationSaved') })
    } catch (error) {
      if (aliveRef.current) {
        setMessage({
          kind: 'error',
          text: fill(t('locationFailed'), { error: error instanceof Error ? error.message : String(error) }),
        })
      }
    } finally {
      if (aliveRef.current) setBusy(null)
    }
  }, [pick, refresh, t])

  const resetLocation = useCallback(async () => {
    setBusy('dir')
    setMessage(null)
    try {
      const response = await fetch(`${API_BASE}/output-dir`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outputDir: '' }),
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string }
      if (payload.ok !== true) throw new Error(payload.error ?? `HTTP ${response.status}`)
      await refresh()
      if (aliveRef.current) setMessage({ kind: 'ok', text: t('locationReset') })
    } catch (error) {
      if (aliveRef.current) {
        setMessage({
          kind: 'error',
          text: fill(t('locationFailed'), { error: error instanceof Error ? error.message : String(error) }),
        })
      }
    } finally {
      if (aliveRef.current) setBusy(null)
    }
  }, [refresh, t])

  const configured = status?.configured === true
  const sourceText =
    status === null
      ? ''
      : status.source === 'env'
        ? `${t('sourceEnv')} ${status.envName ?? ''}`.trim()
        : status.source === 'file'
          ? t('sourceFile')
          : ''
  const signupUrl = status?.provider.signupUrl ?? FALLBACK_SIGNUP_URL
  const model = status?.provider.model ?? 'Kwai-Kolors/Kolors'
  const busyAny = busy !== null

  return (
    <div className="kfi">
      <div className="kfi-head">
        <div className="kfi-title">
          <span className="kfi-mark" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
              <path d="M21 15l-4.5-4.5L7 20" />
            </svg>
          </span>
          {t('title')}
        </div>
        <div className="kfi-headRight">
          <button
            className="kfi-btn kfi-docsBtn"
            data-variant="ghost"
            data-size="sm"
            type="button"
            aria-expanded={!hideDocs}
            title={hideDocs ? t('showDocsTitle') : t('hideDocsTitle')}
            disabled={busyAny}
            onClick={() => {
              if (busyAny) return
              void toggleDocs()
            }}
          >
            {hideDocs ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 15l6-6 6 6" />
              </svg>
            )}
            {hideDocs ? t('showDocs') : t('hideDocs')}
          </button>
          <span className="kfi-badge" data-on={configured ? 'true' : 'false'}>
            {configured ? `✅ ${t('configured')}` : `⚠️ ${t('notConfigured')}`}
          </span>
        </div>
      </div>

      <div>
        <p className="kfi-hint">
          {t('hint')}
          <a className="kfi-link" href={signupUrl} target="_blank" rel="noreferrer noopener">
            {t('link')}
          </a>
        </p>
        <p className="kfi-signupNote">{t('signupNote')}</p>
      </div>

      <form
        className="kfi-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (busyAny) return
          void submitKey(draft)
        }}
      >
        <input
          className="kfi-input"
          type="password"
          name="api-free-image-key"
          autoComplete="new-password"
          spellCheck={false}
          placeholder={configured && status ? status.maskedKey : t('placeholder')}
          value={draft}
          disabled={busyAny}
          onChange={(event) => setDraft(event.currentTarget.value)}
          aria-label={t('title')}
        />
        <button className="kfi-btn" data-variant="primary" type="submit" disabled={busyAny || draft.trim() === ''}>
          {busy === 'key' ? t('saving') : t('save')}
        </button>
        {status?.source === 'file' ? (
          <button
            className="kfi-btn"
            data-variant="ghost"
            type="button"
            disabled={busyAny}
            onClick={() => {
              if (busyAny) return
              void submitKey('')
            }}
          >
            {t('clear')}
          </button>
        ) : null}
      </form>

      <div className="kfi-loc">
        <span className="kfi-locLabel">{t('saveLocation')}</span>
        <code className="kfi-path" title={status?.output.dir ?? ''}>
          {status === null ? '…' : status.output.dir}
        </code>
        <button
          className="kfi-btn"
          data-variant="ghost"
          data-size="sm"
          type="button"
          disabled={busyAny}
          onClick={() => {
            if (busyAny) return
            void chooseLocation()
          }}
        >
          {busy === 'dir' ? t('picking') : t('changeLocation')}
        </button>
        {status?.output.source === 'custom' ? (
          <button
            className="kfi-btn"
            data-variant="ghost"
            data-size="sm"
            type="button"
            disabled={busyAny}
            onClick={() => {
              if (busyAny) return
              void resetLocation()
            }}
          >
            {t('resetLocation')}
          </button>
        ) : null}
      </div>

      {status !== null ? (
        <div className="kfi-meta">
          {sourceText === '' ? null : <span>{sourceText}</span>}
          <span>
            <b>{model}</b>
          </span>
          <span>
            {fill(t('quota'), {
              today: status.usage.todayCount,
              ipd: status.limits.ipd,
              minute: status.usage.minuteCount,
              ipm: status.limits.ipm,
            })}
          </span>
          <span>{fill(t('remaining'), { remaining: status.usage.remainingToday })}</span>
        </div>
      ) : null}

      <div className="kfi-note">{fill(t('modelNote'), { model })}</div>
      {message !== null ? (
        <div className="kfi-msg" data-kind={message.kind}>
          {message.text}
        </div>
      ) : null}

      <style>{CSS}</style>
    </div>
  )
}

/** DSH Client 侧需要的最小上下文（只声明用到的成员）。 */
interface ClientContext {
  slots: {
    inject(name: string, callback: () => () => void): unknown
    register(registration: Record<string, unknown>, component: unknown): () => void
  }
  locale: {
    register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
    bind(namespace: string): Translate
  }
  effect(callback: () => () => void, label?: string): unknown
  inject(deps: readonly string[], callback: (scoped: ClientContext & { uiWorkspace?: WorkspaceService }) => void): unknown
}

interface WorkspaceService {
  pickDirectory(): Promise<string | null>
}

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(PLUGIN_ID, { zh, en }), `${PLUGIN_ID}: dictionaries`)
  const t = ctx.locale.bind(PLUGIN_ID)

  // uiWorkspace 是可选依赖：没有它就退化成“没有选择器”的提示，卡片其余功能照常。
  let workspace: WorkspaceService | undefined
  ctx.inject(['uiWorkspace'], (scoped) => {
    workspace = scoped.uiWorkspace
  })
  // 桌面端还会挂一个全局挑选器（和官方 directory-picker-native 包读的是同一个），有就优先用。
  const desktopPicker = (
    globalThis as unknown as { __DSH_DIRECTORY_PICKER__?: { pick: () => Promise<string | null> } }
  ).__DSH_DIRECTORY_PICKER__
  const pick = async (): Promise<string | null> => {
    if (desktopPicker !== undefined) return await desktopPicker.pick()
    if (workspace !== undefined) return await workspace.pickDirectory()
    throw new Error(t('pickerUnavailable'))
  }

  ctx.slots.inject('plugins.bundle.config', () =>
    ctx.slots.register(
      {
        name: 'plugins.bundle.config',
        key: PLUGIN_ID,
        locale: PLUGIN_ID,
        inject: () => ({ t, pick }),
      },
      (ownerProps: { view?: 'summary' | 'page' } = {}) =>
        ownerProps.view === 'summary' ? null : <ApiFreeImageCard t={t} pick={pick} />,
    ),
  )
}
