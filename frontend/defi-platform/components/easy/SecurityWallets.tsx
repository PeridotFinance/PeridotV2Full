"use client"

import { useState } from "react"
import { useLinkAccount } from "@privy-io/react-auth"
import { Check, Copy, Loader2, Plus, Unlink, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useLinkedWallets, type LinkedWallet } from "@/hooks/use-linked-wallets"
import { useStellarWallet, type StellarWalletSource } from "@/hooks/use-stellar-wallet"

// ─── Shared ───────────────────────────────────────────────────────────────────

function truncateAddr(addr: string, namespace: "evm" | "stellar") {
  return namespace === "evm"
    ? `${addr.slice(0, 8)}···${addr.slice(-6)}`
    : `${addr.slice(0, 6)}···${addr.slice(-4)}`
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          toast.error("Could not copy")
        }
      }}
      aria-label="Copy address"
      className="shrink-0 p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.06] transition-colors"
    >
      {copied
        ? <Check className="w-3.5 h-3.5 text-emerald-500" />
        : <Copy className="w-3.5 h-3.5" />
      }
    </button>
  )
}

/**
 * The user's own Privy-managed embedded Stellar wallet — it *is* their account,
 * so it needs no link/verify (those prove ownership of an external wallet) and
 * can't be unlinked. Full address is copyable.
 */
function OwnedStellarRow({ address }: { address: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-emerald-500/[0.05] border border-emerald-500/[0.12]">
      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
        <Wallet className="w-3.5 h-3.5 text-emerald-500/80" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold font-mono text-foreground/80">
          {truncateAddr(address, "stellar")}
        </p>
        <p className="text-[10px] text-emerald-500/70 mt-0.5">Your Stellar wallet</p>
      </div>
      <CopyButton value={address} />
    </div>
  )
}

function StatusDot({ status }: { status: LinkedWallet["verificationStatus"] }) {
  return (
    <span className={cn(
      "text-[10px] mt-0.5",
      status === "verified" ? "text-emerald-500/70" : "text-muted-foreground/40"
    )}>
      {status === "verified" ? "● Verified" : "○ Pending"}
    </span>
  )
}

function WalletRow({ wallet, onUnlink, unlinking }: {
  wallet: LinkedWallet
  onUnlink: (id: number) => void
  unlinking: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-foreground/[0.04] border border-foreground/[0.06]">
      <div className="w-7 h-7 rounded-lg bg-foreground/[0.06] flex items-center justify-center shrink-0">
        <Wallet className="w-3.5 h-3.5 text-muted-foreground/50" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold font-mono text-foreground/80">
          {truncateAddr(wallet.address, wallet.chainNamespace)}
        </p>
        <StatusDot status={wallet.verificationStatus} />
      </div>
      <CopyButton value={wallet.address} />
      <button
        type="button"
        onClick={() => onUnlink(wallet.id)}
        disabled={unlinking}
        aria-label="Unlink wallet"
        className="shrink-0 p-1.5 rounded-lg text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
      >
        {unlinking
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Unlink className="w-3.5 h-3.5" />
        }
      </button>
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/30 mb-2">
      {label}
    </p>
  )
}

function LinkButton({ onClick, disabled, loading, label }: {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-foreground/[0.12] text-[12px] font-semibold text-muted-foreground/50 hover:border-foreground/25 hover:text-foreground/60 hover:bg-foreground/[0.03] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {loading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <Plus className="w-3.5 h-3.5" />
      }
      {label}
    </button>
  )
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function EvmSection({ wallets, onUnlink, unlinkingId, onLink, isLinking }: {
  wallets: LinkedWallet[]
  onUnlink: (id: number) => void
  unlinkingId: number | null
  onLink: () => void
  isLinking: boolean
}) {
  return (
    <div>
      <SectionLabel label="EVM" />
      {wallets.length > 0 && (
        <div className="space-y-2 mb-2">
          {wallets.map(w => (
            <WalletRow key={w.id} wallet={w} onUnlink={onUnlink} unlinking={unlinkingId === w.id} />
          ))}
        </div>
      )}
      <LinkButton onClick={onLink} disabled={isLinking} loading={isLinking} label="Link EVM wallet" />
    </div>
  )
}

function StellarSection({ wallets, onUnlink, unlinkingId, onLinkVerify, isLinking, freighter }: {
  wallets: LinkedWallet[]
  onUnlink: (id: number) => void
  unlinkingId: number | null
  onLinkVerify: () => void
  isLinking: boolean
  freighter: { isConnected: boolean; address?: string; isLoading: boolean; source?: StellarWalletSource }
}) {
  const freighterAddr = freighter.address?.toUpperCase()

  // Embedded Privy wallet = the user's own account. Show it as owned (copyable,
  // no verify/unlink) and skip the external-wallet link flow entirely — that
  // flow signs via the Wallets Kit, which an embedded wallet doesn't have.
  if (freighter.source === "privy" && freighter.address) {
    return (
      <div>
        <SectionLabel label="Stellar" />
        <div className="space-y-2">
          <OwnedStellarRow address={freighter.address} />
          {wallets.map(w => (
            <WalletRow key={w.id} wallet={w} onUnlink={onUnlink} unlinking={unlinkingId === w.id} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <SectionLabel label="Stellar" />
      {wallets.length > 0 ? (
        <div className="space-y-2">
          {wallets.map(w => (
            <WalletRow key={w.id} wallet={w} onUnlink={onUnlink} unlinking={unlinkingId === w.id} />
          ))}
        </div>
      ) : (
        <>
          {freighter.isConnected && freighterAddr && (
            <div className="flex items-center gap-3 px-3 py-2.5 mb-2 rounded-xl bg-foreground/[0.04] border border-foreground/[0.06]">
              <div className="w-7 h-7 rounded-lg bg-foreground/[0.06] flex items-center justify-center shrink-0">
                <Wallet className="w-3.5 h-3.5 text-muted-foreground/50" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold font-mono text-foreground/80">
                  {truncateAddr(freighterAddr, "stellar")}
                </p>
                <p className="text-[10px] text-muted-foreground/40 mt-0.5">Stellar wallet · not linked</p>
              </div>
            </div>
          )}
          <LinkButton
            onClick={onLinkVerify}
            disabled={isLinking || freighter.isLoading}
            loading={isLinking}
            label={freighter.isConnected ? "Link & Verify Stellar wallet" : "Connect & Link Stellar wallet"}
          />
        </>
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function SecurityWallets() {
  const { groupedLinks, deleteLink, createLink, createChallenge, verifyLink, isLoading } = useLinkedWallets()
  const stellarWallet = useStellarWallet()
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null)
  const [stellarLinking, setStellarLinking] = useState(false)
  const [evmLinking, setEvmLinking] = useState(false)

  const { linkWallet } = useLinkAccount({
    onSuccess: async ({ linkedAccount }) => {
      // Privy linked the wallet in its own system; mirror it into our DB so
      // the linked-wallets list (GET /api/account/wallet-links) reflects it.
      if (linkedAccount.type !== "wallet" || linkedAccount.chainType !== "ethereum") {
        setEvmLinking(false)
        return
      }
      try {
        await createLink({ chainNamespace: "evm", address: linkedAccount.address })
        toast.success("EVM wallet linked")
      } catch {
        toast.error("Linked in Privy, but Peridot record failed — try again")
      } finally {
        setEvmLinking(false)
      }
    },
    onError: () => {
      setEvmLinking(false)
    },
  })

  const handleEvmLink = () => {
    setEvmLinking(true)
    linkWallet()
  }

  const handleUnlink = async (id: number) => {
    setUnlinkingId(id)
    try {
      await deleteLink(id)
      toast.success("Wallet unlinked")
    } catch {
      toast.error("Failed to unlink wallet")
    } finally {
      setUnlinkingId(null)
    }
  }

  const handleStellarLink = async () => {
    setStellarLinking(true)
    try {
      if (!stellarWallet.isConnected) {
        const ok = await stellarWallet.connect()
        if (!ok) throw new Error("Stellar wallet not available")
      }
      const challenge = await createChallenge({
        chainNamespace: "stellar",
        address: stellarWallet.address!,
        chainReference: "stellar-soroban-mainnet",
      })
      const signed = await stellarWallet.sign(challenge!.message)
      if (!signed) throw new Error("Signing cancelled")
      await verifyLink({
        chainNamespace: "stellar",
        address: stellarWallet.address!,
        signature: signed.signedMessage,
        nonce: challenge!.nonce,
      })
      toast.success("Stellar wallet verified")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed")
    } finally {
      setStellarLinking(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-3">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/30" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <EvmSection
        wallets={groupedLinks.evm}
        onUnlink={handleUnlink}
        unlinkingId={unlinkingId}
        onLink={handleEvmLink}
        isLinking={evmLinking}
      />
      <div className="h-px bg-foreground/[0.05]" />
      <StellarSection
        wallets={groupedLinks.stellar}
        onUnlink={handleUnlink}
        unlinkingId={unlinkingId}
        onLinkVerify={handleStellarLink}
        isLinking={stellarLinking}
        freighter={stellarWallet}
      />
    </div>
  )
}
