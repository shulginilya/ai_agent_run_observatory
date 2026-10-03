import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ThemeProvider } from "next-themes"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import Home from "@/app/page"

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }) as MediaQueryList
})

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ""
})

function renderHome() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Home />
    </ThemeProvider>,
  )
}

describe("home page", () => {
  it("shows the product name and description", () => {
    renderHome()
    expect(
      screen.getByRole("heading", { name: "Agent Run Observatory" }),
    ).toBeInTheDocument()
    expect(
      screen.getByText("Explore what an AI coding agent did in a session."),
    ).toBeInTheDocument()
  })

  it("toggles the dark class on the root element", async () => {
    const user = userEvent.setup()
    renderHome()
    const toggle = screen.getByRole("button", { name: "Toggle theme" })

    await user.click(toggle)
    expect(document.documentElement).toHaveClass("dark")

    await user.click(toggle)
    expect(document.documentElement).not.toHaveClass("dark")
  })
})
