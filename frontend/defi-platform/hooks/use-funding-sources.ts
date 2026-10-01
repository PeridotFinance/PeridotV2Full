"use client"

/**
 * Everywhere the user holds money the cross-chain engine can move: the stables
 * and native coin on every EVM network with a SODAX route, plus USDC and XLM in
 * the Stellar wallet. Only what holds something, largest first, which is what a
 * "Pay with" picker lists.
 *
 * The general form of `use-cross-chain-top-up`, which answers the same
 * question for CCTP and native USDC only and stays as it is for Easy mode.
 * Token addresses and decimals come from SODAX's list through
 * `/api/crosschain/tokens` (never a hand-kept table: USDC is 18 decimals on BNB
 * Smart Chain), dollar values from the prices it returns.
 *
 * A chain whose RPC does not answer is left out rather than shown as zero: we do
 * not know that the user has nothing there.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { useConfig } from "wagmi"
import { getBalance, readContract } from "wagmi/actions"
import { erc20Abi, formatUnits, type Hex } from "viem"
import { stellarGetTokenBalance } from "@/lib/stellar-soroban-lending"
import { xcApi, type XcTokenInfo } from "@/lib/crosschain/client"
import { isNativeToken, XC_EVM_CHAIN_IDS, type XcChain } from "@/lib/crosschain/route"

export interface FundingSource {
  chain: XcChain
  chainName: string
  token: XcTokenInfo
  /** Smallest unit. */
  balance: bigint
  /** Whole tokens, for display and arithmetic that tolerates float. */
  amount: number
  /** Dollar value; null when nothing priced the token. */
  usd: number | null
  isNative: boolean
}

export interface UseFundingSourcesInput {
  evmAddress?: string | null
  stellarAddress?: string | null
  enabled?: boolean
}

const TOKENS_STALE_MS = 10 * 60_000

export function useFundingSources({ evmAddress, stellarAddress, enabled = true }: UseFundingSourcesInput) {
  const config = useConfig()
  const queryClient = useQueryClient()

  const chains = useMemo(
    () => config.chains.filter((c) => (XC_EVM_CHAIN_IDS as readonly number[]).includes(c.id)),
    [config.chains],
  )

  const tokensFor = useCallback(
    (chain: XcChain) =>
      queryClient.fetchQuery({
        queryKey: ["xc-tokens", chain],
        queryFn: async () => (await xcApi.tokens(chain)).tokens,
        staleTime: TOKENS_STALE_MS,
      }),
    [queryClient],
  )

  const query = useQuery({
    queryKey: ["xc-funding-sources", evmAddress ?? null, stellarAddress ?? null, chains.map((c) => c.id).join(",")],
    enabled: enabled && Boolean(evmAddress || stellarAddress),
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<FundingSource[]> => {
      const jobs: Promise<FundingSource[]>[] = []

      if (evmAddress) {
        for (const chain of chains) {
          jobs.push(
            (async () => {
              const tokens = await tokensFor(chain.id)
              const rows = await Promise.all(
                tokens.map(async (token): Promise<FundingSource | null> => {
                  const native = isNativeToken(chain.id, token)
                  const balance = native
                    ? (await getBalance(config, { address: evmAddress as Hex, chainId: chain.id })).value
                    : await readContract(config, {
                        chainId: chain.id,
                        address: token.address as Hex,
                        abi: erc20Abi,
                        functionName: "balanceOf",
                        args: [evmAddress as Hex],
                      })
                  return toSource(chain.id, chain.name, token, balance, native)
                }),
              )
              return rows.filter((r): r is FundingSource => r !== null)
            })(),
          )
        }
      }

      if (stellarAddress) {
        jobs.push(
          (async () => {
            const tokens = await tokensFor("stellar")
            const rows = await Promise.all(
              tokens.map(async (token) =>
                toSource("stellar", "Stellar", token, BigInt(await stellarGetTokenBalance(token.address, stellarAddress)), false),
              ),
            )
            return rows.filter((r): r is FundingSource => r !== null)
          })(),
        )
      }

      const settled = await Promise.allSettled(jobs)
      const sources = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []))
      return sortSources(sources)
    },
  })

  return {
    sources: query.data ?? [],
    isLoading: query.isLoading,
    /** Balances were read at least once; an empty list then means "holds nothing". */
    isFetched: query.isFetched,
    refresh: query.refetch,
  }
}

function toSource(chain: XcChain, chainName: string, token: XcTokenInfo, balance: bigint, isNative: boolean): FundingSource | null {
  if (balance <= BigInt(0)) return null
  const amount = Number(formatUnits(balance, token.decimals))
  return {
    chain,
    chainName,
    token,
    balance,
    amount,
    usd: token.usdPrice == null ? null : amount * token.usdPrice,
    isNative,
  }
}

/** Largest dollar value first; unpriced sources after every priced one. */
export function sortSources(sources: FundingSource[]): FundingSource[] {
  return [...sources].sort((a, b) => {
    if (a.usd == null && b.usd == null) return b.amount - a.amount
    if (a.usd == null) return 1
    if (b.usd == null) return -1
    return b.usd - a.usd
  })
}
