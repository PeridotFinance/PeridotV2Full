"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Monitor, Smartphone, ImageOff } from "lucide-react"
import { cn } from "@/lib/utils"
import type { HelpEntry, Viewport } from "@/data/help-catalog"
import { DeviceFrame, Hotspot } from "./DeviceFrame"

interface ShotMeta {
  path: string
  width: number
  height: number
}
type EntryShots = Partial<Record<Viewport, ShotMeta>>

interface GuideEntryCardProps {
  entry: HelpEntry
  shots: EntryShots | undefined
  /** Global viewport preference; the card follows it when available. */
  preferred: Viewport
}

export function GuideEntryCard({ entry, shots, preferred }: GuideEntryCardProps) {
  const available = entry.viewports.filter((v) => shots?.[v])
  // Follow the global preference, else fall back to whatever was captured.
  const initial = available.includes(preferred) ? preferred : available[0]
  const [viewport, setViewport] = useState<Viewport | undefined>(initial)

  const active = viewport && available.includes(viewport) ? viewport : available[0]
  const shot = active ? shots?.[active] : undefined
  const hotspots = active ? entry.hotspots?.[active] ?? [] : []

  return (
    <motion.article
      id={`entry-${entry.key}`}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
      className="scroll-mt-28 rounded-2xl border border-border bg-card/70 p-5 backdrop-blur-sm sm:p-6"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-text sm:text-xl">{entry.title}</h3>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{entry.blurb}</p>
        </div>

        {available.length > 1 && (
          <div className="flex shrink-0 rounded-full border border-border bg-muted p-0.5">
            {available.map((v) => (
              <button
                key={v}
                onClick={() => setViewport(v)}
                aria-pressed={active === v}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  active === v ? "bg-cyber-accent-primary text-white" : "text-muted-foreground hover:text-text",
                )}
              >
                {v === "desktop" ? <Monitor className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
                {v === "desktop" ? "Desktop" : "Mobile"}
              </button>
            ))}
          </div>
        )}
      </div>

      {shot && active ? (
        <DeviceFrame
          viewport={active}
          src={shot.path}
          width={shot.width}
          height={shot.height}
          alt={`${entry.title} – ${active}`}
        >
          {hotspots.map((h, i) => (
            <Hotspot key={i} x={h.x} y={h.y} label={h.label} />
          ))}
        </DeviceFrame>
      ) : (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground">
          <ImageOff className="h-5 w-5" />
          <span className="text-xs">Screenshot not captured yet</span>
        </div>
      )}
    </motion.article>
  )
}
