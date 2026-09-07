import { expect, test } from "bun:test"
import { buildCaseSummary, reviewReasons, synchronizeSummaryRows } from "./case-summary"
import type { CaseRow } from "./casebook-model"

const row = (patch: Partial<CaseRow>): CaseRow => ({ id: crypto.randomUUID(), kind: "profile", field: "worker", title: "", date: "", detail: "张三", position: "neutral", status: "pending", links: [], gap: "", ...patch })

test("summary groups structured elements and chronological events", () => {
  const rows = [row({ field: "baseSalary", detail: "8000元/月" }), row({}), row({ kind: "fact", field: undefined, date: "2025-01-08", detail: "劳动者发出解除通知", position: "worker" }), row({ kind: "fact", field: undefined, date: "2020-03-01", detail: "劳动者入职" })]
  const text = buildCaseSummary(rows)
  expect(text).toContain("一、案件基本情况")
  expect(text.indexOf("2020-03-01")).toBeLessThan(text.indexOf("2025-01-08"))
  expect(text).toContain("劳动者主张")
})

test("only material conflicts, stale sources and key gaps require attention", () => {
  const ordinary = row({ gap: "用户手动补充，尚无材料佐证。" })
  expect(reviewReasons(ordinary, [ordinary], [])).toEqual([])
  expect(reviewReasons(row({ position: "disputed" }), [], [])).toContain("存在争议")
  const undated = row({ kind: "fact", field: undefined, detail: "发生解除" })
  expect(reviewReasons(undated, [undated], [])).toContain("事件时间待明确")
  expect(reviewReasons(ordinary, [ordinary], [ordinary.id])).toContain("来源已变化")
  const conflict = row({ id: "b", detail: "李四" })
  expect(reviewReasons(ordinary, [ordinary, conflict], [])).toContain("同一要素存在不同说法")
})

test("edited summary synchronizes existing elements and events without deleting source records", () => {
  const rows = [
    row({ id: "worker", kind: "profile", field: "worker", title: "劳动者", date: "", detail: "张三" }),
    row({ id: "joined", kind: "fact", field: undefined, date: "2023-09-01", detail: "2023年9月1日入职" }),
  ]
  const result = synchronizeSummaryRows("一、案件基本情况\n劳动者：李四\n\n二、案件经过\n2023-09-02：2023年9月2日入职", rows)
  expect(result.touched).toEqual(["worker", "joined"])
  expect(result.rows.find((item) => item.id === "worker")?.detail).toBe("李四")
  expect(result.rows.find((item) => item.id === "joined")?.date).toBe("2023-09-02")
})

test("plain intake in the unified editor creates structured records", () => {
  const result = synchronizeSummaryRows("劳动者：张三；基本工资：8000元/月；2020年3月1日入职", [])
  expect(result.rows.filter((item) => item.kind === "profile")).toHaveLength(3)
  expect(result.rows.filter((item) => item.kind === "fact")).toHaveLength(1)
})

test("inserting a new event does not shift and overwrite existing events", () => {
  const existing = row({ id: "joined", kind: "fact", field: undefined, date: "2023-09-01", detail: "劳动者入职" })
  const result = synchronizeSummaryRows("二、案件经过\n2022-01-01：双方开始接洽\n2023-09-01：劳动者入职", [existing])
  expect(result.rows.find((item) => item.id === "joined")?.detail).toBe("劳动者入职")
  expect(result.rows).toHaveLength(2)
})
