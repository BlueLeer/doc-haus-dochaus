import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { cachedText } from "./text-cache"
import { extractDocumentText } from "./ingest"

test("extraction cache persists, coalesces reads, and invalidates changed bytes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "text-cache-test-"))
  try {
    const file = path.join(dir, "scan.pdf")
    const bytes = Buffer.from("first")
    let calls = 0
    const extract = async () => { calls++; return "中文全文" }
    expect(await Promise.all([cachedText(file, bytes, extract), cachedText(file, bytes, extract)])).toEqual(["中文全文", "中文全文"])
    expect(await cachedText(file, bytes, extract)).toBe("中文全文")
    expect(calls).toBe(1)
    await cachedText(file, Buffer.from("changed"), extract)
    expect(calls).toBe(2)
    const failed = Buffer.from("failure")
    await expect(cachedText(file, failed, async () => { throw new Error("识别失败") })).rejects.toThrow("识别失败")
    expect(await cachedText(file, failed, extract)).toBe("中文全文")
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("real Chinese PDF full-text reads reuse identical persisted extraction", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "text-cache-pdf-"))
  try {
    const bytes = Buffer.from(await Bun.file(path.join(import.meta.dir, "fixtures/chinese-scanned.pdf")).arrayBuffer())
    const file = path.join(dir, "中文.pdf")
    const first = await extractDocumentText(file, bytes)
    expect(first.replace(/\s/g, "")).toContain("劳动合同")
    expect(await extractDocumentText(file, bytes)).toBe(first)
  } finally { await rm(dir, { recursive: true, force: true }) }
}, 120_000)
