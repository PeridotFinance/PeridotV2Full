"use client"

/**
 * The EVM wallet behind a cross-chain transfer: its address, and how to send
 * from it.
 *
 * Two ways to send, picked per wallet:
 *
 *   - **Through wagmi**, for MetaMask and the like, and for the embedded wallet
 *     in Expert. This is the path the Expert flows have always used; the
 *     embedded wallet shows Privy's confirmation window on it.
 *   - **Silently through Privy**, for the embedded wallet when the caller asks
 *     for it (Easy mode). The user pressed one button and sees one progress
 *     bar; a second window asking to confirm a transaction they cannot read
 *     adds nothing. The wallet pays its own fee, there is no sponsoring here:
 *     money that arrives as the chain's own coin brings its fee with it.
 *
 * If the silent send fails, the window is the fallback, but only after the
 * account's pending nonce has shown that nothing left the wallet
 * (`mayRetryAfterSilentFailure`). When the nonce did move, the transaction went
 * out although the call threw: it is looked up in the blocks since, and its
 * hash is returned as if the call had answered. The transfer is stored before
 * the signature, so a hash is all that is needed to carry it to the end.
 */
import { useCallback, useMemo } from "react"
import { useAccount, useConfig } from "wagmi"
import { getBlock, getBlockNumber, getTransactionCount, sendTransaction } from "wagmi/actions"
import type { Hex } from "viem"
import { useSendTransaction, useWallets } from "@privy-io/react-auth"
import { useEnsureEvmChain } from "@/hooks/use-ensure-evm-chain"
import { isUserRejection, xcError } from "@/lib/crosschain/errors"
import { XcClientError } from "@/lib/crosschain/client"
import { mayRetryAfterSilentFailure, pickXcEvmWallet, type XcEvmWalletChoice } from "@/lib/crosschain/evm-wallet"
import type { SodaxRawTx } from "@/lib/crosschain/sodax"

const NONCE_SETTLE_MS = 2_500
/** Blocks searched for a transaction that went out although the call threw. */
const FIND_SENT_MAX_BLOCKS = 40
const FIND_SENT_ROUNDS = 4
const FIND_SENT_PAUSE_MS = 3_000

export interface UseXcEvmWalletOptions {
  /** Sign with the embedded wallet without a confirmation window. */
  silentEmbedded?: boolean
}

export interface XcEvmWallet {
  wallet: XcEvmWalletChoice | null
  /** True when sends from this wallet need no click in a wallet window. */
  silent: boolean
  /** Put the wallet on `chainId`. A no-op on the silent path, which names the chain per transaction. */
  prepare: (chainId: number) => Promise<void>
  send: (chainId: number, from: string, tx: SodaxRawTx) => Promise<Hex>
}

export function useXcEvmWallet({ silentEmbedded = false }: UseXcEvmWalletOptions = {}): XcEvmWallet {
  const config = useConfig()
  const { address: wagmiAddress } = useAccount()
  const { wallets } = useWallets()
  const { ensureChain } = useEnsureEvmChain()
  const { sendTransaction: privySend } = useSendTransaction()

  const wallet = useMemo(() => pickXcEvmWallet(wagmiAddress, wallets), [wagmiAddress, wallets])
  const silent = !!wallet?.embedded && silentEmbedded

  const pendingNonce = useCallback(
    async (chainId: number, address: string): Promise<number | null> => {
      try {
        return await getTransactionCount(config, { address: address as Hex, chainId, blockTag: "pending" })
      } catch {
        return null
      }
    },
    [config],
  )

  /** The transaction `from` sent with `nonce`, in the blocks after `since`. */
  const findSent = useCallback(
    async (chainId: number, from: string, nonce: number, since: bigint): Promise<Hex | null> => {
      let next = since + BigInt(1)
      for (let round = 0; round < FIND_SENT_ROUNDS; round++) {
        try {
          const head = await getBlockNumber(config, { chainId })
          const last = head - next >= BigInt(FIND_SENT_MAX_BLOCKS) ? next + BigInt(FIND_SENT_MAX_BLOCKS) - BigInt(1) : head
          for (let n = next; n <= last; n++) {
            const block = await getBlock(config, { chainId, blockNumber: n, includeTransactions: true })
            const hit = block.transactions.find(
              (t) => t.from.toLowerCase() === from.toLowerCase() && t.nonce === nonce,
            )
            if (hit) return hit.hash
          }
          next = last + BigInt(1)
        } catch {
          /* a block that did not load is read again in the next round */
        }
        await new Promise((r) => setTimeout(r, FIND_SENT_PAUSE_MS))
      }
      return null
    },
    [config],
  )

  const prepare = useCallback(
    async (chainId: number) => {
      if (silent) return
      if (!wallet?.viaWagmi) {
        throw new XcClientError(xcError("unsupported", "No wallet is connected for this network."), 0)
      }
      await ensureChain(chainId)
    },
    [ensureChain, silent, wallet?.viaWagmi],
  )

  const send = useCallback(
    async (chainId: number, from: string, tx: SodaxRawTx): Promise<Hex> => {
      const viaWagmi = () =>
        sendTransaction(config, {
          account: from as Hex,
          chainId,
          to: tx.to as Hex,
          data: tx.data as Hex,
          value: BigInt(tx.value || "0"),
        })
      if (!silent) return viaWagmi()

      const viaPrivy = async (showWalletUIs: boolean): Promise<Hex> => {
        const res = await privySend(
          { to: tx.to as Hex, data: tx.data as Hex, value: BigInt(tx.value || "0"), chainId },
          { address: from, uiOptions: { showWalletUIs } },
        )
        return ((res as { hash?: string })?.hash ?? (res as unknown as string)) as Hex
      }

      const [before, since] = await Promise.all([
        pendingNonce(chainId, from),
        getBlockNumber(config, { chainId }).catch(() => null),
      ])
      try {
        return await viaPrivy(false)
      } catch (e) {
        if (isUserRejection(e)) throw e
        await new Promise((r) => setTimeout(r, NONCE_SETTLE_MS))
        const after = await pendingNonce(chainId, from)
        if (!mayRetryAfterSilentFailure(before, after)) {
          if (before != null && since != null) {
            const sent = await findSent(chainId, from, before, since)
            if (sent) return sent
          }
          throw new XcClientError(
            xcError(
              "unknown",
              "We could not confirm whether this was sent. Check your balance before you try again.",
            ),
            0,
          )
        }
        console.warn("[xc] silent send failed, asking in the wallet window instead:", e)
        return viaPrivy(true)
      }
    },
    [config, findSent, pendingNonce, privySend, silent],
  )

  return { wallet, silent, prepare, send }
}
