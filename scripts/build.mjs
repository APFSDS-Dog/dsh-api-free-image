#!/usr/bin/env node
/**
 * 构建脚本：把 src/ 下的 TypeScript 打成本地插件要的三种产物。
 *
 *   lib/index.js        Host 半（ESM，Node 直接跑）
 *   lib/mcp-server.js   本地 MCP Server（ESM + shebang，stdio）
 *   lib/client.js       Client 半（浏览器半，包成 DSH 的 __ModuleLoader__ 懒工厂）
 *
 * Client 半必须长成 `window.__ModuleLoader__.load({ id, factory })` 这个样子，
 * 所以先用 esbuild 打成 CJS，再套一层壳：壳里的 `require` 就是宿主模块表给的
 * require（react / react/jsx-runtime 都从那里来）。
 */
import { build } from 'esbuild'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const libDir = path.join(root, 'lib')
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))

const banner = '/* 由 scripts/build.mjs 生成，请改 src/ 下的源码后重新 build */'
// 产物保持 UTF-8 原样，不把中文转成 \uXXXX —— 打包发人时至少还是可读的。
const encoding = { charset: 'utf8' }
// 版本号只从 package.json 来，避免手抄的 SERVER_VERSION 与包版本对不上。
const defines = { define: { __PLUGIN_VERSION__: JSON.stringify(pkg.version) } }

await fs.rm(libDir, { recursive: true, force: true })
await fs.mkdir(libDir, { recursive: true })

// 1) Host 半
await build({
  absWorkingDir: root,
  entryPoints: ['src/host/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  legalComments: 'none',
  banner: { js: banner },
  ...encoding,
  ...defines,
  logLevel: 'info',
})

// 2) MCP Server（独立可执行，stdio）
await build({
  absWorkingDir: root,
  entryPoints: ['src/mcp/server.ts'],
  outfile: 'lib/mcp-server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  legalComments: 'none',
  banner: { js: '#!/usr/bin/env node\n' + banner },
  ...encoding,
  ...defines,
  logLevel: 'info',
})
await fs.chmod(path.join(libDir, 'mcp-server.js'), 0o755).catch(() => {})

// 3) Client 半：先打 CJS，再套 __ModuleLoader__ 壳
const clientBundle = await build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2020',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
  legalComments: 'none',
  write: false,
  ...encoding,
  ...defines,
  logLevel: 'info',
})

const bundleCode = clientBundle.outputFiles?.[0]?.text
if (typeof bundleCode !== 'string' || bundleCode.trim() === '') {
  throw new Error('Client 半构建失败：esbuild 没有产出内容')
}

const indent = (text) =>
  text
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => (line === '' ? '' : `      ${line}`))
    .join('\n')

const clientSource = `/* 由 scripts/build.mjs 生成，请改 src/client/index.tsx 后重新 build */
window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${indent(bundleCode)}
    return module.exports;
  },
});
`

await fs.writeFile(path.join(libDir, 'client.js'), clientSource, 'utf8')

const files = await fs.readdir(libDir)
const sizes = await Promise.all(
  files.map(async (file) => {
    const stat = await fs.stat(path.join(libDir, file))
    return `${file}  ${(stat.size / 1024).toFixed(1)} KB`
  }),
)
console.log(`\n构建完成 → ${libDir}`)
for (const line of sizes) console.log(`  ${line}`)

