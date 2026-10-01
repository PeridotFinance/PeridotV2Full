"use client"

/**
 * A single screenshot with a caption, click to enlarge.
 *
 * The one-image sibling of ScreenshotWalkthrough, for the places where a page
 * needs to show one screen rather than walk through a flow. Captures are stored
 * at twice their display width so they stay sharp on retina, and the caption is
 * a real figcaption: it says what the reader is looking at, which is also the
 * text a search engine gets to associate with the image.
 */

import { useState } from "react"
import Image from "next/image"
import { Maximize2 } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { ReactNode } from "react"

export interface DocFigureProps {
  /** Path under /public, e.g. "/docs/app/easy-markets.webp". */
  src: string
  /** Intrinsic pixel size of the file; keeps the layout from shifting. */
  width: number
  height: number
  /** Describes the screen for a reader who cannot see it. */
  alt: string
  caption: ReactNode
}

export function DocFigure({ src, width, height, alt, caption }: DocFigureProps) {
  const [zoomed, setZoomed] = useState(false)

  return (
    <>
      <figure className="my-6">
        <button
          type="button"
          onClick={() => setZoomed(true)}
          aria-label={`Enlarge screenshot: ${alt}`}
          className="group relative block w-full overflow-hidden rounded-xl border border-border/60 bg-background/40 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            sizes="(min-width: 768px) 768px, 100vw"
            className="h-auto w-full"
          />
          <span
            aria-hidden
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </span>
        </button>
        <figcaption className="mt-2 text-xs leading-5 text-muted-foreground">{caption}</figcaption>
      </figure>

      <Dialog open={zoomed} onOpenChange={setZoomed}>
        <DialogContent className="max-w-[min(94vw,1100px)] p-3">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            sizes="(min-width: 1100px) 1060px, 94vw"
            className="h-auto w-full rounded-lg"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
