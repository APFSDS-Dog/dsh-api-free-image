/**
 * 无 GUI 的 Client 半自检。
 *
 * DSH 的设置卡片要装在 Electron 窗口里才看得见，开发时不想每次重启应用去点，
 * 就先把 `lib/client.js` 当成宿主那样“装”一遍：伪造 window.__ModuleLoader__，
 * 用真的 react 跑一次服务端渲染，断言卡片该有的东西都在。
 *
 *   node scripts/check-client.mjs
 *
 * 检查项：模块 id、apply() 能跑通、注册到 `plugins.bundle.config` 且 key 正确、
 * summary 视图返回 null、page 视图渲染出标题 / 注册链接 / AFF 备注 / 密码框 /
 * 保存按钮 / 更改保存位置 / 模型说明，**且卡片里不出现任何具体平台名**。
 * 不检查样式好不好看——那得人眼看。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const React = require('react')
const jsxRuntime = require('react/jsx-runtime')
const { renderToStaticMarkup } = require('react-dom/server')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const bundles = {
  react: React,
  'react/jsx-runtime': jsxRuntime,
}

const failures = []
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ✓ ${label}`)
    return
  }
  failures.push(label)
  console.log(`  ✗ ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

// 1) 像浏览器一样把 lib/client.js 装进一个假 window
const source = fs.readFileSync(path.join(root, 'lib/client.js'), 'utf8')
const loaded = []
const windowStub = {
  __ModuleLoader__: {
    load(entry) {
      loaded.push(entry)
    },
  },
}
// eslint-disable-next-line no-new-func
new Function('window', source)(windowStub)

console.log(`\n[1/5] 模块外壳`)
check('注册了一个 __ModuleLoader__ 工厂', loaded.length === 1, `实际 ${loaded.length} 个`)
const entry = loaded[0] ?? {}
check('工厂 id 等于 package name', entry.id === pkg.name, `id=${entry.id}`)
check('工厂是个函数', typeof entry.factory === 'function')

// 2) 执行工厂：require 只允许宿主模块表里有的东西
console.log(`\n[2/5] 模块导出`)
const mod = entry.factory((name) => {
  const value = bundles[name]
  if (value === undefined) throw new Error(`client bundle 试图 require("${name}")，宿主模块表里没有`)
  return value
})
check('导出了 apply', typeof mod.apply === 'function')
check('导出了 inject 且包含 slots/locale', Array.isArray(mod.inject) && mod.inject.includes('slots') && mod.inject.includes('locale'))

// 3) apply()：用一个假 ctx 接住注册行为
console.log(`\n[3/5] 插槽注册`)
const registrations = []
let dictionaries = {}
const FAKE_PICKED_DIR = 'D:\\FakePictures\\picked'
const ctx = {
  effect(callback) {
    return callback()
  },
  inject(_deps, callback) {
    // 假装宿主的 uiWorkspace 服务可用。
    callback({ uiWorkspace: { pickDirectory: async () => FAKE_PICKED_DIR } })
  },
  locale: {
    register(_ns, dicts) {
      dictionaries = dicts
      return () => {}
    },
    bind() {
      return (key, vars) => {
        const template = dictionaries.zh?.[key] ?? dictionaries.en?.[key] ?? key
        if (vars === undefined) return template
        return template.replace(/\{(\w+)\}/g, (_m, name) => String(vars[name] ?? `{${name}}`))
      }
    },
  },
  slots: {
    inject(_name, callback) {
      callback()
      return () => {}
    },
    register(registration, component) {
      registrations.push({ registration, component })
      return () => {}
    },
  },
}

mod.apply(ctx)
check('注册了恰好一处插槽', registrations.length === 1, `实际 ${registrations.length} 处`)
const registration = registrations[0]?.registration ?? {}
const component = registrations[0]?.component
check('座位是 plugins.bundle.config', registration.name === 'plugins.bundle.config', registration.name)
check('key 是本包 package name', registration.key === pkg.name, registration.key)
check('注册项带了 t（locale 命名空间）', typeof registration.inject === 'function')
check('组件是个函数', typeof component === 'function')

// 4) 语言包完整性：中英文 key 必须一一对应
console.log(`\n[4/5] 语言包`)
const zhKeys = Object.keys(dictionaries.zh ?? {}).sort()
const enKeys = Object.keys(dictionaries.en ?? {}).sort()
check('zh / en 都有', zhKeys.length > 0 && enKeys.length > 0, `zh=${zhKeys.length} en=${enKeys.length}`)
check(
  'zh 与 en 的 key 完全一致',
  JSON.stringify(zhKeys) === JSON.stringify(enKeys),
  zhKeys.filter((key) => !enKeys.includes(key)).join(','),
)

// 5) 真的渲染一次（服务端渲染，useEffect 不跑，所以只看静态结构）
console.log(`\n[5/5] 渲染`)
const t = ctx.locale.bind()
const injected = typeof registration.inject === 'function' ? registration.inject() : {}
check('注册项注入了 pick（文件夹选择器）', typeof injected.pick === 'function')
if (typeof injected.pick === 'function') {
  const picked = await injected.pick()
  check('pick 能拿到路径（走 uiWorkspace）', picked === FAKE_PICKED_DIR, String(picked))
}

const summary = component === undefined ? undefined : component({ view: 'summary', t })
check('summary 视图返回 null（不占位）', summary === null)

const markup = component === undefined ? '' : renderToStaticMarkup(component({ view: 'page', t, pick: injected.pick }))
const expected = [
  ['标题 API免费生图', /API免费生图/],
  ['提示文案 输入你的 API Key', /输入你的 API Key/],
  ['注册链接文字 去注册获取', /去注册获取/],
  ['注册链接地址（带邀请码）', /https:\/\/cloud\.siliconflow\.cn\/i\/Qt3zAfmr/],
  ['AFF 备注 通过此链接注册可支持本插件开发', /通过此链接注册可支持本插件开发/],
  ['密码输入框', /type="password"/],
  ['保存按钮', />\s*保存\s*</],
  ['保存位置标签', /保存位置/],
  ['更改保存位置按钮', /更改保存位置/],
  ['锁死模型说明', /Kwai-Kolors\/Kolors/],
  ['自带 <style>（不污染宿主 DOM）', /<style>/],
]
for (const [label, pattern] of expected) check(label, pattern.test(markup), 'markup 里没找到')
check('卡片里不出现具体平台名（多平台预留）', !/硅基流动/.test(markup))
check('没有渲染 <script>（不会往宿主塞代码）', !/<script/i.test(markup))

if (failures.length > 0) {
  console.error(`\n❌ ${failures.length} 项失败：${failures.join('、')}\n`)
  process.exitCode = 1
} else {
  console.log(`\n✅ Client 半自检通过（${markup.length} 字符 markup）\n`)
  console.log(markup.replace(/></g, '>\n<').split('\n').slice(0, 44).join('\n'))
  console.log('…')
}
