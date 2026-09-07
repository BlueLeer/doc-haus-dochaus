import { useState } from "react"
import { parseManualIntake, INTAKE_EXAMPLE } from "../../../../dochaus/lib/manual-intake"
import type { CaseRow } from "../api/ingest"
import CaseSelect from "./CaseSelect"

export default function ManualIntake({ existing, onAdd, disabled }: { existing: CaseRow[]; onAdd: (rows: CaseRow[]) => void; disabled: boolean }) {
  const [text, setText] = useState("")
  const [position, setPosition] = useState<CaseRow["position"]>("neutral")
  const [preview, setPreview] = useState<ReturnType<typeof parseManualIntake>>()
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState("")
  function parse() {
    const result = parseManualIntake(text, position)
    setPreview(result)
    setSelected(result.rows.map((row) => row.id))
    setMessage(result.rows.length ? "请核对预览，再加入工作台。加入后仍需点击“保存修改”。" : "未识别到条目，请参考示例使用“字段：内容”，或逐条手动添加。")
  }
  function add() {
    if (!preview) return
    const same = (a: CaseRow, b: CaseRow) => a.kind === b.kind && a.field === b.field && a.detail === b.detail && a.date === b.date && a.position === b.position
    const rows = preview.rows.filter((row) => selected.includes(row.id)).filter((row, index, list) => !existing.some((item) => same(item, row)) && !list.slice(0, index).some((item) => same(item, row)))
    onAdd(rows)
    setMessage(`已加入 ${rows.length} 条待确认记录；完全重复的条目已跳过。请检查概况和时间轴，点击“保存修改”后才会持久保存。`)
    setPreview(undefined)
    setSelected([])
  }
  return <details className="case-intake">
    <summary><strong>手动录入案情</strong><span>粘贴当事人、工资和日期信息，整理为工作台条目</span></summary>
    <div className="case-intake-body">
      <label htmlFor="manual-case-text">案件信息 <small>本地解析，不调用外部模型；建议每项一行。工作年限不会自动推算日期。</small></label>
      <textarea id="manual-case-text" maxLength={12000} value={text} placeholder={INTAKE_EXAMPLE} onChange={(event) => { setText(event.target.value); setPreview(undefined); setMessage("") }} />
      <div className="case-intake-actions">
        <CaseSelect label="本次录入立场" value={position} options={{ neutral: "用户补充（未标明立场）", worker: "劳动者主张", employer: "单位主张", disputed: "存在争议" }} onChange={(value) => { setPosition(value as CaseRow["position"]); setPreview(undefined) }} />
        <button disabled={disabled || !text.trim()} className="case-primary" onClick={parse}>解析并预览</button>
      </div>
      {message && <p role="status" className="case-notice">{message}</p>}
      {preview && <>
        <h4>预览 · {preview.rows.filter((row) => row.kind === "profile").length} 条概况 / {preview.rows.filter((row) => row.kind === "fact").length} 条时间轴</h4>
        <div className="case-intake-preview">{preview.rows.map((row) => <label key={row.id} className="case-intake-option">
          <input type="checkbox" checked={selected.includes(row.id)} onChange={(event) => setSelected((items) => event.target.checked ? [...items, row.id] : items.filter((id) => id !== row.id))} />
          <span><strong>{row.kind === "profile" ? "概况" : "时间轴"} · {row.title}</strong><span>{row.detail}</span><small>{row.date ? `日期：${row.date} · ` : ""}用户手动补充 · 待确认 · 无文档证据</small></span>
        </label>)}</div>
        {!!preview.unmatched.length && <div className="case-unsaved"><strong>以下内容未解析，未丢弃：</strong>{preview.unmatched.map((line, index) => <p key={index}>{line}</p>)}<p>可修改输入格式后重新解析，或在工作台逐条添加。</p></div>}
        <button className="case-primary" disabled={disabled || !selected.length} onClick={add}>加入所选 {selected.length} 条草稿</button>
      </>}
    </div>
  </details>
}
