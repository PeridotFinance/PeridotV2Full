'use client'

/**
 * use-robinhood-tx-deps
 *
 * Wires lib/robinhood/tx.ts to the connected wallet: wagmi switches the chain
 * and sends, the Robinhood read client simulates and waits for receipts
 * (through the same-origin proxy when the public RPC is throttled).
 *
 * Every submitted hash is remembered in localStorage until it has a receipt,
 * so a timeout, a reload or a closed tab is reconciled against the hash
 * before the UI offers the same transaction again (guide section 11).
 * Storage is a convenience: if it is unavailable the flow still works, it
 * just cannot recover a hash across a reload.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount, useSendTransaction } from 'wagmi'
import type { Address, Hex } from 'viem'
import { ROBINHOOD_CHAIN_ID } from '@/config/robinhood'
import { getRobinhoodPublicClient } from '@/lib/robinhood/client'
import { useEnsureEvmChain } from './use-ensure-evm-chain'
import type { RobinhoodFlowDeps } from '@/lib/robinhood/flows'
import { requestRobinhoodRefresh } from './use-robinhood-refresh'

const STORAGE_KEY = 'peridot:robinhood:pending-tx'
const MAX_AGE_MS = 24 * 60 * 60 * 1000
const PENDING_EVENT = 'peridot:robinhood-pending'

export interface RobinhoodPendingTx {
  hash: Hex
  user: Address
  callId: string
  at: number
}

function load(): RobinhoodPendingTx[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const list = raw ? (JSON.parse(raw) as RobinhoodPendingTx[]) : []
    return Array.isArray(list) ? list.filter((e) => Date.now() - e.at < MAX_AGE_MS) : []
  } catch {
    return []
  }
}

function save(list: RobinhoodPendingTx[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Storage blocked: reconciliation within this page still works via state.
  }
  // Every hook instance keeps its own copy; this tells the others (the page
  // banner, a second form) that the list changed in this tab.
  try {
    window.dispatchEvent(new Event(PENDING_EVENT))
  } catch {
    // No window events (tests): the calling instance already has its state.
  }
}

export function useRobinhoodTxDeps() {
  const { address, chainId } = useAccount()
  const { ensureChain } = useEnsureEvmChain()
  const { sendTransactionAsync } = useSendTransaction()
  const [pending, setPending] = useState<RobinhoodPendingTx[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const sync = () => setPending(load())
    sync()
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) sync()
    }
    window.addEventListener(PENDING_EVENT, sync)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(PENDING_EVENT, sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const remember = useCallback((entry: RobinhoodPendingTx) => {
    const next = [...load().filter((e) => e.hash !== entry.hash), entry]
    save(next)
    setPending(next)
  }, [])

  const forget = useCallback((hash: Hex) => {
    const next = load().filter((e) => e.hash !== hash)
    save(next)
    setPending(next)
  }, [])

  const deps = useMemo<RobinhoodFlowDeps>(
    () => ({
      client: getRobinhoodPublicClient() as unknown as RobinhoodFlowDeps['client'],
      // Both wagmi and Privy's own wallet state: the embedded wallet signs on
      // the chain Privy's store says, not on the chain wagmi reports.
      ensureChain: () => ensureChain(ROBINHOOD_CHAIN_ID),
      send: (tx) => sendTransactionAsync({ to: tx.to, data: tx.data, value: tx.value, chainId: tx.chainId }),
      remember,
      forget,
    }),
    [ensureChain, sendTransactionAsync, remember, forget],
  )

  /**
   * Look up every remembered hash of this wallet. A receipt clears it and
   * triggers a refresh; no receipt leaves it pending. Returns what is still
   * open, so the caller can keep the retry button disabled.
   */
  const reconcile = useCallback(async (): Promise<RobinhoodPendingTx[]> => {
    const mine = load().filter((e) => !address || e.user.toLowerCase() === address.toLowerCase())
    if (mine.length === 0) return []
    const client = getRobinhoodPublicClient()
    let settled = false
    for (const entry of mine) {
      try {
        await client.getTransactionReceipt({ hash: entry.hash })
        forget(entry.hash)
        settled = true
      } catch {
        // Not mined (or not visible) yet.
      }
    }
    if (settled) requestRobinhoodRefresh()
    return load().filter((e) => !address || e.user.toLowerCase() === address.toLowerCase())
  }, [address, forget])

  const mine = useMemo(
    () => pending.filter((e) => !address || e.user.toLowerCase() === address.toLowerCase()),
    [pending, address],
  )

  return { deps, user: address as Address | undefined, onRobinhoodChain: chainId === ROBINHOOD_CHAIN_ID, pending: mine, reconcile, forget }
}
