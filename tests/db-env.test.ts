// @vitest-environment node
import { describe, expect, it } from "vitest"

import { requireDatabaseUrl } from "@/lib/db/env"

describe("requireDatabaseUrl", () => {
  it("returns the connection string when DATABASE_URL is set", () => {
    const url = "postgres://dev:dev@localhost:5432/observatory"
    expect(requireDatabaseUrl({ DATABASE_URL: url })).toBe(url)
  })

  it("throws an error naming DATABASE_URL when it is missing", () => {
    expect(() => requireDatabaseUrl({})).toThrow(/DATABASE_URL/)
  })

  it("treats an empty or blank value as missing", () => {
    expect(() => requireDatabaseUrl({ DATABASE_URL: "" })).toThrow(
      /DATABASE_URL/,
    )
    expect(() => requireDatabaseUrl({ DATABASE_URL: "  " })).toThrow(
      /DATABASE_URL/,
    )
  })
})
