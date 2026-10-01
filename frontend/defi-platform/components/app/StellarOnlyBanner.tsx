"use client"

import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Dezenter Hinweis, dass aktuell nur die Stellar-Märkte gezeigt werden.
 * Fintech-Ton — keine Chain-/Gas-/Utilization-Fachbegriffe (siehe
 * `feedback_ui_fintech_style`). Nur sichtbar, wenn der Host im Stellar-only
 * Modus ist (siehe `config/stellarOnly`).
 */
export function StellarOnlyBanner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3.5 py-2.5",
        className
      )}
      role="note"
    >
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
      <p className="text-[12px] leading-snug text-muted-foreground">
        We're currently featuring our{" "}
        <span className="font-semibold text-foreground/80">Stellar</span> markets:
        fast, low-cost, and fully non-custodial. More networks are coming back soon.
      </p>
    </div>
  )
}
