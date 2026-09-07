import assert from "node:assert/strict"
import { Document, Packer, Paragraph } from "docx"
import type { CasebookView, CaseRow } from "../src/casebook"

const base = "http://127.0.0.1:4500"
async function get(url: string) {
  const response = await fetch(base + url)
  assert(response.ok, `${url}: ${response.status}`)
  return response.json()
}
async function post(url: string, value: unknown) {
  const response = await fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) })
  assert(response.ok, `${url}: ${await response.clone().text()}`)
  return response.json()
}
const before = await get("/matters") as { id: string }[]
for (const matter of before) {
  assert((await get(`/matters/${matter.id}`)).id === matter.id)
  assert((await get(`/matters/${matter.id}/casebook`)).version === 1)
}
await get("/templates"); await get("/workflows"); await get("/skills"); await get("/agents")
const matter = await post("/matters", { title: "P2回归验收（虚构材料）" }) as { id: string; dir: string; jurisdictions: string[] }
assert.deepEqual(matter.jurisdictions, ["CN-CQ"])
console.log(JSON.stringify({ matter: matter.id, directory: matter.dir, url: `http://localhost:5173/matter/${matter.id}?view=casebook` }))
try {
  const form = new FormData()
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children: [
    new Paragraph("劳动争议回归测试材料（全部虚构）"),
    new Paragraph("劳动者主张于2023年9月1日入职。单位主张于2023年10月1日入职。"),
    new Paragraph("月基本工资8000元，绩效2000元，实际发放情况待查。"),
  ] }] }))
  form.append("file", new File([new Uint8Array(buffer)], "P2虚构劳动材料.docx"))
  const upload = await fetch(`${base}/matters/${matter.id}/documents`, { method: "POST", body: form })
  assert(upload.ok, `upload: ${await upload.text()}`)
  const detail = await get(`/matters/${matter.id}`)
  assert(detail.documents.some((d: { name: string }) => d.name === "P2虚构劳动材料.docx"))
  const original: CaseRow = { id: "worker-fact", kind: "fact", title: "入职日期（劳动者主张）", date: "2023-09-01", detail: "劳动者主张入职日期", position: "worker", status: "pending", links: [], gap: "需补充考勤及合同", source: { document: "P2虚构劳动材料.docx", quote: "劳动者主张于2023年9月1日入职。" } }
  const rows = [original, { ...original, id: "employer-fact", title: "入职日期（单位主张）", detail: "单位主张入职日期与劳动者主张不同", position: "employer", date: "2023-10-01", source: { document: "P2虚构劳动材料.docx", quote: "单位主张于2023年10月1日入职。" } }]
  const proposed = await post(`/matters/${matter.id}/casebook`, { mode: "propose", revision: 0, rows }) as CasebookView
  assert.equal(proposed.rows.length, 2)
  const confirmed = await post(`/matters/${matter.id}/casebook`, { mode: "replace", revision: 1, rows: proposed.rows.map((r) => ({ ...r, status: "confirmed" })) }) as CasebookView
  await post(`/matters/${matter.id}/casebook`, { mode: "analysis", revision: 2, text: "入职日期存在争议，需要核对考勤与合同。本段为回归测试分析记录。" })
  const modified = await post(`/matters/${matter.id}/casebook`, { mode: "replace", revision: 2, rows: confirmed.rows.map((r, i) => i ? r : { ...r, gap: "补充社保缴费记录", status: "pending" }) }) as CasebookView
  assert(modified.analyses[0]!.revision < modified.revision)
  const conflict = await fetch(`${base}/matters/${matter.id}/casebook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "replace", revision: 1, rows: [] }) })
  assert.equal(conflict.status, 409)
  console.log("PASS: legacy cases, libraries, real DOCX upload/index, Chinese quote verification, conflicting accounts, confirmation, stale analysis, concurrent edit rejection")
} finally {
  if (!process.argv.includes("--keep")) {
    const response = await fetch(`${base}/matters/${matter.id}`, { method: "DELETE" })
    assert(response.ok)
    console.log("Removed only this run's synthetic test matter")
  }
}
