import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"

import { CASE_FIELDS, type CaseSource, type CaseRow, type Casebook, type CasebookView } from "../../../dochaus/lib/casebook-model"
export type { CaseRow, Casebook, CasebookView } from "../../../dochaus/lib/casebook-model"

export class CasebookError extends Error {
  constructor(message: string, public status: 400 | 409 = 400) { super(message) }
}

const file = (dir: string) => path.join(dir, ".dochaus", "casebook.json")
const fingerprint = (dir: string, name: string) => createHash("sha256").update(readFileSync(path.join(dir, name))).digest("hex")
const localSource = (dir: string, name: string) => existsSync(path.join(dir, name)) && path.dirname(realpathSync(path.join(dir, name))) === realpathSync(dir)

export function readCasebook(dir: string): CasebookView {
  const state: Casebook = existsSync(file(dir))
    ? JSON.parse(readFileSync(file(dir), "utf8"))
    : { version: 1, revision: 0, rows: [], analyses: [] }
  const staleSources = state.rows.filter((row) => row.source && (
    !localSource(dir, row.source.document) || row.source.fingerprint !== fingerprint(dir, row.source.document)
  )).map((row) => row.id)
  return { ...state, staleSources }
}

export function parseRows(input: unknown, existingIds: string[] = []): CaseRow[] {
  if (!Array.isArray(input) || input.length > 500) throw new CasebookError("案件记录必须是数组，最多500条")
  const ids = new Set<string>(existingIds)
  const rows = input.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new CasebookError("案件记录格式无效")
    const row = value as Record<string, unknown>
    for (const key of ["id", "title", "date", "detail", "gap"]) {
      if (typeof row[key] !== "string" || (row[key] as string).length > 20000) throw new CasebookError(`字段 ${key} 无效`)
    }
    if (!row.id || ids.has(row.id as string)) throw new CasebookError("记录编号不能为空或重复")
    ids.add(row.id as string)
    if (!["profile", "fact", "evidence", "claim"].includes(String(row.kind))) throw new CasebookError("记录类型无效")
    if (row.kind === "profile" && !Object.hasOwn(CASE_FIELDS, String(row.field))) throw new CasebookError("案件概况字段无效")
    if (!["neutral", "worker", "employer", "disputed"].includes(String(row.position))) throw new CasebookError("事实立场无效")
    if (!["pending", "confirmed"].includes(String(row.status))) throw new CasebookError("确认状态无效")
    if (!Array.isArray(row.links) || row.links.some((id) => typeof id !== "string")) throw new CasebookError("关联记录无效")
    if (row.source !== undefined) {
      const source = row.source as CaseSource
      if (!source || typeof source.document !== "string" || !source.document || path.basename(source.document) !== source.document || source.document.startsWith(".") || !/\.(docx|pdf)$/i.test(source.document)) throw new CasebookError("来源必须是本案件中的 DOCX 或 PDF")
      if (typeof source.quote !== "string" || !source.quote.trim()) throw new CasebookError("来源引文不能为空")
    }
    return { id: row.id, kind: row.kind, field: row.field, title: row.title, date: row.date, detail: row.detail,
      position: row.position, status: row.status, source: row.source, links: row.links, gap: row.gap } as CaseRow
  })
  if (rows.some((row) => row.links.some((id) => !ids.has(id) || id === row.id))) throw new CasebookError("关联记录不存在或指向自身")
  return rows
}

// Extractors are injected so tests exercise real persistence and quote validation
// without loading the embedding model. Production uses the same DOCX/PDF extractor as uploads.
export async function saveCasebook(
  dir: string, revision: number, input: unknown,
  extract: (name: string, buffer: Buffer) => Promise<string>,
  mode: "replace" | "propose" = "replace",
) {
  const current = readCasebook(dir)
  if (current.revision !== revision) throw new CasebookError("案件已被其他操作更新，请重新加载后保存", 409)
  const rows = mode === "propose" ? parseRows([...current.rows, ...parseRows(input, current.rows.map((row) => row.id)).map((row) => ({ ...row, status: "pending" }))]) : parseRows(input)
  if (mode === "propose" && rows.slice(current.rows.length).some((row) => row.kind !== "claim" && !row.source)) throw new CasebookError("从材料提取的概况、事实和证据必须附原文来源；未知内容写入缺口")
  const verified = new Map<string, { text: string; hash: string }>()
  for (const row of rows) {
    if (!row.source) continue
    const previous = current.rows.find((item) => item.id === row.id)
    // Preserve stale evidence when editing unrelated fields, but never re-confirm it.
    if (previous && JSON.stringify(previous) === JSON.stringify(row)) continue
    const name = row.source.document
    if (!localSource(dir, name)) throw new CasebookError(`来源文档不存在或不属于本案件：${name}`)
    if (!verified.has(name)) {
      const buffer = readFileSync(path.join(dir, name))
      verified.set(name, { text: await extract(path.join(dir, name), buffer), hash: createHash("sha256").update(buffer).digest("hex") })
    }
    const source = verified.get(name)!
    if (!source.text.includes(row.source.quote)) throw new CasebookError(`引文无法在“${name}”中核验，请复制原文`)
    row.source = { document: name, quote: row.source.quote, fingerprint: source.hash }
  }
  const latest = readCasebook(dir)
  if (latest.revision !== revision) throw new CasebookError("案件已更新，请重新加载", 409)
  for (const [name, source] of verified) {
    if (!localSource(dir, name) || fingerprint(dir, name) !== source.hash) throw new CasebookError("核验过程中来源文档已变化，请重试", 409)
  }
  const state: Casebook = { version: 1, revision: revision + 1, rows, analyses: latest.analyses }
  persist(dir, state)
  return readCasebook(dir)
}

export function addCaseAnalysis(dir: string, revision: number, text: string) {
  const current = readCasebook(dir)
  if (current.revision !== revision) throw new CasebookError("分析所依据的案件版本已变化，请重新分析", 409)
  if (typeof text !== "string" || !text.trim() || text.length > 100000) throw new CasebookError("分析内容无效")
  if (current.staleSources.length) throw new CasebookError("有来源文档已变化，请先核验相关记录")
  persist(dir, { version: 1, revision, rows: current.rows, analyses: [...current.analyses,
    { id: randomUUID(), text, revision, createdAt: Date.now() }] })
  return readCasebook(dir)
}

function persist(dir: string, state: Casebook) {
  mkdirSync(path.join(dir, ".dochaus"), { recursive: true })
  const temporary = `${file(dir)}.${randomUUID()}.tmp`
  writeFileSync(temporary, JSON.stringify(state, null, 2))
  renameSync(temporary, file(dir))
}
