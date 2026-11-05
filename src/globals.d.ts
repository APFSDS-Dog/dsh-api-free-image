/**
 * esbuild `define` 注入的编译期常量（见 scripts/build.mjs）。
 * 用它们代替手抄版本号，避免 package.json 与产物对不上。
 */
declare const __PLUGIN_VERSION__: string
