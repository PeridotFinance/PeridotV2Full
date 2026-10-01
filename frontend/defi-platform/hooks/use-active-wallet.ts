"use client"

import { useAccount } from "wagmi"
import { usePrivy, useWallets } from "@privy-io/react-auth"
import { useMemo } from "react"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { useNetworkContext } from "@/context"
import { isStellarNetwork } from "@/config/contracts"
import { useStellarOnly } from "@/config/stellarOnly"
import { useStellarWallet } from "./use-stellar-wallet"

export type WalletType = "eoa" | "smart"

export interface ActiveWallet {
  address: `0x${string}` | string | undefined
  signerAddress: `0x${string}` | string | undefined
  isConnected: boolean
  walletType: WalletType
  isSmartAccountActive: boolean
  /**
   * True when the connected EVM wallet is Privy's own embedded EOA (MPC-managed).
   * Embedded wallets support silent signing (`uiOptions.showWalletUIs: false`) and are
   * covered by Privy's managed Gas Sponsorship — the two preconditions for agent auto-sign.
   * External wallets (MetaMask, etc.) are always false.
   */
  isEmbeddedWallet: boolean
  /**
   * True when the agent is allowed to sign transactions on behalf of the user without
   * showing a confirmation dialog. Requires: embedded wallet + global feature flag +
   * per-user consent (evaluated against `agent_profiles.auto_execute_enabled` at call site).
   * This is the wallet-level gate only — amount-vs-limit and action-type-allow-list checks
   * still happen in the execute flow.
   */
  canAutoSign: boolean
}

/**
 * A unified hook to resolve the active wallet address and type.
 * When Stellar network is selected, returns Freighter wallet state.
 * Otherwise prioritizes Privy Smart Accounts when the experiment is enabled.
 */
export function useActiveWallet(): ActiveWallet {
  const { selectedNetworkId } = useNetworkContext()
  const stellarWallet = useStellarWallet()
  // The public host surfaces Stellar markets only (see `config/stellarOnly`).
  const stellarOnly = useStellarOnly()
  const { address: eoaAddress, isConnected: isWagmiConnected } = useAccount()
  const { user, ready, authenticated } = usePrivy()
  const { wallets } = useWallets()

  const activeWallet = useMemo<ActiveWallet>(() => {
    // Resolve Privy EOA first so we can decide whether to fall back to Stellar.
    // Mirrors the regex filter further down: Privy may surface a Solana wallet
    // ahead of the EVM one for email-login users; matching `0x…` ensures we
    // only count true EVM signers here.
    const privyEoaCandidate = user?.linkedAccounts?.find(
      (account) =>
        account.type === "wallet" &&
        typeof (account as { address?: string }).address === "string" &&
        /^0x[a-fA-F0-9]{40}$/.test((account as { address: string }).address)
    )
    const privyEoaCandidateAddr = (privyEoaCandidate as { address?: string } | undefined)?.address as `0x${string}` | undefined
    const hasEvmSigner = Boolean(privyEoaCandidateAddr || eoaAddress)

    // Stellar branch fires in three cases:
    //   1. User explicitly switched to a Stellar network (existing behavior).
    //   2. Stellar wallet (Freighter / xBull) is connected and there is NO EVM
    //      signer available — i.e. the user joined via Stellar only. Without
    //      this, every downstream consumer (header pill, activity, portfolio)
    //      would treat them as unconnected just because the default network
    //      selection is BSC.
    //   3. Stellar wallet is connected on a host that shows Stellar markets
    //      only. `hasEvmSigner` counts a wallet that was ever *linked* in
    //      Privy, not one that is actively in use — so a user who connected
    //      MetaMask once stayed an "EVM user" forever and got asked for both
    //      wallets as `selectedNetworkId` moved between surfaces. On a host
    //      without EVM markets a connected Stellar wallet always wins.
    const stellarFallback = stellarWallet.isConnected && (stellarOnly || !hasEvmSigner)
    if (isStellarNetwork(selectedNetworkId) || stellarFallback) {
      return {
        address: stellarWallet.address,
        signerAddress: stellarWallet.address,
        isConnected: stellarWallet.isConnected,
        walletType: "eoa",
        isSmartAccountActive: false,
        isEmbeddedWallet: false,
        canAutoSign: false,
      }
    }

    // Non-Privy flow (legacy WalletConnect path) — no embedded wallet concept
    if (!FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT) {
      return {
        address: eoaAddress,
        signerAddress: eoaAddress,
        isConnected: isWagmiConnected,
        walletType: "eoa",
        isSmartAccountActive: false,
        isEmbeddedWallet: false,
        canAutoSign: false,
      }
    }

    // Reuse the candidate resolved at the top — same regex filter, same reason
    // (Privy may surface a Solana wallet ahead of the EVM one for email-login
    // users; casting that base58 address as `0x${string}` poisons every
    // downstream consumer).
    const privyEoaAddress = privyEoaCandidateAddr

    // Check whether the *currently active* wallet is Privy's embedded wallet.
    // We match on `walletClientType === 'privy'` which is what Privy sets for the
    // MPC-backed embedded wallet (social login users); external wallets report
    // 'metamask', 'coinbase_wallet', etc.
    const activeAddr = (privyEoaAddress || eoaAddress || '').toString().toLowerCase()
    const activeWalletInfo = wallets?.find(
      (w) => (w?.address || '').toString().toLowerCase() === activeAddr
    )
    const walletClientType = (activeWalletInfo as any)?.walletClientType as string | undefined
    const isEmbeddedWallet = walletClientType === 'privy'

    // canAutoSign: wallet-level gate only. The execute flow additionally checks
    // amount-vs-limit and per-user consent (agent_profiles.auto_execute_enabled).
    const canAutoSign =
      isEmbeddedWallet && FEATURE_FLAGS.AGENT_AUTO_EXECUTE_EMBEDDED

    // Smart account is intentionally disabled — the EOA (embedded wallet) is
    // always used directly. The Privy smart wallet exists as infrastructure for
    // gasless transaction execution but is not exposed to users or used as the
    // transaction owner address.
    return {
      address: privyEoaAddress || eoaAddress,
      signerAddress: privyEoaAddress || eoaAddress,
      isConnected: isWagmiConnected || Boolean(privyEoaAddress),
      walletType: "eoa",
      isSmartAccountActive: false,
      isEmbeddedWallet,
      canAutoSign,
    }
  }, [
    selectedNetworkId,
    stellarOnly,
    stellarWallet.address,
    stellarWallet.isConnected,
    eoaAddress,
    isWagmiConnected,
    user,
    ready,
    authenticated,
    wallets,
  ])

  return activeWallet
}
