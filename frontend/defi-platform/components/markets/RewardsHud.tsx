"use client"

import React, { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { usePeridotRewards } from "@/hooks/use-peridot-rewards"
import { Button } from "@/components/ui/button"
import { Gift, Loader2, Check } from "lucide-react"

export const RewardsHud: React.FC = () => {
  if (!FEATURE_FLAGS.REWARDS_HUD) return null
  const { theme } = useTheme()
  const { accruedRewards, isLoadingAccruedRewards, claimRewards, isClaiming, isClaimed } = usePeridotRewards()
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    if (isClaimed) {
      setShowSuccess(true)
      const t = setTimeout(() => setShowSuccess(false), 1500)
      return () => clearTimeout(t)
    }
  }, [isClaimed])

  const hasRewards = useMemo(() => {
    try { return accruedRewards ? Number(accruedRewards) > 0 : false } catch { return false }
  }, [accruedRewards])

  return (
    <div className={cn(
      "inline-flex items-center gap-2 rounded-2xl px-3 py-2 border backdrop-blur-xl",
      effectiveTheme === 'light' ? "bg-white/70 border-white/60" : "bg-white/10 border-white/10",
      hasRewards ? "ring-1 ring-yellow-400/30" : ""
    )}
      aria-live="polite"
    >
      <div className={cn(
        "relative inline-flex items-center justify-center w-6 h-6 rounded-full",
        hasRewards ? "bg-yellow-500/20" : "bg-white/10"
      )}>
        <Gift className={cn("w-3.5 h-3.5",
          hasRewards ? "text-yellow-400" : (effectiveTheme === 'light' ? "text-slate-700" : "text-white/80")
        )} />
        <AnimatePresence>{hasRewards && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute -inset-1 rounded-full pointer-events-none"
            style={{ boxShadow: "0 0 10px rgba(250, 204, 21, 0.5)" }}
          />
        )}</AnimatePresence>
      </div>
      <div className="text-xs">
        <div className="font-semibold">Rewards</div>
        <div className="text-muted-foreground">
          {isLoadingAccruedRewards ? 'Loading...' : hasRewards ? 'Claim available' : 'No rewards yet'}
        </div>
      </div>
      <div className="h-6 w-px bg-white/10 mx-1" />
      <Button
        size="sm"
        disabled={!hasRewards || isClaiming}
        onClick={() => claimRewards()}
        className="rounded-xl px-3 py-1 text-xs"
      >
        {isClaiming ? <span className="inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin"/>Claiming</span> : 'Claim All'}
      </Button>
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="text-[11px] inline-flex items-center gap-1 text-green-500"
          >
            <Check className="w-3.5 h-3.5"/> Claimed
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default RewardsHud


