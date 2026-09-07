import assert from "node:assert/strict"

const id = process.argv[2]
assert(id && /^[a-z0-9-]+$/.test(id))
const matter = await (await fetch(`http://127.0.0.1:4500/matters/${id}`)).json() as { title: string; dir: string }
assert.equal(matter.title, "P2回归验收（虚构材料）")
const headers = { "Content-Type": "application/json", "x-opencode-directory": encodeURIComponent(matter.dir) }
const session = await (await fetch("http://127.0.0.1:4096/session", { method: "POST", headers, body: JSON.stringify({ title: "P2 审查提取回归" }) })).json() as { id: string }
const response = await fetch(`http://127.0.0.1:4096/session/${session.id}/message`, { method: "POST", headers,
  body: JSON.stringify({ agent: "labor", parts: [{ type: "text", text: "仅执行表格单元格提取，不创建工作台分析记录。文档：P2虚构劳动材料.docx。问题：材料记载的月基本工资是多少？使用 search-document 检索原文，简短回答并在末行使用 Source: §实际章节 标记来源。" }] }),
  signal: AbortSignal.timeout(120000),
})
assert(response.ok)
const result = await response.json() as { info?: { error?: unknown }; parts: { type: string; text?: string }[] }
assert(!result.info?.error, JSON.stringify(result.info?.error))
const text = result.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n")
assert(text.includes("8000") || text.includes("8,000"), text)
assert(/Source:\s*§?\s*.+/i.test(text), text)
console.log(`PASS: live review extraction through labor agent\n${text}`)
