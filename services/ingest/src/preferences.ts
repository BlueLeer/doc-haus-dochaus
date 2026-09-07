import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { WORKSPACE_ROOT } from "./matter"

// Firm-wide drafting preferences set in the web settings. They steer every
// assistant, so they live on the engine as a standing instructions file:
// dochaus/opencode.json lists {env:WORKSPACE_ROOT}/.preferences/drafting.md in
// config.instructions, and the engine re-reads that file on every turn — so a
// save here applies from the next reply, no restart. The JSON beside it is the
// structured source the settings form round-trips; the markdown is rendered
// from it and never edited directly.
const PREFS_DIR = () => path.join(WORKSPACE_ROOT, ".preferences")
const JSON_FILE = () => path.join(PREFS_DIR(), "preferences.json")
const INSTRUCTIONS_FILE = () => path.join(PREFS_DIR(), "drafting.md")

export type DraftingPreferences = {
  attorney: string
  firm: string
  posture: "client-favorable" | "balanced" | "conservative"
  formality: "formal" | "plain"
  detail: "concise" | "detailed"
  // Independent from the per-browser interface locale.
  responseLanguage: "auto" | "zh-CN" | "en"
  // "plan-first" makes assistants inventory the source documents, spot issues,
  // research, and write an action plan before producing or revising a document.
  // Slower and costs more model time; catches more.
  process: "plan-first" | "standard"
  dateFormat: "month-day-year" | "day-month-year" | "iso"
  numberStyle: "words-and-numerals" | "numerals"
  houseStyle: string
  // Enforced by the legal plugin's webfetch fence (dochaus/lib/research.ts),
  // not rendered into drafting.md: "official" limits web research to official
  // primary legal sources; "open" allows the whole web.
  webResearch: "official" | "open"
  // Exa web-search key for citation discovery (dochaus/tool/web-search.ts reads
  // it from preferences.json per call). Never rendered into drafting.md — the
  // key must not enter the model's context.
  searchApiKey: string
  // Extra hosts the firm trusts as primary sources, on top of the built-in
  // official list (dochaus/lib/research.ts). Enforced by the webfetch fence,
  // not rendered into drafting.md. Bare hostnames, matched as host or subdomain.
  approvedSources: string[]
}

export const DEFAULT_DRAFTING: DraftingPreferences = {
  attorney: "",
  firm: "",
  posture: "balanced",
  formality: "formal",
  detail: "concise",
  responseLanguage: "auto",
  process: "plan-first",
  dateFormat: "iso",
  numberStyle: "numerals",
  houseStyle: "",
  webResearch: "official",
  searchApiKey: "",
  approvedSources: [],
}

export function readDraftingPreferences(): DraftingPreferences {
  if (!existsSync(JSON_FILE())) return DEFAULT_DRAFTING
  return { ...DEFAULT_DRAFTING, ...(JSON.parse(readFileSync(JSON_FILE(), "utf8")) as Partial<DraftingPreferences>) }
}

export function writeDraftingPreferences(input: DraftingPreferences): DraftingPreferences {
  const prefs = { ...DEFAULT_DRAFTING, ...input }
  mkdirSync(PREFS_DIR(), { recursive: true })
  writeFileSync(JSON_FILE(), JSON.stringify(prefs, null, 2) + "\n")
  writeFileSync(INSTRUCTIONS_FILE(), renderInstructions(prefs))
  return prefs
}

const POSTURE: Record<DraftingPreferences["posture"], string> = {
  "client-favorable":
    "在事实和现行法律允许的范围内，优先维护委托方在劳动争议中的诉求；不得隐瞒不利事实或夸大胜诉概率。",
  balanced: "以中立方式分析劳动者和用人单位双方的主张、证据、举证责任与风险。",
  conservative:
    "采取审慎立场：区分已证实事实、待证事实和法律判断，优先采用可由有效规范及证据支持的方案。",
}

const FORMALITY: Record<DraftingPreferences["formality"], string> = {
  formal: "Use formal legal drafting style throughout.",
  plain:
    "Prefer plain-language drafting: short sentences, minimal legalese, and defined terms only where they add real precision.",
}

const DETAIL: Record<DraftingPreferences["detail"], string> = {
  concise: "Keep explanations concise: lead with the conclusion, then a brief rationale.",
  detailed: "Explain your reasoning in detail, including the risks you considered and the alternatives you rejected.",
}

const LANGUAGE: Record<DraftingPreferences["responseLanguage"], string> = {
  auto: "Reply in the language used by the user unless they explicitly request another language. Preserve quoted source text in its original language.",
  "zh-CN": "Reply in Simplified Chinese unless the user explicitly requests another language. Draft work product in Simplified Chinese unless the requested document or source material requires another language.",
  en: "Reply in English unless the user explicitly requests another language. Draft work product in English unless the requested document or source material requires another language.",
}

const DATES: Record<DraftingPreferences["dateFormat"], string> = {
  "month-day-year": 'Write dates in the form "June 11, 2026".',
  "day-month-year": 'Write dates in the form "11 June 2026".',
  iso: 'Write dates in ISO form, "2026-06-11".',
}

const NUMBERS: Record<DraftingPreferences["numberStyle"], string> = {
  "words-and-numerals": 'In operative contract text, write numbers as words followed by numerals: "thirty (30) days".',
  numerals: 'Write numbers as plain numerals: "30 days".',
}

const PLAN_FIRST = [
  "<plan_first_drafting>",
  "用户启用了先分析后起草。制作或修改劳动争议文书时，依次完成并展示以下阶段：",
  "1. 案情与证据盘点：完整读取材料，列出主体、劳动关系、时间轴、工资口径、争议行为、诉求、已有证据和证据缺口。",
  "2. 请求权与程序分析：识别请求权基础、举证责任、仲裁时效、管辖和前置程序。仅引用已从现行官方来源核验的国家及重庆规则；规则包未就绪或无法核验时，明确标注，不得凭记忆补写。必要时调用 labor-reviewer 复核。",
  "3. 行动方案：逐项说明拟主张或抗辩、所需证据、计算口径、风险与待确认事项。",
  "4. 执行与校验：依据方案生成文书，再逐项回读核对事实、请求、金额、证据编号和法律依据。",
  "空案件也不得跳过：事实只能来自用户陈述，缺失内容必须作为待确认事项。一次对话已有方案时，后续仅更新变化部分并重新校验。",
  "</plan_first_drafting>",
].join("\n")

function renderInstructions(prefs: DraftingPreferences) {
  const who = prefs.attorney
    ? [`Documents are prepared by ${prefs.attorney}${prefs.firm ? ` of ${prefs.firm}` : ""}.`]
    : prefs.firm
      ? [`Documents are prepared by ${prefs.firm}.`]
      : []
  const house = prefs.houseStyle.trim()
  return [
    "# 劳动争议办案偏好",
    "",
    "<drafting_preferences>",
    "以下是本平台的全局办案偏好。起草、修改、提出文书建议或解释分析时均应遵守。",
    ...who,
    `- ${POSTURE[prefs.posture]}`,
    `- ${FORMALITY[prefs.formality]}`,
    `- ${DETAIL[prefs.detail]}`,
    `- ${LANGUAGE[prefs.responseLanguage]}`,
    `- ${DATES[prefs.dateFormat]}`,
    `- ${NUMBERS[prefs.numberStyle]}`,
    "</drafting_preferences>",
    ...(prefs.process === "plan-first" ? ["", PLAN_FIRST] : []),
    ...(house ? ["", "<house_style>", house, "</house_style>"] : []),
    "",
  ].join("\n")
}
