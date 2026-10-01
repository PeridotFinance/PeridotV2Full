"use client"

/**
 * A numbered walkthrough where every step carries the screen it describes.
 *
 * The visual sibling of `StepList`: same numbering, same card, but the prose
 * sits next to the actual screen instead of asking the reader to imagine it.
 * Screens are captured at the width the dialog really renders at (~544–622px)
 * and shown at roughly half that, so they stay crisp on retina; the fine print
 * (a minimum, a fee line) is only legible once enlarged, hence the click.
 */

import { useState } from "react"
import Image from "next/image"
import { Maximize2 } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

export interface WalkthroughStep {
  title: string
  body: ReactNode
  /** Path under /public, e.g. "/docs/fiat/iban-details.webp". */
  src: string
  /** Intrinsic pixel size of the capture; keeps the layout from shifting. */
  width: number
  height: number
  alt: string
}

export function ScreenshotWalkthrough({ steps }: { steps: WalkthroughStep[] }) {
  const [zoomed, setZoomed] = useState<WalkthroughStep | null>(null)

  return (
    <>
      <ol className="my-6 space-y-4">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="overflow-hidden rounded-xl border border-border/60 bg-card"
          >
            <div className="flex gap-4 p-4 pb-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-sm font-semibold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-sm font-medium">{step.title}</p>
                <div className="text-sm leading-6 text-muted-foreground">{step.body}</div>
              </div>
            </div>

            <div className="px-4 pb-4">
              <button
                type="button"
                onClick={() => setZoomed(step)}
                aria-label={`Enlarge screenshot: ${step.title}`}
                className={cn(
                  "group relative mx-auto block overflow-hidden rounded-lg",
                  "border border-border/60 bg-background/40",
                  "w-full transition-colors hover:border-primary/40",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                )}
                style={{ maxWidth: step.width }}
              >
                <Image
                  src={step.src}
                  alt={step.alt}
                  width={step.width}
                  height={step.height}
                  sizes={`(min-width: 768px) ${step.width}px, 100vw`}
                  className="h-auto w-full"
                />
                <span
                  aria-hidden
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </span>
              </button>
            </div>
          </li>
        ))}
      </ol>

      <Dialog open={zoomed !== null} onOpenChange={(open) => !open && setZoomed(null)}>
        <DialogContent className="max-w-[min(92vw,760px)] p-3">
          {zoomed && (
            <>
              <DialogTitle className="sr-only">{zoomed.title}</DialogTitle>
              <Image
                src={zoomed.src}
                alt={zoomed.alt}
                width={zoomed.width}
                height={zoomed.height}
                sizes="(min-width: 800px) 720px, 92vw"
                className="h-auto w-full rounded-lg"
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
