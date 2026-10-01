"use client"

import { motion } from "framer-motion"
import { CheckCircle2, Loader2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { SmartAccountStatus } from "@/hooks/use-smart-account-status"
import { usePrivy, useCreateWallet } from "@privy-io/react-auth"

const benefits = [
  {
    title: "Gasless borrows",
    description: "Peridot sponsors the transaction so you can borrow without holding the native gas token.",
  },
  {
    title: "Cross-chain orchestration",
    description: "Batch and automate actions across supported networks from a single consistent account.",
  },
  {
    title: "Safer permissions",
    description: "Session keys and granular permissions replace unlimited allowances on your EOA.",
  },
]

type SmartAccountUpgradeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: SmartAccountStatus
  onUpgrade: () => Promise<unknown>
  isUpgrading: boolean
  upgradeError: string | null
  upgradeStatus: string | null
  onDismissIntent: (reason: "manual" | "success") => void
}

export function SmartAccountUpgradeDialog({
  open,
  onOpenChange,
  status,
  onUpgrade,
  isUpgrading,
  upgradeError,
  upgradeStatus,
  onDismissIntent,
}: SmartAccountUpgradeDialogProps) {
  const { linkWallet } = usePrivy()
  const { createWallet } = useCreateWallet()
  const headline = status.isSmartAccount
    ? "Smart account active"
    : status.isLegacy
      ? "Unlock smart account benefits"
      : status.hasWallet
        ? "Preparing upgrade"
        : "Connect a wallet"

  const handleUpgrade = async () => {
    try {
      const result = await onUpgrade()
      if (result !== null && result !== undefined) {
        onDismissIntent("success")
        onOpenChange(false)
      }
    } catch (error) {
      console.error("Smart account upgrade failed", error)
    }
  }

  const handleNotNow = () => {
    onDismissIntent("manual")
    onOpenChange(false)
  }

  const handleOpenWalletManager = async () => {
    try {
      await linkWallet()
    } catch {}
  }

  const handleCreateEmbedded = async () => {
    try {
      try {
        await createWallet({})
      } catch (e: any) {
        const msg = (e?.message || '').toString().toLowerCase()
        if (msg.includes('already') || msg.includes('exist')) {
          await createWallet({ createAdditional: true as any })
        } else {
          throw e
        }
      }
    } catch {}
  }

  const helper = (() => {
    if (status.isSmartAccount) {
      return "You're already enjoying sponsored transactions and automation."
    }
    if (status.isLegacy) {
      return "Upgrade once to enable sponsored borrows and smoother cross-chain flows."
    }
    if (status.isLoading) {
      return "Checking your wallet capabilities…"
    }
    if (!status.hasWallet) {
      return "Connect your wallet to see upgrade options."
    }
    if (status.classification === "error") {
      return "We couldn't detect this wallet. Try again or switch networks."
    }
    return ""
  })()

  const badgeLabel = status.isSmartAccount
    ? "Smart account"
    : status.isLegacy
      ? "Legacy wallet"
      : status.isLoading
        ? "Detecting"
        : ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl overflow-hidden border border-emerald-500/30 bg-gradient-to-br from-emerald-900/90 via-emerald-800/80 to-cyan-900/80 p-0 text-emerald-50 backdrop-blur-xl">
        <div className="relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.25),_transparent_70%)]" aria-hidden />
          <div className="relative p-6 sm:p-8">
            <DialogHeader className="gap-2 text-left">
              <Badge
                variant="secondary"
                className={cn(
                  "w-fit bg-emerald-500/20 text-emerald-100 backdrop-blur",
                  status.isSmartAccount && "bg-emerald-400/30 text-emerald-50",
                  status.isLegacy && "bg-amber-400/20 text-amber-100"
                )}
              >
                {badgeLabel || "Smart account"}
              </Badge>
              <DialogTitle className="text-2xl font-semibold tracking-tight text-emerald-50">
                {headline}
              </DialogTitle>
              <DialogDescription className="text-sm text-emerald-100/80">
                {helper}
              </DialogDescription>
              {upgradeError && !status.isSmartAccount && (
                <p className="mt-2 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-100/90">
                  {upgradeError}
                </p>
              )}
            </DialogHeader>

            <motion.div
              className="mt-6 grid gap-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {benefits.map((benefit) => (
                <div
                  key={benefit.title}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/20 to-cyan-400/20">
                    <Sparkles className="h-5 w-5 text-emerald-200" />
                  </div>
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold text-emerald-50">{benefit.title}</p>
                    <p className="text-emerald-100/80">{benefit.description}</p>
                  </div>
                </div>
              ))}
            </motion.div>

            <div className="mt-6 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-emerald-100/80">
              <p className="font-semibold text-emerald-50">What happens next?</p>
              <ul className="space-y-1 text-emerald-100/70">
                <li>• You'll approve a one-time upgrade that deploys your Peridot smart account.</li>
                <li>• Future borrows can be sponsored by Peridot without extra clicks.</li>
                <li>• You can always switch back to a legacy flow by disconnecting this session.</li>
              </ul>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 bg-black/20 p-6 sm:flex-row">
          <Button
            variant="ghost"
            className="text-emerald-100 hover:bg-emerald-500/20"
            onClick={handleNotNow}
          >
            Not now
          </Button>
          {!status.isSmartAccount && status.hasWallet && (
            <Button
              variant="outline"
              className="border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/20"
              onClick={handleOpenWalletManager}
            >
              Open Wallet Manager
            </Button>
          )}
          {!status.isSmartAccount && status.hasWallet && (
            <Button
              variant="outline"
              className="border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/20"
              onClick={handleCreateEmbedded}
            >
              Create Embedded Wallet
            </Button>
          )}
          <Button
            className="bg-gradient-to-r from-emerald-400 to-cyan-400 text-emerald-950 shadow-[0_20px_40px_-20px_rgba(16,185,129,0.7)] hover:from-emerald-300 hover:to-cyan-300"
            onClick={handleUpgrade}
            disabled={status.isSmartAccount || status.isLoading || isUpgrading}
          >
            {status.isSmartAccount ? (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                You're upgraded
              </span>
            ) : (
              <span className="flex items-center gap-2">
                {isUpgrading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isUpgrading ? "Upgrading..." : "Begin upgrade"}
              </span>
            )}
          </Button>
        </DialogFooter>
        {(isUpgrading || upgradeStatus) && (
          <div className="border-t border-white/10 bg-black/30 px-6 py-4 text-xs text-emerald-100/70">
            {isUpgrading ? upgradeStatus || "Preparing upgrade…" : upgradeStatus}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default SmartAccountUpgradeDialog
