'use client'

import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Copy, Check, Wallet, Smartphone, ExternalLink, Loader2, Coins, Settings, Plus, ChevronRight, ChevronLeft, QrCode, Trash2, Shield, Sparkles, RefreshCw, Send, LogOut, Mail, Banknote } from 'lucide-react'
import { useWalletInfo, formatWalletAddress, getWalletDisplayName, type WalletInfo } from '@/lib/walletUtils'
import { getNativeTokenSymbol } from '@/lib/multiChainBalanceUtils'
import { useAccount, useSwitchAccount, useDisconnect, useChainId, useSignMessage } from 'wagmi'

import { useNetworkContext } from '@/context'
import { useRouter } from 'next/navigation'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useExportWallet as useExportStellarWallet } from '@privy-io/react-auth/extended-chains'
import { type Address } from 'viem'

import { toast } from 'sonner'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { BridgeFundingStatus } from '@/components/onramp/BridgeFundingStatus'
import { BankAccountSummary } from '@/components/onramp/BankAccountSummary'
import { AddMoneyBody } from '@/components/onramp/AddMoneySheet'
import { openAddMoney } from '@/lib/onramp/add-money'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { useLinkedWallets } from '@/hooks/use-linked-wallets'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { WalletAssetsSection } from '@/components/wallet/WalletAssetsSection'
import { SendTokenSheet } from '@/components/wallet/SendTokenSheet'
import { ReceiveSheet } from '@/components/wallet/ReceiveSheet'
import type { PreselectedSendToken } from '@/hooks/use-multi-chain-token-balances'

interface WalletManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Types for extensible feature system
interface WalletFeature {
  id: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  action: () => void
  disabled?: boolean
  comingSoon?: boolean
}

// Compact, equal-standing identity row for the Overview — address + copy, plus
// an optional disconnect. EVM and Stellar render the same shape; neither leads.
function WalletIdentityRow({
  label,
  address,
  copied,
  onCopy,
  onDisconnect,
  disconnectTitle,
}: {
  label: string
  address: string
  copied: boolean
  onCopy: () => void
  onDisconnect?: () => void
  disconnectTitle?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-background/40 border border-border/30">
      <div className="relative h-9 w-9 shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-primary/30 to-primary/5 ring-1 ring-primary/30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,theme(colors.primary/0.5),transparent_65%)]" />
        <Wallet className="absolute inset-0 m-auto h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/60">
          {label}
        </div>
        <div className="font-mono text-sm font-medium text-foreground tabular-nums truncate">
          {formatWalletAddress(address)}
        </div>
      </div>
      <button
        onClick={onCopy}
        title="Copy address"
        aria-label={`Copy ${label} address`}
        className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted/60 transition-colors"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {onDisconnect && (
        <button
          onClick={onDisconnect}
          title={disconnectTitle}
          aria-label={disconnectTitle}
          className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

export function WalletManagementDialog({ open, onOpenChange }: WalletManagementDialogProps) {
  const { walletInfos, ready } = useWalletInfo()
  const { address: activeAddress } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { switchAccount } = useSwitchAccount()
  const { disconnect } = useDisconnect()
  const { exportWallet, logout, user, unlinkWallet } = usePrivy()
  // Privy owns the wallet connection — `useWallets()` is the source of truth for
  // what's connected (it feeds `walletInfos`). Disconnecting has to go through
  // Privy's own wallet handle; a bare wagmi disconnect gets re-synced right back.
  const { wallets: privyWallets } = useWallets()
  // Stellar (extended-chains) lives behind a separate export entrypoint — the
  // root `exportWallet` only handles EVM. Each key export is address-scoped.
  const { exportWallet: exportStellarWallet } = useExportStellarWallet()
  useNetworkContext()
  const router = useRouter()
  const currentChainId = useChainId()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  // Single source of truth for the primary wallet address — matches the header.
  // `useActiveWallet` resolves Privy's embedded EOA from `user.linkedAccounts`
  // and bypasses Wagmi's account (which can surface the Smart Account address).
  const { address: activeWalletAddress } = useActiveWallet()
  const primaryAddress =
    (typeof activeWalletAddress === 'string' && /^0x[a-fA-F0-9]{40}$/.test(activeWalletAddress))
      ? (activeWalletAddress as Address)
      : undefined

  // How the user signed in — shown under Accounts so they know which email /
  // social / login method is tied to this Peridot account. When they joined via
  // a wallet only (no email, no social) there's nothing to show, and that's
  // fine: `null` → render the "connected via wallet" fallback.
  const signInIdentity = useMemo<{ value: string; method: string } | null>(() => {
    if (!user) return null
    const u = user as any
    if (u.email?.address) return { value: u.email.address, method: "Email" }
    if (u.google?.email) return { value: u.google.email, method: "Google" }
    if (u.apple?.email) return { value: u.apple.email, method: "Apple" }
    if (u.twitter?.username) return { value: `@${u.twitter.username}`, method: "X" }
    if (u.discord?.username) return { value: u.discord.username, method: "Discord" }
    if (u.github?.username) return { value: u.github.username, method: "GitHub" }
    if (u.farcaster?.username) return { value: `@${u.farcaster.username}`, method: "Farcaster" }
    if (u.phone?.number) return { value: u.phone.number, method: "Phone" }
    return null
  }, [user])

  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const [isLinkingEvm, setIsLinkingEvm] = useState(false)
  const [isLinkingStellar, setIsLinkingStellar] = useState(false)
  const [retryingLinkId, setRetryingLinkId] = useState<number | null>(null)
  const [activeSection, setActiveSection] = useState<'overview' | 'wallets' | 'cashout' | 'advanced'>('overview')
  // Within the Wallets tab: "assets" (holdings across chains) vs "accounts"
  // (addresses, cross-chain links, connected EOAs). The Overview's assets link
  // deep-links into "assets".
  const [walletsSubtab, setWalletsSubtab] = useState<'assets' | 'accounts'>('assets')
  const [sendSheetOpen, setSendSheetOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [sendPreselect, setSendPreselect] = useState<PreselectedSendToken | null>(null)

  // Open the send sheet — optionally pre-selecting an asset tapped in the list.
  const openSendSheet = (preselect: PreselectedSendToken | null = null) => {
    setSendPreselect(preselect)
    setSendSheetOpen(true)
  }
  const [autoReconnectEnabled, setAutoReconnectEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('wallet-auto-reconnect') !== 'false'
    }
    return true
  })
  const [loadError, setLoadError] = useState(false)
  const stellarWallet = useStellarWallet()
  const {
    groupedLinks,
    links,
    isLoading: isLinkedWalletsLoading,
    isMutating: isLinkedWalletsMutating,
    createChallenge,
    verifyLink,
    deleteLink,
  } = useLinkedWallets()

  const linkedEvmForActive = useMemo(() => {
    if (!activeAddress) return null
    return groupedLinks.evm.find((link) => link.normalizedAddress === activeAddress.toLowerCase()) || null
  }, [activeAddress, groupedLinks.evm])

  const linkedStellarForActive = useMemo(() => {
    if (!stellarWallet.address) return null
    return groupedLinks.stellar.find((link) => link.normalizedAddress === stellarWallet.address.toUpperCase()) || null
  }, [stellarWallet.address, groupedLinks.stellar])

  const handleLinkActiveEvmWallet = async () => {
    if (!activeAddress) {
      toast.error("Connect an EVM wallet first")
      return
    }
    try {
      setIsLinkingEvm(true)
      const challenge = await createChallenge({
        chainNamespace: "evm",
        address: activeAddress,
        chainReference: String(currentChainId),
      })

      const signature = await signMessageAsync({
        account: activeAddress as `0x${string}`,
        message: challenge.message,
      })

      await verifyLink({
        chainNamespace: "evm",
        address: activeAddress,
        signature,
        nonce: challenge.nonce,
      })
      toast.success("EVM wallet linked successfully")
    } catch (error) {
      console.error("Failed to link EVM wallet:", error)
      toast.error(error instanceof Error ? error.message : "Failed to link EVM wallet")
    } finally {
      setIsLinkingEvm(false)
    }
  }

  const handleLinkStellarWallet = async () => {
    try {
      if (!stellarWallet.isConnected) {
        const connected = await stellarWallet.connect()
        if (!connected) {
          toast.error(stellarWallet.error || "Unable to connect Stellar wallet")
          return
        }
      }

      if (!stellarWallet.address) {
        toast.error("Stellar wallet address unavailable")
        return
      }

      setIsLinkingStellar(true)
      const challenge = await createChallenge({
        chainNamespace: "stellar",
        address: stellarWallet.address,
        chainReference: "stellar-soroban-mainnet",
      })

      const signed = await stellarWallet.sign(challenge.message)
      if (!signed?.signedMessage) {
        throw new Error(stellarWallet.error || "Failed to sign challenge with Stellar wallet")
      }

      await verifyLink({
        chainNamespace: "stellar",
        address: stellarWallet.address,
        signature: signed.signedMessage,
        nonce: challenge.nonce,
      })
      toast.success("Soroban wallet linked successfully")
    } catch (error) {
      console.error("Failed to link Soroban wallet:", error)
      toast.error(error instanceof Error ? error.message : "Failed to link Soroban wallet")
    } finally {
      setIsLinkingStellar(false)
    }
  }

  const handleUnlinkWallet = async (linkId: number) => {
    try {
      await deleteLink(linkId)
      toast.success("Wallet unlinked")
    } catch (error) {
      console.error("Failed to unlink wallet:", error)
      toast.error(error instanceof Error ? error.message : "Failed to unlink wallet")
    }
  }

  const handleRetryLinkedWalletVerification = async (link: (typeof links)[number]) => {
    if (link.verificationStatus === "verified") return

    try {
      setRetryingLinkId(link.id)
      const challenge = await createChallenge({
        chainNamespace: link.chainNamespace,
        address: link.address,
        chainReference: link.chainReference || undefined,
        label: link.label || undefined,
        metadata: link.metadata,
      })

      if (link.chainNamespace === "evm") {
        if (!activeAddress || activeAddress.toLowerCase() !== link.normalizedAddress.toLowerCase()) {
          throw new Error("Switch to the linked EVM wallet before retrying verification")
        }

        const signature = await signMessageAsync({
          account: activeAddress as `0x${string}`,
          message: challenge.message,
        })

        await verifyLink({
          chainNamespace: "evm",
          address: link.address,
          signature,
          nonce: challenge.nonce,
        })
      } else {
        if (!stellarWallet.isConnected) {
          const connected = await stellarWallet.connect()
          if (!connected) {
            throw new Error(stellarWallet.error || "Unable to connect Stellar wallet")
          }
        }

        if (!stellarWallet.address || stellarWallet.address.toUpperCase() !== link.normalizedAddress.toUpperCase()) {
          throw new Error("Connect the linked Stellar wallet before retrying verification")
        }

        const signed = await stellarWallet.sign(challenge.message)
        if (!signed?.signedMessage) {
          throw new Error(stellarWallet.error || "Failed to sign challenge with Stellar wallet")
        }

        await verifyLink({
          chainNamespace: "stellar",
          address: link.address,
          signature: signed.signedMessage,
          nonce: challenge.nonce,
        })
      }

      toast.success("Wallet verification completed")
    } catch (error) {
      console.error("Failed to retry wallet verification:", error)
      toast.error(error instanceof Error ? error.message : "Failed to retry verification")
    } finally {
      setRetryingLinkId(null)
    }
  }

  // If Privy never becomes ready, avoid an infinite loading state by surfacing a clear error
  React.useEffect(() => {
    // Reset error whenever dialog closes or Privy finally becomes ready
    if (!open || ready) {
      setLoadError(false)
      return
    }

    const timeout = setTimeout(() => {
      if (!ready) {
        setLoadError(true)
      }
    }, 8000)

    return () => clearTimeout(timeout)
  }, [open, ready])

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
      setCopiedAddress(address)
      toast.success('Address copied to clipboard')
      setTimeout(() => setCopiedAddress(null), 2000)
    } catch (error) {
      toast.error('Failed to copy address')
    }
  }

  const handleSetActiveWallet = async (walletAddress: string) => {
    try {
      console.log('Setting active wallet', walletAddress)
      // For now, just show a message since wallet switching is complex
      // The user would need to disconnect and reconnect with the desired wallet
      toast.info('Please disconnect and reconnect with the desired wallet')
    } catch (error) {
      console.error(error)
      toast.error('Failed to switch wallet')
    }
  }

  // Key export only works for Privy-managed embedded wallets — external wallets
  // (e.g. Freighter) hold their own keys, so we never offer it for them. The EVM
  // and Stellar keys live on separate Privy entrypoints and must be exported by
  // address, so each gets its own action when that embedded wallet exists.
  const embeddedEvmAddress = walletInfos.find(w => w.type === 'embedded')?.address as Address | undefined
  const exportableStellarAddress = stellarWallet.source === 'privy' ? stellarWallet.address : undefined

  // Future extensibility: feature system
  const walletFeatures: WalletFeature[] = [
    {
      id: 'add-money',
      title: 'Add money',
      description: 'By card or bank transfer',
      icon: Coins,
      action: () => handleFundWallet(),
    },
    ...(embeddedEvmAddress ? [{
      id: 'export-key-evm',
      title: 'Export wallet key',
      description: 'Back up your wallet or move it to another app',
      icon: ExternalLink,
      action: () => handleExportPrivateKey(),
    } satisfies WalletFeature] : []),
    ...(exportableStellarAddress ? [{
      id: 'export-key-stellar',
      title: 'Export Stellar key',
      description: 'Back up your Stellar wallet or move it to another app',
      icon: ExternalLink,
      action: () => handleExportStellarKey(),
    } satisfies WalletFeature] : []),
    {
      id: 'qr-receive',
      title: 'Show QR Code',
      description: 'Display QR code for easy receiving',
      icon: QrCode,
      action: () => handleShowQRCode()
    }
  ]

  const handleExportPrivateKey = async () => {
    if (!embeddedEvmAddress) {
      toast.error('No wallet available to export')
      return
    }
    try {
      // Privy opens its secure export modal (key is assembled in a cross-origin
      // iframe — we never see it). Address-scoped so the right wallet is exported.
      await exportWallet({ address: embeddedEvmAddress })
    } catch (error) {
      console.error(error)
      toast.error('Failed to export wallet key')
    }
  }

  const handleExportStellarKey = async () => {
    if (!exportableStellarAddress) {
      toast.error('No Stellar wallet available to export')
      return
    }
    try {
      await exportStellarWallet({ address: exportableStellarAddress })
    } catch (error) {
      console.error(error)
      toast.error('Failed to export Stellar key')
    }
  }

  const handleShowQRCode = () => {
    setReceiveOpen(true)
  }

  // Money in has one home: the "Add money" sheet, shared with the Easy card
  // and the deposit sheet. This dialog steps aside for it, since a modal
  // dialog would keep the sheet underneath it from taking focus or clicks.
  const handleFundWallet = (view?: 'bank') => {
    onOpenChange(false)
    openAddMoney(view ? { view } : {})
  }

  // Cash out, the reverse rail, stays in this dialog.
  const handleCashOut = () => {
    setActiveSection('cashout')
  }

  const handleStellarDisconnect = async () => {
    try {
      if (stellarWallet.source === 'privy') {
        // Embedded Stellar wallet is part of the user's Privy account — it can't
        // be disconnected on its own; the honest action is a full logout.
        const confirmed = confirm(
          'Your Stellar wallet is part of your Peridot account. Disconnecting logs you out completely. Continue?'
        )
        if (!confirmed) return
        await handleLogoutAll('Logged out')
      } else {
        await stellarWallet.disconnect()
        clearConnectionHints()
        toast.success('Stellar wallet disconnected')
        try { router.refresh() } catch { if (typeof window !== 'undefined') window.location.reload() }
      }
    } catch (error) {
      console.error('Failed to disconnect Stellar wallet:', error)
      toast.error('Failed to disconnect Stellar wallet')
    }
  }

  const handleIndividualWalletDisconnect = async (wallet: WalletInfo) => {
    try {
      if (wallet.type === 'external') {
        // The wallet is a Privy-managed connection: it lives in `useWallets()`
        // (which builds `walletInfos`) and Privy keeps the wagmi account in sync.
        // A bare wagmi `disconnect()` therefore never sticks — Privy reconnects
        // it on the next tick and the row never disappears. Disconnect through
        // Privy: drop the live connection, then unlink it from the account so it
        // doesn't re-sync. If it's the account's only login, unlink is refused —
        // fall back to a full logout, which is the honest "disconnect" there.
        const target = wallet.address.toLowerCase()
        const connected = privyWallets.find(
          (w) => (w.address || '').toLowerCase() === target
        )
        try { connected?.disconnect() } catch (err) { console.warn('Privy wallet disconnect failed:', err) }
        try { disconnect() } catch (err) { console.warn('wagmi disconnect failed:', err) }
        // If the wallet is also a *linked login* on the account, drop it from the
        // account too so Privy doesn't re-sync it. If it's the account's only
        // login, unlink is refused — a full logout is the honest disconnect there.
        // A bare connection that was never linked needs neither: `disconnect()`
        // above already removed it from `useWallets()`.
        const isLinkedLogin = (user?.linkedAccounts || []).some(
          (a: any) => a?.type === 'wallet' && (a?.address || '').toLowerCase() === target
        )
        if (isLinkedLogin) {
          try {
            await unlinkWallet(wallet.address)
            toast.success(`Disconnected ${getWalletDisplayName(wallet)}`)
          } catch (err) {
            // Only login on the account → unlink refused. Full sign-out is the
            // honest disconnect (it navigates away, so nothing runs after).
            console.warn('unlinkWallet failed (likely the only login) — signing out:', err)
            await handleLogoutAll(`Disconnected ${getWalletDisplayName(wallet)}`)
          }
        } else {
          toast.success(`Disconnected ${getWalletDisplayName(wallet)}`)
        }
      } else if (wallet.type === 'embedded' || wallet.type === 'smart_wallet') {
        // Embedded/smart wallets ARE the Privy account — there's no per-wallet
        // disconnect, so this is a full sign-out. Confirm, then tear down.
        const confirmed = confirm(
          `Disconnecting ${getWalletDisplayName(wallet)} requires logging out of all Privy wallets and re-authentication. Continue?`
        )
        if (confirmed) {
          await handleLogoutAll('Disconnected')
        }
      }
    } catch (error) {
      console.error('Failed to disconnect wallet:', error)
      toast.error(`Failed to disconnect ${getWalletDisplayName(wallet)}`)
    }
  }

  // Wipe the localStorage hints that wagmi / Privy / the Stellar kit use to
  // silently reconnect on the next load. Without this, disconnecting an
  // *unlocked* MetaMask or Freighter is pointless: wagmi's `recentConnectorId`
  // and Privy's `active-wallet-connection` re-establish the session a tick
  // later, so the user still shows as connected. logout() clears the Privy
  // session cookie server-side; this clears the client-side reconnect state.
  const clearConnectionHints = () => {
    if (typeof window === 'undefined') return
    try {
      for (const k of Object.keys(localStorage)) {
        if (
          /^wagmi/i.test(k) ||
          /^privy:connections$/i.test(k) ||
          /^privy:.*(active-wallet-connection|recent-login)/i.test(k) ||
          /^@StellarWalletsKit\/(activeAddress|selectedModuleId|usedWalletsIds)/i.test(k)
        ) {
          localStorage.removeItem(k)
        }
      }
    } catch (err) {
      console.warn('Failed to clear connection hints:', err)
    }
  }

  // Single, honest "sign out" — the one true disconnect. Tears down every
  // connection path (live wallet handles, wagmi, Stellar, the Privy session),
  // clears reconnect hints, then does a FULL navigation rather than a soft
  // router.refresh(): a refresh keeps the in-memory Wagmi/Privy providers alive,
  // which immediately reconnect an unlocked wallet and leave the user "connected"
  // after a disconnect. A hard load guarantees the logged-out state renders.
  const handleLogoutAll = async (message = 'Signed out') => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    toast.loading('Signing out…', { id: 'signout' })
    try {
      // Best-effort live disconnects first. Embedded wallets no-op here; external
      // ones (MetaMask, etc.) drop their provider connection.
      try {
        privyWallets.forEach((w) => { try { (w as any)?.disconnect?.() } catch {} })
      } catch (err) { console.warn('Privy wallet disconnect failed:', err) }
      try { disconnect() } catch (err) { console.warn('wagmi disconnect failed:', err) }
      try {
        if (stellarWallet.isConnected) await stellarWallet.disconnect()
      } catch (err) { console.warn('stellar disconnect failed:', err) }
      try { await logout() } catch (err) { console.warn('Privy logout failed:', err) }
      clearConnectionHints()
      toast.success(message, { id: 'signout' })
      onOpenChange(false)
      if (typeof window !== 'undefined') {
        window.location.assign('/app')
      } else {
        setIsLoggingOut(false)
      }
    } catch (error) {
      console.error('Sign out failed:', error)
      toast.error('Failed to sign out', { id: 'signout' })
      setIsLoggingOut(false)
    }
  }

  const handleAutoReconnectToggle = (enabled: boolean) => {
    setAutoReconnectEnabled(enabled)
    if (typeof window !== 'undefined') {
      localStorage.setItem('wallet-auto-reconnect', enabled.toString())
    }
    toast.success(`Auto-reconnect ${enabled ? 'enabled' : 'disabled'}`)
  }

  const getWalletIcon = (type: WalletInfo['type']) => {
    switch (type) {
      case 'smart_wallet':
        return <Smartphone className="h-4 w-4" />
      case 'embedded':
        return <Wallet className="h-4 w-4" />
      case 'external':
        return <ExternalLink className="h-4 w-4" />
      default:
        return <Wallet className="h-4 w-4" />
    }
  }

  // Initial loading state while Privy wallets are initializing
  if (!ready && !loadError) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md glass-card rounded-3xl">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading identity...</span>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Fallback when Privy fails to become ready (e.g., blocked scripts, privacy settings)
  if (!ready && loadError) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md glass-card rounded-3xl">
          <DialogHeader>
            <DialogTitle>Wallet management unavailable</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <p>
              We couldn&apos;t load your wallet identity. This can happen if privacy blockers, strict cookie settings,
              or disabled scripts prevent our identity provider from initializing.
            </p>
            <p>
              You can still use your connected wallet for lending and borrowing, but advanced wallet management features
              may be temporarily unavailable.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                try {
                  window.location.reload()
                } catch {
                  onOpenChange(false)
                }
              }}
            >
              Reload page
            </Button>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: Sparkles },
    { id: 'wallets' as const, label: 'Wallets', icon: Shield },
    { id: 'advanced' as const, label: 'Settings', icon: Settings },
  ]

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        // `wallet-dialog-sheet` carries the mobile bottom-sheet override (see
        // globals.css). On `sm+` the listed Tailwind utilities take over and
        // the component renders as the original centered modal.
        // NOTE: `mobile-first` is intentionally not on this element — its
        // `margin: 0 1rem` rule clashes with `position: fixed; left: 0;
        // width: 100%` and shifts the sheet right by 1rem, overflowing the
        // viewport. The space-y tightening that lived in `mobile-first` is
        // replicated under `.wallet-dialog-sheet` directly.
        "wallet-dialog-sheet",
        "sm:max-w-2xl sm:max-h-[90vh] sm:rounded-3xl sm:p-6 sm:pb-6 p-4",
        "overflow-y-auto scrollbar-ghost",
        "bg-background/95 backdrop-blur-xl border border-border/50",
        "shadow-2xl shadow-black/10 dark:shadow-black/40"
      )}>
        {/* Mobile drag-handle — signals 'sheet' affordance; hidden on desktop */}
        <div className="sm:hidden flex justify-center -mt-1 mb-2" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-foreground/15" />
        </div>
        <DialogHeader className="pb-4 sm:pb-5">
          <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
            <div className={cn(
              "relative p-2.5 rounded-2xl overflow-hidden",
              "bg-gradient-to-br from-primary/25 to-primary/5",
              "border border-primary/25"
            )}>
              <Wallet className="h-5 w-5 text-primary relative z-10" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,theme(colors.primary/0.3),transparent_70%)]" />
            </div>
            <span className="tracking-tight">Wallet</span>
          </DialogTitle>
        </DialogHeader>

        {/* Navigation Tabs — sliding indicator */}
        <LayoutGroup id="wallet-dialog-tabs">
          <div className={cn(
            "relative flex gap-0.5 p-1 rounded-2xl mb-5",
            "bg-muted/40 backdrop-blur-sm border border-border/40"
          )}>
            {tabs.map(({ id, label, icon: Icon }) => {
              const isActive = activeSection === id
              return (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={cn(
                    "relative flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium",
                    "transition-colors duration-200 active:scale-[0.98]",
                    isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="wallet-tab-indicator"
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      className={cn(
                        "absolute inset-0 rounded-xl",
                        "bg-gradient-to-br from-primary to-primary/90",
                        "shadow-md shadow-primary/30",
                        "ring-1 ring-primary/30"
                      )}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </LayoutGroup>

        {/* Content Sections */}
        <div className="flex-1 relative">
         <AnimatePresence mode="wait">
          {activeSection === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-6">
              {/* Returning-user bank-transfer state, surfaced the moment the
                  modal opens. Self-hides when there's nothing in flight. */}
              <BridgeFundingStatus onOpenDetails={() => handleFundWallet('bank')} />
              {(() => {
                const evmAddress =
                  primaryAddress ||
                  walletInfos.find(w => w.type === 'embedded')?.address ||
                  walletInfos.find(w => w.type !== 'smart_wallet')?.address ||
                  ''
                const hasEvm = Boolean(evmAddress)
                const stellarAddr = stellarWallet.address
                const nonSmartWallets = walletInfos.filter(w => w.type !== 'smart_wallet')
                if (!hasEvm && !stellarAddr) {
                  return (
                    <div className="text-center py-12">
                      <div className="p-5 rounded-2xl mx-auto w-fit mb-4 bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20">
                        <Wallet className="h-10 w-10 text-primary/80" />
                      </div>
                      <p className="font-semibold text-base text-foreground mb-1">No wallet yet</p>
                      <p className="text-sm text-muted-foreground">Sign in to get started</p>
                    </div>
                  )
                }
                return (
                  <>
                    {/* Primary actions — the purpose of this screen */}
                    <div className="space-y-2">
                      <Button
                        onClick={() => handleFundWallet()}
                        className={cn(
                          "w-full h-12 rounded-2xl font-bold text-[15px]",
                          "bg-emerald-600 text-white shadow-sm shadow-emerald-500/25",
                          "hover:bg-emerald-500 transition-colors duration-200",
                        )}
                      >
                        <Plus className="h-4 w-4 mr-1.5" />
                        Add money
                      </Button>
                      {FEATURE_FLAGS.FIAT_OFFRAMP_BRIDGE && Boolean(stellarAddr) && (
                        <Button
                          variant="outline"
                          onClick={handleCashOut}
                          className="w-full h-12 rounded-2xl font-bold text-[15px] border-border/50 bg-background/40 hover:bg-background/70 hover:border-emerald-500/40 hover:text-emerald-600 transition-all duration-200"
                        >
                          <Banknote className="h-4 w-4 mr-1.5" />
                          Cash out
                        </Button>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          onClick={() => openSendSheet(null)}
                          className="h-11 rounded-2xl font-semibold border-border/50 bg-background/40 hover:bg-background/70 hover:border-primary/40 hover:text-primary transition-all duration-200"
                        >
                          <Send className="h-4 w-4 mr-1.5" />
                          Send
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleShowQRCode()}
                          className="h-11 rounded-2xl font-semibold border-border/50 bg-background/40 hover:bg-background/70 hover:border-primary/40 hover:text-primary transition-all duration-200"
                        >
                          <QrCode className="h-4 w-4 mr-1.5" />
                          Receive
                        </Button>
                      </div>
                    </div>

                    {/* Your wallets — equal standing, identity only */}
                    <div className="space-y-2">
                      <h4 className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground/70 px-1">
                        Your wallets
                      </h4>
                      <div className="space-y-1.5">
                        {hasEvm && (
                          <WalletIdentityRow
                            label="EVM"
                            address={evmAddress}
                            copied={copiedAddress === evmAddress}
                            onCopy={() => handleCopyAddress(evmAddress)}
                            onDisconnect={nonSmartWallets.length > 0 ? () => handleIndividualWalletDisconnect(nonSmartWallets[0]) : undefined}
                            disconnectTitle="Disconnect wallet"
                          />
                        )}
                        {stellarAddr && (
                          <WalletIdentityRow
                            label="Stellar"
                            address={stellarAddr}
                            copied={copiedAddress === stellarAddr}
                            onCopy={() => handleCopyAddress(stellarAddr)}
                            onDisconnect={handleStellarDisconnect}
                            disconnectTitle="Disconnect Stellar wallet"
                          />
                        )}
                      </div>
                    </div>

                    {/* Assets entry -> Wallets / Assets subtab */}
                    <button
                      type="button"
                      onClick={() => { setActiveSection('wallets'); setWalletsSubtab('assets') }}
                      data-testid="overview-assets-link"
                      className="group w-full flex items-center justify-between rounded-2xl px-4 py-3.5 bg-background/40 border border-border/50 hover:bg-background/70 hover:border-primary/30 transition-colors duration-200"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center text-primary shrink-0">
                          <Coins className="h-4 w-4" />
                        </div>
                        <div className="text-left min-w-0">
                          <div className="text-sm font-semibold text-foreground">Your assets</div>
                          <div className="text-[11px] text-muted-foreground/80 truncate">Balances across all your chains</div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary/70 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  </>
                )
              })()}

            </motion.div>
          )}

          {activeSection === 'wallets' && (
            <motion.div
              key="wallets"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-4">
              {/* Assets vs Accounts — assets are holdings, accounts are the
                  addresses + cross-chain links. */}
              <LayoutGroup id="wallet-subtabs">
                <div className="relative flex gap-0.5 p-1 rounded-2xl bg-muted/40 border border-border/40">
                  {([['assets', 'Assets'], ['accounts', 'Accounts']] as const).map(([id, label]) => {
                    const active = walletsSubtab === id
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setWalletsSubtab(id)}
                        data-testid={`wallets-subtab-${id}`}
                        className={cn(
                          "relative flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-colors duration-200",
                          active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {active && (
                          <motion.div
                            layoutId="wallet-subtab-indicator"
                            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                            className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-primary/90 shadow-sm shadow-primary/30"
                          />
                        )}
                        <span className="relative z-10">{label}</span>
                      </button>
                    )
                  })}
                </div>
              </LayoutGroup>

              {walletsSubtab === 'assets' ? (
                <WalletAssetsSection
                  address={primaryAddress || activeAddress || null}
                  onSend={(selection) => openSendSheet(selection)}
                />
              ) : (
                <>
              {/* Signed in as — which email / social / login the account uses.
                  Wallet-only sign-ins have no email; we say so plainly. */}
              <div className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3",
                "bg-background/40 border border-border/40"
              )}>
                <div className="h-9 w-9 shrink-0 rounded-xl bg-muted/50 border border-border/40 flex items-center justify-center text-muted-foreground">
                  {signInIdentity ? <Mail className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/70">
                    Signed in {signInIdentity ? `with ${signInIdentity.method}` : ""}
                  </p>
                  {signInIdentity ? (
                    <p className="text-sm font-semibold text-foreground truncate" title={signInIdentity.value}>
                      {signInIdentity.value}
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-foreground">
                      Connected with a wallet
                    </p>
                  )}
                </div>
                {signInIdentity?.method === "Email" && (
                  <button
                    type="button"
                    aria-label="Copy email"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(signInIdentity.value)
                        .then(() => toast.success("Email copied"))
                        .catch(() => toast.error("Could not copy"))
                    }}
                    className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-background/60 transition-colors shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* The user's own IBAN — a permanent property of the account, so
                  it sits beside the login it belongs to instead of only inside
                  the add-money flow. Self-hides until one is provisioned. */}
              <BankAccountSummary onOpenDetails={() => handleFundWallet('bank')} />

              {/* Cross-chain wallet links */}
              <div className={cn(
                "relative overflow-hidden rounded-2xl p-5",
                "bg-gradient-to-br from-card/90 via-card/80 to-card/60",
                "border border-border/50 backdrop-blur-sm shadow-sm"
              )}>
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
                />
                <div className="relative">
                  <div className="mb-4">
                    <div className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground/70">
                      Cross-chain links
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Link EVM and Soroban wallets to aggregate across chains.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className={cn(
                      "flex items-center justify-between rounded-xl px-3 py-2.5",
                      "bg-background/40 border border-border/30",
                      "hover:bg-background/70 hover:border-border/60 transition-colors duration-200"
                    )}>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">EVM</p>
                        <p className="text-[11px] font-mono text-muted-foreground/80">
                          {activeAddress ? formatWalletAddress(activeAddress) : "No active wallet"}
                        </p>
                      </div>
                      {linkedEvmForActive ? (
                        <div className="flex items-center gap-1.5 shrink-0 pl-2">
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                          </span>
                          <span className="text-[10px] uppercase tracking-widest font-semibold text-emerald-500">
                            {linkedEvmForActive.verificationStatus === "verified" ? "Verified" : "Pending"}
                          </span>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!activeAddress || isLinkingEvm || isLinkedWalletsMutating}
                          onClick={handleLinkActiveEvmWallet}
                          className="h-8 px-3 rounded-xl text-xs"
                        >
                          {isLinkingEvm ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Link"}
                        </Button>
                      )}
                    </div>

                    <div className={cn(
                      "flex items-center justify-between rounded-xl px-3 py-2.5",
                      "bg-background/40 border border-border/30",
                      "hover:bg-background/70 hover:border-border/60 transition-colors duration-200"
                    )}>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">Stellar wallet</p>
                        <p className="text-[11px] font-mono text-muted-foreground/80">
                          {stellarWallet.address ? formatWalletAddress(stellarWallet.address) : "Not connected"}
                        </p>
                      </div>
                      {stellarWallet.source === "privy" && stellarWallet.address ? (
                        // Embedded Privy wallet = the user's own account. No link
                        // & verify (that proves ownership of an external wallet,
                        // and it signs via the Wallets Kit, which an embedded
                        // wallet doesn't have). Just label it and let them copy.
                        <div className="flex items-center gap-1.5 shrink-0 pl-2">
                          <span className="text-[10px] uppercase tracking-widest font-semibold text-emerald-500">
                            Your wallet
                          </span>
                          <button
                            type="button"
                            aria-label="Copy address"
                            onClick={() => {
                              navigator.clipboard
                                .writeText(stellarWallet.address!)
                                .then(() => toast.success("Address copied"))
                                .catch(() => toast.error("Could not copy"))
                            }}
                            className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-background/60 transition-colors"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : linkedStellarForActive ? (
                        <div className="flex items-center gap-1.5 shrink-0 pl-2">
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                          </span>
                          <span className="text-[10px] uppercase tracking-widest font-semibold text-emerald-500">
                            {linkedStellarForActive.verificationStatus === "verified" ? "Verified" : "Pending"}
                          </span>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isLinkingStellar || isLinkedWalletsMutating}
                          onClick={handleLinkStellarWallet}
                          className="h-8 px-3 rounded-xl text-xs"
                        >
                          {isLinkingStellar ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : stellarWallet.isConnected ? (
                            "Link"
                          ) : (
                            "Connect"
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 text-[11px] text-muted-foreground/70">
                    {isLinkedWalletsLoading ? "Loading…" : `${links.length} link${links.length === 1 ? '' : 's'} on this account`}
                  </div>
                  {!isLinkedWalletsLoading && links.length > 1 && (
                    <p className="mt-1 text-[10px] leading-snug text-muted-foreground/60">
                      Points are pooled across all verified wallets on your account — they always show as one balance, not one per wallet.
                    </p>
                  )}

                  <AnimatePresence initial={false}>
                    {!isLinkedWalletsLoading && links.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="mt-3 space-y-1.5"
                      >
                        {links.map((link, i) => (
                          <motion.div
                            key={link.id}
                            layout
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2, delay: i * 0.03 }}
                            className={cn(
                              "flex items-center justify-between rounded-xl px-3 py-2.5",
                              "bg-background/30 border border-border/30"
                            )}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-semibold text-foreground">
                                  {link.chainNamespace === "evm" ? "EVM" : "Soroban"}
                                </p>
                                {link.label && (
                                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
                                    · {link.label}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] font-mono text-muted-foreground/80 truncate">
                                {formatWalletAddress(link.address)}
                              </p>
                              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/60 mt-0.5">
                                {link.verificationStatus === "verified" ? "Verified" : "Pending verification"}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 pl-2">
                              {link.verificationStatus !== "verified" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRetryLinkedWalletVerification(link)}
                                  disabled={isLinkedWalletsMutating || retryingLinkId === link.id}
                                  className="h-7 w-7 p-0 rounded-lg hover:bg-muted/60"
                                  title="Retry verification"
                                >
                                  {retryingLinkId === link.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleUnlinkWallet(link.id)}
                                disabled={isLinkedWalletsMutating}
                                className="h-7 w-7 p-0 rounded-lg hover:bg-destructive/10 hover:text-destructive"
                                title="Unlink"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </motion.div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Connected EOAs */}
              {walletInfos.filter(w => w.type !== 'smart_wallet').length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground/70 px-1">
                    Connected wallets
                  </h4>
                  <LayoutGroup>
                    <div className="space-y-1.5">
                      {walletInfos
                        .filter(w => w.type !== 'smart_wallet')
                        .map((wallet, i) => (
                          <motion.div
                            key={wallet.address}
                            layout
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                            className={cn(
                              "group rounded-xl p-3",
                              "bg-background/40 border border-border/30",
                              "hover:bg-background/70 hover:border-border/60 transition-colors duration-200"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={cn(
                                  "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                                  "bg-muted/40 border border-border/30 text-muted-foreground"
                                )}>
                                  {getWalletIcon(wallet.type)}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-semibold text-foreground truncate">
                                      {getWalletDisplayName(wallet)}
                                    </span>
                                    <button
                                      onClick={() => handleCopyAddress(wallet.address)}
                                      className="h-6 w-6 p-0 rounded-md flex items-center justify-center hover:bg-muted/60 transition-colors shrink-0"
                                      title="Copy"
                                      aria-label="Copy"
                                    >
                                      {copiedAddress === wallet.address ? (
                                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                                      ) : (
                                        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                                      )}
                                    </button>
                                  </div>
                                  <div className="text-[11px] font-mono text-muted-foreground/80 truncate">
                                    {formatWalletAddress(wallet.address)}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {wallet.isActive ? (
                                  <div className="flex items-center gap-1.5 pr-1">
                                    <span className="relative flex h-2 w-2">
                                      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                                    </span>
                                    <span className="text-[10px] uppercase tracking-widest font-semibold text-emerald-500">
                                      Active
                                    </span>
                                  </div>
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleSetActiveWallet(wallet.address)}
                                      className="h-7 px-2 rounded-lg text-[11px]"
                                    >
                                      Set active
                                    </Button>
                                    <button
                                      onClick={() => handleIndividualWalletDisconnect(wallet)}
                                      className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors"
                                      title={`Disconnect ${getWalletDisplayName(wallet)}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            {wallet.balanceFormatted && (
                              <div className="mt-2 pt-2 border-t border-border/30 flex items-center justify-between text-[11px]">
                                <span className="uppercase tracking-widest font-semibold text-muted-foreground/70">
                                  Balance
                                </span>
                                <span className="font-mono font-semibold text-foreground tabular-nums">
                                  {wallet.balanceFormatted} {getNativeTokenSymbol(wallet.chainId || currentChainId)}
                                </span>
                              </div>
                            )}
                          </motion.div>
                        ))}
                    </div>
                  </LayoutGroup>
                </div>
              )}

              {/* Empty state */}
              {walletInfos.length === 0 && (
                <div className="text-center py-12">
                  <div className={cn(
                    "p-5 rounded-2xl mx-auto w-fit mb-4",
                    "bg-gradient-to-br from-primary/15 to-primary/5",
                    "border border-primary/20"
                  )}>
                    <Wallet className="h-10 w-10 text-primary/80" />
                  </div>
                  <p className="font-semibold text-base text-foreground mb-1">No wallets yet</p>
                  <p className="text-sm text-muted-foreground">Connect a wallet to get started</p>
                </div>
              )}
                </>
              )}
            </motion.div>
          )}

          {activeSection === 'cashout' && (
            <motion.div
              key="cashout"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-3">
              <button
                type="button"
                onClick={() => setActiveSection('overview')}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </button>
              <AddMoneyBody embedded mode="cashout" />
            </motion.div>
          )}

          {activeSection === 'advanced' && (
            <motion.div
              key="advanced"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-4">
              {/* Preferences */}
              <div className="space-y-2">
                <h4 className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground/70 px-1">
                  Preferences
                </h4>
                <motion.div
                  layout
                  className={cn(
                    "flex items-center justify-between rounded-xl p-3.5",
                    "bg-gradient-to-br from-card/90 to-card/60",
                    "border border-border/50 backdrop-blur-sm shadow-sm"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                      "bg-gradient-to-br from-blue-500/25 to-blue-500/5",
                      "ring-1 ring-blue-500/30"
                    )}>
                      <Shield className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="min-w-0">
                      <h5 className="text-sm font-semibold text-foreground">Auto-reconnect</h5>
                      <p className="text-xs text-muted-foreground">Reconnect wallets on page reload</p>
                    </div>
                  </div>
                  <Switch
                    checked={autoReconnectEnabled}
                    onCheckedChange={handleAutoReconnectToggle}
                    className="data-[state=checked]:bg-primary"
                  />
                </motion.div>
              </div>

              {/* Advanced actions */}
              <div className="space-y-2">
                <h4 className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground/70 px-1">
                  Actions
                </h4>
                <LayoutGroup>
                  <div className="space-y-1.5">
                    {walletFeatures.map((feature, i) => (
                      <motion.button
                        key={feature.id}
                        layout
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                        onClick={feature.action}
                        disabled={feature.disabled || feature.comingSoon}
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.99 }}
                        className={cn(
                          "group w-full flex items-center justify-between rounded-xl p-3.5 text-left",
                          "bg-gradient-to-br from-card/90 to-card/60",
                          "border border-border/50 hover:border-primary/30",
                          "backdrop-blur-sm shadow-sm hover:shadow-md",
                          "transition-all duration-200",
                          "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-sm disabled:hover:border-border/50"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                            feature.comingSoon || feature.disabled
                              ? "bg-muted/40 border border-border/30"
                              : "bg-gradient-to-br from-primary/25 to-primary/5 ring-1 ring-primary/30"
                          )}>
                            <feature.icon className={cn(
                              "h-4 w-4",
                              feature.comingSoon || feature.disabled ? "text-muted-foreground" : "text-primary"
                            )} />
                          </div>
                          <div className="min-w-0">
                            <h5 className="text-sm font-semibold text-foreground truncate">{feature.title}</h5>
                            <p className="text-xs text-muted-foreground truncate">{feature.description}</p>
                          </div>
                        </div>
                        <div className={cn(
                          "flex items-center gap-1.5 text-xs font-semibold shrink-0 pl-2",
                          feature.comingSoon ? "text-muted-foreground" : "text-primary opacity-80 group-hover:opacity-100",
                          "transition-opacity"
                        )}>
                          {feature.comingSoon ? 'Soon' : (
                            <>
                              Open
                              <ChevronRight className="h-3.5 w-3.5" />
                            </>
                          )}
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </LayoutGroup>
              </div>

              {/* Account — sign out */}
              <div className="space-y-2 pt-1">
                <h4 className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground/70 px-1">
                  Account
                </h4>
                <motion.button
                  layout
                  onClick={() => handleLogoutAll()}
                  disabled={isLoggingOut}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.99 }}
                  className={cn(
                    "group w-full flex items-center justify-between rounded-xl p-3.5 text-left",
                    "bg-gradient-to-br from-destructive/10 to-destructive/5",
                    "border border-destructive/30 hover:border-destructive/50",
                    "backdrop-blur-sm shadow-sm hover:shadow-md",
                    "transition-all duration-200",
                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-sm disabled:hover:border-destructive/30"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                      "bg-gradient-to-br from-destructive/25 to-destructive/5 ring-1 ring-destructive/30"
                    )}>
                      {isLoggingOut
                        ? <Loader2 className="h-4 w-4 text-destructive animate-spin" />
                        : <LogOut className="h-4 w-4 text-destructive" />}
                    </div>
                    <div className="min-w-0">
                      <h5 className="text-sm font-semibold text-foreground truncate">Sign out</h5>
                      <p className="text-xs text-muted-foreground truncate">Disconnect all wallets and end your session</p>
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-destructive/70 shrink-0 group-hover:text-destructive transition-colors" />
                </motion.button>
              </div>
            </motion.div>
          )}
         </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>

    <SendTokenSheet
      open={sendSheetOpen}
      onOpenChange={setSendSheetOpen}
      address={primaryAddress || activeAddress || null}
      preselect={sendPreselect}
    />
    <ReceiveSheet
      open={receiveOpen}
      onOpenChange={setReceiveOpen}
      evmAddress={primaryAddress || activeAddress || null}
    />
    </>
  )
}
