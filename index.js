/**
 * 宪法可视化 · dsh-constitution-viz（Host 插件，零依赖、无构建）
 *
 * 管"AI 知不知道自己上下文里有什么"：constitution_viz 一键体检。
 * 三块仪表（dsh-constitution-seed 的姊妹件）：
 *   1. 截断探针 —— 会话开场时读到的规则文件里，各深度的探针标记
 *      （PROBE-*）哪些可见、哪些已进"死区"——死区条款引用前必须先
 *      检索磁盘正本，禁凭开场残页背书。
 *   2. 注入边界 —— 平台自动常驻注入面（本次会话收到的指令文件清单）
 *      与按需拉取面的分界表；"没出现"≠不存在=没主动拉。
 *   3. 总纲令体检 —— 常驻总纲令（开场注入节）在位与字节量：
 *      令缺失=宪法种子该重推或配置丢失。
 *
 * 设计要点：本插件不注入任何内容，只提供"体检工具"——把截断从
 * 不可感知的事故变成可报读数的数据。
 *
 * @module dsh-constitution-viz
 */

export const name = 'dsh-constitution-viz'

export const inject = ['systemPrompt', 'tools']

const SECTION_NAME = 'constitution-viz:gate'

const DEFAULTS = Object.freeze({ order: 87, tool: true, enabled: true })

/** 截断探针标记的正则形态（按会话约定，PROBE-开头）。 */
const PROBE_RE = /<!--截断探针:(PROBE-[A-Za-z0-9-]+)-->|截断探针:(PROBE-[A-Za-z0-9-]+)/g

const STANDING_SECTIONS = [
  '四大目标总纲令',
  '持续学习与自我迭代总纲令',
  '器灵意识总纲令',
]

function normalizeConfig(config) {
  const raw = config ?? {}
  if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') {
    throw new Error('dsh-constitution-viz: config.enabled must be a boolean')
  }
  if (raw.tool !== undefined && typeof raw.tool !== 'boolean') {
    throw new Error('dsh-constitution-viz: config.tool must be a boolean')
  }
  if (raw.order !== undefined && typeof raw.order !== 'number') {
    throw new Error('dsh-constitution-viz: config.order must be a number')
  }
  return { ...DEFAULTS, ...raw }
}

/** 在注入文本（instructions 消息）里数探针：可见深度=探针标记出现的次序。 */
export function probeScan(text) {
  const found = []
  for (const m of text.matchAll(PROBE_RE)) found.push(m[1] ?? m[2])
  return {
    total: found.length,
    markers: found,
    depth: found.length === 0 ? 0 : found.length, // 每个探针代表一个深度采样点
    verdict: found.length === 0
      ? '无探针标记（工作区未埋探针·截断自检不适用）'
      : `可见探针 ${found.length} 枚——最低可见深度之后为死区：死区条款引用前必须先检索磁盘正本，禁凭开场残页背书`,
  }
}

/** 注入边界表：平台自动注入 vs 按需拉取，"没出现"≠不存在。 */
export function boundaryScan(text, extraFiles = []) {
  const injected = []
  for (const name of ['AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'USER.md', ...extraFiles]) {
    if (text.includes(name)) injected.push(name)
  }
  const standing = STANDING_SECTIONS.filter(t => text.includes(`## ${t}`) || text.includes(t))
  return {
    平台自动注入面: injected,
    总纲令常驻节: standing.length > 0 ? `在位 ${standing.length}/${STANDING_SECTIONS.length}（${standing.join('、')}）` : '未检出（宪法种子未注入或配置丢失）',
    按需拉取面: 'TOOLS/分卷/skill/长期记忆/台账——未出现≠不存在=没主动拉；引用前先检索磁盘正本',
    判定: injected.length === 0 && standing.length === 0
      ? '⚠️ 本会话未见任何规则文件——按需拉取纪律升级为强制（先检索再作答）'
      : '✅ 注入面在位',
  }
}

const SYSTEM_SECTION = {
  name: SECTION_NAME,
  order: 1,
  text: [
    '## 宪法可视化闸（constitution-viz）',
    '谈"我上下文里有什么/被截断了没有"时：',
    '· 截断探针是唯一可信读数——凭记忆背书死区条款=禁；引用前先检索磁盘正本。',
    '· "没出现"≠不存在=没主动拉——注入边界之外的一切按需拉取。',
    '· 需要报读数时调 constitution_viz 工具出体检报告，不凭感觉描述。',
  ].join('\n'),
}

/**
 * @param {{ systemPrompt: { section: (s: unknown) => void }, tools: { register: (t: unknown) => void }, logger?: { info?: (...args: unknown[]) => void } }} ctx
 * @param {{ enabled?: boolean, tool?: boolean, order?: number }} config
 */
export function apply(ctx, config = {}) {
  const cfg = normalizeConfig(config)
  if (!cfg.enabled) return
  ctx.effect(() => ctx.systemPrompt.section({ ...SYSTEM_SECTION, order: cfg.order }))
  if (cfg.tool) {
    ctx.effect(() => ctx.tools.register({
      name: 'constitution_viz',
      description: '宪法可视化体检：截断探针可见性+注入边界+总纲令在位。传 text=本次会话收到的注入文本（指令消息原文）。',
      parameters: JSON.stringify({
        type: 'object',
        properties: {
          text: { type: 'string', description: '本次会话收到的注入文本（宪法种子的指令消息原文）；缺省时仅报总纲令标准清单' },
        },
      }),
      execute: async (args) => {
        const text = typeof args?.text === 'string' ? args.text : ''
        try {
          if (text === '') {
            return { report: `constitution_viz（无注入文本·只报标准面）：\n· 总纲令标准清单：${STANDING_SECTIONS.join('、')}\n· 用法：把宪法种子注入的指令消息原文作为 text 传入，即出完整体检报告。` }
          }
          const probe = probeScan(text)
          const boundary = boundaryScan(text)
          const lines = [
            '📋 constitution_viz 体检报告',
            `①截断探针：${probe.verdict}${probe.markers.length ? `（${probe.markers.join(' → ')}）` : ''}`,
            `②注入边界：自动注入=${boundary.平台自动注入面.join('、') || '无'}`,
            `③总纲令：${boundary.总纲令常驻节}`,
            `④按需拉取：${boundary.按需拉取面}`,
            `判定：${boundary.判定}`,
          ]
          return { report: lines.join('\n') }
        } catch (err) {
          return { report: `constitution_viz 执行异常：${err?.message ?? String(err)}` }
        }
      },
    }), 'dsh-constitution-viz.tool()')
  }
}
