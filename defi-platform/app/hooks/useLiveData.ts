"use client";

import { useMemo } from 'react';
import { useReadContract } from 'wagmi';
import { PeridottrollerABI } from '../../abi/PeridottrollerABI';
import { ERC20ABI } from '../../abi/ERC20ABI';
import { soneiumMinato } from '../../config/chains';
import type { Asset, PortfolioAsset, PortfolioSummary } from '../types/defi';

// Contract addresses
const peridottrollerAddressSoneiumMinato = '0xB911C192ed1d6428A12F2Cf8F636B00c34e68a2a' as `0x${string}`;
const percTokenAddressSoneiumMinato = '0x28fE679719e740D15FC60325416bB43eAc50cD15' as `0x${string}`;

// Define pToken addresses for different assets
const pTokenAddresses = {
  PERC: '0x1DCb19949fC0a68cbdAa53Cce898B60D7436b14F' as `0x${string}`,
  // Add more pToken addresses as they become available
} as const;

// Live account data hook
export const useLiveAccountData = (
  isDemoMode: boolean, 
  address: `0x${string}` | undefined, 
  isConnected: boolean, 
  chain: any
) => {
  const isEnabled = !isDemoMode && isConnected && chain?.id === soneiumMinato.id && !!address;

  // Get user's supplied assets and calculate total supplied value
  const { data: userAssetsIn } = useReadContract({
    abi: PeridottrollerABI,
    address: peridottrollerAddressSoneiumMinato,
    functionName: 'getAssetsIn',
    args: [address as `0x${string}`],
    query: { enabled: isEnabled },
  });

  // Get account liquidity for borrow calculations
  const { data: accountLiquidity } = useReadContract({
    abi: PeridottrollerABI,
    address: peridottrollerAddressSoneiumMinato,
    functionName: 'getAccountLiquidity',
    args: [address as `0x${string}`],
    query: { enabled: isEnabled },
  });

  // Get PERC balance for portfolio
  const { data: percBalance } = useReadContract({
    abi: ERC20ABI,
    address: percTokenAddressSoneiumMinato,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: isEnabled },
  });

  // Calculate live data from contract responses
  const liveData = useMemo(() => {
    if (!isEnabled || !accountLiquidity) {
      return null;
    }

    const liquidityValue = Number(accountLiquidity[1]) / 1e18;
    const shortfallValue = Number(accountLiquidity[2]) / 1e18;
    
    // For now, we'll use placeholder calculations since we need more contract calls
    // to get actual supplied/borrowed amounts
    return {
      totalSupplied: liquidityValue, // This would need actual calculation from pToken balances
      totalBorrowed: shortfallValue, // This would need actual calculation from borrow balances
      netAPY: 0, // Would need to calculate from supply/borrow rates
      borrowLimitUsed: liquidityValue > 0 ? (shortfallValue / liquidityValue) * 100 : 0,
      accountLiquidity: liquidityValue,
      percBalance: percBalance ? Number(percBalance) / 1e18 : 0,
    };
  }, [accountLiquidity, percBalance, isEnabled]);

  return liveData;
};

// Market data fetching hook
export const useLiveMarketData = (isDemoMode: boolean, isConnected: boolean, chain: any) => {
  const isEnabled = !isDemoMode && isConnected && chain?.id === soneiumMinato.id;

  // Get all markets
  const { data: allMarkets } = useReadContract({
    abi: PeridottrollerABI,
    address: peridottrollerAddressSoneiumMinato,
    functionName: 'getAllMarkets',
    query: { enabled: isEnabled },
  });

  // Get market info for PERC token
  const { data: percMarketInfo } = useReadContract({
    abi: PeridottrollerABI,
    address: peridottrollerAddressSoneiumMinato,
    functionName: 'markets',
    args: [pTokenAddresses.PERC],
    query: { enabled: isEnabled },
  });

  // Calculate live market data
  const liveMarketData = useMemo(() => {
    if (!isEnabled || !allMarkets || !percMarketInfo) {
      return null;
    }

    // For now, we'll create a basic market structure
    // In a full implementation, you'd loop through all markets and get their details
    const liveSupplyMarkets: Asset[] = [
      {
        id: 'perc',
        name: 'Peridot',
        symbol: 'PERC',
        icon: '/logo.svg',
        apy: 5.2, // Would need to fetch from interest rate model
        wallet: '0 PERC', // Would need to fetch user's balance
        collateral: false, // Would need to check user's market membership
        price: 1.0, // Would need to fetch from oracle
        marketCap: '$1M', // Would need to calculate
        volume24h: '$100K', // Would need external data
        change24h: 0,
        liquidity: '$500K', // Would need to calculate from total supply
        pTokenAddress: pTokenAddresses.PERC,
      }
    ];

    const liveBorrowMarkets: Asset[] = [
      {
        id: 'perc-borrow',
        name: 'Peridot',
        symbol: 'PERC',
        icon: '/logo.svg',
        apy: 7.8, // Would need to fetch borrow rate
        wallet: '0 PERC',
        collateral: false,
        price: 1.0,
        marketCap: '$1M',
        volume24h: '$100K',
        change24h: 0,
        liquidity: '$300K', // Available to borrow
        pTokenAddress: pTokenAddresses.PERC,
      }
    ];

    return {
      supplyMarkets: liveSupplyMarkets,
      borrowMarkets: liveBorrowMarkets,
    };
  }, [allMarkets, percMarketInfo, isEnabled]);

  return liveMarketData;
};

// Portfolio data fetching hook
export const useLivePortfolioData = (
  isDemoMode: boolean, 
  address: `0x${string}` | undefined, 
  isConnected: boolean, 
  chain: any
) => {
  const isEnabled = !isDemoMode && isConnected && chain?.id === soneiumMinato.id && !!address;

  // Get PERC balance
  const { data: percBalance } = useReadContract({
    abi: ERC20ABI,
    address: percTokenAddressSoneiumMinato,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: { enabled: isEnabled },
  });

  // Calculate live portfolio data
  const livePortfolioData = useMemo(() => {
    if (!isEnabled) {
      return null;
    }

    const percAmount = percBalance ? Number(percBalance) / 1e18 : 0;
    const percPrice = 1.0; // Would need to fetch from oracle
    const percValue = percAmount * percPrice;

    const portfolioAssets: PortfolioAsset[] = [];
    
    if (percAmount > 0) {
      portfolioAssets.push({
        id: 'perc',
        name: 'Peridot',
        symbol: 'PERC',
        icon: '/logo.svg',
        amount: percAmount,
        price: percPrice,
        value: percValue,
        allocation: 100, // Would calculate based on total portfolio
        change24h: 0, // Would need price history
      });
    }

    const totalValue = portfolioAssets.reduce((sum, asset) => sum + asset.value, 0);

    return {
      summary: {
        totalValue,
        change24hValue: 0, // Would need to calculate
        change24hPercentage: 0, // Would need to calculate
      } as PortfolioSummary,
      assets: portfolioAssets,
    };
  }, [percBalance, isEnabled]);

  return livePortfolioData;
}; 