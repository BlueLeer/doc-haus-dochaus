import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

// Bump when extraction/model settings change. Cache raw text so injection
// detection and normalization still run for every consumer.
const VERSION = "paddleocr-v6-small-3508-v1"
const pending = new Map<string, Promise<string>>()

export async function cachedText(file: string, bytes: Buffer, extract: () => Promise<string>) {
  if (!path.isAbsolute(file)) return extract()
  const dir = path.join(path.dirname(file), ".dochaus", "text-cache")
  const key = createHash("sha256").update(VERSION).update(path.extname(file).toLowerCase()).update(bytes).digest("hex")
  const target = path.join(dir, `${key}.txt`)
  const active = pending.get(target)
  if (active) return active
  const task = (async () => {
    const saved = await readFile(target, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    if (saved !== undefined) return saved
    const text = await extract()
    await mkdir(dir, { recursive: true })
    const temp = `${target}.${crypto.randomUUID()}.tmp`
    await writeFile(temp, text, { mode: 0o600 })
    await rename(temp, target)
    return text
  })()
  pending.set(target, task)
  try { return await task } finally { pending.delete(target) }
}
