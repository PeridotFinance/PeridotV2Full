"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface LoadingDotsProps {
  className?: string
}

export function LoadingDots({ className }: LoadingDotsProps) {
  const [dots, setDots] = useState(".")

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "." : prev + "."))
    }, 500)
    return () => clearInterval(interval)
  }, [])

  return (
    <span className={cn("inline-block min-w-[12px] text-left animate-pulse", className)}>
      {dots}
    </span>
  )
}

