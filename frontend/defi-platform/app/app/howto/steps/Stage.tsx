"use client"

import { ReactNode } from "react"

export function Stage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative mx-auto mb-3 w-16 h-16 rounded-2xl overflow-hidden`}>
      <div className="absolute -inset-px rounded-2xl opacity-70 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(94,121,69,0.55), rgba(238,241,236,0.7))" }} />
      <div className="absolute inset-0 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20" />
      <div className="relative w-full h-full flex items-center justify-center">
        {children}
      </div>
    </div>
  )
}


