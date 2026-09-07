import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync, symlinkSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Document, Packer, Paragraph } from "docx"
import { readCasebook, saveCasebook, addCaseAnalysis, type CaseRow } from "./casebook"
import { extractDocumentText } from "./ingest"
import { parseManualIntake } from "../../../dochaus/lib/manual-intake"

test("manual intake persists profiles and timeline without fabricated evidence", async () => {
  const dir = workspace()
  const parsed = parseManualIntake("劳动者：张三；工龄：5年；基本工资：8000元/月；2020年3月1日入职", "worker")
  const result = await saveCasebook(dir, 0, parsed.rows, extractDocumentText)
  expect(result.rows).toHaveLength(5)
  expect(result.rows.find((item) => item.field === "tenure")?.detail).toBe("5年")
  expect(result.rows.every((item) => !item.source && item.status === "pending" && item.gap.includes("用户手动补充"))).toBe(true)
  expect(readCasebook(dir).rows).toEqual(result.rows)
})

const directories: string[] = []
function workspace() {
  const dir = mkdtempSync(path.join(tmpdir(), "labor-casebook-test-"))
  directories.push(dir)
  return dir
}
afterEach(() => directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))
const row = (patch: Partial<CaseRow> = {}): CaseRow => ({ id: "fact-1", kind: "fact", title: "入职", date: "2023-09-01", detail: "劳动者称2023年9月1日入职", position: "worker", status: "pending", links: [], gap: "", ...patch })
async function document(dir: string, text = "劳动者于2023年9月1日入职。") {
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph(text)] }] }))
  writeFileSync(path.join(dir, "劳动合同.docx"), buffer)
}

test("legacy matter returns empty workbench without modifying its files", () => {
  const dir = workspace()
  writeFileSync(path.join(dir, "matter.json"), '{"jurisdictions":["HK"]}')
  expect(readCasebook(dir)).toEqual({ version: 1, revision: 0, rows: [], analyses: [], staleSources: [] })
  expect(existsSync(path.join(dir, ".dochaus"))).toBe(false)
})

test("real Chinese DOCX extraction verifies quote and preserves conflicting accounts", async () => {
  const dir = workspace()
  await document(dir)
  const result = await saveCasebook(dir, 0, [row({ source: { document: "劳动合同.docx", quote: "2023年9月1日入职" } }), row({ id: "fact-2", position: "employer", detail: "单位主张实际入职时间另有约定" })], extractDocumentText)
  expect(result.rows).toHaveLength(2)
  expect(result.rows[0]!.source?.fingerprint).toHaveLength(64)
  expect(result.rows.map((r) => r.position)).toEqual(["worker", "employer"])
  expect(result.staleSources).toEqual([])
})

test("fabricated quote does not persist", async () => {
  const dir = workspace(); await document(dir)
  await expect(saveCasebook(dir, 0, [row({ source: { document: "劳动合同.docx", quote: "不存在的金额" } })], extractDocumentText)).rejects.toThrow("无法")
  expect(readCasebook(dir).revision).toBe(0)
})

test("source paths cannot escape matter, including symlinks", async () => {
  const dir = workspace(); const other = workspace(); await document(other)
  await expect(saveCasebook(dir, 0, [row({ source: { document: "../劳动合同.docx", quote: "入职" } })], extractDocumentText)).rejects.toThrow("来源")
  symlinkSync(path.join(other, "劳动合同.docx"), path.join(dir, "外部.docx"))
  await expect(saveCasebook(dir, 0, [row({ source: { document: "外部.docx", quote: "入职" } })], extractDocumentText)).rejects.toThrow("不属于")
})

test("assistant proposals append pending records without overwriting confirmed inputs", async () => {
  const dir = workspace(); await document(dir)
  await saveCasebook(dir, 0, [row({ status: "confirmed" })], extractDocumentText)
  const result = await saveCasebook(dir, 1, [row({ id: "fact-2", status: "confirmed", source: { document: "劳动合同.docx", quote: "入职" } })], extractDocumentText, "propose")
  expect(result.rows.map((r) => r.status)).toEqual(["confirmed", "pending"])
  await expect(saveCasebook(dir, 2, [row({ id: "fact-3" })], extractDocumentText, "propose")).rejects.toThrow("必须附原文")
})

test("changes invalidate earlier analysis and stale revisions cannot overwrite", async () => {
  const dir = workspace()
  await saveCasebook(dir, 0, [row({ status: "confirmed" })], extractDocumentText)
  addCaseAnalysis(dir, 1, "分析依据：入职时间待对照。")
  const changed = await saveCasebook(dir, 1, [row({ date: "2023-10-01", status: "pending" })], extractDocumentText)
  expect(changed.analyses[0]!.revision).toBeLessThan(changed.revision)
  await expect(saveCasebook(dir, 1, [], extractDocumentText)).rejects.toThrow("更新")
  expect(() => addCaseAnalysis(dir, 1, "过期分析")).toThrow("版本")
  expect(readCasebook(dir).rows).toHaveLength(1)
})

test("source replacement and deletion invalidate records; unchanged stale rows remain editable", async () => {
  const dir = workspace(); await document(dir)
  await saveCasebook(dir, 0, [row({ source: { document: "劳动合同.docx", quote: "入职" } })], extractDocumentText)
  await document(dir, "双方发生劳动争议。")
  expect(readCasebook(dir).staleSources).toEqual(["fact-1"])
  expect(() => addCaseAnalysis(dir, 1, "分析")).toThrow("来源")
  const current = readCasebook(dir)
  await saveCasebook(dir, 1, [...current.rows, row({ id: "manual" })], extractDocumentText)
  expect(readCasebook(dir).staleSources).toEqual(["fact-1"])
  rmSync(path.join(dir, "劳动合同.docx"))
  expect(readCasebook(dir).staleSources).toEqual(["fact-1"])
})

test("invalid IDs, links and statuses are rejected", async () => {
  const dir = workspace()
  await expect(saveCasebook(dir, 0, [row(), row()], extractDocumentText)).rejects.toThrow("重复")
  await expect(saveCasebook(dir, 0, [row({ links: ["missing"] })], extractDocumentText)).rejects.toThrow("关联")
  await expect(saveCasebook(dir, 0, [{ ...row(), status: "invented" }], extractDocumentText)).rejects.toThrow("状态")
})

test("request links and evidence gaps survive round trip", async () => {
  const dir = workspace()
  await saveCasebook(dir, 0, [row(), row({ id: "evidence", kind: "evidence", title: "工资记录" }), row({ id: "claim", kind: "claim", links: ["fact-1", "evidence"], gap: "缺少工资流水" })], extractDocumentText)
  expect(readCasebook(dir).rows[2]!.links).toEqual(["fact-1", "evidence"])
  expect(readCasebook(dir).rows[2]!.gap).toBe("缺少工资流水")
})

test("a new request can link existing facts without duplicating them", async () => {
  const dir = workspace()
  await saveCasebook(dir, 0, [row()], extractDocumentText)
  const result = await saveCasebook(dir, 1, [row({ id: "new-claim", kind: "claim", links: ["fact-1"] })], extractDocumentText, "propose")
  expect(result.rows).toHaveLength(2)
  expect(result.rows[1]!.links).toEqual(["fact-1"])
})

test("analysis arriving during document verification is retained", async () => {
  const dir = workspace(); await document(dir)
  const result = await saveCasebook(dir, 0, [row({ source: { document: "劳动合同.docx", quote: "入职" } })], async (name, buffer) => {
    addCaseAnalysis(dir, 0, "保存进行期间到达的旧版本分析")
    return extractDocumentText(name, buffer)
  })
  expect(result.analyses).toHaveLength(1)
  expect(result.analyses[0]!.revision).toBeLessThan(result.revision)
})
