import { test, expect } from "bun:test"
import { parseManualIntake, INTAKE_EXAMPLE } from "./manual-intake"

test("manual intake produces profiles and dated events without evidence", () => {
  const result = parseManualIntake(INTAKE_EXAMPLE, "worker")
  expect(result.rows.filter((row) => row.kind === "profile")).toHaveLength(7)
  expect(result.rows.filter((row) => row.kind === "fact")).toHaveLength(2)
  expect(result.rows.find((row) => row.field === "baseSalary")?.detail).toBe("8000元/月")
  expect(result.rows.find((row) => row.field === "joined")?.date).toBe("2020-03-01")
  expect(result.rows.every((row) => row.status === "pending" && !row.source && row.position === "worker")).toBe(true)
  expect(result.unmatched).toEqual([])
})
test("duration never fabricates dates, unknown sentences preserved", () => {
  const result = parseManualIntake("工龄：五年半；老板拖欠工资。单位地址：重庆；劳动者姓名：", "neutral")
  expect(result.rows.map((row) => row.field)).toEqual(["tenure", "employerAddress"])
  expect(result.rows.every((row) => row.date === "")).toBe(true)
  expect(result.unmatched).toEqual(["老板拖欠工资", "劳动者姓名："])
})
test("conflicting claims remain separate and invalid dates stay unknown", () => {
  const result = parseManualIntake("基本工资：8000元；基本工资：6000元；入职日期：2025年2月30日；2024年2月29日离职", "disputed")
  expect(result.rows.filter((row) => row.field === "baseSalary")).toHaveLength(2)
  expect(result.rows.find((row) => row.field === "joined")?.date).toBe("")
  expect(result.rows.find((row) => row.field === "departed")?.date).toBe("2024-02-29")
})
test("partial dates and unspecified wage periods are not invented", () => {
  const result = parseManualIntake("入职：2020年3月，基本工资：8,000元", "neutral")
  expect(result.rows.find((row) => row.field === "joined")?.date).toBe("")
  expect(result.rows.find((row) => row.field === "baseSalary")?.detail).toBe("8,000元")
})
