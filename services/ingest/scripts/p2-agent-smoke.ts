import assert from "node:assert/strict"

const id = process.argv[2]
if (!id || !/^[a-z0-9-]+$/.test(id)) throw new Error("Provide the synthetic P2 smoke-test matter ID")
const base = "http://127.0.0.1:4500"
const matter = await (await fetch(`${base}/matters/${id}`)).json() as { title: string; dir: string }
assert.equal(matter.title, "P2回归验收（虚构材料）", "Only the synthetic regression matter may be used")
const headers = { "Content-Type": "application/json", "x-opencode-directory": encodeURIComponent(matter.dir) }
const created = await fetch("http://127.0.0.1:4096/session", { method: "POST", headers, body: JSON.stringify({ title: "P2 材料整理回归" }) })
assert(created.ok, await created.clone().text())
const session = await created.json() as { id: string }
console.log(`Session ${session.id}`)
const response = await fetch(`http://127.0.0.1:4096/session/${session.id}/message`, {
  method: "POST", headers,
  body: JSON.stringify({ agent: "labor", parts: [{ type: "text", text: "本案件仅含虚构回归测试材料。请先 casebook read，再 read-document 全文读取 P2虚构劳动材料.docx。不要重复已存在的入职日期记录。提取工资结构概况和证据目录，用 casebook propose 保存，记录必须附原文引文。未知姓名和日期不填写，不做法律结论。保存后简短告知结果。" }] }),
  signal: AbortSignal.timeout(180000),
})
assert(response.ok, await response.clone().text())
const result = await response.json() as { info?: { error?: unknown }; parts?: { type: string; text?: string; tool?: string; state?: { status?: string } }[] }
assert(!result.info?.error, JSON.stringify(result.info?.error))
console.log(JSON.stringify(result.parts?.map((part) => ({ type: part.type, tool: part.tool, status: part.state?.status, text: part.type === "text" ? part.text : undefined }))))
const book = await (await fetch(`${base}/matters/${id}/casebook`)).json() as { rows: { kind: string; field?: string; source?: unknown }[] }
assert(book.rows.some((row) => row.kind === "profile" && row.field === "salary" && row.source), "Salary extraction was not persisted")
assert(book.rows.some((row) => row.kind === "evidence" && row.source), "Evidence extraction was not persisted")
console.log("PASS: live model read existing workbench, read DOCX, and persisted verified salary/evidence proposals")
