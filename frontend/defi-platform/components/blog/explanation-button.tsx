"use client"

import { useState, useRef, useEffect } from "react"
import Image from "next/image"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface ExplanationButtonProps {
  explanation: string
  className?: string
}

export function ExplanationButton({ explanation, className }: ExplanationButtonProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isExpanded && contentRef.current) {
      // Scroll explanation into view on mobile
      contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isExpanded])

  return (
    <div ref={containerRef} className={cn("relative my-4 w-full", className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "group relative flex items-center gap-2 px-3 py-2 rounded-2xl w-full sm:w-auto",
          "bg-background/40 backdrop-blur-sm",
          "border border-border/50",
          "shadow-[0_2px_8px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.1)]",
          "hover:bg-background/60 hover:shadow-[0_4px_12px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.15)]",
          "transition-all duration-300 ease-out",
          "active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          "text-sm text-muted-foreground hover:text-foreground"
        )}
        aria-label="Learn more"
        aria-expanded={isExpanded}
      >
        {/* Owl mascot icon */}
        <div className="relative w-5 h-5 flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
          <Image
            src="/Owl Mascot - Mint Green.svg"
            alt=""
            width={20}
            height={20}
            className="w-full h-full object-contain"
            aria-hidden="true"
          />
        </div>
        
        <span className="font-medium">Learn more</span>
        
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 transition-transform ml-auto sm:ml-0" />
        ) : (
          <ChevronDown className="w-4 h-4 transition-transform ml-auto sm:ml-0" />
        )}
      </button>

      {/* Expanded explanation */}
      {isExpanded && (
        <div
          ref={contentRef}
          className={cn(
            "mt-3 w-full",
            "bg-background/95 backdrop-blur-md",
            "border border-border/60 rounded-2xl",
            "shadow-[0_8px_24px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.1)]",
            "p-4 md:p-5",
            "animate-in fade-in slide-in-from-top-2 duration-300"
          )}
          role="region"
          aria-label="Explanation"
        >
          <div className="flex items-start gap-3">
            <div className="relative w-6 h-6 flex-shrink-0 mt-0.5">
              <Image
                src="/Owl Mascot - Colored.svg"
                alt=""
                width={24}
                height={24}
                className="w-full h-full object-contain"
                aria-hidden="true"
              />
            </div>
            <div className="flex-1">
              <p className="text-sm md:text-base text-foreground/90 leading-relaxed whitespace-pre-wrap">
                {explanation}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

