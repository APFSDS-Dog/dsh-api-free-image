# dsh-api-free-image

> 在 **DeepSeek Harness（DSH）** 里用免费生图 API 画图：4 个参数、模型写死、本地限额、图片自动落盘，还能一键改保存位置。
> 纯 Node.js / TypeScript 实现，**没有 Python、没有 uv、没有子进程**。

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20.10-brightgreen)](https://nodejs.org)
[![dsh](https://img.shields.io/badge/dsh-%3E%3D0.2.1--rc.5-6f5bff)](https://github.com/deepseek-ai/deepseek-harness)

**English (short)**: a DSH plugin that exposes free text-to-image APIs as two agent tools
(`generate_image`, `check_status`). Four parameters only, a hard-locked free model, a local
IPM/IPD quota, a settings card for the API key, a native folder picker for the output directory,
and a zero-dependency stdio MCP server. MIT licensed.

---

## ✨ 功能特性

| | |
| --- | --- |
| 🎨 **两个工具** | `generate_image`（出图）· `check_status`（只看本地状态，不联网不耗额度） |
| 🎛 **只暴露 4 个参数** | `prompt` / `aspect_ratio` / `image_size` / `negative_prompt`，多一个都没有 |
| 🔒 **模型写死** | 没有 `model` 参数，从根上避免误调收费模型 |
| ⏱ **本地限额** | IPM=2（每分钟）· IPD=400（每天），超限就地拦截，请求根本不会发出去 |
| 📁 **保存位置可改** | 默认系统的「图片」目录；卡片上点一下弹出**系统原生文件夹选择框** |
| 💾 **自动落盘** | `<保存位置>/<YYYY-MM-DD>/img_<时间戳>.png`，图片路径直接返回给模型 |
| 🧩 **多平台预留** | 平台差异全部关在 `src/providers/`，加一个免费平台 = 加一个文件 + 注册一行 |
| 🔌 **自带 MCP Server** | 同一份核心也发布成标准 stdio MCP Server，可接任意 MCP 客户端 |
| 📦 **零运行时依赖** | 装完即可用，不需要再联网拉第三方包 |

## 📋 环境要求

- **Node.js** ≥ 20.10（DSH 桌面版自带的运行时也满足）
- **DeepSeek Harness** ≥ `0.2.1-rc.5`（`package.json` 的 `engines.dsh` 已声明）

## 🚀 安装

### 从 npm 安装

```bash
dsh plugin --profile desktop add dsh-api-free-image
```

### 图形界面安装

DSH → 左下角 **设置** → **插件** → **添加**，填入包名 `dsh-api-free-image`，或者选本地目录 / `.tgz` 文件。

### 从源码安装（开发用）

```bash
git clone https://github.com/your-name/dsh-api-free-image.git
cd dsh-api-free-image
pnpm install && pnpm build
dsh plugin --profile desktop add "C:\path\to\dsh-api-free-image"
```

安装的是**目录链接**，所以之后改完源码重新 `pnpm build`、重启 DSH 就是新版，不必重装。

## ⚙️ 配置

装好后打开 **设置 → 插件 → API免费生图**，配置卡片长这样：

```
🗂  API免费生图                                    ⚠️ 未配置
    输入你的 API Key，去注册获取
    通过此链接注册可支持本插件开发              ← 就这一行小灰字

    [ sk-•••••••••••• ]  [保存]

    保存位置  C:\Users\你\Pictures   [更改保存位置]
```

- **API Key**：粘贴后点保存，写进 `~/.dsh/api-free-image/config.json`（Windows 上靠用户目录权限保护）
- **保存位置**：点「更改保存位置」弹系统原生文件夹选择框；选过之后按钮旁边会多出「恢复默认」
- **环境变量兜底**：也可以不填卡片，直接设 `SILICONFLOW_API_KEY`。
  **卡片里保存过的优先**于环境变量（卡片上会显示当前用的是哪一个）
- **数据目录**：`~/.dsh/api-free-image/`（`config.json` 存 Key 与保存位置，`usage.json` 存限额计数）

## 🖼 使用

装好后直接跟 Agent 说「画一只戴墨镜的柴犬」，或者显式调用工具：

```jsonc
// generate_image
{
  "prompt": "一只戴墨镜的柴犬，扁平插画风，暖色调",
  "aspect_ratio": "16:9",          // 可选，默认 1:1
  "image_size": "1024x576",        // 可选，给了它就覆盖 aspect_ratio（宽高 256~2048）
  "negative_prompt": "文字, 水印"   // 可选
}
```

| `aspect_ratio` | 实际像素 |
| --- | --- |
| `1:1`（默认） | 1024x1024 |
| `3:4` | 768x1024 |
| `4:3` | 1024x768 |
| `9:16` | 576x1024 |
| `16:9` | 1024x576 |

### 请求体里到底发了什么

```json
{
  "model": "Kwai-Kolors/Kolors",
  "prompt": "一只戴墨镜的柴犬",
  "image_size": "1024x1024",
  "negative_prompt": "文字, 水印"
}
```

`negative_prompt` 没填就不带这个字段；**永远只有这四个**。
上游 API 会「接收但静默忽略」`num_images` / `seed` / `output_format` / `num_inference_steps` /
`guidance_scale` / `batch_size` 这类字段——发了不报错也不生效，所以本插件一个都不发，
工具参数里也一个都不暴露。这条由 `pnpm check:request` 抓包自动验证。

## 📁 图片保存位置

- 默认：系统的「图片」目录（Windows 是 `%USERPROFILE%\Pictures`，macOS / Linux 是 `~/Pictures`）
- 实际路径：`<保存位置>/<YYYY-MM-DD>/img_<毫秒时间戳>.png`
- 改法：设置卡片 →「更改保存位置」；或直接 POST `/{插件}/api/output-dir`
- 安全检查：必须是绝对路径；不能是盘符根目录、`%WINDIR%`、`Program Files`；
  设置时会建目录并**试写一个探针文件**，不可写立刻报错（不会等出图才失败）

## ⏱ 限额与错误提示

| 规则 | 行为 |
| --- | --- |
| 每分钟 ≤ 2 张（IPM） | 超限直接抛 `RATE_LIMIT_IPM`，请求不发 |
| 每天 ≤ 400 张（IPD） | 超限直接抛 `RATE_LIMIT_IPD`，次日 0 点按**本地日期**重置 |
| HTTP 401 | ❌ API Key 无效或已失效（告诉你去哪重填） |
| HTTP 402 | 💸 余额不足（免费模型也要求余额 ≥ 0） |
| HTTP 429 | ⏳ 触发官方限速（等 1 分钟） |
| HTTP 403 / 400 / 5xx | 对应中文说明 + 服务端原文 |
| 网络不通 | 🌐 连不上服务端（附错误原因） |

限额记账对并发安全：两个并发出图不会丢计数（`pnpm check:request` 里有回归测试）。

## 🔗 换成你自己的注册链接（AFF）

只有一个地方要改——`src/config.ts`：

```ts
// 👉 想放自己的邀请码：直接改这一行
export const SIGNUP_URL = 'https://cloud.siliconflow.cn/account/ak?affiliate_code=你的邀请码'
```

改完 `pnpm build`。卡片上的「去注册获取」链接、以及链接下面那行小字
（`通过此链接注册可支持本插件开发`）都跟着走，不需要动 UI 代码。

## 🧩 接入更多免费生图平台

平台差异全部关在 Provider 接口后面（`src/providers/types.ts`）：

```ts
export interface ImageProvider {
  readonly id: string                       // 配置/账本里的 key
  readonly label: string                    // 文档/日志用
  readonly defaultModel: string             // 写死的免费模型
  readonly apiKeyEnv: string                // 环境变量名
  readonly signupUrl: string                // 注册链接（AFF 放这）
  readonly aspectRatios: Record<string, string>
  readonly ignoredParams: readonly string[] // 上游会静默忽略的参数（只用于文档/自检）
  buildRequest(input: ProviderInput, apiKey: string): ProviderRequest
  parseImageUrl(payload: unknown): string
  translateHttpError(status: number, bodyText: string): ImageGenError | undefined
}
```

加一个平台：

1. 新建 `src/providers/<平台>.ts`，导出一个 `ImageProvider`；
2. 在 `src/providers/index.ts` 的 `REGISTRY` 里加一行；
3. 想让新平台成为默认，改 `src/config.ts` 的 `DEFAULT_PROVIDER_ID`。

`core.ts` 一行都不用改：配额、落盘、状态、工具、MCP 全部自动复用。
如果想同时暴露多个平台，建议**各注册一个工具**（例如 `generate_image_xxx`），
这样 `generate_image` 依旧保持 4 个参数。

## 🔌 本地 MCP Server

同一份核心也以标准 stdio MCP Server 发布，工具名同样是 `generate_image` / `check_status`：

```jsonc
// Claude Desktop / Cursor / 任意 MCP 客户端
{
  "mcpServers": {
    "api-free-image": {
      "command": "node",
      "args": ["<安装目录>/lib/mcp-server.js"]
    }
  }
}
```

自检（不联网，只读本地状态）：

```bash
node lib/mcp-server.js --selftest
```

> **为什么 DSH 内部不套这层 MCP？** DSH 的 MCP 通道是「宿主 spawn 子进程，再用 JSON-RPC
> 把工具挂回来」。插件本身就在宿主进程里，再套一层只会多出 Node 路径、依赖解析、子进程
> 退出三个可能挂的环节，功能完全一样。所以 DSH 里走原生 `ctx.tools.register`，对外的
> MCP Server 作为同一份核心的另一个入口发布。

## 🛠 本地开发

```bash
pnpm install          # 装 typescript + esbuild + react（仅开发用）

pnpm typecheck        # tsc --noEmit
pnpm build            # 产出 lib/index.js · lib/client.js · lib/mcp-server.js
pnpm check:client     # 无 GUI 渲染自检：真 react 跑一遍设置卡片并断言内容
pnpm check:request    # 抓包自检：请求体只有 4 个字段 + 并发记账不丢
pnpm check            # 上面四项一把跑完
```

### 三个产物是怎么回事

| 产物 | 格式 | 说明 |
| --- | --- | --- |
| `lib/index.js` | ESM | Host 半（`apply(ctx)`，注册工具 + 配置路由） |
| `lib/mcp-server.js` | ESM + shebang | 独立 stdio MCP Server |
| `lib/client.js` | `__ModuleLoader__` 懒工厂 | Client 半（浏览器里跑，`require('react')` 由宿主模块表提供） |

Client 半不能是普通 ESM：DSH 的浏览器插件必须注册成
`window.__ModuleLoader__.load({ id, factory })`。所以 `scripts/build.mjs` 先用 esbuild
打成 CJS（`react` 全部当外部依赖），再套一层壳——壳里的 `require` 就是宿主给的 require。

### 目录结构

```
src/
├─ config.ts              全局常量（显示名 / 注册链接 / 默认平台）← 通常只改这里
├─ core.ts                配额、Key、输出目录、出图流水线、状态
├─ errors.ts              带 code 的错误类型
├─ tools.ts               两个工具的 schema + 执行体（Host 与 MCP 共用）
├─ providers/
│  ├─ types.ts            ImageProvider 接口
│  ├─ siliconflow.ts      硅基流动实现（当前默认，已实测）
│  └─ index.ts            Provider 注册表
├─ host/index.ts          Host 半：注册工具 + /api/status · /api/key · /api/output-dir
├─ mcp/server.ts          零依赖 stdio MCP Server
├─ client/index.tsx       设置卡片（React，只用 --dsw-alias-* 主题变量）
└─ globals.d.ts           esbuild 注入的编译期常量声明
```

## 📤 发布

```bash
# 1) 发 npm
pnpm build
npm publish            # prepublishOnly 会自动再 build 一次

# 2) 打成 .tgz 单独分发（朋友端不用编译）
pnpm pack              # → dsh-api-free-image-1.1.0.tgz

# 3) 打 tag 发 GitHub Release，把 tgz 挂上去
git tag v1.1.0 && git push --tags
```

发布前记得把 `package.json` 里的 `repository` / `homepage` / `bugs` 换成你自己的仓库地址。
`dsh-api-free-image` 这个名字如果已被占用，改成 `@你的scope/dsh-api-free-image` 也完全可以。

朋友收到 tgz 后：

```bash
dsh plugin --profile desktop add "D:\下载\dsh-api-free-image-1.1.0.tgz"
```

## 🩺 常见问题

**Q：卡片显示「未配置」，但我的环境变量明明有 Key？**
A：卡片优先用本地配置。检查卡片上的「来源」提示——如果显示「环境变量」，说明生效的是环境变量；
想改就保存一个新 Key（会覆盖），或点「清除」回到环境变量。

**Q：卡片显示「读取本地状态失败」？**
A：说明客户端没连上 Host 的 `/dsh-api-free-image/api/status`。先在浏览器/终端访问
`http://127.0.0.1:<端口>/dsh-api-free-image/api/status` 看看是不是 JSON；另外确认装的是
**1.1.0 及以上**（路由前缀换了）。

**Q：桌面版里找不到 `dsh` 命令？**
A：直接走图形界面：设置 → 插件 → 添加。或者在 `node` 可用的环境里跑上面那条命令。

**Q：从 v1.0.0（旧名字「硅基流动免费生图」）升级要注意什么？**
A：只需把旧包移除再装新的：

```bash
dsh plugin --profile desktop remove dsh-kolors-free-image
dsh plugin --profile desktop add dsh-api-free-image
```

旧的 `~/.dsh/siliconflow/` 数据会在首次读取时**自动迁移**（Key 与当天计数都带过来），
你不需要手动搬。

**Q：402 / 429 一直出现？**
A：402 是账户余额不足（免费模型也要求余额 ≥ 0，充 ¥1 即可）；429 是官方限速，等一分钟。
插件本身还有 IPM=2 的本地限额，正常情况下不会先撞到官方限速。

## 🗒 更新日志

### 1.1.0

- 改名：`硅基流动免费生图` → **API免费生图**（包名 `dsh-api-free-image`）
- 新增：保存位置可改（系统原生文件夹选择框 + 实时显示 + 恢复默认）
- 新增：Provider 抽象，为接入其它免费平台预留
- 新增：注册链接可配置（放自己的邀请码）+ 一行小灰字备注
- 修复：并发调用时账本可能丢计数
- 变更：默认保存目录改为系统的「图片」目录
- 变更：数据目录迁到 `~/.dsh/api-free-image/`（旧数据自动迁移）

### 1.0.0

- 首个版本：`generate_image` / `check_status`、本地限额、错误中文化、自带 stdio MCP Server

## 📄 License

[MIT](./LICENSE) © 2026 dsh-api-free-image contributors

欢迎 issue / PR。改代码前建议先跑一遍 `pnpm check`，它会把请求体、并发记账和设置卡片渲染
一起验一遍。
