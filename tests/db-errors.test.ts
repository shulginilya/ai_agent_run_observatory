// @vitest-environment node
import { describe, expect, it } from "vitest"

import { describeError } from "@/lib/db/errors"

describe("describeError", () => {
  it("includes the cause behind a wrapped driver error", () => {
    const cause = new Error('password authentication failed for user "dev"')
    const error = new Error('Failed query: CREATE SCHEMA "drizzle"', { cause })
    expect(describeError(error)).toBe(
      'Failed query: CREATE SCHEMA "drizzle"\npassword authentication failed for user "dev"',
    )
  })

  it("follows a chain of causes", () => {
    const error = new Error("a", {
      cause: new Error("b", { cause: new Error("c") }),
    })
    expect(describeError(error)).toBe("a\nb\nc")
  })

  it("prints a non-Error value as text", () => {
    expect(describeError("boom")).toBe("boom")
  })
})
