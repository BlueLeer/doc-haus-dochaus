import { expect, test } from "bun:test"
import { changedRecordCount, visibleRecords } from "../../apps/web/src/components/case-workbench-list"
import type { CaseRow } from "./casebook-model"

const rows: CaseRow[] = [
  { id: "a", kind: "fact", title: "解除", date: "2025-03-01", detail: "单位通知解除", position: "disputed", status: "pending", links: [], gap: "", source: { document: "通知书.pdf", quote: "解除" } },
  { id: "b", kind: "fact", title: "工资", date: "", detail: "工资待核", position: "worker", status: "pending", links: [], gap: "" },
  { id: "c", kind: "fact", title: "入职", date: "2020-03-01", detail: "张三入职", position: "neutral", status: "confirmed", links: [], gap: "" },
  { id: "d", kind: "profile", field: "worker", title: "", date: "", detail: "张三", position: "neutral", status: "pending", links: [], gap: "" },
]

test("timeline sorts known dates and retains undated records without mutating data", () => {
  expect(visibleRecords(rows, "fact", "", "all", []).map((row) => row.id)).toEqual(["c", "a", "b"])
  expect(rows.map((row) => row.id)).toEqual(["a", "b", "c", "d"])
})
test("filters combine query and status without mixing categories", () => {
  expect(visibleRecords(rows, "fact", "通知书", "pending", []).map((row) => row.id)).toEqual(["a"])
  expect(visibleRecords(rows, "fact", "", "disputed", []).map((row) => row.id)).toEqual(["a"])
  expect(visibleRecords(rows, "fact", "", "missing", []).map((row) => row.id)).toEqual(["c", "b"])
  expect(visibleRecords(rows, "fact", "", "stale", ["a"]).map((row) => row.id)).toEqual(["a"])
  expect(visibleRecords(rows, "profile", "劳动者", "all", []).map((row) => row.id)).toEqual(["d"])
  expect(visibleRecords(rows, "fact", "不存在", "all", [])).toEqual([])
})
test("unsaved count includes additions, edits and removals exactly once", () => {
  expect(changedRecordCount(rows, rows)).toBe(0)
  expect(changedRecordCount([{ ...rows[0]!, detail: "已修改" }, ...rows.slice(2), { ...rows[1]!, id: "new" }], rows)).toBe(3)
})
