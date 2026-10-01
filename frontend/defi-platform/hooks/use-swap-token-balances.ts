"use client"

import { useMemo } from 'react'
import { useBalance, useReadContracts } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import type { SwapToken } from '@/lib/swap/chains'
import { isNativeToken } from '@/lib/swap/bitget-chains'

export interface SwapTokenBalance {
  balance: number
  usdValue: number
}

export type SwapTokenBalancesMap = Map<string, SwapTokenBalance>

const isEvmHexAddress = (value: string | undefined | null): value is `0x${string}` =>
  typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)

/** Key used to look up a token's balance in the returned map. Native tokens collapse to ''. */
export const swapTokenBalanceKey = (address: string) =>
  isNativeToken(address) ? '' : address.toLowerCase()

export function useSwapTokenBalances({
  tokens,
  chainId,
  userAddress,
  enabled = true,
}: {
  tokens: SwapToken[]
  chainId: number | null | undefined
  userAddress: string | undefined
  enabled?: boolean
}): { balances: SwapTokenBalancesMap; isLoading: boolean } {
  const target = isEvmHexAddress(userAddress) ? userAddress : undefined

  const erc20Tokens = useMemo(
    () => tokens.filter((t) => !isNativeToken(t.address) && isEvmHexAddress(t.address)),
    [tokens],
  )

  const nativeToken = useMemo(
    () => tokens.find((t) => isNativeToken(t.address)),
    [tokens],
  )

  const contracts = useMemo(() => {
    const list: Array<{
      address: `0x${string}`
      abi: typeof erc20Abi
      functionName: 'balanceOf'
      args: [`0x${string}`]
      chainId: number
    }> = []
    if (!chainId || !target) return list
    erc20Tokens.forEach((t) => {
      list.push({
        address: t.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [target],
        chainId,
      })
    })
    return list
  }, [erc20Tokens, chainId, target])

  const { data: erc20Results, isLoading: isLoadingErc20 } = useReadContracts({
    contracts,
    query: { enabled: enabled && contracts.length > 0 },
  })

  const { data: nativeBalance, isLoading: isLoadingNative } = useBalance({
    address: target,
    chainId: chainId ?? undefined,
    query: { enabled: enabled && !!target && !!nativeToken && !!chainId },
  })

  const balances = useMemo(() => {
    const map: SwapTokenBalancesMap = new Map()
    if (!chainId || !target) return map

    erc20Tokens.forEach((token, i) => {
      const r = erc20Results?.[i]
      if (r?.status !== 'success') return
      const raw = r.result as bigint
      if (!raw || raw === 0n) return
      const fmt = Number(formatUnits(raw, token.decimals))
      const usdValue = (token.usdPrice ?? 0) * fmt
      map.set(token.address.toLowerCase(), { balance: fmt, usdValue })
    })

    if (nativeToken && nativeBalance && nativeBalance.value > 0n) {
      const fmt = Number(formatUnits(nativeBalance.value, nativeBalance.decimals))
      const usdValue = (nativeToken.usdPrice ?? 0) * fmt
      map.set(swapTokenBalanceKey(nativeToken.address), { balance: fmt, usdValue })
    }

    return map
  }, [erc20Tokens, erc20Results, nativeToken, nativeBalance, chainId, target])

  return { balances, isLoading: isLoadingErc20 || isLoadingNative }
}
