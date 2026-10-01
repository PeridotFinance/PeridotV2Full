import { useAccount, useReadContracts } from 'wagmi'
import { useState, useEffect, useMemo, useRef } from 'react'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { formatUnits, type Abi } from 'viem'
import { getMarketsForChain, getAssetContractAddresses } from '@/data/market-data'
import { chainConfigs, getChainConfig, resolveHubReadChainId, getDefaultHubChainId, isHubChain } from '@/config/contracts'
import { isEvmAddress } from '@/config/contracts'
import { networks } from '@/config'
import priceOracleAbi from '@/app/abis/PriceOracle.json'
import type { LiveApyData } from '@/hooks/use-apy-data'
import { useNetworkContext } from '@/context'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useAuthedFetch } from '@/hooks/use-authed-fetch'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'
import { STELLAR_PORTFOLIO_POSITIONS_QUERY_KEY, useStellarPortfolioPositions } from '@/hooks/use-stellar-portfolio-positions'
import { useQuery, useQueryClient } from '@tanstack/react-query'

const balanceOfUnderlyingAbi = [{
  name: 'balanceOfUnderlying',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }]
}] as const;

const borrowBalanceStoredAbi = [{
  name: 'borrowBalanceStored',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }]
}] as const;

// Helper function to safely get the oracle address
function getOracleAddress(chainConfig: any): `0x${string}` | null {
  if (chainConfig && typeof chainConfig === 'object') {
    if ('oracle' in chainConfig && chainConfig.oracle) {
      return chainConfig.oracle as `0x${string}`;
    }
    if ('simplePriceOracle' in chainConfig && chainConfig.simplePriceOracle) {
      return chainConfig.simplePriceOracle as `0x${string}`;
    }
  }
  return null;
}

interface TokenPosition {
  assetId: string
  icon: string
  symbol: string
  chainId: number
  chainName: string
  suppliedBalance: number
  borrowedBalance: number
  suppliedValueUSD: number
  borrowedValueUSD: number
  priceUSD: number
  decimals: number
  pTokenAddress: string
  marketData: any // Add marketData to store collateral factor etc.
}

interface ChainBalance {
  chainId: number
  chainName: string
  totalSupplied: number
  totalBorrowed: number
  liquidity: number
  shortfall: number
  supplyEarningsUSD: number
  supplyRewardsUSD: number
  borrowCostsUSD: number
  borrowRewardsUSD: number
  netEarningsUSD: number
  positions: TokenPosition[]
}

interface CrossChainBalances {
  totalSupplied: number
  totalBorrowed: number
  borrowLimit: number
  borrowLimitUsed: number
  netAPY: number
  liveNetAPY: number // Raw computed APY from on-chain/live data
  weightedSupplyAPY: number  // Average supply APY across all positions
  weightedBorrowAPY: number  // Average borrow APY across all positions
  weightedSupplyRewardsAPY: number
  weightedBorrowRewardsAPY: number
  supplyEarningsUSD: number
  supplyRewardsUSD: number
  borrowCostsUSD: number
  borrowRewardsUSD: number
  netEarningsUSD: number
  chainBalances: ChainBalance[]
  allPositions: TokenPosition[]
  isLoading: boolean
  error: string | null
}

type ProcessedBalances = Omit<CrossChainBalances, 'isLoading' | 'error'>

export function useCrossChainBalances(liveApyData?: LiveApyData): CrossChainBalances {
  const { chainId, address: eoaAddress } = useAccount()
  const { address, isConnected } = useActiveWallet()
  const { authedFetch, authReady } = useAuthedFetch()
  const { selectedNetworkId } = useNetworkContext()
  const queryClient = useQueryClient()
  const isEvmActiveAddress = Boolean(address && isEvmAddress(address))
  // EVM address resolved independently of the selected network. When the user is
  // on Stellar, the active wallet (above) is the Stellar G-address — but a linked
  // embedded EVM wallet is usually still connected (e.g. on BSC). The portfolio
  // snapshot endpoint resolves *linked* EVM wallets, so querying it with this
  // address keeps DEPOSITED at EVM + Stellar while viewing Stellar instead of
  // collapsing to the Stellar-only total.
  const evmAddress = useMemo<`0x${string}` | null>(() => {
    if (isEvmActiveAddress) return address as `0x${string}`
    if (eoaAddress && isEvmAddress(eoaAddress)) return eoaAddress as `0x${string}`
    return null
  }, [isEvmActiveAddress, address, eoaAddress])
  // Pull the Stellar address straight from Freighter, independent of which
  // network the user has selected. Otherwise the Stellar position query is
  // disabled whenever the user is on an EVM network selection — even though
  // their Freighter wallet is connected and has live deposits.
  const stellarWallet = useStellarWallet()
  const stellarAddress = useMemo(
    () => (stellarWallet.address ? stellarWallet.address : null),
    [stellarWallet.address]
  )
  const {
    positions: stellarPositions,
    isLoading: isStellarPositionsLoading,
    refetch: refetchStellarPositions,
  } = useStellarPortfolioPositions(stellarAddress)
  
  const [isLoadingState, setIsLoadingState] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);
  
  const lastPostedRef = useRef<Record<string, { supplied: number, borrowed: number, notional: number }>>({})
  const lastPortfolioPostedRef = useRef<{ netApy: number, totalSupply: number, totalBorrow: number } | null>(null)
  const lastComputedPortfolioRef = useRef<{
    payload: any,
    gates: { hasApyEstimates: boolean, coverageSufficient: boolean, multicallCoverageOk: boolean },
    totals: { totalSupplied: number, totalBorrowed: number }
  } | null>(null)
  const lastImmediatePortfolioPostAtRef = useRef<number>(0)

  const SNAPSHOT_TTL_MS = 5 * 60 * 1000

  // Visibility state to avoid background polling when tab is hidden
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (typeof document === 'undefined') return true
    return document.visibilityState === 'visible'
  })

  useEffect(() => {
    const onVis = () => setIsVisible(document.visibilityState === 'visible')
    try { document.addEventListener('visibilitychange', onVis) } catch {}
    return () => { try { document.removeEventListener('visibilitychange', onVis) } catch {} }
  }, [])

  // DB-first snapshot fetch using React Query.
  // Keyed on the resolved EVM address (not the active wallet) so it ALSO fires
  // when the user is viewing Stellar but has a linked EVM wallet connected. The
  // portfolio-data endpoint resolves linked EVM wallets and returns the full EVM
  // portfolio, which then gets merged with live Stellar positions below — so
  // DEPOSITED stays EVM + Stellar. Disabled only when there is no EVM address at
  // all (Stellar-only users), where it would just waste a request.
  const { data: dbPortfolio, dataUpdatedAt: dbFetchedAt, isFetching: isDbPortfolioFetching } = useQuery({
    queryKey: ['user-portfolio-snapshot', evmAddress],
    queryFn: async () => {
      const res = await authedFetch(`/api/user/portfolio-data?address=${evmAddress}`)
      if (!res.ok) return null
      const json = await res.json()
      return json.success ? json.data : null
    },
    enabled: !!evmAddress && authReady,
    initialData: null,
    staleTime: SNAPSHOT_TTL_MS,
    refetchOnWindowFocus: false,
  })

  function buildBalancesFromSnapshots(portfolioData: any): Omit<CrossChainBalances, 'isLoading' | 'error'> {
    const allPositions: TokenPosition[] = []
    const chainBalanceMap = new Map<number, ChainBalance>()

    // Use assets from portfolio data to build positions
    if (portfolioData?.assets) {
      portfolioData.assets.forEach((asset: any) => {
        const assetId = asset.assetId
        // Try to find the asset in ANY chain config to get its basic info
        // This is a simplified fallback as the snapshot doesn't store chainId per asset row directly in the root list
        // but it's enough for a fast-path display.
        const defaultChainId = 56 // BSC Hub
        const marketsForChain = getMarketsForChain(defaultChainId)
        const assetInfo = marketsForChain.find(a => a.id === assetId)
        
        if (assetInfo) {
          const position: TokenPosition = {
            assetId,
            icon: assetInfo.icon,
            symbol: assetInfo.symbol,
            chainId: defaultChainId,
            chainName: 'BSC',
            suppliedBalance: 0,
            borrowedBalance: 0,
            suppliedValueUSD: asset.supplied || 0,
            borrowedValueUSD: asset.borrowed || 0,
            priceUSD: 0,
            decimals: assetInfo.decimals || 18,
            pTokenAddress: (getAssetContractAddresses(assetId, defaultChainId)?.pTokenAddress) || '' as any,
            marketData: assetInfo,
          }
          allPositions.push(position)

          if (!chainBalanceMap.has(defaultChainId)) {
            chainBalanceMap.set(defaultChainId, {
              chainId: defaultChainId,
              chainName: 'BSC',
              totalSupplied: 0,
              totalBorrowed: 0,
              liquidity: 0,
              shortfall: 0,
              supplyEarningsUSD: 0,
              supplyRewardsUSD: 0,
              borrowCostsUSD: 0,
              borrowRewardsUSD: 0,
              netEarningsUSD: 0,
              positions: [],
            })
          }
          const cb = chainBalanceMap.get(defaultChainId)!
          cb.totalSupplied += position.suppliedValueUSD
          cb.totalBorrowed += position.borrowedValueUSD
          cb.positions.push(position)
        }
      })
    }

    const totalSupplied = portfolioData?.portfolio?.totalSupplied || 0
    const totalBorrowed = portfolioData?.portfolio?.totalBorrowed || 0
    const borrowLimit = allPositions.reduce((acc, p) => acc + (p.suppliedValueUSD * ((p.marketData.maxLTV || 0) / 100)), 0)
    const borrowLimitUsed = totalBorrowed > 0 && borrowLimit > 0 ? (totalBorrowed / borrowLimit) * 100 : 0

    return {
      totalSupplied,
      totalBorrowed,
      borrowLimit,
      borrowLimitUsed,
      netAPY: Number(portfolioData?.portfolio?.netApy) || 0,
      liveNetAPY: Number(portfolioData?.portfolio?.netApy) || 0,
      weightedSupplyAPY: 0,
      weightedBorrowAPY: 0,
      weightedSupplyRewardsAPY: 0,
      weightedBorrowRewardsAPY: 0,
      supplyEarningsUSD: 0,
      supplyRewardsUSD: 0,
      borrowCostsUSD: 0,
      borrowRewardsUSD: 0,
      netEarningsUSD: 0,
      chainBalances: Array.from(chainBalanceMap.values()),
      allPositions,
    }
  }

  // Determine which chain to query: route spoke chains to hub chain for reads
  const effectiveChainId = useMemo(() => {
    if (isConnected && chainId) {
      return resolveHubReadChainId(chainId) ?? chainId
    }
    // If not connected, use default hub chain based on network selection
    return getDefaultHubChainId(selectedNetworkId)
  }, [isConnected, chainId, selectedNetworkId])

  // Helper to get all hub chains that should be queried
  // This ensures we query ALL hub chains (BSC, Monad, etc.) to get complete borrow/supply balances
  const getHubChainsToQuery = useMemo(() => {
    const enabledChainIds = new Set<number>((networks as any[]).map((n: any) => n.id))
    
    // Query ALL hub chains to get complete borrow/supply balances across all pools
    // This ensures we see all positions regardless of which chain the user is connected to
    const allHubChains = Object.entries(chainConfigs)
      .filter(([_, config]) => {
        const cid = (config as any)?.chainId
        return cid && isHubChain(cid) && enabledChainIds.has(cid) && 
               'chainId' in config && 'markets' in config
      })
      .map(([key, config]) => [key, config] as [string, any])

    // If no hub chains found, fallback to effective chain (for backwards compatibility)
    if (allHubChains.length > 0) {
      return allHubChains
    }
    
    const chainConfig = getChainConfig(effectiveChainId)
    if (chainConfig && 'chainId' in chainConfig && 'markets' in chainConfig) {
      return [[`chain-${effectiveChainId}`, chainConfig]]
    }
    
    return []
  }, [effectiveChainId, selectedNetworkId])

  const allContractCalls = useMemo(() => {
    // Use the resolved EVM address, NOT the active-wallet address. The active
    // wallet collapses to Stellar whenever selectedNetworkId is Stellar, which
    // would switch these on-chain reads off and drop all EVM positions from the
    // portfolio. The DB snapshot is empty for many users, so the live multicall
    // is the only reliable EVM source — run it whenever an EVM wallet exists,
    // regardless of which network is selected for viewing.
    if (!evmAddress) return [];

    const calls = [];
    const chainsWithContracts = getHubChainsToQuery

    chainsWithContracts.forEach(([chainKey, chainConfig]) => {
      if (!('chainId' in chainConfig) || !('markets' in chainConfig)) return;
      
      const marketsForChain = getMarketsForChain(chainConfig.chainId);
      const assetsWithContracts = marketsForChain.filter(asset => asset.hasSmartContract);

      assetsWithContracts.forEach(asset => {
        const oracleAddress = getOracleAddress(chainConfig);
        const contractAddresses = getAssetContractAddresses(asset.id, chainConfig.chainId);
        
        if (!oracleAddress || !contractAddresses?.pTokenAddress) return;

        const pTokenAddress = contractAddresses.pTokenAddress as `0x${string}`;

        const commonContractProps = {
          chainId: chainConfig.chainId,
          address: pTokenAddress,
        };

        // Supply call
        calls.push({
          ...commonContractProps,
          abi: balanceOfUnderlyingAbi,
          functionName: 'balanceOfUnderlying',
          args: [evmAddress],
        });

        // Borrow call
        calls.push({
          ...commonContractProps,
          abi: borrowBalanceStoredAbi,
          functionName: 'borrowBalanceStored',
          args: [evmAddress],
        });
      });
    });

    return calls;
  }, [evmAddress, getHubChainsToQuery]);

  const { data: multicallResults, isLoading: isMulticallLoading, error: multicallError, refetch: refetchMulticall } = useReadContracts<any>({
    contracts: allContractCalls as any,
    query: {
      enabled: !!evmAddress && allContractCalls.length > 0 && (!FEATURE_FLAGS.LIVE_MARKET_REFRESH || isVisible),
      ...(FEATURE_FLAGS.LIVE_MARKET_REFRESH ? {
        refetchInterval: isVisible && !!evmAddress ? 60000 : false, // Reduced refresh frequency to prevent RPC rate limits
        refetchIntervalInBackground: false,
        staleTime: 60000, // Matching staleTime with refetchInterval
        retry: 1,
      } : {}),
    }
  } as any);
  
  const processedBalances = useMemo(() => {
    const mergeWithStellarPositions = (base: ProcessedBalances): ProcessedBalances => {
      if (!stellarPositions.length) return base

      const existingPositionKeys = new Set(base.allPositions.map((p) => `${p.assetId}-${p.chainId}`))
      const uniqueStellarPositions = stellarPositions.filter(
        (p) => !existingPositionKeys.has(`${p.assetId}-${p.chainId}`)
      )

      if (!uniqueStellarPositions.length) return base

      const chainBalanceMap = new Map<number, ChainBalance>()
      base.chainBalances.forEach((cb) => {
        chainBalanceMap.set(cb.chainId, {
          ...cb,
          positions: [...cb.positions],
        })
      })

      let stellarSupplyEarningsUSD = 0
      let stellarSupplyRewardsUSD = 0
      let stellarBorrowCostsUSD = 0
      let stellarBorrowRewardsUSD = 0

      uniqueStellarPositions.forEach((position) => {
        const apyData = liveApyData?.[position.chainId]?.[position.assetId]
        // Stellar Soroban vaults earn their yield through the boost layer
        // (DefIndex/Blend autocompound), which lands in `boostSourceApy` /
        // `totalSupplyApy` — NOT the base `supplyApy` (≈0 for these vaults). The
        // market table already shows `totalSupplyApy ?? supplyApy`, so mirror it
        // here: derive the effective supply APY from the server-authoritative
        // total (fallback: sum of all components) and split the reward layers
        // back out so the breakdown stays meaningful. Using only `supplyApy`
        // here is why NET APY / Yield showed nothing for Stellar deposits.
        const supplyRewardsApyEff = apyData ? ((apyData.supplyRewardsApy ?? 0) + (apyData.boostRewardsApy ?? 0)) : 0
        const totalSupplyApyEff = apyData
          ? (apyData.totalSupplyApy > 0
              ? apyData.totalSupplyApy
              : ((apyData.supplyApy ?? 0) + (apyData.supplyRewardsApy ?? 0) + (apyData.boostSourceApy ?? 0) + (apyData.boostRewardsApy ?? 0)))
          : 0
        const supplyBaseApyEff = Math.max(0, totalSupplyApyEff - supplyRewardsApyEff)
        if (apyData) {
          if (position.suppliedValueUSD > 0) {
            stellarSupplyEarningsUSD += (supplyBaseApyEff / 100) * position.suppliedValueUSD
            stellarSupplyRewardsUSD += (supplyRewardsApyEff / 100) * position.suppliedValueUSD
          }
          if (position.borrowedValueUSD > 0) {
            stellarBorrowCostsUSD += (apyData.borrowApy / 100) * position.borrowedValueUSD
            stellarBorrowRewardsUSD += (apyData.borrowRewardsApy / 100) * position.borrowedValueUSD
          }
        }

        if (!chainBalanceMap.has(position.chainId)) {
          chainBalanceMap.set(position.chainId, {
            chainId: position.chainId,
            chainName: position.chainName,
            totalSupplied: 0,
            totalBorrowed: 0,
            liquidity: 0,
            shortfall: 0,
            supplyEarningsUSD: 0,
            supplyRewardsUSD: 0,
            borrowCostsUSD: 0,
            borrowRewardsUSD: 0,
            netEarningsUSD: 0,
            positions: [],
          })
        }

        const chainBalance = chainBalanceMap.get(position.chainId)!
        chainBalance.totalSupplied += position.suppliedValueUSD
        chainBalance.totalBorrowed += position.borrowedValueUSD
        chainBalance.positions.push(position as TokenPosition)

        if (apyData) {
          if (position.suppliedValueUSD > 0) {
            chainBalance.supplyEarningsUSD += (supplyBaseApyEff / 100) * position.suppliedValueUSD
            chainBalance.supplyRewardsUSD += (supplyRewardsApyEff / 100) * position.suppliedValueUSD
          }
          if (position.borrowedValueUSD > 0) {
            chainBalance.borrowCostsUSD += (apyData.borrowApy / 100) * position.borrowedValueUSD
            chainBalance.borrowRewardsUSD += (apyData.borrowRewardsApy / 100) * position.borrowedValueUSD
          }
        }
      })

      const mergedAllPositions = [...base.allPositions, ...(uniqueStellarPositions as TokenPosition[])]
      const totalSupplied = mergedAllPositions.reduce((acc, p) => acc + p.suppliedValueUSD, 0)
      const totalBorrowed = mergedAllPositions.reduce((acc, p) => acc + p.borrowedValueUSD, 0)
      const borrowLimit = mergedAllPositions.reduce(
        (acc, p) => acc + (p.suppliedValueUSD * ((p.marketData?.maxLTV || 0) / 100)),
        0
      )
      const borrowLimitUsed = totalBorrowed > 0 && borrowLimit > 0 ? (totalBorrowed / borrowLimit) * 100 : 0

      const supplyEarningsUSD = base.supplyEarningsUSD + stellarSupplyEarningsUSD
      const supplyRewardsUSD = base.supplyRewardsUSD + stellarSupplyRewardsUSD
      const borrowCostsUSD = base.borrowCostsUSD + stellarBorrowCostsUSD
      const borrowRewardsUSD = base.borrowRewardsUSD + stellarBorrowRewardsUSD
      const netEarningsUSD = supplyEarningsUSD + supplyRewardsUSD + borrowRewardsUSD - borrowCostsUSD

      const weightedSupplyAPY = totalSupplied > 0 ? (supplyEarningsUSD / totalSupplied) * 100 : 0
      const weightedSupplyRewardsAPY = totalSupplied > 0 ? (supplyRewardsUSD / totalSupplied) * 100 : 0
      const weightedBorrowAPY = totalBorrowed > 0 ? (borrowCostsUSD / totalBorrowed) * 100 : 0
      const weightedBorrowRewardsAPY = totalBorrowed > 0 ? (borrowRewardsUSD / totalBorrowed) * 100 : 0

      const baseAnnualNet = (base.netAPY / 100) * base.totalSupplied
      const baseAnnualLiveNet = (base.liveNetAPY / 100) * base.totalSupplied
      const stellarAnnualNet = stellarSupplyEarningsUSD + stellarSupplyRewardsUSD + stellarBorrowRewardsUSD - stellarBorrowCostsUSD

      const netAPY = totalSupplied > 0 ? ((baseAnnualNet + stellarAnnualNet) / totalSupplied) * 100 : 0
      const liveNetAPY = totalSupplied > 0 ? ((baseAnnualLiveNet + stellarAnnualNet) / totalSupplied) * 100 : 0

      const mergedChainBalances = Array.from(chainBalanceMap.values()).map((cb) => ({
        ...cb,
        netEarningsUSD: cb.supplyEarningsUSD + cb.supplyRewardsUSD + cb.borrowRewardsUSD - cb.borrowCostsUSD,
      }))

      return {
        ...base,
        totalSupplied,
        totalBorrowed,
        borrowLimit,
        borrowLimitUsed,
        netAPY,
        liveNetAPY,
        weightedSupplyAPY,
        weightedSupplyRewardsAPY,
        weightedBorrowAPY,
        weightedBorrowRewardsAPY,
        supplyEarningsUSD,
        supplyRewardsUSD,
        borrowCostsUSD,
        borrowRewardsUSD,
        netEarningsUSD,
        chainBalances: mergedChainBalances,
        allPositions: mergedAllPositions,
      }
    }

    const dbFresh = dbFetchedAt && (Date.now() - dbFetchedAt) < SNAPSHOT_TTL_MS
    const shouldUseSnapshot = Boolean(dbPortfolio) && (Boolean(dbFresh) || !isEvmActiveAddress)
    // No live EVM multicall data yet (still loading, or no EVM wallet at all):
    // fall back to the DB snapshot if present, otherwise just merge Stellar.
    if ((!multicallResults || multicallResults.length === 0)) {
      if (evmAddress && shouldUseSnapshot) {
        const snapshotData = buildBalancesFromSnapshots(dbPortfolio)
        return mergeWithStellarPositions(snapshotData)
      }
      return mergeWithStellarPositions({
        totalSupplied: 0,
        totalBorrowed: 0,
        borrowLimit: 0,
        borrowLimitUsed: 0,
        netAPY: 0,
        liveNetAPY: 0,
        weightedSupplyAPY: 0,
        weightedBorrowAPY: 0,
        weightedSupplyRewardsAPY: 0,
        weightedBorrowRewardsAPY: 0,
        supplyEarningsUSD: 0,
        supplyRewardsUSD: 0,
        borrowCostsUSD: 0,
        borrowRewardsUSD: 0,
        netEarningsUSD: 0,
        chainBalances: [],
        allPositions: [],
      });
    }

    try {
      const allPositions: TokenPosition[] = []
      const chainBalanceMap = new Map<number, ChainBalance>()
      let totalSupplyEarningsUSD = 0
      let totalSupplyRewardEarningsUSD = 0
      let totalBorrowCostsUSD = 0
      let totalBorrowRewardEarningsUSD = 0
      let totalExposureUSD = 0
      let apyCoveredExposureUSD = 0
      
      // Process results from the same hub chains we queried (ensures resultIndex matches)
      const chainsToProcess = getHubChainsToQuery

      let resultIndex = 0;
      chainsToProcess.forEach(([chainKey, chainConfig]) => {
        if (!('chainId' in chainConfig) || !('markets' in chainConfig)) return;

        const marketsForChain = getMarketsForChain(chainConfig.chainId);
        const assetsWithContracts = marketsForChain.filter(asset => asset.hasSmartContract);

        assetsWithContracts.forEach(asset => {
          const contractAddresses = getAssetContractAddresses(asset.id, chainConfig.chainId);
          const oracleAddress = getOracleAddress(chainConfig);

          if (!oracleAddress || !contractAddresses?.pTokenAddress) return;

          const supplyResult = multicallResults[resultIndex++];
          const borrowResult = multicallResults[resultIndex++];
          
          const supplyRaw = supplyResult?.status === 'success' ? (supplyResult.result as bigint) : BigInt(0);
          const suppliedBalance = Number(formatUnits(supplyRaw, asset.decimals || 18));

          const borrowRaw = borrowResult?.status === 'success' ? (borrowResult.result as bigint) : BigInt(0);
          const borrowedBalance = Number(formatUnits(borrowRaw, asset.decimals || 18));

          // Use configured fallback price directly (oracle prices removed to reduce RPC calls)
          let priceUSD = asset.oraclePrice || asset.price || 0;
          
          // Fallback for legacy assets without oraclePrice configured
          if (priceUSD === 0 && (suppliedBalance > 0 || borrowedBalance > 0)) {
            const fallbackPrices: Record<string, number> = {
              'LINK': 15.0, 'PUSD': 1.0, 'USDC': 1.0, 'USDT': 1.0, 
              'WMON': 0.1, 'WETH': 2400.0, 'WBTC': 65000.0, 'PDT': 0.01,
              'gMON': 0.02, 'AUSD': 1.0, 'earnAUSD': 1.0,
            };
            priceUSD = fallbackPrices[asset.symbol] || 1.0;
          }

          const suppliedValueUSD = suppliedBalance * priceUSD;
          const borrowedValueUSD = borrowedBalance * priceUSD;
          const positionExposureUSD = Math.abs(suppliedValueUSD) + Math.abs(borrowedValueUSD)
          totalExposureUSD += positionExposureUSD

          const apyData = liveApyData?.[chainConfig.chainId]?.[asset.id];
          if (apyData) {
            apyCoveredExposureUSD += positionExposureUSD
            if (suppliedValueUSD > 0) {
              totalSupplyEarningsUSD += (apyData.supplyApy / 100) * suppliedValueUSD;
              totalSupplyRewardEarningsUSD += (apyData.supplyRewardsApy / 100) * suppliedValueUSD;
            }
            if (borrowedValueUSD > 0) {
              totalBorrowCostsUSD += (apyData.borrowApy / 100) * borrowedValueUSD;
              totalBorrowRewardEarningsUSD += (apyData.borrowRewardsApy / 100) * borrowedValueUSD;
            }
          }

          if (suppliedBalance > 0 || borrowedBalance > 0) {
            const position = {
              assetId: asset.id,
              icon: asset.icon,
              symbol: asset.symbol,
              chainId: chainConfig.chainId,
              chainName: chainConfig.chainNameReadable,
              suppliedBalance,
              borrowedBalance,
              suppliedValueUSD,
              borrowedValueUSD,
              priceUSD,
              decimals: asset.decimals || 18,
              pTokenAddress: contractAddresses.pTokenAddress,
              marketData: asset
            };
            allPositions.push(position);

            if (!chainBalanceMap.has(chainConfig.chainId)) {
              chainBalanceMap.set(chainConfig.chainId, {
                chainId: chainConfig.chainId,
                chainName: chainConfig.chainNameReadable,
                totalSupplied: 0,
                totalBorrowed: 0,
                liquidity: 0,
                shortfall: 0,
                supplyEarningsUSD: 0,
                supplyRewardsUSD: 0,
                borrowCostsUSD: 0,
                borrowRewardsUSD: 0,
                netEarningsUSD: 0,
                positions: [],
              });
            }

            const chainBalance = chainBalanceMap.get(chainConfig.chainId)!;
            chainBalance.totalSupplied += suppliedValueUSD;
            chainBalance.totalBorrowed += borrowedValueUSD;
            chainBalance.positions.push(position);
            
            if (apyData) {
              if (suppliedValueUSD > 0) {
                chainBalance.supplyEarningsUSD += (apyData.supplyApy / 100) * suppliedValueUSD;
                chainBalance.supplyRewardsUSD += (apyData.supplyRewardsApy / 100) * suppliedValueUSD;
              }
              if (borrowedValueUSD > 0) {
                chainBalance.borrowCostsUSD += (apyData.borrowApy / 100) * borrowedValueUSD;
                chainBalance.borrowRewardsUSD += (apyData.borrowRewardsApy / 100) * borrowedValueUSD;
              }
            }
          }
        });
      });

      const totalSupplied = allPositions.reduce((acc, p) => acc + p.suppliedValueUSD, 0);
      const totalBorrowed = allPositions.reduce((acc, p) => acc + p.borrowedValueUSD, 0);
      const borrowLimit = allPositions.reduce((acc, p) => acc + (p.suppliedValueUSD * (p.marketData.maxLTV / 100)), 0);
      const borrowLimitUsed = totalBorrowed > 0 && borrowLimit > 0 ? (totalBorrowed / borrowLimit) * 100 : 0;
      
      const totalNetAnnualEarnings = totalSupplyEarningsUSD + totalSupplyRewardEarningsUSD + totalBorrowRewardEarningsUSD - totalBorrowCostsUSD;
      const computedNetAPY = totalSupplied > 0 ? (totalNetAnnualEarnings / totalSupplied) * 100 : 0;
      const hasApyEstimates = (totalSupplyEarningsUSD > 0) || (totalSupplyRewardEarningsUSD > 0) || (totalBorrowRewardEarningsUSD > 0) || (totalBorrowCostsUSD > 0)

      const weightedSupplyAPY = totalSupplied > 0 ? (totalSupplyEarningsUSD / totalSupplied) * 100 : 0;
      const weightedSupplyRewardsAPY = totalSupplied > 0 ? (totalSupplyRewardEarningsUSD / totalSupplied) * 100 : 0;
      const weightedBorrowAPY = totalBorrowed > 0 ? (totalBorrowCostsUSD / totalBorrowed) * 100 : 0;
      const weightedBorrowRewardsAPY = totalBorrowed > 0 ? (totalBorrowRewardEarningsUSD / totalBorrowed) * 100 : 0;

      const finalChainBalances = Array.from(chainBalanceMap.values()).map(cb => {
        cb.netEarningsUSD = cb.supplyEarningsUSD + cb.supplyRewardsUSD + cb.borrowRewardsUSD - cb.borrowCostsUSD;
        return cb;
      });

      // Data completeness: require APY coverage across exposure (>=90%) to override DB
      const exposureCoverage = totalExposureUSD > 0 ? (apyCoveredExposureUSD / totalExposureUSD) : 0
      const coverageSufficient = exposureCoverage >= 0.8

      // Optional: also ensure most calls returned successfully (fallback safety)
      const totalCalls = allContractCalls.length || 1
      const successCount = multicallResults.filter((r: any) => r?.status === 'success').length
      const multicallCoverageOk = (successCount / totalCalls) >= 0.8

      const finalNetAPY = (hasApyEstimates && coverageSufficient && multicallCoverageOk)
        ? computedNetAPY
        : (dbPortfolio?.portfolio?.netApy || 0)

      const resultObj: ProcessedBalances = {
        totalSupplied,
        totalBorrowed,
        borrowLimit,
        borrowLimitUsed,
        netAPY: finalNetAPY,
        liveNetAPY: computedNetAPY,
        weightedSupplyAPY,
        weightedBorrowAPY,
        weightedSupplyRewardsAPY,
        weightedBorrowRewardsAPY,
        supplyEarningsUSD: totalSupplyEarningsUSD,
        supplyRewardsUSD: totalSupplyRewardEarningsUSD,
        borrowCostsUSD: totalBorrowCostsUSD,
        borrowRewardsUSD: totalBorrowRewardEarningsUSD,
        netEarningsUSD: totalNetAnnualEarnings,
        chainBalances: finalChainBalances,
        allPositions,
      }
      const mergedResult = mergeWithStellarPositions(resultObj)

      // Cache latest computed portfolio payload and gating flags for tx fast-path
      if (evmAddress) {
        try {
          const cachedPayload = {
            address: evmAddress.toLowerCase(),
            net_apy_pct: mergedResult.netAPY,
            total_supply_usd: mergedResult.totalSupplied,
            total_borrow_usd: mergedResult.totalBorrowed,
            breakdown: {
              chains: mergedResult.chainBalances.map(cb => ({
                chainId: cb.chainId,
                chainName: cb.chainName,
                totalSupplied: cb.totalSupplied,
                totalBorrowed: cb.totalBorrowed,
                netEarningsUSD: cb.netEarningsUSD,
              })),
              positions: mergedResult.allPositions.map(p => ({
                assetId: p.assetId,
                chainId: p.chainId,
                suppliedValueUSD: p.suppliedValueUSD,
                borrowedValueUSD: p.borrowedValueUSD,
              })),
            },
            observed_at: new Date().toISOString(),
            source: 'client',
            version: 1,
          }
          lastComputedPortfolioRef.current = {
            payload: cachedPayload,
            gates: { hasApyEstimates, coverageSufficient, multicallCoverageOk },
            totals: { totalSupplied: mergedResult.totalSupplied, totalBorrowed: mergedResult.totalBorrowed },
          }
        } catch {}
      }

      // Incremental DB updates removed - client-side updates are deprecated.
      // Balances are now indexed on the server.
      if (address && mergedResult.allPositions.length > 0) {
        // ... removed balance POST logic ...
      }

      // Debounced portfolio snapshot removed - client-side updates are deprecated.
      if (address && ((hasApyEstimates && coverageSufficient && multicallCoverageOk) || (mergedResult.totalSupplied === 0 && mergedResult.totalBorrowed === 0))) {
        // ... removed portfolio POST logic ...
      }

      return mergedResult
    } catch (e: any) {
      console.error("Error processing cross-chain balances:", e);
      setErrorState(e.message);
      return mergeWithStellarPositions({
        totalSupplied: 0,
        totalBorrowed: 0,
        borrowLimit: 0,
        borrowLimitUsed: 0,
        netAPY: 0,
        liveNetAPY: 0,
        weightedSupplyAPY: 0,
        weightedBorrowAPY: 0,
        weightedSupplyRewardsAPY: 0,
        weightedBorrowRewardsAPY: 0,
        supplyEarningsUSD: 0,
        supplyRewardsUSD: 0,
        borrowCostsUSD: 0,
        borrowRewardsUSD: 0,
        netEarningsUSD: 0,
        chainBalances: [],
        allPositions: [],
      });
    }
  }, [isConnected, isEvmActiveAddress, evmAddress, liveApyData, multicallResults, getHubChainsToQuery, address, dbFetchedAt, dbPortfolio, stellarPositions]);

  useEffect(() => {
    if (!address && !evmAddress) {
      setIsLoadingState(false)
      return
    }
    // EVM positions now load via live multicall whenever an EVM wallet exists
    // (independent of the selected network); the DB snapshot and Stellar
    // positions load alongside it.
    setIsLoadingState((!!evmAddress && isMulticallLoading) || isDbPortfolioFetching || isStellarPositionsLoading)
  }, [address, evmAddress, isMulticallLoading, isDbPortfolioFetching, isStellarPositionsLoading]);

  useEffect(() => {
    if (multicallError && !!evmAddress) {
      setErrorState(multicallError.message);
    }
  }, [multicallError, evmAddress]);

  // Stable refs so the event handler never needs to be re-registered when these values change.
  // This prevents the "accumulating setTimeout" bug: if the effect re-ran on every dependency
  // change, previously-scheduled timeouts would not be cancelled, creating a feedback loop
  // (invalidation → re-render → dep change → new effect → more timeouts → ...).
  const addressRef = useRef(address)
  const isVisibleRef = useRef(isVisible)
  const isConnectedRef = useRef(isConnected)
  const refetchMulticallRef = useRef(refetchMulticall)
  const refetchStellarPositionsRef = useRef(refetchStellarPositions)
  const queryClientRef = useRef(queryClient)
  useEffect(() => { addressRef.current = address }, [address])
  useEffect(() => { isVisibleRef.current = isVisible }, [isVisible])
  useEffect(() => { isConnectedRef.current = isConnected }, [isConnected])
  useEffect(() => { refetchMulticallRef.current = refetchMulticall }, [refetchMulticall])
  useEffect(() => { refetchStellarPositionsRef.current = refetchStellarPositions }, [refetchStellarPositions])
  useEffect(() => { queryClientRef.current = queryClient }, [queryClient])

  // Listen for tx-success and force a refresh of the DB snapshots
  useEffect(() => {
    const pendingTimers: ReturnType<typeof setTimeout>[] = []

    const handler = () => {
      // Cancel any previously-queued timers from an earlier tx-success event so we
      // never have multiple rounds of invalidation in flight simultaneously.
      while (pendingTimers.length) clearTimeout(pendingTimers.pop())
      try {
        // Light on-chain refresh 1s after tx success to update totals/net APY
        if (FEATURE_FLAGS.LIVE_MARKET_REFRESH) {
          pendingTimers.push(setTimeout(() => {
            try {
              if (isVisibleRef.current && isConnectedRef.current) {
                (refetchMulticallRef.current as any)?.()
                ;(refetchStellarPositionsRef.current as any)?.()
              }
            } catch {}
          }, 1000))
        }
        // Trigger a re-fetch of DB snapshots after a short delay
        pendingTimers.push(setTimeout(() => {
          const addr = addressRef.current
          if (addr) {
            queryClientRef.current.invalidateQueries({ queryKey: ['user-balances-snapshot', addr] })
            queryClientRef.current.invalidateQueries({ queryKey: ['user-portfolio-snapshot', addr] })
            queryClientRef.current.invalidateQueries({ queryKey: [STELLAR_PORTFOLIO_POSITIONS_QUERY_KEY] })
          }
        }, 1500))
      } catch {}
    }
    window.addEventListener('peridot:tx-success' as any, handler)
    return () => {
      window.removeEventListener('peridot:tx-success' as any, handler)
      while (pendingTimers.length) clearTimeout(pendingTimers.pop())
    }
  }, []) // stable — all mutable values accessed via refs above

  return {
    ...processedBalances,
    isLoading: isLoadingState,
    error: errorState,
  };
}
