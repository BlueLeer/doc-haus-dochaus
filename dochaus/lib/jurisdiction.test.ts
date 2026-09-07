import { expect, test } from "bun:test"
import { productConfig, resolveJurisdictions, selectableJurisdictionCodes } from "./jurisdiction"

test("product registry exposes only Chongqing for selection", async () => {
  expect((await productConfig()).defaultJurisdictions).toEqual(["CN-CQ"])
  expect([...await selectableJurisdictionCodes()]).toEqual(["CN-CQ"])
})

test("Chongqing resolves the national parent before the local pack", async () => {
  const packs = await resolveJurisdictions(["CN-CQ"])
  expect(packs.map((pack) => pack.code)).toEqual(["CN", "CN-CQ"])
  expect(packs.every((pack) => pack.rulesReady === false)).toBe(true)
  expect(packs[0]!.selectable).toBe(false)
  expect(packs[1]!.selectable).toBe(true)
})
