import type { CaseRow } from "../api/ingest"
import { CASE_FIELDS } from "../../../../dochaus/lib/casebook-model"

export const recordFilters = { all: "全部", pending: "待确认", disputed: "存在争议", missing: "缺少来源", stale: "来源需复核" }

export function visibleRecords(rows: CaseRow[], kind: CaseRow["kind"], query: string, filter: keyof typeof recordFilters, stale: string[]) {
  return rows.filter((row) => row.kind === kind
    && (filter === "all" || (filter === "pending" && row.status === "pending") || (filter === "disputed" && row.position === "disputed") || (filter === "missing" && !row.source) || (filter === "stale" && stale.includes(row.id)))
    && [row.title, row.detail, row.date, row.gap, row.source?.document, row.field ? CASE_FIELDS[row.field] : ""].join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => kind === "fact" ? (a.date || "9999").localeCompare(b.date || "9999") : 0)
}

export function changedRecordCount(rows: CaseRow[], saved: CaseRow[]) {
  const original = new Map(saved.map((row) => [row.id, JSON.stringify(row)]))
  return rows.filter((row) => original.get(row.id) !== JSON.stringify(row)).length + saved.filter((row) => !rows.some((item) => item.id === row.id)).length
}
