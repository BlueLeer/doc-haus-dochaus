import { useEffect, useRef, useState } from "react"
import { getCasebook, saveCasebook, type CasebookView, type CaseRow, type CaseField } from "../api/ingest"
import "./case-workbench.css"
import { CASE_FIELDS } from "../../../../dochaus/lib/casebook-model"
import CaseSelect from "./CaseSelect"
import CaseSummary from "./CaseSummary"
import { changedRecordCount, recordFilters, visibleRecords } from "./case-workbench-list"
import { buildCaseSummary, reviewReasons } from "../../../../dochaus/lib/case-summary"

const fields = CASE_FIELDS
const kinds = { profile: "案件要素", fact: "案件经过", evidence: "证据目录", claim: "请求与证据矩阵" }
const positions = { neutral: "中立记载", worker: "劳动者主张", employer: "单位主张", disputed: "存在争议" }

export default function CaseWorkbench({ matterId, onView, onExtract }: {
  matterId: string; onView: (name: string) => void; onExtract: () => void
}) {
  const [state, setState] = useState<CasebookView>()
  const [rows, setRows] = useState<CaseRow[]>([])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [kind, setKind] = useState<CaseRow["kind"]>("profile")
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<keyof typeof recordFilters>("all")
  const [active, setActive] = useState<string>()
  const [quickDate, setQuickDate] = useState("")
  const [quickText, setQuickText] = useState("")
  const editor = useRef<HTMLElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const visible = visibleRecords(rows, kind, query, filter, state?.staleSources ?? [])
  const changed = changedRecordCount(rows, state?.rows ?? [])
  const dirty = state && JSON.stringify(rows) !== JSON.stringify(state.rows)
  const latestSummary = state?.summary?.confirmed.at(-1)
  const summaryCoversCurrent = !!state && !dirty && !!latestSummary && latestSummary.revision === state.revision && latestSummary.text === state.summary?.draft && buildCaseSummary(rows) === state.summary?.draft
  const attentionCount = state ? rows.filter((row) => reviewReasons(row, rows, state.staleSources).length).length : 0

  useEffect(() => { setActive(undefined) }, [matterId])
  useEffect(() => { if (active) { editor.current?.focus({ preventScroll: true }); editor.current?.scrollTo(0, 0) } }, [active])

  function closeEditor() { setActive(undefined); list.current?.focus() }
  function addRecord(field?: CaseField) {
    const id = crypto.randomUUID()
    setRows((items) => [...items, { id, kind, ...(kind === "profile" ? { field: field ?? "stance" } : {}), title: field ? fields[field] : "", date: "", detail: "", position: "neutral", status: "pending", links: [], gap: "" }])
    setQuery(""); setFilter("all"); setActive(id); setNotice("")
  }
  useEffect(() => {
    let cancelled = false
    getCasebook(matterId).then((value) => { if (!cancelled) { setState(value); setRows(value.rows) } }).catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [matterId])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  function change(id: string, patch: Partial<CaseRow>) {
    setNotice("")
    setRows((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item))
  }
  async function save() {
    if (!state) return
    setBusy(true); setError(""); setNotice("")
    try {
      const value = await saveCasebook(matterId, state.revision, rows)
      setState(value); setRows(value.rows); setNotice("已保存，既有分析将按案件版本提示更新。")
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败") }
    finally { setBusy(false) }
  }
  async function reload() {
    if (dirty && !window.confirm("重新加载会放弃尚未保存的修改，是否继续？")) return
    setError("")
    try { const value = await getCasebook(matterId); setState(value); setRows(value.rows) }
    catch (e) { setError(e instanceof Error ? e.message : "读取失败") }
  }

  return <section className="case-workbench">
    <header className="case-toolbar">
      <div><span className="case-eyebrow">摘要 · 要素 · 经过 · 证据</span><h2>案件工作台</h2><p>先核对案情摘要，仅在冲突或关键缺失时进入底层记录。</p></div>
      <div className="case-actions">
        <button className="case-secondary" disabled={busy || !!dirty} onClick={onExtract}>从材料整理</button>
        <button disabled={busy} onClick={reload}>重新加载</button>
        <span className="case-save-state" role="status">{changed ? `${changed} 条底层修改未保存` : "已同步"}</span>
        {dirty && <button className="case-primary" disabled={busy} onClick={save}>{busy ? "保存中…" : "保存底层修改"}</button>}
      </div>
    </header>
    {error && <p role="alert" className="case-error">{error}</p>}
    {notice && <p className="case-notice" role="status">{notice}</p>}
    {dirty && <p className="case-unsaved" role="status">有尚未保存的修改，请保存后再切换页面。</p>}
    {!state ? <p>正在读取案件工作台…</p> : <>
      <div className="case-summary">
        <div><span>案件版本</span><strong><small>V</small>{state.revision}</strong></div>
        <div><span>全部记录</span><strong>{rows.length}<small> 条</small></strong></div>
        <div className="case-summary-pending"><span>需重点处理</span><strong>{attentionCount}<small> 条</small></strong></div>
        <div className={state.staleSources.length ? "case-summary-warning" : ""}><span>来源需复核</span><strong>{state.staleSources.length}<small> 条</small></strong></div>
      </div>
      <CaseSummary matterId={matterId} state={state} rows={rows} dirty={!!dirty} busy={busy} onBusy={setBusy}
        onError={setError} onSaved={(value, message) => { setState(value); setRows(value.rows); setNotice(message); setError("") }}
        onOpenRecord={(row) => { setKind(row.kind); setQuery(""); setFilter("all"); setActive(row.id) }} />
      <nav className="case-tabs" aria-label="工作台内容">{Object.entries(kinds).map(([value, label]) =>
        <button key={value} aria-pressed={kind === value} onClick={() => { setKind(value as CaseRow["kind"]); setQuery(""); setFilter("all") }}>{label}<span className="case-tab-count">{rows.filter((row) => row.kind === value).length}</span></button>)}</nav>
      <div className="case-section-heading"><div><h3>{kinds[kind]}</h3><p>底层记录用于来源、冲突、计算和追溯；普通信息可由律师确认版摘要统一覆盖。</p></div>
      <button className="case-add" disabled={busy} onClick={() => addRecord()}>＋ 添加记录</button>
      </div>
      {kind === "profile" && <div className="case-overview">{(["worker", "employer", "joined", "departed", "baseSalary", "tenure"] as CaseField[]).map((field) => {
        const entries = rows.filter((row) => row.kind === "profile" && row.field === field)
        const item = entries[0]
        const stateLabel = entries.length !== 1 ? "" : item && reviewReasons(item, rows, state.staleSources).length ? "需关注" : item && summaryCoversCurrent && latestSummary.rowIds.includes(item.id) ? "当前案情已覆盖" : "待纳入确认案情"
        return <button key={field} disabled={busy} title={entries.map((row) => row.detail).join(" / ")} onClick={() => { if (!entries.length) { addRecord(field); return } setQuery(fields[field]); setFilter("all"); setActive(entries[0].id) }}><small>{fields[field]}</small><strong>{entries.length > 1 ? `${entries.length} 条说法 · 点击核对` : item?.detail || "＋ 补充"}</strong><span>{stateLabel}{item ? ` · 内容 V${item.modifiedInVersion ?? state.revision}` : ""}</span></button>
      })}</div>}
      <div className="case-list-tools">
        <input aria-label="搜索案件记录" placeholder="搜索内容、当事人、来源文件…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <CaseSelect label="筛选记录" value={filter} options={recordFilters} onChange={(value) => setFilter(value as keyof typeof recordFilters)} />
        <span>显示 {visible.length} / {rows.filter((row) => row.kind === kind).length} 条</span>
      </div>
      {kind === "fact" && <form className="case-quick-add" onSubmit={(event) => { event.preventDefault(); if (!quickText.trim() || busy) return; setRows((items) => [...items, { id: crypto.randomUUID(), kind: "fact", title: "", date: quickDate, detail: quickText.trim(), position: "neutral", status: "pending", links: [], gap: "用户手动补充，尚无材料佐证。" }]); setQuickText(""); setQuickDate(""); setQuery(""); setFilter("all"); setNotice("") }}>
        <input type="date" aria-label="快速添加事实日期" value={quickDate} onChange={(e) => setQuickDate(e.target.value)} />
        <input aria-label="快速添加事实内容" placeholder="输入事实，日期可留空，按 Enter 加入草稿" value={quickText} onChange={(e) => setQuickText(e.target.value)} />
        <button disabled={busy || !quickText.trim()}>＋ 加入</button>
      </form>}
      <div className={`case-review-layout${active && rows.some((row) => row.id === active) ? " has-editor" : ""}`}>
      <div className="case-list-scroll" ref={list} tabIndex={-1} aria-label="案件记录列表">
      <table className="case-compact-table"><thead><tr><th>{kind === "fact" ? "日期 / 事件" : "字段 / 标题"}</th><th>内容摘要</th><th>立场 / 来源 / 状态</th></tr></thead><tbody>
        {visible.map((row, index) => <tr key={row.id} className={active === row.id ? "is-active" : ""}>
          <td>{kind === "fact" && !row.date && (index === 0 || visible[index - 1].date) && <small className="case-unknown-date">时间待明确</small>}<button className="case-row-open" aria-label={`编辑记录 ${row.title || row.detail.slice(0, 30) || "未命名"}`} onClick={() => setActive(row.id)}>{kind === "fact" ? row.date || "日期未知" : row.field ? fields[row.field] : row.title || "未命名记录"}</button>{kind === "fact" && row.title && <small>{row.title}</small>}</td>
          <td><button className="case-row-open case-row-detail" onClick={() => setActive(row.id)} title={row.detail}>{row.detail || "点击补充内容"}</button><small>内容版本：案件 V{row.modifiedInVersion ?? state.revision}</small></td>
          <td>{reviewReasons(row, rows, state.staleSources).length ? <span className="case-status attention">需关注</span> : summaryCoversCurrent && latestSummary.rowIds.includes(row.id) ? <span className="case-status covered">当前案情已覆盖</span> : <span className="case-status">待纳入确认案情</span>} <small>{positions[row.position]}</small><small className={state.staleSources.includes(row.id) ? "case-error" : ""}>{state.staleSources.includes(row.id) ? "来源需复核 · " : ""}{row.source?.document || "用户补充 · 无材料来源"}</small></td>
        </tr>)}
      </tbody></table>
      {!visible.length && <div className="case-empty"><strong>没有符合条件的记录</strong><p>调整筛选，或添加一条记录。</p></div>}
      </div>
      <aside className="case-detail-panel" ref={editor} tabIndex={-1} inert={busy} aria-label="记录详情与编辑" hidden={!active || !rows.some((row) => row.id === active)} onKeyDown={(event) => { if (event.key === "Escape") closeEditor() }}>
      <div className="case-detail-toolbar"><strong>核对与编辑</strong><button onClick={closeEditor}>关闭详情</button></div>
      {rows.filter((row) => row.id === active).map((row) =>
        <article className="case-record" key={row.id}>
          <div className="case-record-head"><div className="case-record-title">{reviewReasons(row, rows, state.staleSources).length ? <span className="case-status attention">需关注</span> : <span className="case-status covered">底层记录</span>}<h4>{row.title || (row.field ? fields[row.field] : "未命名记录")}</h4><small>当前内容形成于案件 V{row.modifiedInVersion ?? state.revision}</small></div>
            {state.staleSources.includes(row.id) && <strong className="case-error">来源已变化，请重新核验引文</strong>}
            <button className="case-remove" disabled={busy} onClick={() => { if (!window.confirm("移除此记录并清除相关引用关联？保存后生效。")) return; setRows((items) => items.filter((item) => item.id !== row.id).map((item) => ({ ...item, links: item.links.filter((id) => id !== row.id) }))); closeEditor() }}>移除记录</button>
          </div>
          <div className={`case-fields${kind !== "profile" ? " case-fields-three" : ""}`}>
            {kind === "profile" && <CaseSelect label="概况字段" value={row.field ?? "stance"} options={fields} onChange={(value) => change(row.id, { field: value as CaseField, status: "pending" })} />}
            <label>标题<input value={row.title} onChange={(e) => change(row.id, { title: e.target.value, status: "pending" })} /></label>
            <label>日期（未知可留空）<input placeholder="如 2026-08-31，或注明日期不详" value={row.date} onChange={(e) => change(row.id, { date: e.target.value, status: "pending" })} /></label>
            <CaseSelect label="记录立场" value={row.position} options={positions} onChange={(value) => change(row.id, { position: value as CaseRow["position"], status: "pending" })} />
          </div>
          <label>{kind === "claim" ? "请求内容、依据与待核验条件" : kind === "evidence" ? "证据内容及证明目的" : "内容"}<textarea value={row.detail} onChange={(e) => change(row.id, { detail: e.target.value, status: "pending" })} /></label>
          <section className="case-source"><h5>来源核验</h5><div className="case-fields">
            <label>来源文件名<input placeholder="留空表示用户补充，无材料引用" value={row.source?.document ?? ""} onChange={(e) => change(row.id, { source: e.target.value ? { document: e.target.value, quote: row.source?.quote ?? "" } : undefined, status: "pending" })} /></label>
            {row.source && <label>原文引文<textarea value={row.source.quote} onChange={(e) => change(row.id, { source: { document: row.source!.document, quote: e.target.value }, status: "pending" })} /></label>}
          </div>
          {row.source && <button onClick={() => onView(row.source!.document)}>查看来源文档</button>}
          {!row.source && <small>用户补充／待提供来源，不能视为已由材料证明。</small>}
          </section>
          <label>证据缺口／待核验事项<textarea value={row.gap} onChange={(e) => change(row.id, { gap: e.target.value, status: "pending" })} /></label>
          {kind === "claim" && <fieldset><legend>关联事实与证据</legend>{rows.filter((r) => r.kind === "fact" || r.kind === "evidence").map((linked) =>
            <label className="case-check-row" key={linked.id}><input type="checkbox" checked={row.links.includes(linked.id)} onChange={(e) => change(row.id, { links: e.target.checked ? [...row.links, linked.id] : row.links.filter((id) => id !== linked.id), status: "pending" })} /><span>{linked.title || linked.detail.slice(0, 50) || "未命名记录"}<small> {positions[linked.position]}</small></span></label>)}
            {!rows.some((r) => r.kind === "fact" || r.kind === "evidence") && <p>请先添加事实或证据记录。</p>}</fieldset>}
          <div className="case-detail-footer"><small>修改后使用页面顶部的“保存底层修改”；是否正式采用由“确认当前案情”统一决定。</small></div>
        </article>)}
      </aside>
      </div>
      <section className="case-analyses"><h3>分析记录</h3>
        {!state.analyses.length && <p>助手保存的分析会显示在这里，并记录依据的案件版本。</p>}
        {[...state.analyses].reverse().map((analysis) => <details key={analysis.id}>
          <summary>{new Date(analysis.createdAt).toLocaleString()} · {analysis.revision !== state.revision || state.staleSources.length || dirty ? "待更新" : "与当前案件版本一致"} · 依据版本 {analysis.revision}</summary>
          <p className="case-analysis-text">{analysis.text}</p>
        </details>)}
      </section>
    </>}
  </section>
}
