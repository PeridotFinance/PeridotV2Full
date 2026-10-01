import { useState, useEffect, useCallback } from 'react';

export interface StatsData {
  tvl: string;
  totalBorrowed: string;
  activeUsers: number;
  totalTransactions: number;
  volume24h: string;
  volume7d: string;
  totalVolume: string;
  topSuppliers: Array<{
    wallet_address: string;
    total_value: string;
    transaction_count: number;
  }>;
  actionDistribution: Array<{
    action_type: string;
    count: number;
    volume: string;
  }>;
  volumeTimeSeries: Array<{
    date: string;
    supply: number;
    borrow: number;
    repay: number;
    redeem: number;
  }>;
  assetDistribution: Array<{
    token_symbol: string;
    volume: string;
    percentage: number;
  }>;
}

export interface StellarStatsBlock {
  chainId: number;
  totalTVL: number;
  totalMarketSize: number;
  totalBorrowed: number;
  vaults: Array<{
    symbol: 'XLM' | 'USDC' | 'EURC';
    vaultId: string;
    decimals: number;
    liquidityUnderlying: number;
    totalBorrowedUnderlying: number;
    totalSupplyUnderlying: number;
    priceUsd: number | null;
    liquidityUsd: number;
    borrowedUsd: number;
    totalMarketSizeUsd: number;
  }>;
  lastUpdated: string;
}

interface UseStatsDataResult {
  data: StatsData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
  isCached: boolean;
  liveVolumeTimeSeries?: Array<{
    date: string;
    supply: number;
    borrow: number;
    repay: number;
    redeem: number;
  }>;
  actionAssetDaily?: Array<{
    date: string;
    action_type: string;
    token_symbol: string;
    volume: number;
  }>;
  stellar?: StellarStatsBlock;
}

export const useStatsData = (autoRefresh = true): UseStatsDataResult => {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [liveVolumeTimeSeries, setLiveVolumeTimeSeries] = useState<UseStatsDataResult['liveVolumeTimeSeries']>(undefined)
  const [actionAssetDaily, setActionAssetDaily] = useState<UseStatsDataResult['actionAssetDaily']>(undefined)
  const [stellar, setStellar] = useState<StellarStatsBlock | undefined>(undefined)

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      // ?stellar=1 folds the live Soroban TVL/borrow read into the
      // response so the unified stats page can render BSC + Stellar
      // from a single source of truth.
      const response = await fetch('/api/stats?compare=1&assets=1&stellar=1', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add cache control to prevent browser caching
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.error) {
        // If there's an error but cached data is available
        if (result.data) {
          setData(result.data);
          setIsCached(true);
          setError(`Warning: ${result.error}`);
        } else {
          throw new Error(result.error);
        }
      } else {
        setData(result.data);
        setIsCached(result.cached || false);
        setError(null);
        if (Array.isArray(result.liveVolumeTimeSeries)) {
          setLiveVolumeTimeSeries(result.liveVolumeTimeSeries)
        } else {
          setLiveVolumeTimeSeries(undefined)
        }
        if (Array.isArray(result.actionAssetDaily)) {
          setActionAssetDaily(result.actionAssetDaily)
        } else {
          setActionAssetDaily(undefined)
        }
        setStellar(result.stellar && typeof result.stellar === 'object' ? result.stellar as StellarStatsBlock : undefined)
      }
      
      setLastUpdated(new Date(result.timestamp));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch stats data';
      setError(errorMessage);
      console.error('Stats data fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchData();
  }, [fetchData]);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 5 minutes if enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchData();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // Listen for custom refresh events (e.g., from other components)
  useEffect(() => {
    const handleRefresh = () => {
      refresh();
    };

    window.addEventListener('custom:refresh-stats', handleRefresh);
    return () => window.removeEventListener('custom:refresh-stats', handleRefresh);
  }, [refresh]);

  return {
    data,
    loading,
    error,
    refresh,
    lastUpdated,
    isCached,
    liveVolumeTimeSeries,
    actionAssetDaily,
    stellar,
  };
};

// Utility function to trigger refresh from other components
export const refreshStatsData = () => {
  window.dispatchEvent(new CustomEvent('custom:refresh-stats'));
};

// Utility function to format large numbers
export const formatNumber = (value: string | number, decimals = 2): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  // The database already returns these values in the correct denomination,
  // so we just need to format them with a dollar sign and commas.
  return `$${num.toLocaleString(undefined, { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  })}`;
};

// Utility function to format wallet addresses
export const formatAddress = (address: string): string => {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Utility function to get action type display name
export const getActionDisplayName = (actionType: string): string => {
  const displayNames: Record<string, string> = {
    supply: 'Supply',
    borrow: 'Borrow',
    repay: 'Repay',
    redeem: 'Withdraw'
  };
  return displayNames[actionType] || actionType;
};

// Utility function to get action color
export const getActionColor = (actionType: string): string => {
  const colors: Record<string, string> = {
    supply: 'hsl(var(--primary))',
    borrow: 'hsl(var(--destructive))',
    repay: 'hsl(var(--success))',
    redeem: 'hsl(var(--warning))'
  };
  return colors[actionType] || 'hsl(var(--muted-foreground))';
}; 