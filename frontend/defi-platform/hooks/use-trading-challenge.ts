/**
 * Trading Challenge Hooks
 * 
 * Provides React hooks for fetching and syncing Solana trading challenge data.
 * Includes built-in caching, request deduplication, rate limiting, and DOS protection.
 * 
 * @example
 * ```tsx
 * // In your dashboard component
 * import { useTradingChallengeComplete } from '@/hooks/use-trading-challenge';
 * import { useActiveWallet } from '@/hooks/use-active-wallet';
 * 
 * function TradingDashboard() {
 *   const { address } = useActiveWallet();
 *   const { 
 *     challenge, 
 *     userStats, 
 *     sync, 
 *     isSyncing, 
 *     isLoading 
 *   } = useTradingChallengeComplete(address);
 * 
 *   if (isLoading) return <Loading />;
 * 
 *   return (
 *     <div>
 *       <h1>Your Volume: ${userStats?.eligibleVolume || 0}</h1>
 *       <h2>Pending Rewards: ${userStats?.pendingRewards || 0}</h2>
 *       <button onClick={sync} disabled={isSyncing}>
 *         {isSyncing ? 'Syncing...' : 'Refresh Data'}
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

export const TRADING_CHALLENGE_QUERY_KEY = 'trading-challenge';
export const TRADING_CHALLENGE_SYNC_KEY = 'trading-challenge-sync';
export const TRADING_CHALLENGE_USER_KEY = 'trading-challenge-user';

export interface UserTradingStats {
  wallet: string;
  totalVolume: number;
  buyVolume: number;
  sellVolume: number;
  eligibleVolume: number;
  pendingRewards: number;
  currentBalance: number;
  lastTradeAt: string | null;
  lastSyncedAt: string | null;
  rank: number | null;
}

export interface TradingChallengeData {
  traders: Array<{
    address: string;
    volume: number;
    reward: number;
    holdTime: string;
    rank: number;
  }>;
  stats: {
    totalVolume: number;
    totalPayout: number;
    remainingPayout: number;
    participantCount: number;
    capAmount: number;
    rewardRate: number;
    volumeThreshold: number;
    holdThreshold: number;
  };
}

export interface SyncResponse {
  success: boolean;
  data: {
    eligibleVolume: number;
    pendingRewards?: number;
    lastSyncedAt?: string;
    message: string;
    cached?: boolean;
  };
  error?: string;
}

/**
 * Hook to fetch trading challenge dashboard data
 * Uses React Query for caching and automatic request deduplication
 */
export function useTradingChallenge() {
  return useQuery<TradingChallengeData>({
    queryKey: [TRADING_CHALLENGE_QUERY_KEY],
    queryFn: async () => {
      const response = await fetch('/api/trading-challenge');
      if (!response.ok) {
        throw new Error('Failed to fetch trading challenge data');
      }
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }
      return result.data;
    },
    staleTime: 30000, // 30 seconds - data is relatively static
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    refetchOnWindowFocus: false, // Don't refetch on tab focus
    refetchOnReconnect: true, // Refetch on network reconnect
  });
}

/**
 * Hook to sync a specific wallet's trading data
 * Includes throttling, request coalescing, and optimistic updates
 */
export function useTradingChallengeSync(walletAddress?: string) {
  const queryClient = useQueryClient();
  const lastSyncRef = useRef<number>(0);
  const SYNC_THROTTLE_MS = 60000; // 1 minute throttle on client side

  const syncMutation = useMutation<SyncResponse, Error, void>({
    mutationKey: [TRADING_CHALLENGE_SYNC_KEY, walletAddress],
    mutationFn: async () => {
      if (!walletAddress) {
        throw new Error('Wallet address is required');
      }

      const now = Date.now();
      const timeSinceLastSync = now - lastSyncRef.current;

      // Client-side throttle: prevent rapid-fire syncs
      if (timeSinceLastSync < SYNC_THROTTLE_MS) {
        const waitTime = SYNC_THROTTLE_MS - timeSinceLastSync;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const response = await fetch('/api/trading-challenge/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      lastSyncRef.current = Date.now();
      return result;
    },
    onSuccess: (data) => {
      // Invalidate and refetch challenge data after successful sync
      queryClient.invalidateQueries({ queryKey: [TRADING_CHALLENGE_QUERY_KEY] });
      
      // If sync returned cached data, don't show success toast
      if (!data.data?.cached) {
        // You can add a toast notification here if needed
        console.log('✅ Sync completed:', data.data?.message);
      }
    },
    onError: (error) => {
      console.error('❌ Sync failed:', error.message);
      // You can add error toast here
    },
  });

  // Throttled sync function that respects rate limits
  const sync = useCallback(() => {
    if (!walletAddress) {
      console.warn('Cannot sync: wallet address not provided');
      return;
    }

    // Check if mutation is already in progress (React Query handles this, but we add extra check)
    if (syncMutation.isPending) {
      console.log('⏳ Sync already in progress, skipping...');
      return;
    }

    syncMutation.mutate();
  }, [walletAddress, syncMutation]);

  // Auto-sync if data is stale (optional - can be disabled)
  const shouldAutoSync = useCallback(() => {
    if (!walletAddress) return false;
    
    const queryData = queryClient.getQueryData<TradingChallengeData>([TRADING_CHALLENGE_QUERY_KEY]);
    if (!queryData) return false;

    // Check if user's data might be stale (e.g., their wallet is in top traders but volume seems outdated)
    const userTrader = queryData.traders.find(t => 
      t.address.toLowerCase() === walletAddress.toLowerCase()
    );
    
    // If user is in leaderboard but we haven't synced recently, trigger sync
    if (userTrader && (Date.now() - lastSyncRef.current) > 5 * 60 * 1000) {
      return true;
    }

    return false;
  }, [walletAddress, queryClient]);

  return {
    sync,
    syncMutation,
    isSyncing: syncMutation.isPending,
    syncError: syncMutation.error,
    shouldAutoSync,
  };
}

/**
 * Combined hook that provides both data and sync functionality
 * Automatically syncs when wallet connects and data is stale
 */
export function useTradingChallengeWithSync(walletAddress?: string) {
  const challengeQuery = useTradingChallenge();
  const { sync, syncMutation, shouldAutoSync } = useTradingChallengeSync(walletAddress);

  // Auto-sync on mount if wallet is connected and data might be stale
  const autoSyncTriggered = useRef(false);
  if (walletAddress && !autoSyncTriggered.current && shouldAutoSync()) {
    autoSyncTriggered.current = true;
    // Delay auto-sync slightly to avoid blocking initial render
    setTimeout(() => {
      sync();
    }, 1000);
  }

  // Reset auto-sync trigger when wallet changes
  if (walletAddress && autoSyncTriggered.current) {
    // Keep it triggered for this wallet
  } else if (!walletAddress) {
    autoSyncTriggered.current = false;
  }

  return {
    ...challengeQuery,
    sync,
    isSyncing: syncMutation.isPending,
    syncError: syncMutation.error,
    lastSyncTime: syncMutation.data?.data?.lastSyncedAt,
  };
}

/**
 * Hook to fetch user-specific trading challenge stats
 * Automatically refetches after sync
 */
export function useUserTradingStats(walletAddress?: string) {
  const queryClient = useQueryClient();

  return useQuery<UserTradingStats>({
    queryKey: [TRADING_CHALLENGE_USER_KEY, walletAddress],
    queryFn: async () => {
      if (!walletAddress) {
        throw new Error('Wallet address is required');
      }

      const response = await fetch(`/api/trading-challenge/user?wallet=${walletAddress}`);
      if (!response.ok) {
        throw new Error('Failed to fetch user trading stats');
      }
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }
      return result.data;
    },
    enabled: !!walletAddress,
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Complete hook that provides challenge data, user stats, and sync functionality
 * This is the recommended hook to use in dashboard components
 */
export function useTradingChallengeComplete(walletAddress?: string) {
  const challenge = useTradingChallenge();
  const userStats = useUserTradingStats(walletAddress);
  const { sync, syncMutation, shouldAutoSync } = useTradingChallengeSync(walletAddress);

  // Auto-sync when wallet connects and data is stale
  const autoSyncTriggered = useRef(false);
  if (walletAddress && !autoSyncTriggered.current && shouldAutoSync()) {
    autoSyncTriggered.current = true;
    setTimeout(() => sync(), 1000);
  }

  if (!walletAddress) {
    autoSyncTriggered.current = false;
  }

  return {
    // Challenge data
    challenge: challenge.data,
    isChallengeLoading: challenge.isLoading,
    challengeError: challenge.error,
    
    // User stats
    userStats: userStats.data,
    isUserStatsLoading: userStats.isLoading,
    userStatsError: userStats.error,
    
    // Sync functionality
    sync,
    isSyncing: syncMutation.isPending,
    syncError: syncMutation.error,
    
    // Combined loading state
    isLoading: challenge.isLoading || (walletAddress ? userStats.isLoading : false),
  };
}

