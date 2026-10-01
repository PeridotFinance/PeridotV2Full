'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useSendTransaction, useAccount } from 'wagmi'
import { waitForTransactionReceipt, getWalletClient } from '@wagmi/core'
import { type Hex } from 'viem'
import { bitgetAdapter } from '@/lib/swap/bitget-adapter'
import { squidAdapter } from '@/lib/swap/squid-adapter'
import type {
  SwapQuote,
  SwapOrder,
  SwapOrderStatus,
  SwapStatusContext,
  SwapTransaction,
} from '@/lib/swap/types'
import { wagmiConfig } from '@/config/wagmiConfig'

export type SwapStep =
  | 'idle'
  | 'creating_order'
  | 'approving'
  | 'signing'
  | 'submitting'
  | 'polling'
  | 'success'
  | 'failed'

export type SourceChainType = 'evm' | 'stellar' | 'cosmos' | 'sui'

const TERMINAL_STATES: SwapOrderStatus[] = ['success', 'failed', 'refunded']
const POLL_INTERVAL = 5_000

/**
 * Sign and send a Stellar transaction via whichever wallet the user has
 * connected through Stellar Wallets Kit (Freighter, Albedo, xBull, Lobstr,
 * Hot, Ledger, WalletConnect …). Squid returns XDR-encoded transaction data
 * for Stellar sources.
 */
async function signAndSendStellar(tx: SwapTransaction): Promise<string> {
  // Dynamic imports — signer registry routes to kit (external wallets) or Privy
  // raw-sign (embedded) by address. We pass the registered embedded address so
  // a logged-in user's swap signs through Privy; with no embedded wallet the
  // registry is empty → undefined → the kit path (external wallet) as before.
  const { signStellarXdr, getRegisteredStellarSignerAddress } = await import('@/lib/stellar-signer')
  const StellarSdk = await import('@stellar/stellar-sdk')

  const xdr = tx.data // Squid puts the XDR in the data field
  if (!xdr) throw new Error('No Stellar transaction data')

  // Squid uses mainnet Stellar by default.
  const networkPassphrase = StellarSdk.Networks.PUBLIC

  const { signedTxXdr } = await signStellarXdr(xdr, {
    networkPassphrase,
    address: getRegisteredStellarSignerAddress(),
  })
  if (!signedTxXdr) throw new Error('Wallet did not return a signed transaction')

  // Submit to Stellar network via Horizon.
  const server = new StellarSdk.Horizon.Server('https://horizon.stellar.org')
  const signed = StellarSdk.TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase)
  const result = await server.submitTransaction(signed)

  return result.hash
}

/**
 * Sign and send an EVM transaction via wagmi.
 */
async function signAndSendEvm(
  tx: SwapTransaction,
  sendTransactionAsync: ReturnType<typeof useSendTransaction>['sendTransactionAsync'],
): Promise<string> {
  const hash = await sendTransactionAsync({
    to: tx.to as Hex,
    data: tx.data as Hex,
    value: tx.value ? BigInt(tx.value) : 0n,
    gas: tx.gasLimit ? BigInt(tx.gasLimit) : undefined,
  })

  // Wait for on-chain confirmation
  await waitForTransactionReceipt(wagmiConfig, { hash })
  return hash
}

/**
 * Sign (but do NOT broadcast) a Bitget Order Mode transaction. Bitget supplies
 * the full nonce + gas params, so we sign them verbatim and hand the serialized
 * signed tx back to Bitget via submitSwapOrder — Bitget broadcasts and tracks.
 * Requires a wallet that supports eth_signTransaction (Privy embedded does).
 */
async function signBitgetTx(tx: SwapTransaction, account: string): Promise<Hex> {
  // @wagmi/core has no signTransaction action — go through the viem wallet
  // client bound to the tx's chain. For JSON-RPC accounts (Privy embedded /
  // injected) this dispatches eth_signTransaction.
  const walletClient = await getWalletClient(wagmiConfig, {
    chainId: tx.chainId,
    account: account as Hex,
  })

  const base = {
    account: account as Hex,
    to: tx.to as Hex,
    data: tx.data as Hex,
    value: tx.value ? BigInt(tx.value) : 0n,
    gas: tx.gasLimit ? BigInt(tx.gasLimit) : undefined,
    nonce: tx.nonce,
  }

  const params = tx.supportEIP1559
    ? {
        ...base,
        type: 'eip1559' as const,
        maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : undefined,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas
          ? BigInt(tx.maxPriorityFeePerGas)
          : undefined,
      }
    : {
        ...base,
        type: 'legacy' as const,
        gasPrice: tx.gasPrice ? BigInt(tx.gasPrice) : undefined,
      }

  return await walletClient.signTransaction(params as any)
}

export function useSwap() {
  const { sendTransactionAsync } = useSendTransaction()
  const { chainId: activeChainId } = useAccount()

  const [step, setStep] = useState<SwapStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null)
  const [receiveAmount, setReceiveAmount] = useState<string | null>(null)

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    return () => {
      cancelledRef.current = true
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [])

  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setOrderId(null)
    setTxHash(null)
    setExplorerUrl(null)
    setReceiveAmount(null)
    cancelledRef.current = true
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const pollStatus = useCallback(
    (
      adapter: typeof bitgetAdapter | typeof squidAdapter,
      oid: string,
      ctx?: SwapStatusContext,
    ) => {
      cancelledRef.current = false
      if (pollingRef.current) clearInterval(pollingRef.current)

      pollingRef.current = setInterval(async () => {
        if (cancelledRef.current) {
          if (pollingRef.current) clearInterval(pollingRef.current)
          return
        }

        try {
          const status = await adapter.getStatus(oid, ctx)
          if (status.txHash) setTxHash(status.txHash)
          if (status.explorerUrl) setExplorerUrl(status.explorerUrl)
          if (status.receiveAmount) setReceiveAmount(status.receiveAmount)

          if (TERMINAL_STATES.includes(status.status)) {
            if (pollingRef.current) clearInterval(pollingRef.current)
            pollingRef.current = null

            if (status.status === 'success') {
              setStep('success')
            } else {
              setStep('failed')
              setError(
                status.status === 'refunded'
                  ? 'Transaction refunded'
                  : 'Transaction failed',
              )
            }
          }
        } catch {
          console.warn('[useSwap] poll error, will retry')
        }
      }, POLL_INTERVAL)
    },
    [],
  )

  const executeSwap = useCallback(
    async (
      quote: SwapQuote,
      userAddress: string,
      sourceChainType: SourceChainType = 'evm',
    ) => {
      const adapter = quote.provider === 'bitget' ? bitgetAdapter : squidAdapter
      setError(null)
      setTxHash(null)
      setExplorerUrl(null)
      setReceiveAmount(null)

      try {
        // 1. Create order
        setStep('creating_order')
        const order: SwapOrder = await adapter.createOrder(quote, userAddress)
        setOrderId(order.orderId)

        if (order.transactions.length === 0) {
          throw new Error('No transactions returned from provider')
        }

        if (quote.provider === 'bitget' && sourceChainType === 'evm') {
          // Bitget Order Mode: sign every tx (no broadcast), then hand the raw
          // signed txs to Bitget, which broadcasts and tracks them by orderId.
          setStep('signing')
          const signedRawTxs: string[] = []
          for (const tx of order.transactions) {
            if (cancelledRef.current) return
            signedRawTxs.push(await signBitgetTx(tx, userAddress))
          }

          setStep('submitting')
          await adapter.submitSignedTxs(order.orderId, signedRawTxs)

          setStep('polling')
          pollStatus(adapter, order.orderId)
        } else {
          // Squid (and Stellar): the user broadcasts each tx directly. The last
          // tx is the swap; any earlier tx is an approval.
          const signedTxHashes: string[] = []

          for (let i = 0; i < order.transactions.length; i++) {
            if (cancelledRef.current) return

            const tx = order.transactions[i]
            const isApproval = i < order.transactions.length - 1
            setStep(isApproval ? 'approving' : 'signing')

            const hash =
              sourceChainType === 'stellar'
                ? await signAndSendStellar(tx)
                : await signAndSendEvm(tx, sendTransactionAsync)

            setTxHash(hash)
            signedTxHashes.push(hash)
          }

          // Squid /v2/status keys on the source swap tx hash + chain pair.
          setStep('polling')
          pollStatus(adapter, order.orderId, {
            txHash: signedTxHashes[signedTxHashes.length - 1],
            fromChainId: quote.fromToken.chainId,
            toChainId: quote.toToken.chainId,
            quoteId:
              quote.rawQuote?.quoteId ??
              quote.rawQuote?.route?.quoteId ??
              quote.rawQuote?.route?.estimate?.quoteId,
          })
        }
      } catch (err: any) {
        if (cancelledRef.current) return

        // User rejected in wallet (EVM or Freighter)
        if (
          err?.code === 4001 ||
          err?.message?.includes('User rejected') ||
          err?.message?.includes('User denied') ||
          err?.message?.includes('User declined')
        ) {
          setStep('idle')
          setError(null)
          return
        }

        setStep('failed')
        setError(err?.shortMessage ?? err?.message ?? 'Swap failed')
      }
    },
    [sendTransactionAsync, pollStatus],
  )

  return {
    step,
    error,
    orderId,
    txHash,
    explorerUrl,
    receiveAmount,
    executeSwap,
    reset,
    isLoading: !['idle', 'success', 'failed'].includes(step),
  }
}
