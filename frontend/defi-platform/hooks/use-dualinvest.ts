"use client"

import { useMemo, useCallback } from "react"
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi"
import { getDualInvestmentAddresses, DualInvestmentAddresses } from "@/config/contracts"
import managerAbi from "@/app/abis/DualinvestmentManagerAbi.json"
import settlementAbi from "@/app/abis/SettlementEngineAbi.json"
import { getMarketsForChain, getAssetContractAddresses } from "@/data/market-data"
import { useActiveWallet } from "@/hooks/use-active-wallet"

// Minimal ERC20 ABI subset
const erc20Abi = [
  { "type": "function", "name": "decimals", "stateMutability": "view", "inputs": [], "outputs": [{"name":"","type":"uint8"}] },
  { "type": "function", "name": "symbol", "stateMutability": "view", "inputs": [], "outputs": [{"name":"","type":"string"}] },
  { "type": "function", "name": "balanceOf", "stateMutability": "view", "inputs": [{"name":"account","type":"address"}], "outputs": [{"name":"","type":"uint256"}] },
  { "type": "function", "name": "allowance", "stateMutability": "view", "inputs": [{"name":"owner","type":"address"},{"name":"spender","type":"address"}], "outputs": [{"name":"","type":"uint256"}] },
  { "type": "function", "name": "approve", "stateMutability": "nonpayable", "inputs": [{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}], "outputs": [{"name":"","type":"bool"}] }
 ] as const

export function useDualInvestmentAddresses(): DualInvestmentAddresses | null {
  const chainId = useChainId()
  return useMemo(() => getDualInvestmentAddresses(chainId) ?? null, [chainId])
}

export function useDualConstraints() {
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId })
  const addresses = useDualInvestmentAddresses()
  const managerAddress = addresses?.managerImplementation as `0x${string}` | undefined

  const getExpiryBounds = useCallback(async () => {
    if (!managerAddress || !publicClient) return null
    try {
      const [minAllowed, maxAllowed] = await publicClient.readContract({
        address: managerAddress,
        abi: managerAbi as any,
        functionName: "getExpiryBounds",
        args: [],
      }) as [bigint, bigint]
      return { minAllowed, maxAllowed }
    } catch {
      return null
    }
  }, [managerAddress, publicClient])

  const getPositionSizeBounds = useCallback(async () => {
    if (!managerAddress || !publicClient) return null
    try {
      const [minPositionSize, maxPositionSize] = await Promise.all([
        publicClient.readContract({ address: managerAddress, abi: managerAbi as any, functionName: "minPositionSize", args: [] }) as Promise<bigint>,
        publicClient.readContract({ address: managerAddress, abi: managerAbi as any, functionName: "maxPositionSize", args: [] }) as Promise<bigint>,
      ])
      return { minPositionSize, maxPositionSize }
    } catch {
      return null
    }
  }, [managerAddress, publicClient])

  return { getExpiryBounds, getPositionSizeBounds }
}

export function useDualCanEnter() {
  const { address } = useActiveWallet()
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId })
  const addresses = useDualInvestmentAddresses()
  const managerAddress = addresses?.managerImplementation as `0x${string}` | undefined

  const canEnter = useCallback(async (params: { cTokenIn: `0x${string}`; amount: bigint; useCollateral: boolean }) => {
    if (!managerAddress || !publicClient || !address) return { canEnter: false, reason: "wallet-not-connected" }
    try {
      // eslint-disable-next-line no-console
      console.log('[DualInvest:canEnter] request', { managerAddress, user: address, ...params, amount: String(params.amount) })
      const [canEnter, reason] = await publicClient.readContract({
        address: managerAddress,
        abi: managerAbi as any,
        functionName: "canEnterPosition",
        args: [address, params.cTokenIn, params.amount, params.useCollateral],
      }) as [boolean, string]
      // eslint-disable-next-line no-console
      console.log('[DualInvest:canEnter] result', { canEnter, reason })
      return { canEnter, reason }
    } catch (e: any) {
      return { canEnter: false, reason: e?.shortMessage || e?.message || "unknown-error" }
    }
  }, [managerAddress, publicClient, address])

  return { canEnter }
}

export function useTokenAllowance(token?: `0x${string}`, spender?: `0x${string}`) {
  const { address } = useActiveWallet()
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId })
  const { data: walletClient } = useWalletClient({ chainId })

  const read = useCallback(async () => {
    if (!token || !spender || !address || !publicClient) return BigInt(0)
    try {
      const value = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [address, spender] }) as bigint
      return value
    } catch {
      return BigInt(0)
    }
  }, [token, spender, address, publicClient])

  const approve = useCallback(async (amount: bigint) => {
    if (!token || !spender || !walletClient) throw new Error("missing-params")
    return walletClient.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amount],
      chain: undefined,
      account: address as `0x${string}`,
    })
  }, [token, spender, walletClient, address])

  return { read, approve }
}

export function useDualEnterPosition() {
  const chainId = useChainId()
  const addresses = useDualInvestmentAddresses()
  const { data: walletClient } = useWalletClient({ chainId })
  const { address } = useActiveWallet()
  const managerAddress = addresses?.managerImplementation as `0x${string}` | undefined

  const enterPosition = useCallback(async (args: {
    cTokenIn: `0x${string}`
    cTokenOut: `0x${string}`
    amount: bigint
    direction: number // 0=CALL (sell high), 1=PUT (buy low)
    strike: bigint
    expiry: bigint
    useCollateral: boolean
    enableAutoCompound?: boolean
  }) => {
    if (!managerAddress || !walletClient) throw new Error("wallet-or-addresses-missing")
    const enableAutoCompound = args.enableAutoCompound ?? false
    return walletClient.writeContract({
      address: managerAddress,
      abi: managerAbi as any,
      functionName: "enterPosition",
      args: [args.cTokenIn, args.cTokenOut, args.amount, args.direction, args.strike, args.expiry, args.useCollateral, enableAutoCompound],
      chain: undefined,
      account: address as `0x${string}`,
    })
  }, [managerAddress, walletClient, address])

  const borrowAndEnterPosition = useCallback(async (args: {
    cToken: `0x${string}`
    cTokenOut: `0x${string}`
    borrowUnderlyingAmount: bigint
    direction: number
    strike: bigint
    expiry: bigint
  }) => {
    if (!managerAddress || !walletClient) throw new Error("wallet-or-addresses-missing")
    return walletClient.writeContract({
      address: managerAddress,
      abi: managerAbi as any,
      functionName: "borrowAndEnterPosition",
      args: [args.cToken, args.cTokenOut, args.borrowUnderlyingAmount, args.direction, args.strike, args.expiry],
      chain: undefined,
      account: address as `0x${string}`,
    })
  }, [managerAddress, walletClient, address])

  const enterPositionWithBorrowed = useCallback(async (args: {
    cToken: `0x${string}`
    cTokenOut: `0x${string}`
    underlyingAmount: bigint
    direction: number
    strike: bigint
    expiry: bigint
  }) => {
    if (!managerAddress || !walletClient) throw new Error("wallet-or-addresses-missing")
    return walletClient.writeContract({
      address: managerAddress,
      abi: managerAbi as any,
      functionName: "enterPositionWithBorrowed",
      args: [args.cToken, args.cTokenOut, args.underlyingAmount, args.direction, args.strike, args.expiry],
      chain: undefined,
      account: address as `0x${string}`,
    })
  }, [managerAddress, walletClient, address])

  return { enterPosition, borrowAndEnterPosition, enterPositionWithBorrowed }
}

export function useDualPositions() {
  const { address } = useActiveWallet()
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId })
  const addresses = useDualInvestmentAddresses()

  // Simple discovery via PositionEntered logs
  const findUserPositions = useCallback(async (fromBlock?: bigint, toBlock?: bigint) => {
    if (!addresses?.managerImplementation || !publicClient || !address) return [] as Array<{ tokenId: bigint }>
    try {
      const eventSig = (managerAbi as any).find((f: any) => f.type === 'event' && f.name === 'PositionEntered')
      if (!eventSig) return []
      const currentBlock = await publicClient.getBlockNumber()
      const twoHundredK = BigInt("200000")
      const safeFrom = fromBlock ?? (currentBlock > twoHundredK ? currentBlock - twoHundredK : BigInt(0))
      const logs = await publicClient.getLogs({
        address: addresses.managerImplementation as `0x${string}`,
        event: eventSig as any,
        args: { user: address },
        fromBlock: safeFrom,
        toBlock: toBlock ?? 'latest',
      } as any)
      const tokenIds: Array<{ tokenId: bigint }> = []
      for (const l of logs as any[]) {
        const tokenId = l.args?.tokenId as bigint | undefined
        if (typeof tokenId === 'bigint') tokenIds.push({ tokenId })
      }
      return tokenIds
    } catch {
      return []
    }
  }, [addresses, publicClient, address])

  const getPositionInfo = useCallback(async (tokenId: bigint) => {
    if (!addresses?.managerImplementation || !publicClient) return null
    try {
      const [position, canSettle, isSettled] = await publicClient.readContract({
        address: addresses.managerImplementation as `0x${string}`,
        abi: managerAbi as any,
        functionName: "getPositionInfo",
        args: [tokenId],
      }) as [any, boolean, boolean]
      return { position, canSettle, isSettled }
    } catch {
      return null
    }
  }, [addresses, publicClient])

  return { findUserPositions, getPositionInfo }
}

export function useDualSettlement() {
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId })
  const { data: walletClient } = useWalletClient({ chainId })
  const addresses = useDualInvestmentAddresses()
  const { address } = useActiveWallet()

  const canSettlePosition = useCallback(async (tokenId: bigint) => {
    if (!addresses || !publicClient) return { canSettle: false, reason: "missing-addresses" }
    try {
      const [canSettle, reason] = await publicClient.readContract({
        address: addresses.settlementEngine as `0x${string}`,
        abi: settlementAbi as any,
        functionName: "canSettlePosition",
        args: [tokenId],
      }) as [boolean, string]
      return { canSettle, reason }
    } catch (e: any) {
      return { canSettle: false, reason: e?.shortMessage || e?.message || "unknown-error" }
    }
  }, [addresses, publicClient])

  const settlePosition = useCallback(async (tokenId: bigint, user: `0x${string}`) => {
    if (!addresses || !walletClient) throw new Error("wallet-or-addresses-missing")
    return walletClient.writeContract({
      address: addresses.settlementEngine as `0x${string}`,
      abi: settlementAbi as any,
      functionName: "settlePosition",
      args: [tokenId, user],
      chain: undefined,
      account: address as `0x${string}`,
    })
  }, [addresses, walletClient, address])

  return { canSettlePosition, settlePosition }
}

// Discover which cTokens are integrated/supported by the Manager on the current chain
export function useDualSupportedMarkets() {
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId })
  const addresses = useDualInvestmentAddresses()

  const list = useCallback(async () => {
    if (!addresses?.managerImplementation || !publicClient) return { integrated: [] as string[], supported: [] as string[] }
    const markets = getMarketsForChain(chainId)
    const pTokens = markets
      .filter(m => m.hasSmartContract)
      .map(m => getAssetContractAddresses(m.id, chainId)?.pTokenAddress)
      .filter(Boolean) as `0x${string}`[]

    const integrated: string[] = []
    const supported: string[] = []

    for (const c of pTokens) {
      try {
        const okIntegrated = await publicClient.readContract({ address: addresses.managerImplementation as `0x${string}`, abi: managerAbi as any, functionName: 'protocolIntegratedMarkets', args: [c] }) as boolean
        if (okIntegrated) integrated.push(c.toLowerCase())
      } catch {}
      try {
        const okSupported = await publicClient.readContract({ address: addresses.managerImplementation as `0x${string}`, abi: managerAbi as any, functionName: 'supportedCTokens', args: [c] }) as boolean
        if (okSupported) supported.push(c.toLowerCase())
      } catch {}
    }

    return { integrated, supported }
  }, [addresses, publicClient, chainId])

  return { list }
}

// Centralized diagnostics to confirm manager initialization and market flags
export function useDualDiagnostics() {
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId })
  const addresses = useDualInvestmentAddresses()
  const managerAddress = addresses?.managerImplementation as `0x${string}` | undefined

  const getManagerDiagnostics = useCallback(async (params: { cTokenIn: `0x${string}`; cTokenOut?: `0x${string}` }) => {
    if (!publicClient || !managerAddress) return null
    try {
      const [owner, positionToken, vaultExecutor, settlementEngine, borrowRouter, riskGuard, peridottroller] = await Promise.all([
        publicClient.readContract({ address: managerAddress, abi: managerAbi as any, functionName: 'owner', args: [] }) as Promise<`0x${string}`>,
        publicClient.readContract({ address: managerAddress, abi: managerAbi as any, functionName: 'positionToken', args: [] }) as Promise<`0x${string}`>,
        publicClient.readContract({ address: managerAddress, abi: managerAbi as any, functionName: 'vaultExecutor', args: [] }) as Promise<`0x${string}`>,
        publicClient.readContract({ address: managerAddress, abi: managerAbi as any, functionName: 'settlementEngine', args: [] }) as Promise<`0x${string}`>,
        publicClient.readContract({ address: managerAddress, abi: managerAbi as any, functionName: 'borrowRouter', args: [] }) as Promise<`0x${string}`>,
        publicClient.readContract({ address: managerAddress, abi: managerAbi as any, functionName: 'riskGuard', args: [] }) as Promise<`0x${string}`>,
        publicClient.readContract({ address: managerAddress, abi: managerAbi as any, functionName: 'peridottroller', args: [] }) as Promise<`0x${string}`>,
      ])
      const expiry = await publicClient.readContract({ address: managerAddress, abi: managerAbi as any, functionName: 'getExpiryBounds', args: [] }) as [bigint, bigint]
      const minPos = await publicClient.readContract({ address: managerAddress, abi: managerAbi as any, functionName: 'minPositionSize', args: [] }) as bigint
      const maxPos = await publicClient.readContract({ address: managerAddress, abi: managerAbi as any, functionName: 'maxPositionSize', args: [] }) as bigint
      const supportedIn = await publicClient.readContract({ address: managerAddress, abi: managerAbi as any, functionName: 'supportedCTokens', args: [params.cTokenIn] }) as boolean
      const integratedIn = await publicClient.readContract({ address: managerAddress, abi: managerAbi as any, functionName: 'protocolIntegratedMarkets', args: [params.cTokenIn] }) as boolean
      let supportedOut: boolean | undefined = undefined
      if (params.cTokenOut) {
        try { supportedOut = await publicClient.readContract({ address: managerAddress, abi: managerAbi as any, functionName: 'supportedCTokens', args: [params.cTokenOut] }) as boolean } catch {}
      }
      return {
        chainId,
        manager: managerAddress,
        pointers: { owner, positionToken, vaultExecutor, settlementEngine, borrowRouter, riskGuard, peridottroller },
        bounds: { minExpiry: expiry?.[0], maxExpiry: expiry?.[1], minPositionSize: minPos, maxPositionSize: maxPos },
        markets: { cTokenIn: params.cTokenIn, supportedIn, integratedIn, cTokenOut: params.cTokenOut, supportedOut },
      }
    } catch {
      return null
    }
  }, [publicClient, managerAddress, chainId])

  return { getManagerDiagnostics }
}


