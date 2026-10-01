"use client"

import { useState, useCallback } from "react"
import { motion } from "framer-motion"
import { usePrivy } from "@privy-io/react-auth"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import {
  FileText,
  LogOut,
  ChevronRight,
  Check,
  Shield,
  Bell,
  ExternalLink,
  Gift,
  Loader2,
  CreditCard,
  LogIn,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { openAddMoney } from "@/lib/onramp/add-money"
import Link from "next/link"
import { useDemoMode } from "@/context/demo-mode"
import { SecurityWallets } from "@/components/easy/SecurityWallets"

// ─── Row components ───────────────────────────────────────────────────────────

function SettingsRow({
  icon: Icon,
  label,
  sublabel,
  href,
  onClick,
  danger = false,
  delay = 0,
  expanded,
}: {
  icon: typeof ChevronRight
  label: string
  sublabel?: string
  href?: string
  onClick?: () => void
  danger?: boolean
  delay?: number
  expanded?: boolean
}) {
  const inner = (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay }}
      className={cn(
        "flex items-center gap-4 px-5 py-4 transition-colors",
        danger
          ? "hover:bg-red-500/5 active:bg-red-500/10 cursor-pointer"
          : "hover:bg-foreground/[0.03] active:bg-foreground/[0.05] cursor-pointer"
      )}
    >
      <div className={cn(
        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
        danger ? "bg-red-500/10" : "bg-foreground/[0.06]"
      )}>
        <Icon className={cn("w-4 h-4", danger ? "text-red-400" : "text-muted-foreground")} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-[14px] font-semibold", danger ? "text-red-400" : "text-foreground")}>
          {label}
        </p>
        {sublabel && (
          <p className="text-[12px] text-muted-foreground/60 mt-0.5 truncate">{sublabel}</p>
        )}
      </div>
      {!danger && (
        <ChevronRight
          className={cn(
            "w-4 h-4 text-muted-foreground/30 shrink-0 transition-transform duration-300",
            expanded && "rotate-90"
          )}
        />
      )}
    </motion.div>
  )

  if (href) return <Link href={href}>{inner}</Link>
  if (onClick) return <button type="button" onClick={onClick} className="w-full text-left">{inner}</button>
  return inner
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const { logout } = usePrivy()
  const { address } = useActiveWallet()
  const { isDemoMode, setDemoMode } = useDemoMode()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [referralCopied, setReferralCopied] = useState(false)
  const [isReferralLoading, setIsReferralLoading] = useState(false)
  const [securityOpen, setSecurityOpen] = useState(false)

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true)
      await logout()
    } catch {
      setIsLoggingOut(false)
    }
  }

  const handleShare = useCallback(async () => {
    if (!address) {
      toast.error("Connect your wallet first")
      return
    }
    setIsReferralLoading(true)
    try {
      // Fetch existing code or generate a new one
      const res = await fetch("/api/referral/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      })
      const data = await res.json()
      if (!res.ok || !data.referralCode) throw new Error("Failed to get referral code")

      const link = `${window.location.origin}/?ref=${data.referralCode}`
      await navigator.clipboard.writeText(link)
      setReferralCopied(true)
      toast.success("Referral link copied!")
      setTimeout(() => setReferralCopied(false), 2000)
    } catch {
      toast.error("Could not copy referral link")
    } finally {
      setIsReferralLoading(false)
    }
  }, [address])

  return (
    <div className="max-w-lg mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {/* ── Header ── */}
        <div className="px-5 pt-8 pb-2">
          <h1 className="text-[22px] font-black tracking-tight">Account</h1>
        </div>

        {/* ── Add cash card ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.07 }}
          className="mx-5 mt-4"
        >
          {isDemoMode ? (
            <div className="rounded-2xl bg-foreground/[0.03] border border-foreground/[0.08] p-5 flex items-center gap-4 opacity-50">
              <div className="w-10 h-10 rounded-xl bg-foreground/[0.06] flex items-center justify-center shrink-0">
                <CreditCard className="w-5 h-5 text-muted-foreground/40" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold leading-tight">Add cash</p>
                <p className="text-[12px] text-muted-foreground/50 mt-0.5">Sign in to add money</p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => openAddMoney()}
              className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] transition-all shadow-lg shadow-emerald-500/20 p-5 flex items-center gap-4 text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <CreditCard className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-white leading-tight">Add cash</p>
                <p className="text-[12px] text-white/60 mt-0.5">Card or bank transfer</p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/50 shrink-0" />
            </button>
          )}
        </motion.div>

        {/* ── Referral card ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
          className={cn(
            "mx-5 mt-4 rounded-2xl border p-5",
            isDemoMode
              ? "bg-foreground/[0.02] border-foreground/[0.07] opacity-50"
              : "bg-gradient-to-br from-emerald-500/10 to-primary/5 border-emerald-500/20"
          )}
        >
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              isDemoMode ? "bg-foreground/[0.06]" : "bg-emerald-500/15"
            )}>
              <Gift className={cn("w-5 h-5", isDemoMode ? "text-muted-foreground/40" : "text-emerald-400")} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold">Invite friends</p>
              <p className="text-[12px] text-muted-foreground/70 mt-0.5">
                {isDemoMode ? "Sign in to share your referral link" : "Earn a bonus"}
              </p>
            </div>
            {!isDemoMode && (
              <button
                type="button"
                onClick={handleShare}
                disabled={isReferralLoading || !address}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[12px] font-bold transition-colors"
              >
                {isReferralLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : referralCopied ? (
                  <><Check className="w-3 h-3" /> Copied!</>
                ) : (
                  "Share"
                )}
              </button>
            )}
          </div>
        </motion.div>

        {/* ── Settings rows ── */}
        <div className="mx-5 mt-3 rounded-2xl bg-foreground/[0.03] border border-foreground/[0.07] overflow-hidden divide-y divide-foreground/[0.05]">
          <SettingsRow
            icon={FileText}
            label="Tax documents"
            sublabel="Download annual summaries & CSV"
            href="/app/easy/account/tax"
            delay={0.1}
          />
          <SettingsRow
            icon={Bell}
            label="Notifications"
            sublabel="Coming soon"
            delay={0.13}
          />
          <div>
            <SettingsRow
              icon={Shield}
              label="Security"
              sublabel={isDemoMode ? "Connect wallet to manage" : "Linked wallets"}
              onClick={isDemoMode ? undefined : () => setSecurityOpen(v => !v)}
              expanded={securityOpen}
              delay={0.16}
            />
            {/* Inline accordion — pure CSS grid transition */}
            <div
              className="grid transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
              style={{ gridTemplateRows: securityOpen ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <div className="px-5 pb-4 pt-1 border-t border-foreground/[0.05]">
                  <SecurityWallets />
                </div>
              </div>
            </div>
          </div>
          <SettingsRow
            icon={Sparkles}
            label="Display"
            sublabel={isDemoMode ? "Sign in to customise" : "Badge, border, name emoji"}
            href={isDemoMode ? undefined : "/app/easy/account/display"}
            delay={0.18}
          />
          <SettingsRow
            icon={ExternalLink}
            label="Full app"
            sublabel="Advanced DeFi features"
            href="/app"
            delay={0.19}
          />
        </div>

        {/* ── Sign out / Exit demo ── */}
        <div className="mx-5 mt-3 rounded-2xl bg-foreground/[0.03] border border-foreground/[0.07] overflow-hidden">
          {isDemoMode ? (
            <SettingsRow
              icon={LogIn}
              label="Sign in to get started"
              onClick={() => setDemoMode(false)}
              danger={false}
              delay={0.2}
            />
          ) : (
            <SettingsRow
              icon={LogOut}
              label={isLoggingOut ? "Signing out…" : "Sign out"}
              onClick={handleLogout}
              danger
              delay={0.2}
            />
          )}
        </div>

        {/* ── Version ── */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center text-[10px] text-muted-foreground/25 mt-6 pb-2"
        >
          Peridot Finance · Easy Mode
        </motion.p>

        <div className="h-6" />
      </motion.div>
    </div>
  )
}
