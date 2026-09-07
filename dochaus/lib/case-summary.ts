import { CASE_FIELDS, type CaseField, type CaseRow } from "./casebook-model"
import { parseManualIntake } from "./manual-intake"

const positions = { neutral: "材料记载", worker: "劳动者主张", employer: "用人单位主张", disputed: "双方存在争议" }
const profileOrder: CaseField[] = ["worker", "employer", "stance", "stage", "workplace", "employerAddress", "performancePlace", "joined", "departed", "tenure", "salary", "baseSalary", "performancePay", "bonus", "allowances", "salaryCycle", "actualPay", "applicationDate", "hearingDate", "awardDate", "serviceDate"]
const brief = (text: string, limit: number) => text.length > limit ? `${text.slice(0, limit - 2)}……` : text

export function buildCaseSummary(rows: CaseRow[]) {
  if (!rows.length) return "尚无可供整理的案件记录。请上传材料整理，或直接在这里填写案情。"
  const profiles = profileOrder.flatMap((field) => rows.filter((row) => row.kind === "profile" && row.field === field)
    .map((row) => `${CASE_FIELDS[field]}：${brief(row.detail || "尚待补充", 300)}${row.position === "neutral" ? "" : `（${positions[row.position]}）`}`))
  const facts = rows.filter((row) => row.kind === "fact").sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))
    .map((row) => `${row.date || "时间待明确"}：${brief(row.detail || row.title || "事实内容待补充", 500)}${row.position === "neutral" ? "" : `（${positions[row.position]}）`}`)
  const claims = rows.filter((row) => row.kind === "claim").map((row) => `${brief(row.detail || row.title || "请求内容待补充", 500)}${row.position === "neutral" ? "" : `（${positions[row.position]}）`}`)
  const evidence = rows.filter((row) => row.kind === "evidence").map((row) => `${brief(row.title || "证据", 100)}：${brief(row.detail || "证明目的待补充", 300)}`)
  const sections = [
    profiles.length ? `一、案件基本情况\n${profiles.join("\n")}` : "",
    facts.length ? `二、案件经过\n${facts.join("\n")}` : "",
    claims.length ? `三、当前请求\n${claims.join("\n")}` : "",
    evidence.length ? `四、主要证据\n${evidence.join("\n")}` : "",
  ].filter(Boolean)
  return brief(sections.join("\n\n"), 100000)
}

export function synchronizeSummaryRows(text: string, rows: CaseRow[]) {
  const sections = summarySections(text)
  const next = [...rows]
  const touched = new Set<string>()
  const labels = Object.entries(CASE_FIELDS).sort((a, b) => b[1].length - a[1].length)
  for (const line of sections.profile) {
    const match = labels.find(([, label]) => line.startsWith(`${label}：`))
    if (!match) continue
    const field = match[0] as CaseField
    const detail = cleanPosition(line.slice(match[1].length + 1))
    if (!detail || detail === "尚待补充") continue
    const existing = next.filter((row) => row.kind === "profile" && row.field === field)
    if (existing.some((row) => row.detail.trim() === detail)) continue
    if (existing.length === 1) {
      const index = next.findIndex((row) => row.id === existing[0]!.id)
      next[index] = { ...existing[0]!, detail, status: "confirmed" }
      touched.add(existing[0]!.id)
      continue
    }
    const id = crypto.randomUUID()
    next.push({ id, kind: "profile", field, title: CASE_FIELDS[field], date: "", detail,
      position: existing.length ? "disputed" : "neutral", status: "confirmed", links: [],
      gap: existing.length ? "案情摘要与既有多项说法不一致，需核对。" : "律师在案情整理中补充，尚无材料佐证。" })
    touched.add(id)
  }
  const facts = rows.filter((row) => row.kind === "fact").sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))
  const factInputs = sections.fact.flatMap((line) => {
    const match = line.match(/^(时间待明确|\d{4}-\d{2}-\d{2})：(.+)$/)
    if (!match?.[1] || !match[2]) return []
    return [{ date: match[1] === "时间待明确" ? "" : match[1], detail: cleanPosition(match[2]) }]
  })
  const used = new Set(factInputs.flatMap((input) => facts.filter((row) => row.date === input.date && row.detail.trim() === input.detail).map((row) => row.id)))
  factInputs.forEach((input, index) => {
    if (facts.some((row) => row.date === input.date && row.detail.trim() === input.detail)) return
    const dated = input.date ? facts.filter((row) => !used.has(row.id) && row.date === input.date) : []
    const current = dated.length === 1 ? dated[0] : factInputs.length === facts.length && facts[index] && !used.has(facts[index]!.id) ? facts[index] : undefined
    if (current) {
      const rowIndex = next.findIndex((row) => row.id === current.id)
      next[rowIndex] = { ...current, date: input.date, detail: input.detail, status: "confirmed" }
      touched.add(current.id)
      used.add(current.id)
      return
    }
    const id = crypto.randomUUID()
    next.push({ id, kind: "fact", title: "律师补充事实", date: input.date, detail: input.detail, position: "neutral",
      status: "confirmed", links: [], gap: "律师在案情整理中补充，尚无材料佐证。" })
    touched.add(id)
  })
  if (!sections.profile.length && !sections.fact.length) {
    for (const candidate of parseManualIntake(text, "neutral").rows) {
      if (next.some((row) => row.kind === candidate.kind && row.field === candidate.field && row.date === candidate.date && row.detail.trim() === candidate.detail.trim())) continue
      const existing = candidate.kind === "profile" && candidate.field ? next.filter((row) => row.kind === "profile" && row.field === candidate.field) : []
      if (existing.length === 1) {
        const index = next.findIndex((row) => row.id === existing[0]!.id)
        next[index] = { ...existing[0]!, detail: candidate.detail, date: candidate.date, status: "confirmed" }
        touched.add(existing[0]!.id)
        continue
      }
      next.push({ ...candidate, status: "confirmed" })
      touched.add(candidate.id)
    }
  }
  return { rows: next, touched: [...touched] }
}

function summarySections(text: string) {
  const result = { profile: [] as string[], fact: [] as string[] }
  let section: keyof typeof result | undefined
  for (const value of text.split("\n").map((line) => line.trim()).filter(Boolean)) {
    if (/^一、案件基本情况/.test(value)) { section = "profile"; continue }
    if (/^二、案件经过/.test(value)) { section = "fact"; continue }
    if (/^[三四五六七八九十]+、/.test(value)) { section = undefined; continue }
    if (section) result[section].push(value)
  }
  return result
}

function cleanPosition(value: string) {
  return value.replace(/（(?:材料记载|劳动者主张|用人单位主张|双方存在争议)）$/, "").trim()
}

export function reviewReasons(row: CaseRow, rows: CaseRow[], staleSources: string[]) {
  const reasons = [
    staleSources.includes(row.id) ? "来源已变化" : "",
    row.position === "disputed" ? "存在争议" : "",
    row.kind === "fact" && !row.date ? "事件时间待明确" : "",
    row.kind === "profile" && row.field && rows.some((item) => item.id !== row.id && item.kind === "profile" && item.field === row.field && item.detail.trim() !== row.detail.trim()) ? "同一要素存在不同说法" : "",
    /日期不完整|无法核验|待补充关键|送达.*待确认/.test(row.gap) ? "关键信息待补充" : "",
  ].filter(Boolean)
  return [...new Set(reasons)]
}
