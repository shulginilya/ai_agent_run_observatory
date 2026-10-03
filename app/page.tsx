import { ThemeToggle } from "@/components/theme-toggle"

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">
          Agent Run Observatory
        </h1>
        <p className="text-muted-foreground">
          Explore what an AI coding agent did in a session.
        </p>
      </div>
      <ThemeToggle />
    </main>
  )
}
