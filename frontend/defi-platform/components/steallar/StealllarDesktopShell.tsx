"use client"

import { type ReactNode } from "react"
import { motion } from "framer-motion"
import { StealllarHeader } from "@/components/steallar/StealllarHeader"
import { DepositSlidePanel } from "@/components/steallar/DepositSlidePanel"
import { TxToast } from "@/components/steallar/TxToast"
import { StellarSheets } from "@/components/steallar/sheets/StellarSheets"
import { useMeldReconcileOnLoad } from "@/hooks/use-meld-reconcile-on-load"

// Catches Meld card funding that landed while the tab was closed.
function MeldReconcile() {
  useMeldReconcileOnLoad()
  return null
}

/**
 * Stellar desktop chrome: fixed header, vertical scroll body, floating deposit
 * panel + tx toast. Consumed by `/app/easy/layout.tsx` when the resolved
 * device is desktop/tablet. Auth is handled upstream in the shared easy
 * layout — this component assumes the user is already past the gate.
 */
export function StealllarDesktopShell({ children }: { children: ReactNode }) {
  // The sheets provider lives in `EasyLayoutShell`, above the desktop/mobile
  // split, so an open sheet survives the device correction after mount.
  return (
    <motion.div
      key="stellar-desktop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 z-10 flex flex-col bg-background"
    >
      <StealllarHeader />

      <div className="flex-1 overflow-y-auto pt-16">{children}</div>

      {/* Floating chrome */}
      <DepositSlidePanel />
      <StellarSheets />
      <TxToast />
      <MeldReconcile />
    </motion.div>
  )
}
