#!/usr/bin/env node
/* 由 scripts/build.mjs 生成，请改 src/ 下的源码后重新 build */

// src/mcp/server.ts
import { createInterface } from "node:readline";

// src/config.ts
var PLUGIN_ID = "dsh-api-free-image";
var PLUGIN_DISPLAY_NAME = "API免费生图";
var SIGNUP_URL = "https://cloud.siliconflow.cn/i/Qt3zAfmr";
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
function findTool(name) {
  return TOOL_SPECS.find((tool) => tool.name === name);
}

// src/mcp/server.ts
var SERVER_VERSION = "1.1.1";
var log = (...parts) => {
  console.error(`[${PLUGIN_ID}]`, ...parts);
};
var DEFAULT_PROTOCOL_VERSION = "2024-11-05";
function writeMessage(payload) {
  process.stdout.write(`${JSON.stringify(payload)}
`);
}
function reply(id, result) {
  writeMessage({ jsonrpc: "2.0", id: id ?? null, result });
}
function replyError(id, error) {
  writeMessage({ jsonrpc: "2.0", id: id ?? null, error });
}
function toolList() {
  return TOOL_SPECS.map((spec) => ({
    name: spec.name,
    description: spec.description,
    inputSchema: spec.parameters
  }));
}
async function callTool(name, args) {
  const spec = findTool(name);
  if (spec === void 0) {
    return {
      content: [{ type: "text", text: `没有这个工具：${name}。可用工具：${TOOL_SPECS.map((t) => t.name).join(", ")}` }],
      isError: true
    };
  }
  const outcome = await spec.run(args, { surface: "mcp" });
  return {
    content: [{ type: "text", text: outcome.text }],
    ...outcome.isError ? { isError: true } : {},
    structuredContent: outcome.value
  };
}
async function handleRequest(request) {
  const method = request.method ?? "";
  const isNotification = request.id === void 0 && method.startsWith("notifications/");
  switch (method) {
    case "initialize": {
      const params = typeof request.params === "object" && request.params !== null ? request.params : {};
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : DEFAULT_PROTOCOL_VERSION;
      reply(request.id, {
        protocolVersion: requested,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: PLUGIN_ID, version: SERVER_VERSION },
        instructions: "免费生图：generate_image(prompt, aspect_ratio, image_size, negative_prompt) 出图并落盘；check_status() 只读本地状态。模型写死为免费模型，本地限额 IPM=2 / IPD=400。"
      });
      log("initialize，协议版本", requested);
      return;
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      if (!isNotification) reply(request.id, {});
      return;
    case "ping":
      reply(request.id, {});
      return;
    case "tools/list":
      reply(request.id, { tools: toolList() });
      return;
    case "tools/call": {
      const params = typeof request.params === "object" && request.params !== null ? request.params : {};
      const toolName = typeof params.name === "string" ? params.name : "";
      const args = typeof params.arguments === "object" && params.arguments !== null ? params.arguments : {};
      try {
        reply(request.id, await callTool(toolName, args));
      } catch (error) {
        reply(request.id, {
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          isError: true
        });
      }
      return;
    }
    case "resources/list":
      reply(request.id, { resources: [] });
      return;
    case "prompts/list":
      reply(request.id, { prompts: [] });
      return;
    default:
      if (isNotification) return;
      replyError(request.id, { code: -32601, message: `Method not found: ${method}` });
  }
}
function serveStdio() {
  const rl = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });
  rl.on("line", (line) => {
    const text = line.trim();
    if (text === "") return;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      replyError(null, { code: -32700, message: "Parse error：收到的不是 JSON" });
      return;
    }
    if (Array.isArray(parsed)) {
      for (const item of parsed) void handleRequest(item);
      return;
    }
    if (typeof parsed !== "object" || parsed === null) {
      replyError(null, { code: -32600, message: "Invalid Request" });
      return;
    }
    void handleRequest(parsed).catch((error) => {
      log("处理请求时出错：", error);
      replyError(parsed.id ?? null, { code: -32603, message: error instanceof Error ? error.message : String(error) });
    });
  });
  rl.on("close", () => {
    process.exitCode = 0;
  });
  log(`stdio MCP Server 已启动（v${SERVER_VERSION}），工具：${TOOL_SPECS.map((t) => t.name).join(", ")}`);
}
async function selftest() {
  const report = await readStatus();
  process.stdout.write(`${formatStatus(report)}
`);
  process.stdout.write(`
可用工具：${TOOL_SPECS.map((t) => t.name).join(", ")}
`);
  const sample = await TOOL_SPECS[1]?.run({}, { surface: "cli" });
  if (sample !== void 0) process.stdout.write(`
check_status 输出：
${sample.text}
`);
}
var argv = process.argv.slice(2);
if (argv.includes("--selftest") || argv.includes("--check")) {
  await selftest();
} else if (argv.includes("--help") || argv.includes("-h")) {
  process.stdout.write(
    `${PLUGIN_ID} — 免费生图的本地 MCP Server（v${SERVER_VERSION}）

  node lib/mcp-server.js              以 stdio MCP 协议运行（给 IDE / 客户端调用）
  node lib/mcp-server.js --selftest   直接打印本地状态，不联网
`
  );
} else {
  serveStdio();
}
