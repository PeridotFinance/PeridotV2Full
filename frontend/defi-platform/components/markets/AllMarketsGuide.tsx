"use client"

import React, { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { X, Zap, PiggyBank, TrendingUp, Wallet, ChevronRight } from "lucide-react"
import { isBannerDismissed, dismissBanner } from "@/lib/user-preferences"

interface AllMarketsGuideProps {
  theme: string | undefined
}

export default function AllMarketsGuide({ theme: themeProp }: AllMarketsGuideProps) {
  const { theme, resolvedTheme } = useTheme()
  const effectiveTheme = resolvedTheme || theme || themeProp || "dark"
  const [isVisible, setIsVisible] = useState(false)
  const bannerId = "all-markets-guide"

  useEffect(() => {
    if (!isBannerDismissed(bannerId)) {
      setIsVisible(true)
    }
  }, [])

  const handleClose = () => {
    setIsVisible(false)
    dismissBanner(bannerId)
  }

  if (!isVisible) return null

  const steps = [
    {
      icon: PiggyBank,
      title: "Supply",
      label: "Step 1",
      description: "Select an asset below and enter the amount you wish to deposit."
    },
    {
      icon: TrendingUp,
      title: "Earn",
      label: "Step 2",
      description: "Your yield accumulates automatically every couple of seconds."
    },
    {
      icon: Wallet,
      title: "Control",
      label: "Step 3",
      description: "Track your real-time earnings and withdraw your funds at any time."
    }
  ]

  return (
    <div className="relative group mb-8">
      {/* Subtle Border Beam Effect (Pure CSS) */}
      <div className={cn(
        "absolute -inset-[1px] rounded-2xl opacity-0 group-hover:opacity-30 transition-opacity duration-700 ease-out",
        "bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent",
        "animate-[shimmer_6s_infinite_linear]"
      )} style={{ backgroundSize: '200% 100%' }} />

      <div className={cn(
        "relative overflow-hidden rounded-2xl transition-all duration-500",
        "backdrop-blur-xl border border-white/10",
        effectiveTheme === "light"
          ? "bg-white/60 shadow-xl shadow-emerald-500/5"
          : "bg-black/20 shadow-2xl shadow-black/40"
      )}>
        {/* Mesh Gradient Background */}
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute top-0 -left-1/4 w-1/2 h-full bg-emerald-500/20 blur-[100px] animate-pulse" />
          <div className="absolute bottom-0 -right-1/4 w-1/2 h-full bg-purple-500/10 blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
        </div>

        <div className="relative p-5 md:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className={cn(
                    "w-2 h-2 rounded-full border border-background",
                    i === 1 ? "bg-emerald-500" : i === 2 ? "bg-teal-500" : "bg-purple-500"
                  )} />
                ))}
              </div>
              <span className={cn(
                "text-[10px] uppercase tracking-[0.2em] font-bold opacity-60",
                effectiveTheme === "light" ? "text-slate-900" : "text-white"
              )}>
                Quick Start Guide
              </span>
            </div>
            
            <button
              onClick={handleClose}
              className="p-1.5 rounded-full hover:bg-white/10 transition-all duration-500 ease-out opacity-40 hover:opacity-70"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Stepper Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4">
            {steps.map((step, i) => (
              <div key={i} className="relative flex flex-col items-center md:items-start group/step">
                <div className="flex items-center gap-4 mb-3 w-full">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 ease-out",
                    "border border-white/10 bg-white/5 group-hover/step:border-emerald-500/30 group-hover/step:bg-emerald-500/5",
                    "shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
                  )}>
                    <step.icon className="h-5 w-5 text-emerald-500 transition-transform duration-500 ease-out group-hover/step:scale-105" />
                  </div>
                  
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-emerald-500/80 uppercase tracking-wider">
                      {step.label}
                    </span>
                    <h3 className={cn(
                      "text-sm font-bold",
                      effectiveTheme === "light" ? "text-slate-900" : "text-white"
                    )}>
                      {step.title}
                    </h3>
                  </div>

                  {i < steps.length - 1 && (
                    <ChevronRight className="hidden md:block h-4 w-4 ml-auto opacity-20" />
                  )}
                </div>
                
                <p className={cn(
                  "text-xs leading-relaxed md:pl-0 pl-14",
                  effectiveTheme === "light" ? "text-slate-600" : "text-slate-400"
                )}>
                  {step.description}
                </p>

                {/* Interactive Indicator (Desktop) */}
                <div className={cn(
                  "absolute -bottom-6 left-0 right-0 h-[1px] transition-all duration-700 ease-out opacity-0 group-hover/step:opacity-40",
                  "bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent"
                )} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          from { background-position: 200% 0; }
          to { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}
