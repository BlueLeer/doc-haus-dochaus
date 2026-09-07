import { CASE_FIELDS, type CaseField, type CaseRow } from "./casebook-model"

export const INTAKE_EXAMPLE = "乙方劳动者：张三\n甲方单位：重庆某公司\n工作年限：5年\n基本工资：8000元/月\n入职日期：2020年3月1日\n离职日期：2025年3月1日\n工作地点：重庆市渝中区"
const aliases: [CaseField, string][] = [
  ["worker", "乙方劳动者信息|乙方劳动者|劳动者信息|劳动者姓名|劳动者|乙方信息|乙方"],
  ["employer", "甲方单位信息|甲方单位|用人单位信息|用人单位|单位名称|甲方信息|甲方|单位"],
  ["tenure", "工作年限|工作年数|工龄|在职年限"],
  ["baseSalary", "基本工资|底薪"], ["performancePay", "绩效工资|绩效"],
  ["bonus", "奖金"], ["allowances", "津贴|补贴"], ["salary", "工资结构|月工资|工资"],
  ["joined", "入职日期|入职时间|入职"], ["departed", "离职日期|离职时间|离职"],
  ["serviceDate", "送达日期|送达时间"], ["applicationDate", "申请日期|申请时间"],
  ["hearingDate", "开庭日期|开庭时间"], ["awardDate", "裁决日期|裁决时间"],
  ["workplace", "工作地点|工作地"], ["employerAddress", "单位所在地|单位地址"],
  ["performancePlace", "合同履行地"], ["stance", "委托立场|代理立场"], ["stage", "争议阶段|案件阶段"],
  ["salaryCycle", "工资支付周期|发薪周期"], ["actualPay", "实发工资"],
]
const dateFields = new Set<CaseField>(["joined", "departed", "serviceDate", "applicationDate", "hearingDate", "awardDate"])
const labels = aliases.flatMap(([field, words]) => words.split("|").map((label) => ({ field, label }))).sort((a, b) => b.label.length - a.label.length)
const events: Record<string, CaseField> = { 入职: "joined", 离职: "departed", 开庭: "hearingDate", 送达: "serviceDate", 裁决: "awardDate" }

// Deliberately bounded local parser: preserve unknown text, never infer legal
// status, wage periods, or dates from service duration. No remote model calls.
export function parseManualIntake(text: string, position: CaseRow["position"]) {
  const rows: CaseRow[] = []
  const unmatched: string[] = []
  for (const original of text.split(/[\n；;，]|。(?!\d)/).map((line) => line.trim()).filter(Boolean)) {
    const found = labels.find((item) => original.startsWith(item.label))
    // Also accept a dated event in ordinary order, e.g. "2020年3月1日入职".
    const event = !found && original.match(/^(\d{4}(?:年\d{1,2}月(?:\d{1,2}日)?|[-/]\d{1,2}(?:[-/]\d{1,2})?))\s*(入职|离职|开庭|送达|裁决)(.*)$/)
    const field = found?.field ?? (event && event[2] ? events[event[2]] : undefined)
    const value = found ? original.slice(found.label.length).trim().replace(/^(?:[：:=]|为|是)\s*/, "").trim() : event ? `${event[1]}${event[3]}`.trim() : ""
    if (!field || !value || /^[：:=\s]+$/.test(value)) { unmatched.push(original); continue }
    const date = dateFields.has(field) ? value.match(/^(\d{4})[年/-](\d{1,2})(?:[月/-](\d{1,2})日?)?月?$/) : null
    const normalized = date && date[1] && date[2] && date[3] && validDate(+date[1], +date[2], +date[3]) ? `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}` : ""
    const gap = `用户手动补充，尚无材料佐证。录入原话：${original}${dateFields.has(field) && !normalized ? "。日期不完整或无法核验，请补充。" : ""}${/^[甲乙]方/.test(original) ? "。甲乙方与劳动者/用人单位身份对应关系请核对。" : ""}`
    rows.push({ id: crypto.randomUUID(), kind: "profile", field, title: CASE_FIELDS[field], date: normalized,
      detail: value, position, status: "pending", links: [], gap })
    if (dateFields.has(field)) rows.push({ id: crypto.randomUUID(), kind: "fact", title: CASE_FIELDS[field], date: normalized,
      detail: original, position, status: "pending", links: [], gap })
  }
  return { rows, unmatched }
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}
