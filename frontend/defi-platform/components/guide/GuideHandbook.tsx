"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Monitor, Smartphone } from "lucide-react"
import { cn } from "@/lib/utils"
import { HELP_CATEGORIES, HELP_CATALOG, type HelpCategoryId, type Viewport } from "@/data/help-catalog"
import manifestJson from "@/public/guide/shots/manifest.json"
import { ShaderBackground } from "./ShaderBackground"
import { GuideSidebar } from "./GuideSidebar"
import { GuideEntryCard } from "./GuideEntryCard"
import { GuideSearch } from "./GuideSearch"

interface ShotMeta {
  path: string
  width: number
  height: number
}
const manifest = manifestJson as { shots: Record<string, Partial<Record<Viewport, ShotMeta>>> }

export function GuideHandbook() {
  const [preferred, setPreferred] = useState<Viewport>("desktop")
  const [searchOpen, setSearchOpen] = useState(false)

  // Only show categories that actually have captured screenshots, which keeps the
  // handbook honest while the catalog is still being filled out.
  const { sections, visibleIds, counts } = useMemo(() => {
    const counts = {} as Record<HelpCategoryId, number>
    const sections = HELP_CATEGORIES.map((cat) => {
      const entries = HELP_CATALOG.filter(
        (e) => e.category === cat.id && e.viewports.some((v) => manifest.shots[e.key]?.[v]),
      )
      counts[cat.id] = entries.length
      return { cat, entries }
    }).filter((s) => s.entries.length > 0)
    return { sections, visibleIds: sections.map((s) => s.cat.id), counts }
  }, [])

  const [active, setActive] = useState<HelpCategoryId>(visibleIds[0])
  const sectionRefs = useRef(new Map<HelpCategoryId, HTMLElement>())

  // Scroll-spy: the section whose heading is nearest the top wins.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive(top.target.id.replace("section-", "") as HelpCategoryId)
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    )
    sectionRefs.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [sections.length])

  const scrollTo = useCallback((id: HelpCategoryId) => {
    sectionRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  const onSearchSelect = useCallback((entryKey: string, categoryId: HelpCategoryId) => {
    setSearchOpen(false)
    setActive(categoryId)
    requestAnimationFrame(() => {
      document.getElementById(`entry-${entryKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
  }, [])

  // ⌘K / Ctrl+K to open search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="relative min-h-screen">
      <ShaderBackground />

      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        {/* Hero */}
        <header className="mx-auto mb-12 max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-cyber-accent-primary">
            App Handbook
          </span>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-text sm:text-5xl">
            Every screen. <span className="gradient-text">Every state.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-text/60">
            A visual reference for the Peridot app, for our team and our users.
            See every screen and every state on desktop and mobile: deposit, waiting, success, error.
          </p>

          {/* Global device preference */}
          <div className="mt-7 inline-flex rounded-full border border-border bg-card/70 p-1 backdrop-blur">
            {(["desktop", "mobile"] as Viewport[]).map((v) => (
              <button
                key={v}
                onClick={() => setPreferred(v)}
                aria-pressed={preferred === v}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  preferred === v ? "bg-cyber-accent-primary text-black" : "text-text/55 hover:text-text/80",
                )}
              >
                {v === "desktop" ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                {v === "desktop" ? "Desktop" : "Mobile"}
              </button>
            ))}
          </div>
        </header>

        {/* Layout */}
        <div className="grid gap-10 lg:grid-cols-[230px_1fr]">
          <GuideSidebar
            active={active}
            visible={visibleIds}
            counts={counts}
            onNavigate={scrollTo}
            onSearch={() => setSearchOpen(true)}
          />

          <main className="min-w-0 space-y-16">
            {sections.map(({ cat, entries }) => (
              <section
                key={cat.id}
                id={`section-${cat.id}`}
                ref={(el) => {
                  if (el) sectionRefs.current.set(cat.id, el)
                  else sectionRefs.current.delete(cat.id)
                }}
                className="scroll-mt-28"
              >
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-text">{cat.label}</h2>
                  <p className="mt-1 text-sm text-text/50">{cat.blurb}</p>
                </div>
                <div className="space-y-6">
                  {entries.map((entry) => (
                    <GuideEntryCard key={entry.key} entry={entry} shots={manifest.shots[entry.key]} preferred={preferred} />
                  ))}
                </div>
              </section>
            ))}
          </main>
        </div>
      </div>

      <GuideSearch open={searchOpen} onOpenChange={setSearchOpen} onSelect={onSearchSelect} />
    </div>
  )
}
