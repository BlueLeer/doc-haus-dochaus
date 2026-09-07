import { test, expect, afterAll } from "bun:test"
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

// Point WORKSPACE_ROOT at a throwaway dir before matter.ts captures it at module
// eval, so the CRUD tests never touch a real workspace. The import is dynamic for
// exactly this reason — a static import would hoist above the env assignment.
const root = mkdtempSync(path.join(tmpdir(), "dochaus-matter-"))
process.env.WORKSPACE_ROOT = root
const matter = await import("./matter")

afterAll(() => rmSync(root, { recursive: true, force: true }))

test("matterDir rejects path traversal and escaping ids", () => {
  // The fix for the traversal hole: ids arrive from a URL param, so anything that
  // could climb out of WORKSPACE_ROOT must throw before it reaches a filesystem path.
  for (const bad of ["..", "../evil", "a/b", "/etc/passwd", "foo/../bar", ".dochaus", "", "Foo", "a b"]) {
    expect(() => matter.matterDir(bad)).toThrow(/invalid matter id/)
  }
})

test("matterDir accepts the generated slug+uuid shape and stays under the root", () => {
  const id = "acme-merger-a1b2c3"
  expect(matter.matterDir(id)).toBe(path.join(root, id))
})

test("create, list, get, rename, delete round-trip", () => {
  const created = matter.createMatter("Acme / Merger 2026", "2026-0042", ["CN-CQ"])
  expect(created.id).toMatch(/^acme-merger-2026-[a-z0-9]{6}$/)
  expect(created.reference).toBe("2026-0042")
  expect(created.jurisdictions).toEqual(["CN-CQ"])
  expect(existsSync(path.join(root, created.id, "matter.json"))).toBe(true)

  expect(matter.listMatters().map((m) => m.id)).toContain(created.id)
  expect(matter.getMatter(created.id).title).toBe("Acme / Merger 2026")
  expect(matter.getMatter(created.id).jurisdictions).toEqual(["CN-CQ"])

  // Jurisdictions move on their own through the rename endpoint while title/ref hold.
  const renamed = matter.renameMatter(created.id, "Acme Acquisition", "2026-0099", ["CN-CQ"])
  expect(renamed.id).toBe(created.id) // id is stable across rename
  expect(renamed.title).toBe("Acme Acquisition")
  expect(matter.getMatter(created.id).reference).toBe("2026-0099")
  expect(matter.getMatter(created.id).jurisdictions).toEqual(["CN-CQ"])

  matter.deleteMatter(created.id)
  expect(existsSync(path.join(root, created.id))).toBe(false)
  expect(matter.listMatters().map((m) => m.id)).not.toContain(created.id)
})

test("listJurisdictions exposes only the selectable Chongqing pack", () => {
  expect(matter.listJurisdictions().map((j) => j.code)).toEqual(["CN-CQ"])
  expect(matter.listJurisdictions()[0]!.name).toBe("重庆市")
  expect(matter.listJurisdictions()[0]!.rulesReady).toBe(false)
})

test("new matters default to Chongqing and reject retired jurisdictions", () => {
  const created = matter.createMatter("重庆案件")
  expect(created.id).toMatch(/^matter-[a-z0-9]{6}$/)
  expect(created.jurisdictions).toEqual(["CN-CQ"])
  expect(() => matter.createMatter("旧地区", undefined, ["HK"])).toThrow(/not available/)
  matter.deleteMatter(created.id)
})

test("existing legacy binding can be preserved but not newly assigned", () => {
  const created = matter.createMatter("Legacy matter")
  const file = path.join(root, created.id, "matter.json")
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), jurisdictions: ["HK"] }, null, 2))
  expect(matter.renameMatter(created.id, "Legacy renamed", undefined, ["HK"]).jurisdictions).toEqual(["HK"])
  expect(() => matter.renameMatter(created.id, "Invalid migration", undefined, ["EW"])).toThrow(/not available/)
  matter.deleteMatter(created.id)
})
