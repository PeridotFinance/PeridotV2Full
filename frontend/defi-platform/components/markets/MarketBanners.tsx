"use client"

import React from "react"
import { motion } from "framer-motion"
import { Zap } from "lucide-react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { CHAIN_IDS } from "@/config/contracts"

interface MarketBannersProps {
  currentChainId: number | null
  theme: string | undefined
  isMounted: boolean
  monadMessage: string
}

export default function MarketBanners({
  currentChainId,
  theme,
  isMounted,
  monadMessage
}: MarketBannersProps) {
  const { resolvedTheme } = useTheme()
  const effectiveTheme = resolvedTheme || theme || "dark"

  // Only show the Monad banner with random messages, remove the 10x points / POW banner
  return (
    <div className="inline-flex items-center gap-2">
      {currentChainId === CHAIN_IDS.MONAD_MAINNET && (
        <motion.span
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.1, ease: "easeOut" }}
          className={cn(
            "hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full select-none",
            "text-[10px] sm:text-xs font-semibold tracking-wide whitespace-nowrap",
            "backdrop-blur-sm shadow-md",
            isMounted && effectiveTheme === "light"
              ? "bg-gradient-to-r from-[#20F6B5]/20 via-[#836EF9]/20 to-[#A0055D]/10 text-slate-800/90 ring-purple-500/30"
              : "bg-gradient-to-r from-[#20F6B5]/20 via-[#836EF9]/20 to-[#A0055D]/10 text-white/90 ring-purple-400/30"
          )}
        >
          <div className="h-3.5 w-3.5 flex items-center justify-center bg-purple-500/20 rounded-full">
            <Zap className="h-2.5 w-2.5 text-[#836EF9]" />
          </div>
          <span className="hidden sm:inline font-medium">{monadMessage}</span>
        </motion.span>
      )}
    </div>
  )
}
