"use client"

import { useCallback, useMemo } from "react"
import {
  useWallets,
  useSignMessage,
  useSignAndSendTransaction,
  type ConnectedStandardSolanaWallet,
} from "@privy-io/react-auth/solana"

export type SolanaChainId = "solana:mainnet" | "solana:devnet" | "solana:testnet"

export interface SolanaWalletState {
  address: string | undefined
  isConnected: boolean
  isReady: boolean
  wallet: ConnectedStandardSolanaWallet | undefined
}

export interface SolanaSignedMessage {
  signature: Uint8Array
  signerAddress: string
}

/**
 * Active Solana wallet managed by Privy — covers both embedded Privy Solana wallets
 * (social-login users) and external wallet-standard wallets (Phantom, Solflare, Backpack).
 * Picks the first wallet from Privy's Solana registry; callers that need multi-wallet
 * handling should consume `useWallets` from `@privy-io/react-auth/solana` directly.
 *
 * Shape mirrors `useStellarWallet` so cross-chain hooks can branch on network source
 * with a consistent signer facade.
 */
export function useSolanaWallet(): SolanaWalletState & {
  sign: (message: string) => Promise<SolanaSignedMessage | null>
  signAndSendRaw: (
    transaction: Uint8Array,
    chain?: SolanaChainId,
  ) => Promise<{ signature: Uint8Array } | null>
} {
  const { wallets, ready } = useWallets()
  const { signMessage } = useSignMessage()
  const { signAndSendTransaction } = useSignAndSendTransaction()

  const wallet = wallets[0]
  const address = wallet?.address
  const isConnected = Boolean(wallet)

  const sign = useCallback(
    async (message: string): Promise<SolanaSignedMessage | null> => {
      if (!wallet || !message.trim()) return null
      try {
        const bytes = new TextEncoder().encode(message)
        const { signature } = await signMessage({ message: bytes, wallet })
        return { signature, signerAddress: wallet.address }
      } catch {
        return null
      }
    },
    [wallet, signMessage],
  )

  const signAndSendRaw = useCallback(
    async (transaction: Uint8Array, chain: SolanaChainId = "solana:mainnet") => {
      if (!wallet) return null
      try {
        return await signAndSendTransaction({ transaction, wallet, chain })
      } catch {
        return null
      }
    },
    [wallet, signAndSendTransaction],
  )

  return useMemo(
    () => ({ address, isConnected, isReady: ready, wallet, sign, signAndSendRaw }),
    [address, isConnected, ready, wallet, sign, signAndSendRaw],
  )
}
