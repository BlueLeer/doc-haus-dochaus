import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ReportProgress } from "./progress"

// Below this many text-layer characters per page the PDF is treated as a flat
// scan (image-only pages with at most stray stamps or bates numbers) and routed
// through OCR.
const SCANNED_CHARS_PER_PAGE = 100
const OCR_ROOT = path.join(import.meta.dir, "..")

// PDF -> text for indexing. markitdown (Python) is the primary extractor because
// it emits structural Markdown whose headings survive into sectionize(); unpdf is
// the floor when no Python tooling is on the host. Flat scans yield a near-empty
// text layer either way, so those fall through to OCR.
export async function pdfToText(pdfBytes: Buffer, report?: ReportProgress): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf")
  const pdf = await getDocumentProxy(new Uint8Array(pdfBytes))
  const text = (await markitdownText(pdfBytes)) ?? (await extractText(pdf, { mergePages: true })).text
  if (!looksScanned(text, pdf.numPages)) return text
  return (await ocrPdfText(pdfBytes, report)) ?? text
}

export function looksScanned(text: string, pageCount: number) {
  return text.trim().length < SCANNED_CHARS_PER_PAGE * pageCount
}

// One PaddleOCR process loads the local models once for all pages.
// Model downloads are a separate setup step, never part of an upload.
export async function ocrPdfText(pdfBytes: Buffer, report?: ReportProgress): Promise<string | null> {
  const pdftoppm = Bun.which("pdftoppm")
  const python = path.join(OCR_ROOT, ".venv-ocr", "bin", "python")
  if (!pdftoppm || !existsSync(python))
    throw new Error("PaddleOCR 环境未就绪：请安装 Poppler 并运行 services/ingest/scripts/setup-paddle-ocr.sh")
  const dir = mkdtempSync(path.join(tmpdir(), "dochaus-ocr-"))
  try {
    const src = path.join(dir, "in.pdf")
    writeFileSync(src, pdfBytes)
    // Phone-generated PDFs can declare oversized physical pages; unbounded
    // 300dpi rendering creates 10,000px images. Cap at an A4 300dpi long edge.
    const { getDocumentProxy } = await import("unpdf")
    const pdf = await getDocumentProxy(new Uint8Array(pdfBytes))
    const total = pdf.numPages
    report?.({ stage: "rendering", completed: 0, total })
    for (let page = 1; page <= total; page++) {
      const raster = Bun.spawn([pdftoppm, "-f", String(page), "-l", String(page), "-singlefile", "-r", "300", "-scale-to", "3508", "-gray", "-png", src, path.join(dir, `page-${String(page).padStart(6, "0")}`)], {
        stdout: "ignore",
        stderr: "ignore",
      })
      if ((await raster.exited) !== 0) throw new Error("PDF 页面转图失败，无法执行 PaddleOCR")
      report?.({ stage: "rendering", completed: page, total })
    }
    // pdftoppm zero-pads page numbers to a uniform width, so a plain sort is page order.
    const pages = readdirSync(dir)
      .filter((f) => f.endsWith(".png"))
      .sort()
    if (pages.length === 0) return null
    const list = path.join(dir, "pages.txt")
    writeFileSync(list, pages.map((f) => path.join(dir, f)).join("\n"))
    report?.({ stage: "ocr", completed: 0, total })
    const ocr = Bun.spawn([python, path.join(OCR_ROOT, "scripts", "paddle-ocr.py"), "--pages", list], { stdout: "pipe", stderr: "pipe" })
    const [text, error] = await Promise.all([readOcrOutput(ocr.stdout, report), new Response(ocr.stderr).text()])
    if ((await ocr.exited) !== 0) throw new Error(`PaddleOCR 识别失败：${error.trim().slice(-2000)}`)
    return text
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export async function readOcrOutput(stream: ReadableStream<Uint8Array>, report?: ReportProgress) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let pending = ""
  let text = ""
  function line(value: string) {
    if (!value.trim()) return
    const event = JSON.parse(value)
    if (typeof event.text === "string") text = event.text
    if (event.stage === "ocr") report?.({ stage: "ocr", completed: event.completed, total: event.total })
  }
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      pending += decoder.decode(result.value, { stream: true })
      const lines = pending.split("\n")
      pending = lines.pop()!
      lines.forEach(line)
    }
    line(pending + decoder.decode())
    return text
  } finally { reader.releaseLock() }
}

async function markitdownText(pdfBytes: Buffer): Promise<string | null> {
  const cmd = markitdownCommand()
  if (!cmd) return null
  const dir = mkdtempSync(path.join(tmpdir(), "dochaus-markitdown-"))
  try {
    const src = path.join(dir, "in.pdf")
    writeFileSync(src, pdfBytes)
    const proc = Bun.spawn([...cmd, src], { stdout: "pipe", stderr: "ignore" })
    const text = await new Response(proc.stdout).text()
    if ((await proc.exited) !== 0) return null
    return text
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// markitdown is Python, so it is never bundled. Use a PATH install when present,
// else run it through uvx, which caches the venv after the first call. Null when
// neither exists, in which case the caller falls back to unpdf.
function markitdownCommand() {
  const direct = Bun.which("markitdown")
  if (direct) return [direct]
  const uvx = Bun.which("uvx")
  if (uvx) return [uvx, "--quiet", "--from", "markitdown[pdf]", "markitdown"]
  return null
}
