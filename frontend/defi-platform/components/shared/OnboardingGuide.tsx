"use client"

import React from "react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

interface OnboardingGuideProps {
  shouldShowOnboarding: boolean
  isConnected: boolean
  theme: string
  scrollToMarkets: () => void
}

export const OnboardingGuide: React.FC<OnboardingGuideProps> = ({
  shouldShowOnboarding,
  isConnected,
  theme,
  scrollToMarkets
}) => {
  const { resolvedTheme } = useTheme()
  const isDarkMode = (resolvedTheme || theme) === "dark"
  const isLightMode = !isDarkMode
  if (!shouldShowOnboarding) {
    return null
  }

  const steps = !isConnected ? [
    {
      step: "01",
      title: "Connect Your Wallet",
      description: "Click the connect button above to link your Web3 wallet. We support MetaMask, WalletConnect, and more.",
      icon: "🔗"
    },
    {
      step: "02",
      title: "Supply & Earn APY",
      description: "Once connected, choose any asset from the markets below, supply it, and start earning interest automatically.",
      icon: "💰"
    }
  ] : [
    {
      step: "01",
      title: "Choose an Asset",
      description: "Select any token from the markets table below. Popular choices: USDC, USDT, or WBNB.",
      icon: "→"
    },
    {
      step: "02",
      title: "Supply & Earn APY",
      description: "Click the asset row to expand, enter an amount, and supply. Start earning interest immediately.",
      icon: "💰"
    },
    {
      step: "03",
      title: "Watch Your Balance Grow",
      description: "Your supplied balance earns APY automatically. Check back anytime to see your earnings.",
      icon: "📈"
    },
    {
      step: "04",
      title: "Enable Collateral (Optional)",
      description: "Enable your supplied assets as collateral to unlock borrowing power and maximize your DeFi strategy.",
      icon: "🔓"
    }
  ]

  const handleStepClick = (step: string) => {
    if (isConnected && (step === "01" || step === "02")) {
      scrollToMarkets()
    }
  }

  return (
    <div className={cn(
      "relative overflow-hidden",
      "rounded-2xl",
      "backdrop-blur-md transition-all duration-500 ease-out",
      // Subtle neomorphism with multi-dimensional look
      "bg-gradient-to-br",
      isLightMode
        ? "from-white/60 via-white/40 to-white/30 border border-white/40"
        : "from-background/80 via-background/60 to-background/40 border border-white/5",
      // Multi-dimensional shadows - inset and outer
      "shadow-[inset_0_2px_4px_rgba(0,0,0,0.06),inset_0_-1px_2px_rgba(255,255,255,0.1),0_4px_12px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]",
      // Dark mode adjustments
      "dark:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),inset_0_-1px_2px_rgba(255,255,255,0.03),0_4px_12px_rgba(0,0,0,0.4),0_1px_2px_rgba(0,0,0,0.2)]",
      // Subtle hover lift
      "hover:shadow-[inset_0_2px_4px_rgba(0,0,0,0.08),inset_0_-1px_2px_rgba(255,255,255,0.12),0_6px_16px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.06)]",
      "dark:hover:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4),inset_0_-1px_2px_rgba(255,255,255,0.05),0_6px_16px_rgba(0,0,0,0.5),0_2px_4px_rgba(0,0,0,0.3)]"
    )}>
      {/* Subtle header */}
      <div className={cn(
        "relative px-4 py-3 md:px-6 md:py-4 border-b",
        isLightMode
          ? "border-slate-200/40 bg-gradient-to-r from-slate-50/50 via-transparent to-transparent"
          : "border-white/5 bg-gradient-to-r from-white/5 via-transparent to-transparent"
      )}>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              isLightMode
                ? "bg-slate-400/60 animate-pulse"
                : "bg-primary/40 animate-pulse"
            )} style={{ animationDelay: '0ms' }} />
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              isLightMode
                ? "bg-slate-400/40 animate-pulse"
                : "bg-primary/30 animate-pulse"
            )} style={{ animationDelay: '200ms' }} />
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              isLightMode
                ? "bg-slate-400/20 animate-pulse"
                : "bg-primary/20 animate-pulse"
            )} style={{ animationDelay: '400ms' }} />
          </div>
          <span className={cn(
            "text-[10px] md:text-xs font-medium tracking-wider uppercase",
            isLightMode
              ? "text-slate-600"
              : "text-muted-foreground"
          )}>
            {!isConnected ? "Get Started" : "Quick Start Guide"}
          </span>
        </div>
      </div>

      {/* Steps */}
      <div className="p-4 md:p-6 space-y-3 md:space-y-4">
        {steps.map((item, idx) => (
          <div
            key={idx}
            onClick={() => handleStepClick(item.step)}
            className={cn(
              "relative flex gap-3 md:gap-4 group",
              "transition-all duration-500 ease-out",
              "hover:translate-x-0.5",
              (isConnected && (item.step === "01" || item.step === "02")) && "cursor-pointer active:scale-95"
            )}
            style={{
              animation: `fadeInUp 0.6s ease-out ${idx * 0.1}s both`,
              animationFillMode: 'both'
            } as React.CSSProperties}
          >
            {/* Step number - subtle neomorphism */}
            <div className={cn(
              "flex-shrink-0 w-9 h-9 md:w-11 md:h-11 rounded-xl",
              "flex items-center justify-center",
              "font-mono text-xs md:text-sm font-semibold",
              // Neomorphism with subtle depth
              "bg-gradient-to-br",
              isLightMode
                ? "from-slate-100/80 to-slate-50/60 border border-slate-200/50 text-slate-700"
                : "from-background/90 to-background/70 border border-white/5 text-muted-foreground",
              // Multi-dimensional shadow
              "shadow-[inset_0_1px_2px_rgba(255,255,255,0.3),inset_0_-1px_1px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.1)]",
              "dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.05),inset_0_-1px_1px_rgba(0,0,0,0.3),0_2px_4px_rgba(0,0,0,0.3)]",
              // Hover lift
              "group-hover:shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),inset_0_-1px_1px_rgba(0,0,0,0.15),0_3px_6px_rgba(0,0,0,0.15)]",
              "dark:group-hover:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08),inset_0_-1px_1px_rgba(0,0,0,0.4),0_3px_6px_rgba(0,0,0,0.4)]",
              "group-hover:scale-105 transition-all duration-300"
            )}>
              {item.step}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 mb-1">
                <h3 className={cn(
                  "text-sm md:text-base font-semibold",
                  "text-foreground",
                  "group-hover:text-primary/90",
                  "transition-colors duration-300"
                )}>
                  {item.title}
                </h3>
                <span className="text-base md:text-lg opacity-50 group-hover:opacity-80 transition-opacity">
                  {item.icon}
                </span>
              </div>
              <p className={cn(
                "text-xs md:text-sm leading-relaxed",
                "text-muted-foreground",
                "opacity-75 group-hover:opacity-100",
                "transition-opacity duration-300"
              )}>
                {item.description}
              </p>
            </div>

            {/* Subtle connecting line */}
            {idx < steps.length - 1 && (
              <div className={cn(
                "absolute left-[22px] md:left-[26px] top-11 md:top-12 w-px h-3 md:h-4",
                isLightMode
                  ? "bg-gradient-to-b from-slate-300/40 to-transparent"
                  : "bg-gradient-to-b from-white/10 to-transparent"
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Subtle footer */}
      <div className={cn(
        "px-4 py-2.5 md:px-6 md:py-3 border-t",
        isLightMode
          ? "border-slate-200/40 bg-slate-50/30"
          : "border-white/5 bg-background/40"
      )}>
        <div className={cn(
          "flex items-center gap-2 text-[10px] md:text-xs font-medium",
          isLightMode
            ? "text-slate-500"
            : "text-muted-foreground"
        )}>
          <span className={cn(
            isLightMode ? "text-slate-600" : "text-primary/70"
          )}>→</span>
          <span className="opacity-70">
            {!isConnected ? "Connect wallet to begin" : "Ready to start earning → Scroll down to markets"}
          </span>
        </div>
      </div>
    </div>
  )
}






