"use client"

/**
 * The user's USDC on every chain a cross-chain deposit could start from.
 *
 * Deliberately **not** `useCrossChainWalletBalances`: that hook resolves token
 * addresses from `data/market-data`, which is the right source for the lending
 * markets and the wrong one here. CCTP burns Circle-issued native USDC only, and
 * on some chains the address a market list would hand back is the bridged
 * variant — Optimism's `0x7F5c764c…` (USDC.e) sits right next to the native
 * `0x0b2C639c…`, looks identical in a balance row, and reverts the burn. So this
 * reads `CCTP_USDC_ADDRESSES`, the list that was verified against Circle's own
 * deployment, and nothing else.
 *
 * Balances come back sorted by size: the deposit UI wants to propose the one
 * obvious source, not present a table of eight chains.
 */

import { useMemo } from "react"
import { useAccount, useReadContracts } from "wagmi"
import { erc20Abi, formatUnits } from "viem"
import { CCTP_USDC_ADDRESSES, listCctpSourceChainIds } from "@/config/cctp"
import { chainConfigs } from "@/config/contracts"

/** One entry of a `useReadContracts` response, narrowed to what we read. */
type ReadResult = { status: "success"; result: unknown } | { status: "failure" }

export interface CctpSourceBalance {
  chainId: number
  chainName: string
  /** USDC, human-readable. */
  balance: number
}

export interface UseCctpSourceBalances {
  balances: CctpSourceBalance[]
  /** The chain holding the most USDC, or null when the user holds none anywhere. */
  best: CctpSourceBalance | null
  /** Sum across all source chains — what "you have $X elsewhere" should say. */
  total: number
  isLoading: boolean
}

/** Readable name for a chain id, falling back to something honest. */
function chainName(chainId: number): string {
  const entry = Object.values(chainConfigs as Record<string, { chainId?: number; chainNameReadable?: string }>).find(
    (c) => c?.chainId === chainId,
  )
  return entry?.chainNameReadable ?? `Chain ${chainId}`
}

export function useCctpSourceBalances(enabled = true): UseCctpSourceBalances {
  const { address, isConnected } = useAccount()

  const chainIds = useMemo(() => listCctpSourceChainIds(), [])

  const contracts = useMemo(() => {
    if (!address || !isConnected || !enabled) return []
    return chainIds.map((chainId) => ({
      chainId,
      address: CCTP_USDC_ADDRESSES[chainId] as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [address] as const,
    }))
  }, [address, isConnected, enabled, chainIds])

  // wagmi infers a result tuple per contract entry and, over a dynamic list of
  // eight chains, that inference blows past TypeScript's depth limit. The shape
  // is fixed where `contracts` is built above, and every result is checked for
  // `status === "success"` before it is read, so narrowing it here by hand
  // loses no safety that the compiler was actually providing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading } = (useReadContracts as any)({
    contracts,
    query: {
      enabled: contracts.length > 0,
      // Balances on chains the user is not looking at do not need to be fresh to
      // the second, and each refetch is one RPC call per chain.
      staleTime: 30_000,
      refetchInterval: 60_000,
    },
  }) as { data: ReadResult[] | undefined; isLoading: boolean }

  return useMemo(() => {
    const balances: CctpSourceBalance[] = []
    chainIds.forEach((chainId, i) => {
      const entry = data?.[i]
      // A chain whose RPC failed is simply absent. Reporting 0 would tell the
      // user they have no money there, which we do not know.
      if (!entry || entry.status !== "success") return
      const balance = Number(formatUnits(entry.result as bigint, 6))
      if (balance > 0) balances.push({ chainId, chainName: chainName(chainId), balance })
    })
    balances.sort((a, b) => b.balance - a.balance)
    return {
      balances,
      best: balances[0] ?? null,
      total: balances.reduce((sum, b) => sum + b.balance, 0),
      isLoading,
    }
  }, [data, chainIds, isLoading])
}
