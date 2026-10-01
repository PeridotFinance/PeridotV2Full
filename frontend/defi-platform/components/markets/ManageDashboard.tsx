"use client"

import React, { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { Asset } from "@/types/markets"
import { Button } from "@/components/ui/button"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { useNetworkContext } from "@/context"
import AssetManageSheet from "@/components/markets/AssetManageSheet"
import { Dialog, DialogContent } from "@/components/ui/dialog"

type Props = {
  assets: Asset[]
  isOpen: boolean
  onClose: () => void
}

export const ManageDashboard: React.FC<Props> = ({ assets, isOpen, onClose }) => {
  const { resolvedTheme } = useTheme()
  const [focusAsset, setFocusAsset] = useState<Asset | null>(null)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="bg-transparent border-0 shadow-none p-0 w-[min(1100px,95vw)] left-[45%] top-[18%] translate-x-[-45%] translate-y-[-18%]">
        <motion.div
          initial={{ y: 40, x: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className={cn(
            "max-h-[80vh] overflow-visible rounded-3xl border",
            "backdrop-blur-2xl shadow-2xl",
            resolvedTheme === 'light' ? "bg-white/80 border-white/60" : "bg-white/10 border-white/10"
          )}
        >
          <div className="p-4 flex items-center justify-between">
            <div className="text-sm font-semibold">Manage Positions</div>
          </div>
          <div className="h-px w-full bg-white/10" />
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 overflow-auto" style={{ maxHeight: 'calc(80vh - 60px)' }}>
            {assets.map(a => (
              <motion.button
                key={a.id}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => setFocusAsset(a)}
                className={cn(
                  "text-left rounded-2xl border p-3",
                  resolvedTheme==='light' ? "bg-white/70 border-white/60" : "bg-white/10 border-white/10"
                )}
              >
                <div className="text-sm font-semibold">{a.name}</div>
                <div className="text-xs text-muted-foreground">{a.symbol}</div>
                <div className="mt-2 text-xs">Tap to Repay/Withdraw</div>
              </motion.button>
            ))}
          </div>
          <AnimatePresence>
            {focusAsset && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="absolute inset-0 flex items-center justify-center p-4"
              >
                <div className="w-full max-w-md">
                  <AssetManageSheet asset={focusAsset} isOpen={true} onClose={() => setFocusAsset(null)} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}

export default ManageDashboard


