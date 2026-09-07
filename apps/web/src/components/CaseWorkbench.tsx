import { useEffect, useRef, useState } from "react"
import { getCasebook, saveCasebook, type CasebookView, type CaseRow, type CaseField } from "../api/ingest"
import "./case-workbench.css"
import { CASE_FIELDS } from "../../../../dochaus/lib/casebook-model"
import CaseSelect from "./CaseSelect"
import ManualIntake from "./ManualIntake"
import { changedRecordCount, recordFilters, visibleRecords } from "./case-workbench-list"

const fields = CASE_FIELDS
const kinds = { profile: "案件概况", fact: "事实时间轴", evidence: "证据目录", claim: "请求与证据矩阵" }
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
  const [selected, setSelected] = useState<string[]>([])
  const [active, setActive] = useState<string>()
  const [quickDate, setQuickDate] = useState("")
  const [quickText, setQuickText] = useState("")
  const editor = useRef<HTMLElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const visible = visibleRecords(rows, kind, query, filter, state?.staleSources ?? [])
  const selectedRows = visible.filter((row) => selected.includes(row.id))
  const changed = changedRecordCount(rows, state?.rows ?? [])
  const dirty = state && JSON.stringify(rows) !== JSON.stringify(state.rows)

  useEffect(() => { setSelected([]); setActive(undefined) }, [kind, matterId])
  useEffect(() => { if (active) { editor.current?.focus({ preventScroll: true }); editor.current?.scrollTo(0, 0) } }, [active])

  function closeEditor() { setActive(undefined); list.current?.focus() }
  function addRecord(field?: CaseField) {
    const id = crypto.randomUUID()
    setRows((items) => [...items, { id, kind, ...(kind === "profile" ? { field: field ?? "stance" } : {}), title: field ? fields[field] : "", date: "", detail: "", position: "neutral", status: "pending", links: [], gap: "" }])
    setQuery(""); setFilter("all"); setActive(id); setNotice("")
  }
  function confirmRecords(items: CaseRow[]) {
    const warnings = items.filter((row) => !row.source || row.position === "disputed" || state?.staleSources.includes(row.id))
    if ((items.length > 1 || warnings.length) && !window.confirm(`确认已核对这 ${items.length} 条记录？${warnings.length ? `其中 ${warnings.length} 条缺少来源、存在争议或来源需复核，请先检查详情。` : ""}确认不代表事实无争议，也不替代证据核验。`)) return false
    setRows((current) => current.map((row) => items.some((item) => item.id === row.id) ? { ...row, status: "confirmed" } : row))
    setNotice(""); return true
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
      <div><span className="case-eyebrow">材料 · 事实 · 证据 · 请求</span><h2>案件工作台</h2><p>将材料整理为可核验的案件记录，逐项确认后用于分析。</p></div>
      <div className="case-actions">
        <button className="case-secondary" disabled={busy || !!dirty} onClick={onExtract}>从材料整理</button>
        <button disabled={busy} onClick={reload}>重新加载</button>
        <span className="case-save-state" role="status">{changed ? `${changed} 条未保存` : "已同步"}</span>
        <button className="case-primary" disabled={busy || !dirty} onClick={save}>{busy ? "保存中…" : "保存修改"}</button>
      </div>
    </header>
    {error && <p role="alert" className="case-error">{error}</p>}
    {notice && <p className="case-notice" role="status">{notice}</p>}
    {dirty && <p className="case-unsaved" role="status">有尚未保存的修改，请保存后再切换页面。</p>}
    {!state ? <p>正在读取案件工作台…</p> : <>
      <div className="case-summary">
        <div><span>案件版本</span><strong><small>V</small>{state.revision}</strong></div>
        <div><span>全部记录</span><strong>{rows.length}<small> 条</small></strong></div>
        <div className="case-summary-pending"><span>待确认</span><strong>{rows.filter((r) => r.status === "pending").length}<small> 条</small></strong></div>
        <div className={state.staleSources.length ? "case-summary-warning" : ""}><span>来源需复核</span><strong>{state.staleSources.length}<small> 条</small></strong></div>
      </div>
      <ManualIntake existing={rows} disabled={busy} onAdd={(added) => { setRows((items) => [...items, ...added]); setNotice(""); if (added.length) setKind("profile") }} />
      <nav className="case-tabs" aria-label="工作台内容">{Object.entries(kinds).map(([value, label]) =>
        <button key={value} aria-pressed={kind === value} onClick={() => { setKind(value as CaseRow["kind"]); setQuery(""); setFilter("all") }}>{label}<span className="case-tab-count">{rows.filter((row) => row.kind === value).length}</span></button>)}</nav>
      <div className="case-section-heading"><div><h3>{kinds[kind]}</h3><p>保留双方立场与原文来源，未知信息记入待确认事项。</p></div>
      <button className="case-add" disabled={busy} onClick={() => addRecord()}>＋ 添加记录</button>
      </div>
      {kind === "profile" && <div className="case-overview">{(["worker", "employer", "joined", "departed", "baseSalary", "tenure"] as CaseField[]).map((field) => {
        const entries = rows.filter((row) => row.kind === "profile" && row.field === field)
        return <button key={field} disabled={busy} title={entries.map((row) => row.detail).join(" / ")} onClick={() => { if (!entries.length) { addRecord(field); return } setQuery(fields[field]); setFilter("all"); setActive(entries[0].id) }}><small>{fields[field]}</small><strong>{entries.length > 1 ? `${entries.length} 条说法 · 点击核对` : entries[0]?.detail || "＋ 补充"}</strong><span>{entries.length === 1 ? entries[0].status === "confirmed" ? "已核对" : "待确认" : ""}</span></button>
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
      <div className="case-batch-tools"><label><input type="checkbox" aria-label="选择当前筛选结果" disabled={!visible.length || busy} checked={!!visible.length && selectedRows.length === visible.length} onChange={(e) => setSelected(e.target.checked ? visible.map((row) => row.id) : [])} />选择当前结果</label><span>已选 {selectedRows.length} 条</span>
        <button disabled={busy || !selectedRows.length} onClick={() => { if (confirmRecords(selectedRows)) setSelected([]) }}>批量确认</button>
        <button disabled={busy || !selectedRows.length} onClick={() => { selectedRows.forEach((row) => change(row.id, { status: "pending" })); setSelected([]) }}>设为待确认</button>
        <CaseSelect label="批量调整立场" disabled={busy || !selectedRows.length} value="" options={{ "": "选择立场…", ...positions }} onChange={(value) => { if (!value || busy || !selectedRows.length) return; if (window.confirm(`将所选 ${selectedRows.length} 条记录改为“${positions[value as CaseRow["position"]]}”并设为待确认？`)) { selectedRows.forEach((row) => change(row.id, { position: value as CaseRow["position"], status: "pending" })); setSelected([]) } }} />
      </div>
      <div className={`case-review-layout${active && rows.some((row) => row.id === active) ? " has-editor" : ""}`}>
      <div className="case-list-scroll" ref={list} tabIndex={-1} aria-label="案件记录列表">
      <table className="case-compact-table"><thead><tr><th aria-label="选择" /><th>{kind === "fact" ? "日期 / 事件" : "字段 / 标题"}</th><th>内容摘要</th><th>立场 / 来源 / 状态</th></tr></thead><tbody>
        {visible.map((row, index) => <tr key={row.id} className={active === row.id ? "is-active" : ""}>
          <td><input type="checkbox" aria-label={`选择记录 ${row.title || row.detail.slice(0, 30) || "未命名"}`} disabled={busy} checked={selected.includes(row.id)} onChange={(e) => setSelected((items) => e.target.checked ? [...items, row.id] : items.filter((id) => id !== row.id))} /></td>
          <td>{kind === "fact" && !row.date && (index === 0 || visible[index - 1].date) && <small className="case-unknown-date">时间待明确</small>}<button className="case-row-open" aria-label={`编辑记录 ${row.title || row.detail.slice(0, 30) || "未命名"}`} onClick={() => setActive(row.id)}>{kind === "fact" ? row.date || "日期未知" : row.field ? fields[row.field] : row.title || "未命名记录"}</button>{kind === "fact" && row.title && <small>{row.title}</small>}</td>
          <td><button className="case-row-open case-row-detail" onClick={() => setActive(row.id)} title={row.detail}>{row.detail || "点击补充内容"}</button></td>
          <td><span className={`case-status ${row.status}`}>{row.status === "confirmed" ? "已确认" : "待确认"}</span> <small>{positions[row.position]}</small><small className={state.staleSources.includes(row.id) ? "case-error" : ""}>{state.staleSources.includes(row.id) ? "来源需复核 · " : ""}{row.source?.document || "用户补充 · 无材料来源"}</small></td>
        </tr>)}
      </tbody></table>
      {!visible.length && <div className="case-empty"><strong>没有符合条件的记录</strong><p>调整筛选，或添加一条记录。</p></div>}
      </div>
      <aside className="case-detail-panel" ref={editor} tabIndex={-1} inert={busy} aria-label="记录详情与编辑" hidden={!active || !rows.some((row) => row.id === active)} onKeyDown={(event) => { if (event.key === "Escape") closeEditor() }}>
      <div className="case-detail-toolbar"><strong>核对与编辑</strong><button onClick={closeEditor}>关闭详情</button></div>
      {rows.filter((row) => row.id === active).map((row) =>
        <article className="case-record" key={row.id}>
          <div className="case-record-head"><div className="case-record-title"><span className={`case-status ${row.status}`}>{row.status === "confirmed" ? "已确认" : "待确认"}</span><h4>{row.title || (row.field ? fields[row.field] : "未命名记录")}</h4></div>
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
          <label>证据缺口／待确认事项<textarea value={row.gap} onChange={(e) => change(row.id, { gap: e.target.value, status: "pending" })} /></label>
          {kind === "claim" && <fieldset><legend>关联事实与证据</legend>{rows.filter((r) => r.kind === "fact" || r.kind === "evidence").map((linked) =>
            <label className="case-check-row" key={linked.id}><input type="checkbox" checked={row.links.includes(linked.id)} onChange={(e) => change(row.id, { links: e.target.checked ? [...row.links, linked.id] : row.links.filter((id) => id !== linked.id), status: "pending" })} /><span>{linked.title || linked.detail.slice(0, 50) || "未命名记录"}<small> {positions[linked.position]}</small></span></label>)}
            {!rows.some((r) => r.kind === "fact" || r.kind === "evidence") && <p>请先添加事实或证据记录。</p>}</fieldset>}
          <label className="case-confirm"><input type="checkbox" checked={row.status === "confirmed"} onChange={(e) => change(row.id, { status: e.target.checked ? "confirmed" : "pending" })} /><span>我已核对本条记录<small>确认仅表示承办人已核对，不消除双方争议。</small></span></label>
          <div className="case-detail-footer"><button className="case-primary" disabled={busy} onClick={() => { const next = visible.find((item, index) => index > visible.findIndex((item) => item.id === row.id) && item.status === "pending" && item.id !== row.id); if (confirmRecords([row])) { if (next) setActive(next.id); else { closeEditor(); setNotice("当前列表已无后续待确认记录，请保存修改。") } } }}>确认并查看下一条</button><small>确认后仍需保存；不会自动消除争议。</small></div>
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
