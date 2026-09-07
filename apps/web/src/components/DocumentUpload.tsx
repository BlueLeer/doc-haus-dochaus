import { useEffect, useRef, useState } from "react"
import { deleteDocument, uploadDocument, getUploadJobs, type UploadJob, type Document } from "../api/ingest"
import { useToast } from "./Toast"
import { useI18n } from "../i18n"

// The matter's documents, as a collapsible right rail beside the chat. Chat is
// the primary surface, so documents sit out of its way: expanded the rail shows
// the indexed list plus a dropzone; collapsed it shrinks to a thin tab carrying
// the document count, reclaiming the width for the conversation.
export default function DocumentUpload({
  matterId,
  documents,
  onUploaded,
  onView,
  collapsed,
  onToggle,
}: {
  matterId: string
  documents: Document[]
  onUploaded: () => void
  onView: (name: string) => void
  // Rail mode (chat surface) is collapsible; the Documents surface omits these
  // and renders the full-width manager with no collapse affordance.
  collapsed?: boolean
  onToggle?: () => void
}) {
  const { t, date } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const uploadName = useRef("")
  const [busy, setBusy] = useState(false)
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [progressError, setProgressError] = useState("")
  const refreshRef = useRef(onUploaded)
  refreshRef.current = onUploaded
  const processing = busy || jobs.some((job) => job.status === "running")
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let previous = ""
    async function poll() {
      try {
        const next = await getUploadJobs(matterId)
        if (cancelled) return
        setJobs(next)
        setProgressError("")
        const completed = next.filter((job) => job.status === "success").map((job) => job.id).join(",")
        if (completed !== previous) refreshRef.current()
        previous = completed
      } catch {
        if (!cancelled) setProgressError("Progress disconnected; reconnecting. The background task may still be running.")
      } finally {
        if (!cancelled) timer = setTimeout(poll, 1000)
      }
    }
    poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [matterId])
  const [uploadStatus, setUploadStatus] = useState<{ type: "processing" | "success" | "error"; message: string }>()
  const [dragging, setDragging] = useState(false)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const toast = useToast()

  useEffect(() => {
    if (!confirmId) return
    const dismiss = () => setConfirmId(null)
    window.addEventListener("click", dismiss)
    return () => window.removeEventListener("click", dismiss)
  }, [confirmId])

  async function onFiles(files: File[]) {
    if (processing) return
    setBusy(true)
    try {
      for (const file of files) {
        uploadName.current = file.name
        setUploadStatus({ type: "processing", message: t("Extracting and indexing {name}...", { name: file.name }) })
        const result = await uploadDocument(matterId, file)
        onUploaded()
        // A flagged upload is a finding the lawyer needs to see, not a failure: the
        // document is indexed, the assistant treats the flagged text as untrusted,
        // and the warning says what ingest found.
        if (result.injection) {
          setUploadStatus({
            type: "success",
            message: t("Indexed {name}: {sections} sections, {chunks} chunks.", {
              name: result.name,
              sections: result.sections,
              chunks: result.chunks,
            }),
          })
          toast("warning", t(
            "Indexed {name} with warnings — possible prompt injection: {details}. The assistant will treat this content as untrusted.",
            {
              name: result.name,
              details: [...new Set(result.injection.findings.map((f) => f.detail))].join("; "),
            },
          ))
          continue
        }
        const message = t("Indexed {name}: {sections} sections, {chunks} chunks.", {
          name: result.name,
          sections: result.sections,
          chunks: result.chunks,
        })
        setUploadStatus({ type: "success", message })
        toast("success", message)
      }
    } catch (error) {
      const message = t("Could not index {name}: {error}", {
        name: uploadName.current,
        error: error instanceof Error ? error.message : String(error),
      })
      setUploadStatus({ type: "error", message })
      toast("error", message)
    } finally {
      setBusy(false)
    }
  }

  async function onRemove(name: string) {
    setConfirmId(null)
    setBusy(true)
    await deleteDocument(matterId, name)
    setBusy(false)
    onUploaded()
    toast("success", t("Removed {name}.", { name }))
  }

  const pending = documents.reduce((n, d) => n + (d.pending ?? 0), 0)

  if (collapsed) {
    return (
      <button className="docs-tab" onClick={onToggle} title={pending ? t("{count} pending changes to review", { count: pending }) : t("Show documents")}>
        <IconDocs />
        <span className="docs-tab-count">{documents.length}</span>
        <span className="docs-tab-label">{t("Documents")}</span>
        {pending > 0 && <span className="redline-badge">{pending}</span>}
      </button>
    )
  }

  return (
    <aside className={onToggle ? "card docs-rail" : "card docs-surface"}>
      <div className="docs-rail-head">
        <h2>{t("Documents")}</h2>
        {onToggle && (
          <button className="icon-btn" onClick={onToggle} title={t("Hide documents")}>
            <IconChevron />
          </button>
        )}
      </div>
      {documents.length === 0 ? (
        <div className="empty-inline">{t("No documents indexed yet.")}</div>
      ) : (
        <ul className="matter-list">
          {documents.map((d) => (
            <li key={d.id} className="doc-row">
              <div className="doc-row-main">
                <button className="linklike" onClick={() => onView(d.name)}>
                  {d.name}
                </button>
                {d.pending ? (
                  <span className="redline-badge" title={t("{count} pending changes to review", { count: d.pending })}>
                    {d.pending}
                  </span>
                ) : null}
              </div>
              <div className="doc-row-meta">
                <span className="muted">{date(d.created_at)}</span>
                {confirmId === d.id ? (
                  <button
                    className="icon-btn danger"
                    title={`Remove ${d.name} — indexed text is deleted and answers can no longer cite it`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(d.name)
                    }}
                  >
                    {t("Confirm")}
                  </button>
                ) : (
                  <button
                    className="doc-remove"
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmId(d.id)
                    }}
                    title={t("Remove {name}", { name: d.name })}
                    disabled={processing}
                  >
                    <IconTrash />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div
        className={`dropzone${dragging ? " dragover" : ""}`}
        style={{ marginTop: 12 }}
        onClick={() => !processing && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const files = Array.from(e.dataTransfer.files)
          if (files.length) onFiles(files)
        }}
      >
        {busy && uploadStatus?.type === "processing"
          ? uploadStatus.message
          : t("Drop .docx or .pdf documents here (scans OK), or click to choose files.")}
      </div>
      {progressError && <p role="status">{t(progressError)}</p>}
      {jobs.slice(-5).map((job) => {
        const labels = { extracting: "Extracting text", rendering: "Rendering PDF pages", ocr: "PaddleOCR recognition", preparing: "Preparing index and model", indexing: "Building index", complete: "Processing complete" }
        const measured = !!job.progress.total
        const percent = measured ? Math.round((job.progress.completed ?? 0) / job.progress.total! * 100) : undefined
        return <div key={job.id} style={{ marginTop: 12 }}>
          <div>{job.name} · {t(job.status === "error" ? "Processing failed" : labels[job.progress.stage])}</div>
          {job.status !== "error" && <progress aria-label={`${job.name} ${t(labels[job.progress.stage])}`} max={100} value={percent} style={{ width: "100%", accentColor: "#285649" }} />}
          <small>{job.status === "error" ? job.error : measured
            ? t("{completed} / {total} {unit} · stage {percent}%", { completed: job.progress.completed ?? 0, total: job.progress.total!, unit: t(job.progress.stage === "indexing" ? "chunks" : job.progress.stage === "complete" ? "items" : "pages"), percent: percent! })
            : t("Working; percentage unavailable for this stage…")}</small>
        </div>
      })}
      {uploadStatus && uploadStatus.type !== "processing" && (
        <p className={`upload-status upload-status-${uploadStatus.type}`} role="status">
          {uploadStatus.message}
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept=".docx,.pdf"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) onFiles(files)
          e.target.value = ""
        }}
      />
    </aside>
  )
}

function IconDocs() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function IconChevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}
