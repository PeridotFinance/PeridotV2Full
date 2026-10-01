"use client"

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

// ─── Content schema ─────────────────────────────────────────────────────────

export interface TooltipCalcRow {
  /** Row label (left side). Omit on separator rows. */
  label?: string
  /** Formatted value (right side). Omit on separator rows. */
  value?: string
  /** Highlight in emerald — useful for totals */
  highlight?: boolean
  /** Renders a full-width separator line instead of a data row */
  separator?: boolean
}

export interface InfoTooltipContent {
  /** Bold header at the top */
  title?: string
  /** Prose explanation — accepts a string or any React node */
  description?: ReactNode
  /** Bulleted list items */
  bullets?: string[]
  /**
   * Monospace calculation table.
   * Insert a { separator: true } row to draw a horizontal rule.
   */
  calculation?: TooltipCalcRow[]
  /**
   * Small italic footnote shown below everything.
   * Good for caveats or data timestamps.
   */
  note?: string
  /**
   * Reserved slot for rich media (image URL, video URL, React node).
   * Rendered as-is beneath the note when provided.
   * Extend this as needed without touching the layout logic.
   */
  media?: ReactNode
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface InfoTooltipProps {
  content: InfoTooltipContent
  /** The element that acts as the trigger. Typically an <Info> icon. */
  children: ReactNode
  /** Additional className on the trigger wrapper */
  className?: string
  /**
   * Preferred side. "auto" (default) picks the side with more room.
   * The tooltip will always flip if it would overflow the viewport.
   */
  side?: "top" | "bottom" | "auto"
  /** Max width of the tooltip bubble in px. Default 300. */
  maxWidth?: number
}

// ─── Positioning ─────────────────────────────────────────────────────────────

const GAP = 8          // px between trigger and tooltip
const EDGE_PAD = 12    // min distance from viewport edges

interface Pos { top: number; left: number; side: "top" | "bottom" }

function calcPos(
  trig: DOMRect,
  tw: number,
  th: number,
  preferred: "top" | "bottom" | "auto",
): Pos {
  const vpW = window.innerWidth
  const vpH = window.innerHeight

  let side: "top" | "bottom" =
    preferred === "bottom" ? "bottom"
    : preferred === "top"   ? "top"
    : trig.top >= th + GAP + EDGE_PAD ? "top" : "bottom"

  // Flip if preferred side overflows
  if (side === "top" && trig.top < th + GAP + EDGE_PAD) side = "bottom"
  if (side === "bottom" && trig.bottom + GAP + th + EDGE_PAD > vpH) side = "top"

  const top =
    side === "top"
      ? trig.top + window.scrollY - th - GAP
      : trig.bottom + window.scrollY + GAP

  const idealLeft = trig.left + trig.width / 2 - tw / 2
  const left = Math.max(
    EDGE_PAD,
    Math.min(idealLeft, vpW - tw - EDGE_PAD),
  )

  return { top, left, side }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function InfoTooltip({
  content,
  children,
  className,
  side = "auto",
  maxWidth = 300,
}: InfoTooltipProps) {
  const [open, setOpen]       = useState(false)
  const [visible, setVisible] = useState(false)   // controls CSS opacity
  const [pos, setPos]         = useState<Pos | null>(null)
  const [mounted, setMounted] = useState(false)

  const triggerRef = useRef<HTMLSpanElement>(null)
  const tipRef     = useRef<HTMLDivElement>(null)
  const hideTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setMounted(true) }, [])

  // ── Positioning ─────────────────────────────────────────────────────────

  const reposition = useCallback(() => {
    if (!triggerRef.current || !tipRef.current) return
    const trig = triggerRef.current.getBoundingClientRect()
    const tip  = tipRef.current.getBoundingClientRect()
    setPos(calcPos(trig, tip.width || maxWidth, tip.height || 60, side))
  }, [side, maxWidth])

  // Run synchronously after DOM paint so we measure the real tooltip size
  useLayoutEffect(() => {
    if (!open) return
    reposition()
  }, [open, reposition])

  // Re-position on scroll / resize
  useEffect(() => {
    if (!open) return
    const opts = { passive: true, capture: true } as const
    window.addEventListener("scroll", reposition, opts)
    window.addEventListener("resize", reposition)
    return () => {
      window.removeEventListener("scroll", reposition, opts as any)
      window.removeEventListener("resize", reposition)
    }
  }, [open, reposition])

  // Fade in after position is known
  useEffect(() => {
    if (!open) { setVisible(false); return }
    // Small raf so position is computed first
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [open, pos])

  // ── Open / close helpers ─────────────────────────────────────────────────

  const show = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setOpen(true)
  }, [])

  const hide = useCallback(() => {
    hideTimer.current = setTimeout(() => {
      setVisible(false)
      // Wait for CSS transition before unmounting
      setTimeout(() => setOpen(false), 150)
    }, 120)
  }, [])

  const toggle = useCallback(() => {
    if (open) hide()
    else      show()
  }, [open, show, hide])

  // Close on outside interaction
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | TouchEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return
      if (tipRef.current?.contains(e.target as Node))     return
      hide()
    }
    document.addEventListener("mousedown", close)
    document.addEventListener("touchstart", close, { passive: true })
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("touchstart", close)
    }
  }, [open, hide])

  // ── Tooltip bubble ───────────────────────────────────────────────────────

  const translateY = pos?.side === "bottom" ? "-4px" : "4px"

  const bubble = (
    <div
      ref={tipRef}
      role="tooltip"
      onMouseEnter={() => hideTimer.current && clearTimeout(hideTimer.current)}
      onMouseLeave={hide}
      style={{
        position:  "fixed",
        top:       pos ? `${pos.top}px`  : "0px",
        left:      pos ? `${pos.left}px` : "0px",
        maxWidth:  `min(${maxWidth}px, calc(100vw - ${EDGE_PAD * 2}px))`,
        zIndex:    9999,
        opacity:   visible && pos ? 1 : 0,
        transform: visible && pos ? "translateY(0) scale(1)" : `translateY(${translateY}) scale(0.96)`,
        transition: "opacity 0.15s ease, transform 0.15s ease",
        pointerEvents: visible ? "auto" : "none",
      }}
      className="rounded-2xl border border-foreground/10 bg-background dark:bg-zinc-900/95 dark:backdrop-blur-2xl shadow-2xl shadow-black/20 p-4 space-y-3 text-sm"
    >
      {/* Title */}
      {content.title && (
        <p className="font-bold text-foreground text-[13px] tracking-tight pb-2 border-b border-foreground/10">
          {content.title}
        </p>
      )}

      {/* Description */}
      {content.description && (
        <div className="text-[12px] text-foreground/70 leading-relaxed">
          {content.description}
        </div>
      )}

      {/* Bullet list */}
      {content.bullets && content.bullets.length > 0 && (
        <ul className="space-y-1.5">
          {content.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px] text-foreground/70">
              <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Calculation table */}
      {content.calculation && content.calculation.length > 0 && (
        <div className="rounded-xl bg-foreground/5 dark:bg-white/[0.04] border border-foreground/10 px-3 py-2.5 space-y-1.5 font-mono">
          {content.calculation.map((row, i) =>
            row.separator ? (
              <div key={i} className="border-t border-foreground/15 my-1" />
            ) : (
              <div
                key={i}
                className={cn(
                  "flex items-center justify-between gap-3 text-[11px]",
                  row.highlight
                    ? "font-bold text-emerald-400"
                    : "text-foreground/60",
                )}
              >
                <span>{row.label}</span>
                <span className="tabular-nums">{row.value}</span>
              </div>
            ),
          )}
        </div>
      )}

      {/* Footnote */}
      {content.note && (
        <p className="text-[10px] text-muted-foreground leading-relaxed italic border-t border-foreground/10 pt-2.5">
          {content.note}
        </p>
      )}

      {/* Rich media slot (images, videos, custom React nodes) */}
      {content.media && (
        <div className="rounded-xl overflow-hidden border border-foreground/10 mt-1">
          {content.media}
        </div>
      )}
    </div>
  )

  return (
    <>
      <span
        ref={triggerRef}
        className={cn("inline-flex items-center cursor-help outline-none", className)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onTouchEnd={(e) => { e.preventDefault(); toggle() }}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {children}
      </span>

      {mounted && open && createPortal(bubble, document.body)}
    </>
  )
}
