/* 由 scripts/build.mjs 生成，请改 src/ 下的源码后重新 build */

// src/config.ts
var PLUGIN_ID = "dsh-api-free-image";
var PLUGIN_DISPLAY_NAME = "API免费生图";
var SIGNUP_URL = "https://cloud.siliconflow.cn/account/ak";
var DEFAULT_PROVIDER_ID = "siliconflow";
var CONFIG_FILE_NAME = "config.json";
var USAGE_FILE_NAME = "usage.json";

// src/core.ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// src/errors.ts
var ImageGenError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "ImageGenError";
    this.code = code;
  }
};
function isImageGenError(error) {
  return error instanceof ImageGenError;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/providers/siliconflow.ts
var API_ENDPOINT = "https://api.siliconflow.cn/v1/images/generations";
var FREE_MODEL = "Kwai-Kolors/Kolors";
var ASPECT_RATIO_SIZES = {
  "1:1": "1024x1024",
  "3:4": "768x1024",
  "4:3": "1024x768",
  "9:16": "576x1024",
  "16:9": "1024x576"
};
function extractApiMessage(bodyText) {
  const text = bodyText.trim();
  if (text === "") return void 0;
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed;
      for (const candidate of [record.message, record.msg, record.error, record.detail]) {
        if (typeof candidate === "string" && candidate.trim() !== "") return candidate.trim().slice(0, 300);
        if (typeof candidate === "object" && candidate !== null) {
          const nested = candidate.message;
          if (typeof nested === "string") return nested.slice(0, 300);
        }
      }
    }
  } catch {
  }
  return text.slice(0, 300);
}
var siliconflowProvider = {
  id: "siliconflow",
  label: "硅基流动",
  defaultModel: FREE_MODEL,
  apiKeyEnv: "SILICONFLOW_API_KEY",
  signupUrl: SIGNUP_URL,
  aspectRatios: ASPECT_RATIO_SIZES,
  ignoredParams: [
    "num_images",
    "seed",
    "output_format",
    "num_inference_steps",
    "guidance_scale",
    "batch_size"
  ],
  buildRequest(input, apiKey) {
    const body = {
      model: FREE_MODEL,
      prompt: input.prompt,
      image_size: input.imageSize
    };
    if (input.negativePrompt !== void 0 && input.negativePrompt !== "") {
      body.negative_prompt = input.negativePrompt;
    }
    return {
      url: API_ENDPOINT,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "dsh-api-free-image"
      },
      body
    };
  },
  parseImageUrl(payload) {
    const images = typeof payload === "object" && payload !== null ? payload.images : void 0;
    const first = Array.isArray(images) ? images[0] : void 0;
    const url = typeof first === "object" && first !== null ? first.url : void 0;
    if (typeof url !== "string" || url === "") {
      const raw = JSON.stringify(payload)?.slice(0, 400) ?? "(空响应)";
      throw new ImageGenError("BAD_RESPONSE", `❌ 接口返回里没有图片地址，原始响应：${raw}`);
    }
    return url;
  },
  translateHttpError(status, bodyText) {
    const detail = extractApiMessage(bodyText);
    const suffix = detail === void 0 ? "" : `
服务端原文：${detail}`;
    switch (status) {
      case 401:
        return new ImageGenError(
          "HTTP_401",
          "❌ API Key 无效或已失效（401）。请在 DSH 设置 → 插件 → API免费生图 卡片里重新填写 Key，或检查对应的环境变量。" + suffix
        );
      case 402:
        return new ImageGenError(
          "HTTP_402",
          "💸 余额不足（402）。硅基流动即使跑免费模型也要求账户余额 ≥ 0（新号赠送额度扣完就会 402）。去计费页充 ¥1 就能继续用。" + suffix
        );
      case 429:
        return new ImageGenError(
          "HTTP_429",
          "⏳ 触发官方限速（429）。免费模型大约 2 张/分钟，请等 1 分钟再试。（本插件自带 IPM=2 的本地限额，正常不会先撞到官方限速。）" + suffix
        );
      case 403:
        return new ImageGenError(
          "HTTP_403",
          "⛔ 没有权限（403）。请确认账号已开通该模型服务，且 Key 属于该账号。" + suffix
        );
      case 400:
      case 422:
        return new ImageGenError(
          "HTTP_400",
          `🙅 请求被拒绝（${status}）：提示词或尺寸不合规，换一种说法再试。` + suffix
        );
      default:
        if (status >= 500) {
          return new ImageGenError(
            "HTTP_5XX",
            `🛠 服务端出错（${status}），通常是对方的临时故障，过几分钟再试。` + suffix
          );
        }
        return void 0;
    }
  }
};

// src/providers/index.ts
var REGISTRY = {
  [siliconflowProvider.id]: siliconflowProvider
};
var PROVIDER_IDS = Object.keys(REGISTRY);
function getProvider(id = DEFAULT_PROVIDER_ID) {
  const provider = REGISTRY[id];
  if (provider === void 0) {
    throw new Error(`未知的生图平台：${id}（已注册：${PROVIDER_IDS.join(", ")}）`);
  }
  return provider;
}

// src/core.ts
var RATE_LIMIT_IPM = 2;
var RATE_LIMIT_IPD = 400;
var LEGACY_DATA_DIR_NAME = "siliconflow";
var LEGACY_KEY_FILE = "api-key.json";
var LEGACY_USAGE_FILE = "usage.json";
function pluginPaths() {
  const home = os.homedir();
  const dataDir = path.join(home, ".dsh", PLUGIN_ID);
  return {
    home,
    dataDir,
    configFile: path.join(dataDir, CONFIG_FILE_NAME),
    usageFile: path.join(dataDir, USAGE_FILE_NAME),
    legacyDataDir: path.join(home, ".dsh", LEGACY_DATA_DIR_NAME),
    defaultOutputDir: path.join(home, "Pictures")
  };
}
function localDateKey(date = /* @__PURE__ */ new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
async function readJsonFile(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return void 0;
  }
}
async function writeJsonFile(file, value, mode) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}
`, "utf8");
  if (mode !== void 0) {
    try {
      await fs.chmod(tmp, mode);
    } catch {
    }
  }
  try {
    await fs.rename(tmp, file);
  } catch (error) {
    try {
      await fs.copyFile(tmp, file);
      await fs.rm(tmp, { force: true });
    } catch {
      await fs.rm(tmp, { force: true });
      throw error;
    }
  }
}
var writeChain = Promise.resolve();
function serialize(operation) {
  const next = writeChain.then(operation, operation);
  writeChain = next.then(
    () => void 0,
    () => void 0
  );
  return next;
}
function normalizeConfig(raw) {
  const config = { version: 1, providers: {} };
  if (!isRecord(raw)) return config;
  if (typeof raw.outputDir === "string" && raw.outputDir.trim() !== "") {
    config.outputDir = raw.outputDir.trim();
  }
  const providers = raw.providers;
  if (isRecord(providers)) {
    for (const [id, value] of Object.entries(providers)) {
      if (!isRecord(value)) continue;
      const apiKey = value.apiKey;
      if (typeof apiKey === "string" && apiKey.trim() !== "") {
        const record = { apiKey: apiKey.trim() };
        if (typeof value.savedAt === "string") record.savedAt = value.savedAt;
        config.providers[id] = record;
      }
    }
  }
  return config;
}
async function readStoredConfig() {
  const paths = pluginPaths();
  const raw = await readJsonFile(paths.configFile);
  if (raw !== void 0) return normalizeConfig(raw);
  const config = { version: 1, providers: {} };
  const legacyKey = await readJsonFile(path.join(paths.legacyDataDir, LEGACY_KEY_FILE));
  if (isRecord(legacyKey) && typeof legacyKey.apiKey === "string" && legacyKey.apiKey.trim() !== "") {
    const record = { apiKey: legacyKey.apiKey.trim() };
    if (typeof legacyKey.savedAt === "string") record.savedAt = legacyKey.savedAt;
    config.providers.siliconflow = record;
  }
  return config;
}
async function writeStoredConfig(config) {
  await writeJsonFile(pluginPaths().configFile, config, 384);
}
function buildOutputState(dir, source, now) {
  return {
    dir,
    source,
    defaultDir: pluginPaths().defaultOutputDir,
    todayImageDir: path.join(dir, localDateKey(new Date(now)))
  };
}
async function readOutputDir(now = Date.now()) {
  const config = await readStoredConfig();
  const custom = config.outputDir;
  if (typeof custom === "string" && custom !== "") return buildOutputState(custom, "custom", now);
  return buildOutputState(pluginPaths().defaultOutputDir, "default", now);
}
function forbiddenOutputDirReason(resolved) {
  const parsed = path.parse(resolved);
  if (resolved === parsed.root) {
    return `❌ 不能直接用盘符根目录（${resolved}），请选一个子文件夹。`;
  }
  const fold = (value) => process.platform === "win32" ? value.toLowerCase() : value;
  const target = fold(path.normalize(resolved));
  const protectedRoots = [
    process.env["WINDIR"] ?? process.env["SystemRoot"],
    process.env["ProgramFiles"],
    process.env["ProgramFiles(x86)"]
  ];
  for (const root of protectedRoots) {
    if (root === void 0 || root.trim() === "") continue;
    const normalizedRoot = fold(path.normalize(root));
    const withSep = normalizedRoot.endsWith(path.sep) ? normalizedRoot : `${normalizedRoot}${path.sep}`;
    if (target === normalizedRoot || target.startsWith(withSep)) {
      return `❌ 这是系统目录，不能往这里存图片：${resolved}`;
    }
  }
  return void 0;
}
async function setOutputDir(input, now = Date.now()) {
  const trimmed = input.trim();
  if (trimmed === "") {
    return await serialize(async () => {
      const config = await readStoredConfig();
      delete config.outputDir;
      await writeStoredConfig(config);
      return buildOutputState(pluginPaths().defaultOutputDir, "default", now);
    });
  }
  if (trimmed.includes("\0")) {
    throw new ImageGenError("BAD_OUTPUT_DIR", "❌ 路径里含有非法字符。");
  }
  if (!path.isAbsolute(trimmed)) {
    throw new ImageGenError("BAD_OUTPUT_DIR", `❌ 保存位置必须是绝对路径（收到 "${trimmed}"）。`);
  }
  const resolved = path.normalize(trimmed);
  const forbidden = forbiddenOutputDirReason(resolved);
  if (forbidden !== void 0) throw new ImageGenError("BAD_OUTPUT_DIR", forbidden);
  try {
    await fs.mkdir(resolved, { recursive: true });
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      throw new ImageGenError("BAD_OUTPUT_DIR", `❌ 这个路径已经存在，但不是文件夹：${resolved}`);
    }
    const probe = path.join(resolved, `.${PLUGIN_ID}-write-test`);
    await fs.writeFile(probe, "ok", "utf8");
    await fs.rm(probe, { force: true });
  } catch (error) {
    if (error instanceof ImageGenError) throw error;
    throw new ImageGenError(
      "BAD_OUTPUT_DIR",
      `❌ 这个文件夹不能用：${resolved}
原因：${errorMessage(error)}
（是不是没有写权限？换个目录，或先手动创建它。）`
    );
  }
  return await serialize(async () => {
    const config = await readStoredConfig();
    config.outputDir = resolved;
    await writeStoredConfig(config);
    return buildOutputState(resolved, "custom", now);
  });
}
function maskKey(key) {
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "****";
  return `${trimmed.slice(0, 6)}****${trimmed.slice(-4)}`;
}
async function resolveApiKey(provider = getProvider()) {
  const config = await readStoredConfig();
  const stored = config.providers[provider.id];
  if (stored !== void 0 && stored.apiKey.trim() !== "") {
    return { apiKey: stored.apiKey.trim(), source: "file" };
  }
  const fromEnv = process.env[provider.apiKeyEnv]?.trim();
  if (fromEnv !== void 0 && fromEnv !== "") return { apiKey: fromEnv, source: "env" };
  return { apiKey: void 0, source: "none" };
}
async function readApiKeyState(provider = getProvider()) {
  const { apiKey, source } = await resolveApiKey(provider);
  return {
    configured: apiKey !== void 0,
    source,
    masked: apiKey === void 0 ? "" : maskKey(apiKey),
    keyFile: pluginPaths().configFile,
    envName: provider.apiKeyEnv
  };
}
async function writeApiKey(input, provider = getProvider()) {
  const trimmed = input.trim();
  if (trimmed === "") return clearApiKey(provider);
  if (trimmed.length < 16 || trimmed.length > 256) {
    throw new ImageGenError("BAD_API_KEY", "❌ API Key 长度不对，一般以 sk- 开头、长度 40 位左右。");
  }
  if (!/^[\x21-\x7e]+$/.test(trimmed)) {
    throw new ImageGenError("BAD_API_KEY", "❌ API Key 里含有空格或非 ASCII 字符，请重新复制粘贴。");
  }
  return await serialize(async () => {
    const config = await readStoredConfig();
    config.providers[provider.id] = { apiKey: trimmed, savedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await writeStoredConfig(config);
    return readApiKeyState(provider);
  });
}
async function clearApiKey(provider = getProvider()) {
  return await serialize(async () => {
    const config = await readStoredConfig();
    delete config.providers[provider.id];
    await writeStoredConfig(config);
    return readApiKeyState(provider);
  });
}
var MINUTE_MS = 6e4;
function normalizeUsageEntry(raw, today, now) {
  const entry = { date: today, count: 0, timestamps: [] };
  if (!isRecord(raw)) return entry;
  if (raw.date !== today) return entry;
  if (typeof raw.count === "number" && Number.isFinite(raw.count) && raw.count >= 0) {
    entry.count = Math.floor(raw.count);
  }
  const list = Array.isArray(raw.timestamps) ? raw.timestamps : [];
  entry.timestamps = list.filter((t) => typeof t === "number" && Number.isFinite(t)).filter((t) => now - t < MINUTE_MS && t <= now + MINUTE_MS);
  return entry;
}
async function readUsageStore(now) {
  const paths = pluginPaths();
  const raw = await readJsonFile(paths.usageFile);
  const store = { version: 2, providers: {} };
  if (raw !== void 0) {
    if (isRecord(raw) && isRecord(raw.providers)) {
      for (const [id, entry] of Object.entries(raw.providers)) {
        if (isRecord(entry)) store.providers[id] = entry;
      }
    }
    return store;
  }
  const legacy = await readJsonFile(path.join(paths.legacyDataDir, LEGACY_USAGE_FILE));
  if (isRecord(legacy)) {
    const timestamps = Array.isArray(legacy.timestamps) ? legacy.timestamps : Array.isArray(legacy.lastMinuteTimestamps) ? legacy.lastMinuteTimestamps : [];
    store.providers.siliconflow = {
      date: typeof legacy.date === "string" ? legacy.date : localDateKey(new Date(now)),
      count: typeof legacy.count === "number" ? legacy.count : 0,
      timestamps: timestamps.filter((t) => typeof t === "number")
    };
  }
  return store;
}
async function readUsageSnapshot(providerId, now = Date.now()) {
  const store = await readUsageStore(now);
  const today = localDateKey(new Date(now));
  const entry = normalizeUsageEntry(store.providers[providerId], today, now);
  return {
    providerId,
    date: today,
    todayCount: entry.count,
    minuteCount: entry.timestamps.length,
    ipm: RATE_LIMIT_IPM,
    ipd: RATE_LIMIT_IPD,
    remainingToday: Math.max(0, RATE_LIMIT_IPD - entry.count)
  };
}
async function assertQuota(providerId, now = Date.now()) {
  const snapshot = await readUsageSnapshot(providerId, now);
  if (snapshot.minuteCount >= snapshot.ipm) {
    throw new ImageGenError(
      "RATE_LIMIT_IPM",
      `⏳ 本分钟已经出过 ${snapshot.ipm} 张（本地限额 IPM=${snapshot.ipm}），请等一分钟再来。`
    );
  }
  if (snapshot.todayCount >= snapshot.ipd) {
    throw new ImageGenError(
      "RATE_LIMIT_IPD",
      `⛔ 今日额度已用完（${snapshot.todayCount}/${snapshot.ipd} 张，IPD=${snapshot.ipd}），明天 0 点重置。`
    );
  }
  return snapshot;
}
async function recordUsage(providerId, now = Date.now()) {
  return await serialize(async () => {
    const store = await readUsageStore(now);
    const today = localDateKey(new Date(now));
    const entry = normalizeUsageEntry(store.providers[providerId], today, now);
    entry.count += 1;
    entry.timestamps.push(now);
    entry.timestamps = entry.timestamps.filter((t) => now - t < MINUTE_MS);
    entry.updatedAt = new Date(now).toISOString();
    store.providers[providerId] = entry;
    await writeJsonFile(pluginPaths().usageFile, store);
    return readUsageSnapshot(providerId, now);
  });
}
var MAX_IMAGE_SIDE = 2048;
var MIN_IMAGE_SIDE = 256;
function resolveImageSize(input, provider = getProvider()) {
  const explicit = input.imageSize?.trim();
  if (explicit !== void 0 && explicit !== "") {
    const match = /^(\d{2,4})\s*[x×*]\s*(\d{2,4})$/i.exec(explicit);
    if (match === null) {
      throw new ImageGenError(
        "BAD_IMAGE_SIZE",
        `❌ image_size 格式不对（收到 "${explicit}"）。请写成 "宽x高"，例如 1024x1024、768x1024。`
      );
    }
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width < MIN_IMAGE_SIDE || height < MIN_IMAGE_SIDE || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
      throw new ImageGenError(
        "BAD_IMAGE_SIZE",
        `❌ image_size 超出范围（${width}x${height}）。宽高都要在 ${MIN_IMAGE_SIDE}~${MAX_IMAGE_SIDE} 之间。`
      );
    }
    return `${width}x${height}`;
  }
  const ratio = input.aspectRatio?.trim();
  const ratios = provider.aspectRatios;
  if (ratio === void 0 || ratio === "") return ratios["1:1"] ?? "1024x1024";
  const mapped = ratios[ratio];
  if (mapped === void 0) {
    throw new ImageGenError(
      "BAD_ASPECT_RATIO",
      `❌ aspect_ratio 只支持 ${Object.keys(ratios).join(" / ")}（收到 "${ratio}"）。也可以直接用 image_size 指定像素。`
    );
  }
  return mapped;
}
var EXT_BY_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp"
};
function extensionFor(contentType, url) {
  if (contentType !== null) {
    const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    const known = EXT_BY_MIME[mime];
    if (known !== void 0) return known;
  }
  const fromUrl = /\.(png|jpe?g|webp)(?:\?|#|$)/i.exec(url)?.[1]?.toLowerCase();
  if (fromUrl === "jpeg") return "jpg";
  return fromUrl ?? "png";
}
async function postGeneration(provider, apiKey, input, signal) {
  const request = provider.buildRequest(input, apiKey);
  let response;
  try {
    response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal
    });
  } catch (error) {
    if (signal.aborted) throw new ImageGenError("ABORTED", "⏹ 已取消出图。");
    throw new ImageGenError(
      "NETWORK",
      `🌐 连不上服务端（${request.url}）：${errorMessage(error)}。检查网络或代理后再试。`
    );
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const translated = provider.translateHttpError(response.status, text);
    if (translated !== void 0) throw translated;
    throw new ImageGenError("HTTP_ERROR", `❌ 请求失败：HTTP ${response.status}。`);
  }
  const payload = await response.json().catch(() => void 0);
  return provider.parseImageUrl(payload);
}
async function downloadImage(url, signal) {
  let response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (signal.aborted) throw new ImageGenError("ABORTED", "⏹ 已取消下载图片。");
    throw new ImageGenError(
      "DOWNLOAD",
      `🌐 图片生成成功，但下载失败：${errorMessage(error)}。图片地址：${url}`
    );
  }
  if (!response.ok) {
    throw new ImageGenError("DOWNLOAD", `🌐 图片下载失败（HTTP ${response.status}）。图片地址：${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new ImageGenError("DOWNLOAD", `🌐 图片下载回来是空文件。图片地址：${url}`);
  }
  return { buffer, ext: extensionFor(response.headers.get("content-type"), url) };
}
async function generateImage(input, options = {}) {
  const provider = getProvider(options.providerId);
  const prompt = input.prompt?.trim();
  if (prompt === void 0 || prompt === "") {
    throw new ImageGenError("BAD_PROMPT", "❌ prompt 不能为空，用一句话描述你想要的画面。");
  }
  if (prompt.length > 2e3) {
    throw new ImageGenError("BAD_PROMPT", "❌ prompt 太长了（超过 2000 字符），精简一下。");
  }
  const { apiKey } = await resolveApiKey(provider);
  if (apiKey === void 0) {
    throw new ImageGenError(
      "NO_API_KEY",
      `🔑 还没配置 API Key。请打开 DSH 设置 → 插件 → API免费生图 填写 Key，或设置环境变量 ${provider.apiKeyEnv}。注册地址：${provider.signupUrl}`
    );
  }
  const imageSize = resolveImageSize(input, provider);
  const startedAt = Date.now();
  const now = options.now ?? startedAt;
  await assertQuota(provider.id, now);
  const output = await readOutputDir(now);
  await fs.mkdir(output.todayImageDir, { recursive: true }).catch((error) => {
    throw new ImageGenError(
      "BAD_OUTPUT_DIR",
      `❌ 保存目录不可写：${output.todayImageDir}
原因：${errorMessage(error)}`
    );
  });
  const outer = new AbortController();
  const onAbort = () => outer.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => outer.abort(), 18e4);
  try {
    const negative = input.negativePrompt?.trim();
    const url = await postGeneration(
      provider,
      apiKey,
      {
        prompt,
        imageSize,
        aspectRatio: input.aspectRatio,
        negativePrompt: negative === void 0 || negative === "" ? void 0 : negative
      },
      outer.signal
    );
    const { buffer, ext } = await downloadImage(url, outer.signal);
    const filePath = path.join(output.todayImageDir, `img_${Date.now()}.${ext}`);
    await fs.writeFile(filePath, buffer);
    const usage = await recordUsage(provider.id, now);
    return {
      filePath,
      imageUrl: url,
      imageSize,
      model: provider.defaultModel,
      providerId: provider.id,
      elapsedMs: Date.now() - startedAt,
      usage,
      outputDir: output.dir
    };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
async function readStatus(providerId, now = Date.now()) {
  const provider = getProvider(providerId);
  const [apiKey, usage, output] = await Promise.all([
    readApiKeyState(provider),
    readUsageSnapshot(provider.id, now),
    readOutputDir(now)
  ]);
  const paths = pluginPaths();
  return {
    provider: {
      id: provider.id,
      label: provider.label,
      model: provider.defaultModel,
      signupUrl: provider.signupUrl
    },
    apiKey,
    usage,
    limits: { ipm: RATE_LIMIT_IPM, ipd: RATE_LIMIT_IPD },
    output,
    paths: { usageFile: paths.usageFile, configFile: paths.configFile }
  };
}
function formatStatus(report) {
  const { apiKey, usage, output } = report;
  const keyLine = apiKey.configured ? `🔑 API Key：已配置（${apiKey.source === "env" ? "环境变量 " + apiKey.envName : "来自设置卡片"}，${apiKey.masked}）` : "🔑 API Key：未配置 —— 打开 DSH 设置 → 插件 → API免费生图 填入 Key";
  return [
    keyLine,
    `🤖 当前模型：${report.provider.model}（写死，不可更换，避免误调收费模型）`,
    `📅 今日 ${usage.date}：${usage.todayCount}/${usage.ipd} 张`,
    `⏱ 本分钟：${usage.minuteCount}/${usage.ipm} 张`,
    `📁 保存位置：${output.dir}${output.source === "default" ? "（默认：系统的「我的图片」）" : "（自定义）"}`,
    `🗂 今日目录：${output.todayImageDir}`
  ].join("\n");
}

// src/tools.ts
var HOST_HINT = `打开 DSH 设置 → 插件 → ${PLUGIN_DISPLAY_NAME} 填入 Key`;
function asString(args, key) {
  const value = args[key];
  if (value === void 0 || value === null) return void 0;
  if (typeof value !== "string") {
    throw new Error(`❌ 参数 ${key} 必须是字符串。`);
  }
  return value;
}
function formatGenerateResult(result, surface) {
  const lines = [
    "✅ 出图成功",
    `图片：${result.filePath}`,
    `尺寸：${result.imageSize} ｜ 模型：${result.model}`,
    `用量：今日 ${result.usage.todayCount}/${result.usage.ipd} 张 ｜ 本分钟 ${result.usage.minuteCount}/${result.usage.ipm} 张`,
    `耗时：${(result.elapsedMs / 1e3).toFixed(1)} 秒`
  ];
  if (surface === "mcp") lines.push("（MCP 调用：图片已存到上面这个本地路径）");
  return {
    text: lines.join("\n"),
    value: {
      ok: true,
      path: result.filePath,
      outputDir: result.outputDir,
      imageSize: result.imageSize,
      model: result.model,
      provider: result.providerId,
      elapsedMs: result.elapsedMs,
      todayCount: result.usage.todayCount,
      minuteCount: result.usage.minuteCount,
      ipd: result.usage.ipd,
      ipm: result.usage.ipm
    },
    isError: false
  };
}
var generateImageTool = {
  name: "generate_image",
  description: "用免费生图模型生成一张图片，并把图片保存到本地磁盘，返回本地绝对路径。模型是写死的免费模型，没有 model 参数，请不要尝试指定别的模型。本地限额：每分钟最多 2 张、每天最多 400 张，超限会直接报错。用户想要“画一张…／出张图／生成图片／文生图”时用它。",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "画面描述（中文或英文都行）。写清主体、风格、光线、构图，效果更好。"
      },
      aspect_ratio: {
        type: "string",
        enum: Object.keys(getProvider().aspectRatios),
        description: "画幅比例，默认 1:1。3:4 竖构图适合人物；16:9 横构图适合风景/封面。被 image_size 覆盖。"
      },
      image_size: {
        type: "string",
        description: '直接指定像素尺寸，写成 "宽x高"（如 1024x1024、768x1024、1024x576），宽高 256~2048。给了它就忽略 aspect_ratio。'
      },
      negative_prompt: {
        type: "string",
        description: '反向提示词：不想出现的东西，例如 "文字, 水印, 变形的手, 低清晰度"。'
      }
    },
    required: ["prompt"],
    additionalProperties: false
  },
  async run(args, context = {}) {
    try {
      const result = await generateImage(
        {
          prompt: asString(args, "prompt") ?? "",
          aspectRatio: asString(args, "aspect_ratio"),
          imageSize: asString(args, "image_size"),
          negativePrompt: asString(args, "negative_prompt")
        },
        context.signal === void 0 ? {} : { signal: context.signal }
      );
      return formatGenerateResult(result, context.surface);
    } catch (error) {
      return errorOutcome(error);
    }
  }
};
var checkStatusTool = {
  name: "check_status",
  description: "查询免费生图插件的本地状态：API Key 是否已配置、今天和这一分钟已经出了几张图、配额还剩多少、图片存在哪个目录。只读本地文件，不联网、不消耗额度。没有参数。",
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false
  },
  async run(_args, context = {}) {
    try {
      const report = await readStatus();
      const text = formatStatus(report);
      const extra = report.apiKey.configured ? "" : `
👉 怎么配：${HOST_HINT}，或设置环境变量 ${report.apiKey.envName}。`;
      return {
        text: `${text}${extra}`,
        value: {
          ok: true,
          configured: report.apiKey.configured,
          source: report.apiKey.source,
          maskedKey: report.apiKey.masked,
          provider: report.provider.id,
          model: report.provider.model,
          date: report.usage.date,
          todayCount: report.usage.todayCount,
          minuteCount: report.usage.minuteCount,
          ipd: report.usage.ipd,
          ipm: report.usage.ipm,
          remainingToday: report.usage.remainingToday,
          outputDir: report.output.dir,
          outputDirSource: report.output.source,
          todayImageDir: report.output.todayImageDir,
          usageFile: report.paths.usageFile,
          configFile: report.paths.configFile
        },
        isError: false
      };
    } catch (error) {
      return errorOutcome(error);
    }
  }
};
function errorOutcome(error) {
  const code = isImageGenError(error) ? error.code : "UNKNOWN";
  const message = errorMessage(error);
  return {
    text: message,
    value: { ok: false, code, error: message },
    isError: true
  };
}
var TOOL_SPECS = [generateImageTool, checkStatusTool];

// src/host/index.ts
var name = PLUGIN_ID;
var inject = ["tools"];
var ROUTE_PREFIX = `/${PLUGIN_ID}/api`;
var MAX_BODY_BYTES = 64 * 1024;
function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}
async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_BODY_BYTES) throw new Error("请求体太大");
    chunks.push(buffer);
  }
  if (total === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text === "") return {};
  const parsed = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) throw new Error("请求体必须是 JSON 对象");
  return parsed;
}
async function buildStatusPayload() {
  const report = await readStatus();
  return {
    ok: true,
    configured: report.apiKey.configured,
    source: report.apiKey.source,
    maskedKey: report.apiKey.masked,
    keyFile: report.apiKey.keyFile,
    envName: report.apiKey.envName,
    provider: report.provider,
    limits: { ipm: RATE_LIMIT_IPM, ipd: RATE_LIMIT_IPD },
    usage: {
      date: report.usage.date,
      todayCount: report.usage.todayCount,
      minuteCount: report.usage.minuteCount,
      remainingToday: report.usage.remainingToday
    },
    output: report.output,
    paths: report.paths
  };
}
function registerRoutes(ctx) {
  const statusRoute = {
    kind: "exact",
    path: `${ROUTE_PREFIX}/status`,
    async handler(request, response) {
      if ((request.method ?? "GET").toUpperCase() !== "GET") {
        sendJson(response, 405, { ok: false, error: "只支持 GET" });
        return;
      }
      try {
        sendJson(response, 200, await buildStatusPayload());
      } catch (error) {
        sendJson(response, 500, { ok: false, error: errorMessage(error) });
      }
    }
  };
  const keyRoute = {
    kind: "exact",
    path: `${ROUTE_PREFIX}/key`,
    async handler(request, response) {
      if ((request.method ?? "GET").toUpperCase() !== "POST") {
        sendJson(response, 405, { ok: false, error: "只支持 POST" });
        return;
      }
      try {
        const body = await readJsonBody(request);
        const rawKey = body.apiKey;
        if (typeof rawKey !== "string") {
          sendJson(response, 400, { ok: false, error: "apiKey 必须是字符串（传空字符串表示清除）" });
          return;
        }
        const state = rawKey.trim() === "" ? await clearApiKey() : await writeApiKey(rawKey);
        sendJson(response, 200, {
          ok: true,
          saved: state.configured && rawKey.trim() !== "",
          configured: state.configured,
          source: state.source,
          maskedKey: state.masked
        });
      } catch (error) {
        sendJson(response, 400, { ok: false, error: errorMessage(error) });
      }
    }
  };
  const outputDirRoute = {
    kind: "exact",
    path: `${ROUTE_PREFIX}/output-dir`,
    async handler(request, response) {
      if ((request.method ?? "GET").toUpperCase() !== "POST") {
        sendJson(response, 405, { ok: false, error: "只支持 POST" });
        return;
      }
      try {
        const body = await readJsonBody(request);
        const rawDir = body.outputDir;
        if (typeof rawDir !== "string") {
          sendJson(response, 400, { ok: false, error: "outputDir 必须是字符串（传空字符串表示恢复默认）" });
          return;
        }
        const output = await setOutputDir(rawDir);
        sendJson(response, 200, { ok: true, output });
      } catch (error) {
        sendJson(response, 400, { ok: false, error: errorMessage(error) });
      }
    }
  };
  ctx.inject(["webServer"], (scoped) => {
    if (scoped.webServer === void 0) return;
    scoped.effect(() => {
      const disposers = [
        scoped.webServer?.register(statusRoute) ?? (() => {
        }),
        scoped.webServer?.register(keyRoute) ?? (() => {
        }),
        scoped.webServer?.register(outputDirRoute) ?? (() => {
        })
      ];
      return () => {
        for (const dispose of disposers) {
          try {
            dispose();
          } catch {
          }
        }
      };
    }, `${PLUGIN_ID}: settings routes`);
  });
}
function registerTools(ctx) {
  ctx.effect(() => {
    const disposers = TOOL_SPECS.map(
      (spec) => ctx.tools.register({
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        output: {
          // 值形状宽松一点：不同分支（成功/失败/状态）字段不同。
          schema: { type: "object", additionalProperties: true },
          render: (_args, value) => {
            const text = typeof value === "object" && value !== null && typeof value.message === "string" ? value.message : "（没有内容）";
            return [{ type: "text", text }];
          }
        },
        async execute(args, exec) {
          const record = typeof args === "object" && args !== null ? args : {};
          const outcome = await spec.run(record, { signal: exec.signal, surface: "host" });
          if (outcome.isError) throw new Error(outcome.text);
          return { ...outcome.value, message: outcome.text };
        }
      })
    );
    return () => {
      for (const dispose of disposers) {
        try {
          dispose();
        } catch {
        }
      }
    };
  }, `${PLUGIN_ID}: tools`);
}
function apply(ctx) {
  registerTools(ctx);
  registerRoutes(ctx);
}
var internals = { buildStatusPayload, ROUTE_PREFIX };
export {
  ROUTE_PREFIX,
  apply,
  inject,
  internals,
  name
};
