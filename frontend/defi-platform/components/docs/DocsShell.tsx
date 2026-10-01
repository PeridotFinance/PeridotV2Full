"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { DOC_SECTIONS, DOC_EXTERNAL_LINKS } from "@/lib/docs/registry"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { BookOpen, ExternalLink, Menu, Search, X } from "lucide-react"

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Docs navigation" className="space-y-6">
      <Link
        href="/docs"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 text-sm font-semibold transition-colors",
          pathname === "/docs" ? "text-primary" : "text-foreground hover:text-primary",
        )}
      >
        <BookOpen className="h-4 w-4" aria-hidden />
        Documentation
      </Link>
      {DOC_SECTIONS.map((section) => (
        <div key={section.id}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {section.title}
          </p>
          <ul className="space-y-0.5 border-l border-border/60">
            {section.pages.map((page) => {
              const href = `/docs/${page.slug}`
              const active = pathname === href
              return (
                <li key={page.slug}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "-ml-px flex items-center gap-2 border-l py-1.5 pl-3 pr-2 text-sm transition-colors",
                      active
                        ? "border-primary font-medium text-primary"
                        : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                    )}
                  >
                    <span className="truncate">{page.navTitle ?? page.title}</span>
                    {page.badge ? (
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal text-muted-foreground">
                        {page.badge}
                      </Badge>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reference</p>
        <ul className="space-y-0.5 border-l border-border/60">
          {DOC_EXTERNAL_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={onNavigate}
                className="-ml-px flex items-center gap-1.5 border-l border-transparent py-1.5 pl-3 pr-2 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
              >
                {link.title}
                <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}

function DocsSearch() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40"
        aria-label="Search documentation"
      >
        <Search className="h-3.5 w-3.5" aria-hidden />
        <span className="flex-1 text-left">Search docs…</span>
        <kbd className="hidden rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[10px] md:inline">
          ⌘K
        </kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search the documentation…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {DOC_SECTIONS.map((section) => (
            <CommandGroup key={section.id} heading={section.title}>
              {section.pages.map((page) => (
                <CommandItem
                  key={page.slug}
                  value={`${page.title} ${page.description} ${page.keywords.join(" ")}`}
                  onSelect={() => {
                    setOpen(false)
                    router.push(`/docs/${page.slug}`)
                  }}
                >
                  <div>
                    <p className="text-sm">{page.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{page.description}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  )
}

export function DocsShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  // Close the drawer whenever the route changes (e.g. browser back).
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <div className="container mx-auto px-4 pb-24 sm:px-6 lg:px-8">
      {/* Mobile top bar */}
      <div className="mb-6 flex items-center gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close docs navigation" : "Open docs navigation"}
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
        <div className="flex-1">
          <DocsSearch />
        </div>
      </div>
      {mobileOpen ? (
        <div className="mb-8 rounded-xl border border-border/60 bg-card p-5 lg:hidden">
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </div>
      ) : null}

      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[240px_minmax(0,1fr)_200px]">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-32 max-h-[calc(100vh-10rem)] space-y-6 overflow-y-auto pb-8 pr-2">
            <DocsSearch />
            <SidebarNav />
          </div>
        </aside>

        {children}
      </div>
    </div>
  )
}
