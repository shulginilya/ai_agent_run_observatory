// @vitest-environment node
import { describe, expect, it } from "vitest"

import { assertThrowawayDatabase } from "./support/throwaway-db"

describe("assertThrowawayDatabase", () => {
  it("accepts a database whose name ends in _test", () => {
    expect(() =>
      assertThrowawayDatabase(
        "postgres://dev:dev@localhost:5432/observatory_test",
      ),
    ).not.toThrow()
  })

  it("refuses a database whose name does not end in _test", () => {
    expect(() =>
      assertThrowawayDatabase("postgres://dev:dev@localhost:5432/observatory"),
    ).toThrow(/_test/)
  })

  it("refuses the database the app itself uses", () => {
    const url = "postgres://dev:dev@localhost:5432/observatory_test"
    expect(() => assertThrowawayDatabase(url, url)).toThrow(/DATABASE_URL/)
  })

  it("ignores query parameters when reading the database name", () => {
    expect(() =>
      assertThrowawayDatabase("postgres://u:p@host/app_test?sslmode=require"),
    ).not.toThrow()
  })
})
