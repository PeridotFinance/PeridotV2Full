"use client"

import { useState } from "react"
import Image from "next/image"
import { Loader2, Lock } from "lucide-react"

export function DataroomLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/dataroom/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body?.error || "Access denied.")
        return
      }
      onSuccess()
    } catch {
      setError("Network error — please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6 py-20">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-foreground/[0.08] bg-background p-8"
      >
        <Image
          src="/tokenimages/app/peridot-dot-logo.svg"
          alt=""
          width={28}
          height={28}
          className="mb-6 opacity-80"
        />
        <h1 className="text-xl font-semibold tracking-tight">Peridot Dataroom</h1>
        <p className="mt-2 text-sm text-foreground/55">
          Protocol and traction data. Enter the access key you were given.
        </p>

        <label className="mt-6 block text-[11px] uppercase tracking-widest text-foreground/45">
          Access key
        </label>
        <div className="relative mt-2">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/30" />
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-foreground/[0.1] bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-foreground/30"
            placeholder="••••••••"
          />
        </div>

        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={busy || !password}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-sm font-medium text-background transition-opacity disabled:opacity-40"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Unlock
        </button>

        <p className="mt-4 text-[11px] leading-relaxed text-foreground/35">
          Session stays open for 12 hours. Figures are aggregated — no personal
          data, addresses or e-mail addresses are shown.
        </p>
      </form>
    </main>
  )
}
