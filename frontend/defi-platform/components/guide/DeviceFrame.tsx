"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"
import type { Viewport } from "@/data/help-catalog"

interface DeviceFrameProps {
  viewport: Viewport
  src: string
  /** Intrinsic image dimensions, used to lock the aspect ratio. */
  width: number
  height: number
  alt: string
  children?: React.ReactNode // hotspot overlay
}

/**
 * Wraps a screenshot in a Trade-Republic-style device shell: a phone bezel
 * for mobile, a browser chrome bar for desktop. The screenshot keeps its true
 * aspect ratio so annotations (children) line up by percentage.
 */
export function DeviceFrame({ viewport, src, width, height, alt, children }: DeviceFrameProps) {
  if (viewport === "mobile") {
    return (
      <div className="mx-auto w-full max-w-[300px]">
        <div className="relative rounded-[2.4rem] border border-white/10 bg-black p-2 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/5">
          {/* notch */}
          <div className="absolute left-1/2 top-2 z-10 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-black" />
          <div className="relative overflow-hidden rounded-[1.9rem]" style={{ aspectRatio: `${width} / ${height}` }}>
            {/* The phone frame caps at ~300px wide, so 300px is the largest
                variant next/image ever needs to serve. */}
            <Image src={src} alt={alt} fill sizes="300px" className="object-cover object-top" />
            {children}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[920px]">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c1012] shadow-[0_30px_80px_-25px_rgba(0,0,0,0.8)] ring-1 ring-white/5">
        {/* chrome bar */}
        <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.03] px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/80" />
          <div className="ml-3 flex-1">
            <div className="mx-auto max-w-xs truncate rounded-md bg-black/30 px-3 py-1 text-center text-[11px] font-medium text-white/40">
              peridot.finance/app
            </div>
          </div>
        </div>
        <div className="relative" style={{ aspectRatio: `${width} / ${height}` }}>
          {/* Browser frame caps at ~920px; full-width below that breakpoint. */}
          <Image src={src} alt={alt} fill sizes="(min-width: 980px) 920px, 100vw" className="object-cover object-top" />
          {children}
        </div>
      </div>
    </div>
  )
}

/** A single annotated point on a screenshot. Positioned by percentage. */
export function Hotspot({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <div className="group/hot absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
      <span className="relative flex h-4 w-4 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyber-accent-primary/50" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyber-accent-primary ring-2 ring-white/70" />
      </span>
      <span
        className={cn(
          "pointer-events-none absolute left-1/2 top-5 z-30 w-max max-w-[200px] -translate-x-1/2 rounded-lg",
          "border border-white/10 bg-black/90 px-2.5 py-1.5 text-[11px] font-medium text-white",
          "opacity-0 shadow-xl backdrop-blur transition-opacity duration-150 group-hover/hot:opacity-100",
        )}
      >
        {label}
      </span>
    </div>
  )
}
