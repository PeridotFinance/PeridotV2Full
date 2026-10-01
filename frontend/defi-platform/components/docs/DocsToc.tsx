"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface TocEntry {
  id: string
  text: string
}

/**
 * "On this page" list, built from the rendered article's h2[id] headings so
 * content pages don't have to declare their outline twice.
 */
export function DocsToc() {
  const [entries, setEntries] = useState<TocEntry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    const headings = Array.from(
      document.querySelectorAll<HTMLHeadingElement>("article[data-docs-article] h2[id]"),
    )
    setEntries(headings.map((h) => ({ id: h.id, text: h.textContent?.replace(/#$/, "").trim() ?? "" })))

    const observer = new IntersectionObserver(
      (observed) => {
        for (const entry of observed) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
            break
          }
        }
      },
      { rootMargin: "-30% 0px -60% 0px" },
    )
    headings.forEach((h) => observer.observe(h))
    return () => observer.disconnect()
  }, [])

  if (entries.length < 2) return null

  return (
    <nav aria-label="On this page" className="hidden xl:block">
      <div className="sticky top-32">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          On this page
        </p>
        <ul className="space-y-2 border-l border-border/60 text-sm">
          {entries.map((entry) => (
            <li key={entry.id}>
              <a
                href={`#${entry.id}`}
                className={cn(
                  "-ml-px block border-l py-0.5 pl-3 leading-5 transition-colors",
                  activeId === entry.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {entry.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
