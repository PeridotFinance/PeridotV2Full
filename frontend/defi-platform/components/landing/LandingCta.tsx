"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { trackCta } from "@/lib/analytics/cta"

/**
 * The primary call to action on a marketing page.
 *
 * One component so that every campaign page reports its clicks the same way and
 * under a name that survives a restyle — `cta` is the identity, the CSS is not.
 */
export function LandingCta({
  cta,
  href = "/app/borrow",
  className,
  children,
}: {
  cta: string
  href?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      onClick={() => trackCta(cta, { to: href })}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3",
        "font-medium text-primary-foreground transition-colors hover:bg-primary/90",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className,
      )}
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  )
}
