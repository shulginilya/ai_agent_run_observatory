// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("getDb", () => {
  it("throws an error naming DATABASE_URL when it is not set", async () => {
    vi.stubEnv("DATABASE_URL", "")
    const { getDb } = await import("@/lib/db")
    expect(() => getDb()).toThrow(/DATABASE_URL/)
  })

  it("creates one client and reuses it", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://dev:dev@localhost:1/none")
    const { getDb } = await import("@/lib/db")
    expect(getDb()).toBe(getDb())
  })
})

describe("app start-up", () => {
  it("prints the error and exits 1 when DATABASE_URL is not set", async () => {
    vi.stubEnv("DATABASE_URL", "")
    vi.stubEnv("NEXT_RUNTIME", "nodejs")
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const { register } = await import("@/instrumentation")
    register()
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/DATABASE_URL/))
    expect(exit).toHaveBeenCalledWith(1)
    exit.mockRestore()
    error.mockRestore()
  })

  it("starts when DATABASE_URL is set", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://dev:dev@localhost:1/none")
    vi.stubEnv("NEXT_RUNTIME", "nodejs")
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)
    const { register } = await import("@/instrumentation")
    register()
    expect(exit).not.toHaveBeenCalled()
    exit.mockRestore()
  })
})
