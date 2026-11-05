/**
 * 全局可改常量 —— 想改显示名、注册链接（邀请码）、默认模型，都改这一个文件。
 *
 * 打包时这些常量会被 esbuild 内联进 Host 半、Client 半和 MCP Server 三份产物，
 * 所以**改完必须重新 build**，不会出现“改了源码但界面没变”。
 */

/** 插件英文标识符（npm 包名 / 配置文件 key / 插槽注册 key）。 */
export const PLUGIN_ID = 'dsh-api-free-image'

/** 插件中文名（设置卡片标题、locale 兜底）。 */
export const PLUGIN_DISPLAY_NAME = 'API免费生图'

/**
 * 注册 / 获取 API Key 的链接（已带本插件作者的邀请码）。
 *
 * 👉 想换成自己的邀请码：直接改这一行，形如
 *    'https://cloud.siliconflow.cn/i/你的邀请码'
 *    （旧的 query 写法 '.../account/ak?affiliate_code=XXX' 也行，但 /i/ 落地页
 *      才能保证邀请关系被记录。）
 * UI 上的「去注册获取」、链接下面那行小字、以及 README 里的注册链接都跟着这一处走。
 */
export const SIGNUP_URL = 'https://cloud.siliconflow.cn/i/Qt3zAfmr'

/** 默认生图平台（将来接第二个平台时，改这里或按 README 注册新 provider）。 */
export const DEFAULT_PROVIDER_ID = 'siliconflow'

/** 数据目录里用到的文件名。 */
export const CONFIG_FILE_NAME = 'config.json'
export const USAGE_FILE_NAME = 'usage.json'
