"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { VIEW_MODE_COOKIE, parseViewMode, type ViewMode } from "@/lib/view-mode"
import { resolveLoginDefault, type LoginKind, type ViewModeOrigin } from "@/lib/login-kind"

// Re-exported for the many client components that already import them from
// here. Server components must import from `@/lib/view-mode` directly — see
// the note in that file.
export { VIEW_MODE_COOKIE, type ViewMode }

interface ViewModeContextValue {
  mode: ViewMode
  setMode: (next: ViewMode) => void
  /**
   * Open the view that fits how the visitor signed in, unless they picked one
   * themselves. Safe to call on every render: it only acts on a change.
   */
  applyLoginDefault: (kind: LoginKind) => void
}

const ViewModeContext = createContext<ViewModeContextValue | null>(null)

function readCookie(): ViewMode | null {
  if (typeof document === "undefined") return null
  const hit = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${VIEW_MODE_COOKIE}=`))
  return parseViewMode(hit?.slice(VIEW_MODE_COOKIE.length + 1))
}

function writeCookie(v: ViewMode) {
  if (typeof document === "undefined") return
  const oneYear = 60 * 60 * 24 * 365
  document.cookie = `${VIEW_MODE_COOKIE}=${v}; path=/; max-age=${oneYear}; SameSite=Lax`
}

// Who set the mode. localStorage rather than a second cookie because only the
// client ever needs it; the server renders whatever the cookie says.
const ORIGIN_KEY = "peridot.viewMode.origin"

function readOrigin(): ViewModeOrigin | null {
  try {
    const v = window.localStorage.getItem(ORIGIN_KEY)
    return v === "explicit" || v === "login" ? v : null
  } catch {
    return null
  }
}

function writeOrigin(v: ViewModeOrigin) {
  try {
    window.localStorage.setItem(ORIGIN_KEY, v)
  } catch {
    /* private window: the cookie still carries the mode */
  }
}

interface ProviderProps {
  initialMode: ViewMode
  children: ReactNode
}

export function ViewModeProvider({ initialMode, children }: ProviderProps) {
  const [mode, setModeState] = useState<ViewMode>(initialMode)
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const hydratedRef = useRef(false)
  // State, not only the ref: children's effects run before this provider's
  // mount effect, so `applyLoginDefault` has to change identity once the URL
  // and cookie have been read, or a login default could overrule `?view=`.
  const [hydrated, setHydrated] = useState(false)

  // Two one-shot mount concerns, in precedence order:
  //
  // 1. `?view=easy|expert` is a deep-link: adopt it, persist to the cookie,
  //    then strip it from the URL so the toggle's own `setMode` calls don't
  //    trip over a stale query param.
  // 2. Otherwise re-read the cookie. `initialMode` is server-rendered, so it is
  //    normally right — but this keeps the client in step with what mode-gated
  //    server routes (e.g. `/app/borrow`) enforce even if the layout's value is
  //    ever served from a cached or prerendered shell. A mismatch there is not
  //    cosmetic: the header would offer a Borrow tab that the server bounces.
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    setHydrated(true)

    const urlMode = parseViewMode(sp?.get("view"))
    if (urlMode) {
      if (urlMode !== mode) setModeState(urlMode)
      writeCookie(urlMode)
      // A link that names a view is a choice; the login default must not
      // undo it a second later (e.g. the funded page's Easy deposit resume).
      writeOrigin("explicit")
      const next = new URLSearchParams(sp?.toString() ?? "")
      next.delete("view")
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname ?? "/app", { scroll: false })
      return
    }

    const cookieMode = readCookie()
    if (cookieMode && cookieMode !== mode) setModeState(cookieMode)
  }, [sp, router, pathname, mode])

  const setMode = (next: ViewMode) => {
    if (next === mode) return
    setModeState(next)
    writeCookie(next)
    writeOrigin("explicit")
  }

  const applyLoginDefault = useCallback(
    (kind: LoginKind) => {
      if (!hydrated) return
      const decision = resolveLoginDefault({
        kind,
        origin: readOrigin(),
        cookieMode: readCookie(),
        currentMode: mode,
      })
      if (decision.mode) setModeState(decision.mode)
      if (decision.writeCookie) writeCookie(decision.mode ?? mode)
      writeOrigin(decision.origin)
    },
    [mode, hydrated],
  )

  return (
    <ViewModeContext.Provider value={{ mode, setMode, applyLoginDefault }}>{children}</ViewModeContext.Provider>
  )
}

export function useViewMode(): ViewModeContextValue {
  const ctx = useContext(ViewModeContext)
  // Safe fallback so components rendered outside the provider (e.g. landing)
  // can still call this hook without throwing. Easy is the default surface.
  if (!ctx) return { mode: "easy", setMode: () => {}, applyLoginDefault: () => {} }
  return ctx
}
