/**
 * dsh-api-free-image · 核心
 *
 * 纯 Node.js，无第三方运行时依赖。这一层只做与平台无关的四件事：
 *   1. 本地配额（IPM / IPD）记账；
 *   2. API Key 的存取（设置卡片写入的配置文件 + 环境变量兜底）；
 *   3. 输出目录（默认系统的「我的图片」，可改成任意目录）；
 *   4. 出图流水线：组装请求 → 抓图 → 落盘 → 记账。
 *
 * 平台差异（接口地址、模型名、错误话术）全部关在 src/providers/ 里，
 * 这里只通过 ImageProvider 接口与它们打交道。
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { CONFIG_FILE_NAME, PLUGIN_ID, USAGE_FILE_NAME } from './config.js'
import { ImageGenError, errorMessage } from './errors.js'
import { getProvider } from './providers/index.js'
import type { ImageProvider } from './providers/types.js'

/** 每分钟最多几次调用。 */
export const RATE_LIMIT_IPM = 2
/** 每天最多几次调用。 */
export const RATE_LIMIT_IPD = 400

/** 老版本（v1.0.0，还叫硅基流动免费生图时）的数据目录，只用于迁移。 */
const LEGACY_DATA_DIR_NAME = 'siliconflow'
const LEGACY_KEY_FILE = 'api-key.json'
const LEGACY_USAGE_FILE = 'usage.json'

export interface PluginPaths {
  readonly home: string
  readonly dataDir: string
  readonly configFile: string
  readonly usageFile: string
  readonly legacyDataDir: string
  /** 用户没设置时的默认输出根目录：系统的「我的图片」。 */
  readonly defaultOutputDir: string
}

export function pluginPaths(): PluginPaths {
  const home = os.homedir()
  const dataDir = path.join(home, '.dsh', PLUGIN_ID)
  return {
    home,
    dataDir,
    configFile: path.join(dataDir, CONFIG_FILE_NAME),
    usageFile: path.join(dataDir, USAGE_FILE_NAME),
    legacyDataDir: path.join(home, '.dsh', LEGACY_DATA_DIR_NAME),
    defaultOutputDir: path.join(home, 'Pictures'),
  }
}

/** 本地日期（不是 UTC）：跨时区/凌晨出图时目录名才不会错一天。 */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function readJsonFile(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

/** 先写临时文件再改名，避免半截 JSON 把配置/账本弄坏。 */
async function writeJsonFile(file: string, value: unknown, mode?: number): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  // 临时名带随机后缀：并发出图时两个写入者不会抢同一个临时文件。
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  if (mode !== undefined) {
    try {
      await fs.chmod(tmp, mode)
    } catch {
      // Windows 上 chmod 基本无效，忽略即可。
    }
  }
  try {
    await fs.rename(tmp, file)
  } catch (error) {
    // Windows 上 rename 偶尔会死在“目标正被占用”，退一步：拷贝内容再删临时文件。
    try {
      await fs.copyFile(tmp, file)
      await fs.rm(tmp, { force: true })
    } catch {
      await fs.rm(tmp, { force: true })
      throw error
    }
  }
}

/**
 * 进程内串行化：配置与账本都是「读 → 改 → 写」，
 * 两个工具调用并发时（DSH 并行工具 / MCP 并发请求）必须排队，否则会丢计数。
 */
let writeChain: Promise<unknown> = Promise.resolve()
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeChain.then(operation, operation)
  writeChain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

// ---------------------------------------------------------------------------
// 配置文件：输出目录 + 各平台的 API Key
// ---------------------------------------------------------------------------

export interface ProviderKeyRecord {
  apiKey: string
  savedAt?: string
}

/** 纯界面偏好（不改生图行为，只是记着用户把界面调成了什么样）。 */
export interface UiSettings {
  /** true = 插件页那段说明（README）收起，下次进来还收起。 */
  hideDocs?: boolean
}

export interface StoredConfig {
  version: 1
  /** 用户自定义的图片根目录；缺省/null 表示用系统「我的图片」。 */
  outputDir?: string | null
  /** 界面偏好。 */
  ui?: UiSettings
  providers: Record<string, ProviderKeyRecord>
}

function normalizeConfig(raw: unknown): StoredConfig {
  const config: StoredConfig = { version: 1, providers: {} }
  if (!isRecord(raw)) return config
  if (typeof raw.outputDir === 'string' && raw.outputDir.trim() !== '') {
    config.outputDir = raw.outputDir.trim()
  }
  const ui = raw.ui
  if (isRecord(ui)) {
    const settings: UiSettings = {}
    if (typeof ui.hideDocs === 'boolean') settings.hideDocs = ui.hideDocs
    if (Object.keys(settings).length > 0) config.ui = settings
  }
  const providers = raw.providers
  if (isRecord(providers)) {
    for (const [id, value] of Object.entries(providers)) {
      if (!isRecord(value)) continue
      const apiKey = value.apiKey
      if (typeof apiKey === 'string' && apiKey.trim() !== '') {
        const record: ProviderKeyRecord = { apiKey: apiKey.trim() }
        if (typeof value.savedAt === 'string') record.savedAt = value.savedAt
        config.providers[id] = record
      }
    }
  }
  return config
}

/** 读配置；老版本目录里的 Key 会自动迁移进来（只在新配置文件不存在时）。 */
async function readStoredConfig(): Promise<StoredConfig> {
  const paths = pluginPaths()
  const raw = await readJsonFile(paths.configFile)
  if (raw !== undefined) return normalizeConfig(raw)

  const config: StoredConfig = { version: 1, providers: {} }
  const legacyKey = await readJsonFile(path.join(paths.legacyDataDir, LEGACY_KEY_FILE))
  if (isRecord(legacyKey) && typeof legacyKey.apiKey === 'string' && legacyKey.apiKey.trim() !== '') {
    const record: ProviderKeyRecord = { apiKey: legacyKey.apiKey.trim() }
    if (typeof legacyKey.savedAt === 'string') record.savedAt = legacyKey.savedAt
    config.providers.siliconflow = record
  }
  return config
}

async function writeStoredConfig(config: StoredConfig): Promise<void> {
  await writeJsonFile(pluginPaths().configFile, config, 0o600)
}

// ---------------------------------------------------------------------------
// 界面偏好（说明收起状态）
// ---------------------------------------------------------------------------

/** 卡片按钮读的状态：说明现在是收起还是展开。 */
export interface UiPrefs {
  readonly hideDocs: boolean
}

export async function readUiPrefs(): Promise<UiPrefs> {
  const config = await readStoredConfig()
  return { hideDocs: config.ui?.hideDocs === true }
}

/**
 * 记下「说明是收起还是展开」。
 *
 * 存进同一份 config.json（跟 Key、保存位置一起），所以关掉 DSH 再开、
 * 换了端口、换了会话，都还记得。
 */
export async function setUiPrefs(patch: { hideDocs?: boolean }): Promise<UiPrefs> {
  return await serialize(async () => {
    const config = await readStoredConfig()
    const settings: UiSettings = { ...(config.ui ?? {}) }
    if (typeof patch.hideDocs === 'boolean') settings.hideDocs = patch.hideDocs
    if (Object.keys(settings).length > 0) config.ui = settings
    else delete config.ui
    await writeStoredConfig(config)
    return { hideDocs: config.ui?.hideDocs === true }
  })
}

// ---------------------------------------------------------------------------
// 输出目录
// ---------------------------------------------------------------------------

export type OutputDirSource = 'default' | 'custom'

export interface OutputDirState {
  readonly dir: string
  readonly source: OutputDirSource
  readonly defaultDir: string
  /** 当天图片会落在哪。 */
  readonly todayImageDir: string
}

function buildOutputState(dir: string, source: OutputDirSource, now: number): OutputDirState {
  return {
    dir,
    source,
    defaultDir: pluginPaths().defaultOutputDir,
    todayImageDir: path.join(dir, localDateKey(new Date(now))),
  }
}

export async function readOutputDir(now: number = Date.now()): Promise<OutputDirState> {
  const config = await readStoredConfig()
  const custom = config.outputDir
  if (typeof custom === 'string' && custom !== '') return buildOutputState(custom, 'custom', now)
  return buildOutputState(pluginPaths().defaultOutputDir, 'default', now)
}

/** 明确不该拿来存图片的位置：盘符根目录、Windows 目录、Program Files。 */
function forbiddenOutputDirReason(resolved: string): string | undefined {
  const parsed = path.parse(resolved)
  if (resolved === parsed.root) {
    return `❌ 不能直接用盘符根目录（${resolved}），请选一个子文件夹。`
  }
  // Windows 路径大小写不敏感，比较前一律 toLowerCase（否则 C:\Windows 挡不住 C:\WINDOWS）。
  const fold = (value: string): string => (process.platform === 'win32' ? value.toLowerCase() : value)
  const target = fold(path.normalize(resolved))
  const protectedRoots = [
    process.env['WINDIR'] ?? process.env['SystemRoot'],
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
  ]
  for (const root of protectedRoots) {
    if (root === undefined || root.trim() === '') continue
    const normalizedRoot = fold(path.normalize(root))
    const withSep = normalizedRoot.endsWith(path.sep) ? normalizedRoot : `${normalizedRoot}${path.sep}`
    if (target === normalizedRoot || target.startsWith(withSep)) {
      return `❌ 这是系统目录，不能往这里存图片：${resolved}`
    }
  }
  return undefined
}

/**
 * 设置输出目录。传空字符串 = 恢复默认（系统「我的图片」）。
 *
 * 会先建目录并试写一个探针文件，避免等到出图那一刻才发现目录不可写。
 */
export async function setOutputDir(input: string, now: number = Date.now()): Promise<OutputDirState> {
  const trimmed = input.trim()

  if (trimmed === '') {
    return await serialize(async () => {
      const config = await readStoredConfig()
      delete config.outputDir
      await writeStoredConfig(config)
      return buildOutputState(pluginPaths().defaultOutputDir, 'default', now)
    })
  }

  if (trimmed.includes('\0')) {
    throw new ImageGenError('BAD_OUTPUT_DIR', '❌ 路径里含有非法字符。')
  }
  if (!path.isAbsolute(trimmed)) {
    throw new ImageGenError('BAD_OUTPUT_DIR', `❌ 保存位置必须是绝对路径（收到 "${trimmed}"）。`)
  }

  const resolved = path.normalize(trimmed)
  const forbidden = forbiddenOutputDirReason(resolved)
  if (forbidden !== undefined) throw new ImageGenError('BAD_OUTPUT_DIR', forbidden)

  try {
    await fs.mkdir(resolved, { recursive: true })
    const stat = await fs.stat(resolved)
    if (!stat.isDirectory()) {
      throw new ImageGenError('BAD_OUTPUT_DIR', `❌ 这个路径已经存在，但不是文件夹：${resolved}`)
    }
    const probe = path.join(resolved, `.${PLUGIN_ID}-write-test`)
    await fs.writeFile(probe, 'ok', 'utf8')
    await fs.rm(probe, { force: true })
  } catch (error) {
    if (error instanceof ImageGenError) throw error
    throw new ImageGenError(
      'BAD_OUTPUT_DIR',
      `❌ 这个文件夹不能用：${resolved}\n原因：${errorMessage(error)}\n` +
        '（是不是没有写权限？换个目录，或先手动创建它。）',
    )
  }

  // 目录验证在锁外做（慢），落盘配置在锁内做（防并发丢字段）。
  return await serialize(async () => {
    const config = await readStoredConfig()
    config.outputDir = resolved
    await writeStoredConfig(config)
    return buildOutputState(resolved, 'custom', now)
  })
}

// ---------------------------------------------------------------------------
// API Key
// ---------------------------------------------------------------------------

export type ApiKeySource = 'file' | 'env' | 'none'

export interface ApiKeyState {
  readonly configured: boolean
  readonly source: ApiKeySource
  /** 形如 sk-abcdef****wxyz，只用于展示。 */
  readonly masked: string
  readonly keyFile: string
  readonly envName: string
}

export function maskKey(key: string): string {
  const trimmed = key.trim()
  if (trimmed.length <= 8) return '****'
  return `${trimmed.slice(0, 6)}****${trimmed.slice(-4)}`
}

/**
 * 解析某个平台当前生效的 Key。
 * 顺序：设置卡片写的配置 → 该平台的环境变量。
 * （显式在界面里保存过的，优先于机器上可能遗留的环境变量。）
 */
export async function resolveApiKey(
  provider: ImageProvider = getProvider(),
): Promise<{ apiKey: string | undefined; source: ApiKeySource }> {
  const config = await readStoredConfig()
  const stored = config.providers[provider.id]
  if (stored !== undefined && stored.apiKey.trim() !== '') {
    return { apiKey: stored.apiKey.trim(), source: 'file' }
  }
  const fromEnv = process.env[provider.apiKeyEnv]?.trim()
  if (fromEnv !== undefined && fromEnv !== '') return { apiKey: fromEnv, source: 'env' }
  return { apiKey: undefined, source: 'none' }
}

export async function readApiKeyState(provider: ImageProvider = getProvider()): Promise<ApiKeyState> {
  const { apiKey, source } = await resolveApiKey(provider)
  return {
    configured: apiKey !== undefined,
    source,
    masked: apiKey === undefined ? '' : maskKey(apiKey),
    keyFile: pluginPaths().configFile,
    envName: provider.apiKeyEnv,
  }
}

/** 保存 Key；传空字符串等于清除。 */
export async function writeApiKey(input: string, provider: ImageProvider = getProvider()): Promise<ApiKeyState> {
  const trimmed = input.trim()
  if (trimmed === '') return clearApiKey(provider)
  if (trimmed.length < 16 || trimmed.length > 256) {
    throw new ImageGenError('BAD_API_KEY', '❌ API Key 长度不对，一般以 sk- 开头、长度 40 位左右。')
  }
  if (!/^[\x21-\x7e]+$/.test(trimmed)) {
    throw new ImageGenError('BAD_API_KEY', '❌ API Key 里含有空格或非 ASCII 字符，请重新复制粘贴。')
  }
  return await serialize(async () => {
    const config = await readStoredConfig()
    config.providers[provider.id] = { apiKey: trimmed, savedAt: new Date().toISOString() }
    await writeStoredConfig(config)
    return readApiKeyState(provider)
  })
}

export async function clearApiKey(provider: ImageProvider = getProvider()): Promise<ApiKeyState> {
  return await serialize(async () => {
    const config = await readStoredConfig()
    delete config.providers[provider.id]
    await writeStoredConfig(config)
    return readApiKeyState(provider)
  })
}

// ---------------------------------------------------------------------------
// 用量（IPM / IPD）
// ---------------------------------------------------------------------------

export interface UsageSnapshot {
  readonly providerId: string
  readonly date: string
  readonly todayCount: number
  readonly minuteCount: number
  readonly ipm: number
  readonly ipd: number
  readonly remainingToday: number
}

interface UsageEntry {
  date: string
  count: number
  timestamps: number[]
  updatedAt?: string
}

interface UsageStore {
  version: 2
  providers: Record<string, UsageEntry>
}

const MINUTE_MS = 60_000

function normalizeUsageEntry(raw: unknown, today: string, now: number): UsageEntry {
  const entry: UsageEntry = { date: today, count: 0, timestamps: [] }
  if (!isRecord(raw)) return entry
  if (raw.date !== today) return entry
  if (typeof raw.count === 'number' && Number.isFinite(raw.count) && raw.count >= 0) {
    entry.count = Math.floor(raw.count)
  }
  const list = Array.isArray(raw.timestamps) ? raw.timestamps : []
  entry.timestamps = list
    .filter((t): t is number => typeof t === 'number' && Number.isFinite(t))
    .filter((t) => now - t < MINUTE_MS && t <= now + MINUTE_MS)
  return entry
}

/** 读账本；老版本（单平台）的 usage.json 会自动迁移到默认平台名下。 */
async function readUsageStore(now: number): Promise<UsageStore> {
  const paths = pluginPaths()
  const raw = await readJsonFile(paths.usageFile)
  const store: UsageStore = { version: 2, providers: {} }
  if (raw !== undefined) {
    if (isRecord(raw) && isRecord(raw.providers)) {
      for (const [id, entry] of Object.entries(raw.providers)) {
        if (isRecord(entry)) store.providers[id] = entry as unknown as UsageEntry
      }
    }
    return store
  }

  const legacy = await readJsonFile(path.join(paths.legacyDataDir, LEGACY_USAGE_FILE))
  if (isRecord(legacy)) {
    const timestamps = Array.isArray(legacy.timestamps)
      ? legacy.timestamps
      : Array.isArray(legacy.lastMinuteTimestamps)
        ? legacy.lastMinuteTimestamps
        : []
    store.providers.siliconflow = {
      date: typeof legacy.date === 'string' ? legacy.date : localDateKey(new Date(now)),
      count: typeof legacy.count === 'number' ? legacy.count : 0,
      timestamps: timestamps.filter((t): t is number => typeof t === 'number'),
    }
  }
  return store
}

export async function readUsageSnapshot(providerId: string, now: number = Date.now()): Promise<UsageSnapshot> {
  const store = await readUsageStore(now)
  const today = localDateKey(new Date(now))
  const entry = normalizeUsageEntry(store.providers[providerId], today, now)
  return {
    providerId,
    date: today,
    todayCount: entry.count,
    minuteCount: entry.timestamps.length,
    ipm: RATE_LIMIT_IPM,
    ipd: RATE_LIMIT_IPD,
    remainingToday: Math.max(0, RATE_LIMIT_IPD - entry.count),
  }
}

/** 超限直接抛错阻断请求（不会发到平台）。 */
export async function assertQuota(providerId: string, now: number = Date.now()): Promise<UsageSnapshot> {
  const snapshot = await readUsageSnapshot(providerId, now)
  if (snapshot.minuteCount >= snapshot.ipm) {
    throw new ImageGenError(
      'RATE_LIMIT_IPM',
      `⏳ 本分钟已经出过 ${snapshot.ipm} 张（本地限额 IPM=${snapshot.ipm}），请等一分钟再来。`,
    )
  }
  if (snapshot.todayCount >= snapshot.ipd) {
    throw new ImageGenError(
      'RATE_LIMIT_IPD',
      `⛔ 今日额度已用完（${snapshot.todayCount}/${snapshot.ipd} 张，IPD=${snapshot.ipd}），明天 0 点重置。`,
    )
  }
  return snapshot
}

/** 成功出图后才记账。并发调用会在这里排队，不会丢计数。 */
export async function recordUsage(providerId: string, now: number = Date.now()): Promise<UsageSnapshot> {
  return await serialize(async () => {
    const store = await readUsageStore(now)
    const today = localDateKey(new Date(now))
    const entry = normalizeUsageEntry(store.providers[providerId], today, now)
    entry.count += 1
    entry.timestamps.push(now)
    entry.timestamps = entry.timestamps.filter((t) => now - t < MINUTE_MS)
    entry.updatedAt = new Date(now).toISOString()
    store.providers[providerId] = entry
    await writeJsonFile(pluginPaths().usageFile, store)
    return readUsageSnapshot(providerId, now)
  })
}

// ---------------------------------------------------------------------------
// 出图
// ---------------------------------------------------------------------------

export interface GenerateInput {
  readonly prompt: string
  /** 1:1 / 3:4 / 4:3 / 9:16 / 16:9；imageSize 存在时被覆盖。 */
  readonly aspectRatio?: string | undefined
  /** 直接指定 "宽x高"（例如 1024x1536），覆盖 aspectRatio。 */
  readonly imageSize?: string | undefined
  readonly negativePrompt?: string | undefined
}

export interface GenerateResult {
  readonly filePath: string
  readonly imageUrl: string
  readonly imageSize: string
  readonly model: string
  readonly providerId: string
  readonly elapsedMs: number
  readonly usage: UsageSnapshot
  readonly outputDir: string
}

const MAX_IMAGE_SIDE = 2048
const MIN_IMAGE_SIDE = 256

/** image_size 覆盖 aspect_ratio；两者都没有时取该平台的 1:1（缺省 1024x1024）。 */
export function resolveImageSize(
  input: Pick<GenerateInput, 'aspectRatio' | 'imageSize'>,
  provider: ImageProvider = getProvider(),
): string {
  const explicit = input.imageSize?.trim()
  if (explicit !== undefined && explicit !== '') {
    const match = /^(\d{2,4})\s*[x×*]\s*(\d{2,4})$/i.exec(explicit)
    if (match === null) {
      throw new ImageGenError(
        'BAD_IMAGE_SIZE',
        `❌ image_size 格式不对（收到 "${explicit}"）。请写成 "宽x高"，例如 1024x1024、768x1024。`,
      )
    }
    const width = Number(match[1])
    const height = Number(match[2])
    if (width < MIN_IMAGE_SIDE || height < MIN_IMAGE_SIDE || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
      throw new ImageGenError(
        'BAD_IMAGE_SIZE',
        `❌ image_size 超出范围（${width}x${height}）。宽高都要在 ${MIN_IMAGE_SIDE}~${MAX_IMAGE_SIDE} 之间。`,
      )
    }
    return `${width}x${height}`
  }
  const ratio = input.aspectRatio?.trim()
  const ratios = provider.aspectRatios
  if (ratio === undefined || ratio === '') return ratios['1:1'] ?? '1024x1024'
  const mapped = ratios[ratio]
  if (mapped === undefined) {
    throw new ImageGenError(
      'BAD_ASPECT_RATIO',
      `❌ aspect_ratio 只支持 ${Object.keys(ratios).join(' / ')}（收到 "${ratio}"）。` +
        '也可以直接用 image_size 指定像素。',
    )
  }
  return mapped
}

const EXT_BY_MIME: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
}

function extensionFor(contentType: string | null, url: string): string {
  if (contentType !== null) {
    const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
    const known = EXT_BY_MIME[mime]
    if (known !== undefined) return known
  }
  const fromUrl = /\.(png|jpe?g|webp)(?:\?|#|$)/i.exec(url)?.[1]?.toLowerCase()
  if (fromUrl === 'jpeg') return 'jpg'
  return fromUrl ?? 'png'
}

async function postGeneration(
  provider: ImageProvider,
  apiKey: string,
  input: Parameters<ImageProvider['buildRequest']>[0],
  signal: AbortSignal,
): Promise<string> {
  const request = provider.buildRequest(input, apiKey)
  let response: Response
  try {
    response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal,
    })
  } catch (error) {
    if (signal.aborted) throw new ImageGenError('ABORTED', '⏹ 已取消出图。')
    throw new ImageGenError(
      'NETWORK',
      `🌐 连不上服务端（${request.url}）：${errorMessage(error)}。检查网络或代理后再试。`,
    )
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const translated = provider.translateHttpError(response.status, text)
    if (translated !== undefined) throw translated
    throw new ImageGenError('HTTP_ERROR', `❌ 请求失败：HTTP ${response.status}。`)
  }

  const payload: unknown = await response.json().catch(() => undefined)
  return provider.parseImageUrl(payload)
}

async function downloadImage(url: string, signal: AbortSignal): Promise<{ buffer: Buffer; ext: string }> {
  let response: Response
  try {
    response = await fetch(url, { signal })
  } catch (error) {
    if (signal.aborted) throw new ImageGenError('ABORTED', '⏹ 已取消下载图片。')
    throw new ImageGenError(
      'DOWNLOAD',
      `🌐 图片生成成功，但下载失败：${errorMessage(error)}。图片地址：${url}`,
    )
  }
  if (!response.ok) {
    throw new ImageGenError('DOWNLOAD', `🌐 图片下载失败（HTTP ${response.status}）。图片地址：${url}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength === 0) {
    throw new ImageGenError('DOWNLOAD', `🌐 图片下载回来是空文件。图片地址：${url}`)
  }
  return { buffer, ext: extensionFor(response.headers.get('content-type'), url) }
}

/**
 * 生成一张图。
 *
 * 参数只有四个：prompt / aspect_ratio / image_size / negative_prompt；
 * model 不给外部改，永远用 provider 里写死的免费模型。
 */
export async function generateImage(
  input: GenerateInput,
  options: { signal?: AbortSignal; now?: number; providerId?: string } = {},
): Promise<GenerateResult> {
  const provider = getProvider(options.providerId)

  const prompt = input.prompt?.trim()
  if (prompt === undefined || prompt === '') {
    throw new ImageGenError('BAD_PROMPT', '❌ prompt 不能为空，用一句话描述你想要的画面。')
  }
  if (prompt.length > 2000) {
    throw new ImageGenError('BAD_PROMPT', '❌ prompt 太长了（超过 2000 字符），精简一下。')
  }

  const { apiKey } = await resolveApiKey(provider)
  if (apiKey === undefined) {
    throw new ImageGenError(
      'NO_API_KEY',
      '🔑 还没配置 API Key。请打开 DSH 设置 → 插件 → API免费生图 填写 Key，' +
        `或设置环境变量 ${provider.apiKeyEnv}。注册地址：${provider.signupUrl}`,
    )
  }

  const imageSize = resolveImageSize(input, provider)
  const startedAt = Date.now()
  const now = options.now ?? startedAt

  // 先查本地限额，超限就地拦下，绝不把请求发给对方。
  await assertQuota(provider.id, now)

  // 再确认输出目录可用：不要等图出来了才发现写不进去。
  const output = await readOutputDir(now)
  await fs.mkdir(output.todayImageDir, { recursive: true }).catch((error: unknown) => {
    throw new ImageGenError(
      'BAD_OUTPUT_DIR',
      `❌ 保存目录不可写：${output.todayImageDir}\n原因：${errorMessage(error)}`,
    )
  })

  const outer = new AbortController()
  const onAbort = (): void => outer.abort()
  options.signal?.addEventListener('abort', onAbort, { once: true })
  const timeout = setTimeout(() => outer.abort(), 180_000)

  try {
    const negative = input.negativePrompt?.trim()
    const url = await postGeneration(
      provider,
      apiKey,
      {
        prompt,
        imageSize,
        aspectRatio: input.aspectRatio,
        negativePrompt: negative === undefined || negative === '' ? undefined : negative,
      },
      outer.signal,
    )
    const { buffer, ext } = await downloadImage(url, outer.signal)

    const filePath = path.join(output.todayImageDir, `img_${Date.now()}.${ext}`)
    await fs.writeFile(filePath, buffer)

    const usage = await recordUsage(provider.id, now)

    return {
      filePath,
      imageUrl: url,
      imageSize,
      model: provider.defaultModel,
      providerId: provider.id,
      elapsedMs: Date.now() - startedAt,
      usage,
      outputDir: output.dir,
    }
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', onAbort)
  }
}

// ---------------------------------------------------------------------------
// 状态（只读本地，不联网）
// ---------------------------------------------------------------------------

export interface StatusReport {
  readonly provider: {
    readonly id: string
    readonly label: string
    readonly model: string
    readonly signupUrl: string
  }
  readonly apiKey: ApiKeyState
  readonly usage: UsageSnapshot
  readonly limits: { readonly ipm: number; readonly ipd: number }
  readonly output: OutputDirState
  readonly paths: {
    readonly usageFile: string
    readonly configFile: string
  }
}

/** check_status 的实现：只查本地凭据 + 账本 + 输出目录，绝不 probe 网络。 */
export async function readStatus(providerId?: string, now: number = Date.now()): Promise<StatusReport> {
  const provider = getProvider(providerId)
  const [apiKey, usage, output] = await Promise.all([
    readApiKeyState(provider),
    readUsageSnapshot(provider.id, now),
    readOutputDir(now),
  ])
  const paths = pluginPaths()
  return {
    provider: {
      id: provider.id,
      label: provider.label,
      model: provider.defaultModel,
      signupUrl: provider.signupUrl,
    },
    apiKey,
    usage,
    limits: { ipm: RATE_LIMIT_IPM, ipd: RATE_LIMIT_IPD },
    output,
    paths: { usageFile: paths.usageFile, configFile: paths.configFile },
  }
}

/** 把状态渲染成人读的几行中文（工具输出 / CLI 共用）。 */
export function formatStatus(report: StatusReport): string {
  const { apiKey, usage, output } = report
  const keyLine = apiKey.configured
    ? `🔑 API Key：已配置（${
        apiKey.source === 'env' ? '环境变量 ' + apiKey.envName : '来自设置卡片'
      }，${apiKey.masked}）`
    : '🔑 API Key：未配置 —— 打开 DSH 设置 → 插件 → API免费生图 填入 Key'
  return [
    keyLine,
    `🤖 当前模型：${report.provider.model}（写死，不可更换，避免误调收费模型）`,
    `📅 今日 ${usage.date}：${usage.todayCount}/${usage.ipd} 张`,
    `⏱ 本分钟：${usage.minuteCount}/${usage.ipm} 张`,
    `📁 保存位置：${output.dir}${output.source === 'default' ? '（默认：系统的「我的图片」）' : '（自定义）'}`,
    `🗂 今日目录：${output.todayImageDir}`,
  ].join('\n')
}
