"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

// ─── Spring / slide variants ──────────────────────────────────────────────────
// House motion for every stellar sheet. Spring on open, short ease on close.

const SPRING = { type: "spring" as const, damping: 32, stiffness: 360, mass: 0.9 }
const EXIT = { duration: 0.2, ease: [0.32, 0, 0.67, 0] as const }

// Right drawer (≥ md). Bottom sheet (< md).
const variants = {
  right: {
    initial: { x: "100%" },
    animate: { x: 0, transition: SPRING },
    exit: { x: "100%", transition: EXIT },
  },
  bottom: {
    initial: { y: "100%" },
    animate: { y: 0, transition: SPRING },
    exit: { y: "100%", transition: EXIT },
  },
}

// ─── Focus trap helpers ───────────────────────────────────────────────────────

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null)
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SheetShellProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  /** Data-testid for the outer panel, so e2e can target it. */
  testId?: string
  /** Optional classes on the panel surface. */
  className?: string
  /** Responsive direction. Default: bottom on mobile, right on desktop. */
  direction?: "bottom" | "right" | "responsive"
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SheetShell({
  open,
  onClose,
  title,
  subtitle,
  children,
  testId,
  className,
  direction = "responsive",
}: SheetShellProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)
  const reducedMotion = useReducedMotion()
  // Reduced-motion users get a quick fade. We keep the same DOM so focus
  // and aria-modal semantics don't diverge between paths.
  const motionConfig = reducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: 0.12 } },
        exit: { opacity: 0, transition: { duration: 0.1 } },
      }
    : null

  // Lock body scroll while open, restore on close.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Focus trap + restore previous focus.
  useEffect(() => {
    if (!open) return
    prevFocusRef.current = (document.activeElement as HTMLElement) ?? null

    const frame = requestAnimationFrame(() => {
      const root = panelRef.current
      if (!root) return
      const focusables = getFocusable(root)
      ;(focusables[0] ?? root).focus()
    })

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== "Tab") return
      const root = panelRef.current
      if (!root) return
      const focusables = getFocusable(root)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("keydown", onKeyDown)
      prevFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  if (typeof document === "undefined") return null

  const panel = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[80] bg-black/30 backdrop-blur-[2px]"
            data-testid={testId ? `${testId}-backdrop` : undefined}
          />

          {/* Panel — responsive direction via two variants on md breakpoint */}
          <motion.div
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            data-testid={testId ?? "sheet-shell"}
            tabIndex={-1}
            variants={
              direction === "bottom"
                ? variants.bottom
                : direction === "right"
                ? variants.right
                : undefined
            }
            initial={direction === "responsive" ? undefined : "initial"}
            animate={direction === "responsive" ? undefined : "animate"}
            exit={direction === "responsive" ? undefined : "exit"}
            className={cn(
              "fixed z-[81] bg-background shadow-2xl flex flex-col outline-none",
              // Responsive default: bottom sheet on mobile, right drawer on desktop
              direction === "responsive" &&
                "inset-x-0 bottom-0 rounded-t-[1.75rem] max-h-[92vh] md:inset-x-auto md:top-0 md:bottom-0 md:right-0 md:rounded-none md:rounded-l-[1.5rem] md:max-h-none md:w-full md:max-w-md",
              direction === "bottom" &&
                "inset-x-0 bottom-0 rounded-t-[1.75rem] max-h-[92vh]",
              direction === "right" &&
                "top-0 right-0 bottom-0 w-full max-w-md",
              className
            )}
            // Responsive mode animates via CSS (transform) — simple fade-in
            // combined with Tailwind spring animation keeps both layouts happy
            {...(motionConfig ??
              (direction === "responsive"
                ? {
                    initial: { opacity: 0, y: 40, x: 0 },
                    animate: { opacity: 1, y: 0, x: 0, transition: SPRING },
                    exit: { opacity: 0, y: 40, transition: EXIT },
                  }
                : {}))}
          >
            {/* Drag handle (mobile bottom sheet) */}
            <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
              <div className="w-9 h-1 rounded-full bg-muted" />
            </div>

            {/* Header */}
            {(title || subtitle) && (
              <div className="flex items-start justify-between px-6 pt-4 pb-3 shrink-0">
                <div className="min-w-0">
                  {title && (
                    <h2 className="text-base font-bold text-foreground truncate">
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {subtitle}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onClose}
                  data-testid={testId ? `${testId}-close` : "sheet-close"}
                  className="shrink-0 -mr-1 w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground/80 hover:text-foreground/80 hover:bg-muted transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(panel, document.body)
}
