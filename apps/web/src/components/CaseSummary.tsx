import { useEffect, useMemo, useState } from "react"
import { saveCaseSummary, type CasebookView, type CaseRow } from "../api/ingest"
import { buildCaseSummary, reviewReasons, synchronizeSummaryRows } from "../../../../dochaus/lib/case-summary"

export default function CaseSummary({ matterId, state, rows, dirty, busy, onBusy, onSaved, onError, onOpenRecord }: {
  matterId: string; state: CasebookView; rows: CaseRow[]; dirty: boolean; busy: boolean
  onBusy: (busy: boolean) => void; onSaved: (state: CasebookView, message: string) => void; onError: (message: string) => void; onOpenRecord: (row: CaseRow) => void
}) {
  const generated = useMemo(() => buildCaseSummary(rows), [rows])
  const baseText = state.summary?.basedOnRevision === state.revision ? state.summary.draft : generated
  const [text, setText] = useState(baseText)
  const [editing, setEditing] = useState(!state.summary?.draft)
  const unsaved = text.trim() !== baseText.trim()
  useEffect(() => {
    setText(state.summary?.basedOnRevision === state.revision ? state.summary.draft : generated)
    if (state.summary && state.summary.basedOnRevision !== state.revision) setEditing(true)
  }, [matterId, state.revision, state.summary?.updatedAt])
  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [unsaved])
  const latest = state.summary?.confirmed.at(-1)
  const stale = dirty || (!!latest && (latest.revision !== state.revision || latest.rowIds.length !== rows.length || latest.rowIds.some((id) => !rows.some((row) => row.id === id))))
  const synchronized = useMemo(() => synchronizeSummaryRows(text, rows), [text, rows])
  const confirmed = !!latest && !stale && latest.text === state.summary?.draft && !synchronized.touched.length
  const attention = rows.map((row) => ({ row, reasons: reviewReasons(row, rows, state.staleSources) })).filter((item) => item.reasons.length)

  async function submit(confirm: boolean) {
    if (dirty) { onError("请先保存下方案件记录，再确认案情摘要。这样可以确保摘要与案件版本一致。"); return }
    onBusy(true); onError("")
    try {
      const value = await saveCaseSummary(matterId, state.revision, state.summary?.updatedAt ?? 0, text, confirm, synchronized.rows)
      onSaved(value, confirm ? `已形成案情摘要 V${value.summary?.confirmed.length ?? 1}，同步至案件 V${value.revision}。` : `案情草稿及结构化记录已同步至案件 V${value.revision}。`)
      if (confirm) setEditing(false)
    } catch (error) { onError(error instanceof Error ? error.message : "保存案情摘要失败") }
    finally { onBusy(false) }
  }

  return <section className="case-summary-editor">
    <header><div><div className="case-summary-version"><span className={`case-summary-state ${confirmed ? "confirmed" : stale || synchronized.touched.length ? "stale" : "draft"}`}>{confirmed ? "律师确认版" : synchronized.touched.length ? `有 ${synchronized.touched.length} 条待同步` : stale ? "案件有变化 · 待更新" : "待律师核对"}</span><span>案件 V{state.revision}</span><span>摘要 V{state.summary?.confirmed.length ?? 0}</span></div><h3>案情整理</h3><p>在这一处阅读、补充和修改完整案情；确认后，识别出的案件要素和案件经过会同步更新。</p></div>
      <div className="case-summary-actions"><button disabled={busy} onClick={() => setEditing(!editing)}>{editing ? "阅读模式" : "编辑案情"}</button><button disabled={busy} onClick={() => { if (text !== generated && !window.confirm("重新整理会替换当前未保存的案情文字，是否继续？")) return; setText(generated); setEditing(true) }}>根据工作台重新整理</button></div>
    </header>
    {editing ? <textarea aria-label="案情摘要正文" value={text} maxLength={100000} onChange={(event) => setText(event.target.value)} /> : <div className="case-summary-reading">{text.split("\n").map((line, index) => line ? <p key={index}>{line}</p> : <br key={index} />)}</div>}
    <footer><div><strong>{unsaved ? `案情有尚未保存的修改${synchronized.touched.length ? `，确认时将同步 ${synchronized.touched.length} 条结构化记录` : ""}` : attention.length ? `${attention.length} 项需要重点处理` : "暂无必须逐项处理的异常"}</strong><small>确认表示采用本摘要作为当前办案口径；同步修改会保留原文来源，但不代表争议事实已经获证明或对方认可。</small></div>
      <div><button disabled={busy || !text.trim() || (!unsaved && !synchronized.touched.length)} onClick={() => submit(false)}>保存案情</button><button className="case-primary" disabled={busy || !text.trim() || confirmed} onClick={() => submit(true)}>确认当前案情</button></div>
    </footer>
    {!!attention.length && <details className="case-summary-attention"><summary>查看需要重点处理的事项</summary>{attention.map(({ row, reasons }) => <button key={row.id} onClick={() => onOpenRecord(row)}><strong>{row.title || row.detail.slice(0, 36) || "未命名记录"}</strong><span>{reasons.join(" · ")}</span></button>)}</details>}
    {!!state.summary?.confirmed.length && <details className="case-summary-history"><summary>历史确认版本（{state.summary.confirmed.length}）</summary>{[...state.summary.confirmed].reverse().map((version, index) => <details key={version.id}><summary>律师确认版 V{state.summary!.confirmed.length - index} · {new Date(version.createdAt).toLocaleString()} · 案件 V{version.revision}</summary><pre>{version.text}</pre></details>)}</details>}
  </section>
}
