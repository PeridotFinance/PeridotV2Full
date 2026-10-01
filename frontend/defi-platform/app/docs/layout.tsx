import type { Metadata } from "next"
import type { ReactNode } from "react"
import { DocsShell } from "@/components/docs/DocsShell"

export const metadata: Metadata = {
  title: {
    default: "Documentation | Peridot",
    template: "%s | Peridot Docs",
  },
  description:
    "The complete guide to Peridot: lending, borrowing, interest-rate math, margin trading, points, and the app itself.",
}

export default function DocsLayout({ children }: { children: ReactNode }) {
  return <DocsShell>{children}</DocsShell>
}
