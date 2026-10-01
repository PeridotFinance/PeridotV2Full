'use client'

import { useCallback, useState } from 'react'
import {
  useChainId,
  useConfig,
  useSendTransaction as useWagmiSendTransaction,
} from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { useSendTransaction as usePrivySendTransaction } from '@privy-io/react-auth'
import {
  encodeFunctionData,
  erc20Abi,
  isAddress,
  parseUnits,
  type Address,
  type Hex,
} from 'viem'
import { useActiveWallet } from './use-active-wallet'
import { useEnsureEvmChain } from './use-ensure-evm-chain'
import { friendlyEvmError } from '@/lib/send/validation'

export type SendStatus =
  | 'idle'
  | 'switching'
  | 'sending'
  | 'confirming'
  | 'success'
  | 'error'

export interface SendTokenParams {
  /** Chain the token lives on. The wallet is switched to this chain before sending. */
  chainId: number
  /** ERC20 contract address, or `null` for the chain's native gas token. */
  tokenAddress: Address | null
  /** Token decimals — used to parse the human-readable amount. */
  decimals: number
  /** Human-readable amount, e.g. "12.5". */
  amount: string
  /** Destination address. */
  recipient: string
}

/**
 * Sends a native or ERC20 token from the connected wallet to an external EVM address.
 *
 * Routing depends on the wallet type:
 * - **Privy embedded wallet** (social login): signed via Privy with managed gas
 *   sponsorship (`sponsor: true`) so the user needs no native balance. If
 *   sponsorship is rejected we fall back to the wagmi path (wallet-paid gas).
 * - **External wallet** (MetaMask, etc.): signed via wagmi through the wallet's
 *   own provider — Privy's `useSendTransaction` only handles its embedded wallet
 *   and would throw "No embedded or connected wallet found" here.
 *
 * Success is only reported once the transaction is *confirmed* on-chain: after
 * submission the hook enters `confirming` and waits for the receipt. A reverted
 * receipt surfaces as an error rather than a false "sent".
 */
export function useSendTokenEvm() {
  const currentChainId = useChainId()
  const config = useConfig()
  const { ensureChain } = useEnsureEvmChain()
  const { sendTransactionAsync: wagmiSendTransaction } = useWagmiSendTransaction()
  const { sendTransaction: privySendTransaction } = usePrivySendTransaction()
  const { isEmbeddedWallet } = useActiveWallet()

  const [status, setStatus] = useState<SendStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | null>(null)

  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
    setTxHash(null)
  }, [])

  const send = useCallback(
    async (params: SendTokenParams): Promise<Hex | undefined> => {
      const { chainId, tokenAddress, decimals, amount, recipient } = params

      setError(null)
      setTxHash(null)

      if (!isAddress(recipient)) {
        setError('Invalid recipient address.')
        setStatus('error')
        return
      }

      let parsedAmount: bigint
      try {
        parsedAmount = parseUnits(amount.trim(), decimals)
      } catch {
        setError('Invalid amount.')
        setStatus('error')
        return
      }
      if (parsedAmount <= BigInt(0)) {
        setError('Amount must be greater than 0.')
        setStatus('error')
        return
      }

      try {
        // Always, not only when wagmi reports another chain: the Privy
        // embedded wallet can sit on its default chain while wagmi already
        // shows `chainId`, and the wagmi fallback below would then sign there.
        // `ensureChain` is a no-op when both already agree.
        if (currentChainId !== chainId) setStatus('switching')
        await ensureChain(chainId)

        setStatus('sending')

        // For an ERC20 the call targets the token contract with `transfer` data;
        // for the native gas token it's a plain value transfer to the recipient.
        const to: Address = tokenAddress ?? (recipient as Address)
        const data: Hex | undefined = tokenAddress
          ? encodeFunctionData({
              abi: erc20Abi,
              functionName: 'transfer',
              args: [recipient as Address, parsedAmount],
            })
          : undefined
        const value: bigint | undefined = tokenAddress ? undefined : parsedAmount

        let hash: Hex
        if (isEmbeddedWallet) {
          // Embedded wallet — try Privy managed gas sponsorship first, then fall
          // back to the wagmi path (still the embedded wallet, wallet-paid gas).
          try {
            const res = await privySendTransaction(
              { to, data, value, chainId },
              { sponsor: true },
            )
            hash = res.hash
          } catch (sponsorErr) {
            console.warn(
              '[useSendTokenEvm] Privy sponsorship failed, falling back to wallet gas:',
              sponsorErr,
            )
            hash = await wagmiSendTransaction({ to, data, value, chainId })
          }
        } else {
          // External wallet (MetaMask, etc.) — sign through its own provider.
          hash = await wagmiSendTransaction({ to, data, value, chainId })
        }

        setTxHash(hash)

        // Wait for on-chain confirmation before reporting success. If the receipt
        // can't be fetched (RPC/CSP hiccup) we keep the optimistic success rather
        // than show a false failure for a transaction that was in fact submitted.
        setStatus('confirming')
        try {
          const receipt = await waitForTransactionReceipt(config, { hash, chainId })
          if (receipt.status === 'reverted') {
            setError('The transaction failed on-chain. No funds were transferred.')
            setStatus('error')
            return
          }
        } catch (confirmErr) {
          console.warn('[useSendTokenEvm] Could not confirm receipt:', confirmErr)
        }

        setStatus('success')
        return hash
      } catch (e) {
        setError(friendlyEvmError(e instanceof Error ? e.message : String(e)))
        setStatus('error')
        return
      }
    },
    [
      currentChainId,
      config,
      ensureChain,
      wagmiSendTransaction,
      privySendTransaction,
      isEmbeddedWallet,
    ],
  )

  return {
    send,
    reset,
    status,
    error,
    txHash,
    isPending: status === 'switching' || status === 'sending' || status === 'confirming',
  }
}
