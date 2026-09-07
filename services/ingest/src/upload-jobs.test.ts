import { expect, test } from "bun:test"
import { listUploadJobs, startUploadJob } from "./upload-jobs"
import { readOcrOutput } from "./pdf"

test("background uploads expose real progress, retain results and isolate matters", async () => {
  const matter = crypto.randomUUID()
  const gate = Promise.withResolvers<void>()
  const job = startUploadJob(matter, "材料.pdf", async (report) => {
    report({ stage: "ocr", completed: 2, total: 5 })
    await gate.promise
    report({ stage: "indexing", completed: 3, total: 3 })
    return { chunks: 3 }
  })
  await Promise.resolve()
  expect(listUploadJobs(matter)[0]?.progress).toEqual({ stage: "ocr", completed: 2, total: 5 })
  expect(listUploadJobs("unrelated")).toEqual([])
  expect(() => startUploadJob(matter, "材料.pdf", async () => null)).toThrow("正在处理")
  gate.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(job.status).toBe("success")
  expect(job.result).toEqual({ chunks: 3 })
  expect(job.progress.stage).toBe("complete")
})

test("failed upload preserves the error and does not claim completion", async () => {
  const job = startUploadJob(crypto.randomUUID(), "失败.pdf", async () => { throw new Error("模型缺失") })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(job.status).toBe("error")
  expect(job.error).toBe("模型缺失")
  expect(job.progress.stage).not.toBe("complete")
})

test("OCR stream reports page progress across split UTF-8 messages", async () => {
  const bytes = new TextEncoder().encode('{"stage":"ocr","completed":1,"total":2}\n{"text":"中文正文"}\n')
  const updates: unknown[] = []
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
    controller.close()
  } })
  expect(await readOcrOutput(stream, (value) => updates.push(value))).toBe("中文正文")
  expect(updates).toEqual([{ stage: "ocr", completed: 1, total: 2 }])
})
