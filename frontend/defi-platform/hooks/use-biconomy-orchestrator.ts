/**
 * Hook for managing Biconomy MEE orchestrator and client
 * Supports external EOA wallets (MetaMask) and extensible for Privy smart wallets
 */

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { createWalletClient, custom, http, type Chain, type Address } from 'viem';
import { bsc } from 'viem/chains';
import {
  createMeeClient,
  toMultichainNexusAccount,
  getMEEVersion,
  MEEVersion,
  type MeeClient,
  type MultichainSmartAccount,
} from '@biconomy/abstractjs';
import { CHAIN_BY_ID } from '@/lib/biconomy/wallet';

const SUPPORTED_CHAIN_IDS = Object.keys(CHAIN_BY_ID).map((id) => Number(id));

const resolveRpcUrl = (chain: Chain): string | undefined => {
  const envKey = `NEXT_PUBLIC_RPC_${chain.id}` as keyof NodeJS.ProcessEnv;
  const envOverride = typeof process !== 'undefined' ? process.env?.[envKey] : undefined;
  return envOverride || chain.rpcUrls?.default?.http?.[0] || chain.rpcUrls?.public?.http?.[0];
};

const buildMeeChainConfigurations = (currentChainId?: number) => {
  const uniqueChains = new Map<number, Chain>();
  const prioritizedIds = currentChainId
    ? [currentChainId, bsc.id, ...SUPPORTED_CHAIN_IDS]
    : [bsc.id, ...SUPPORTED_CHAIN_IDS];
  
  for (const id of prioritizedIds) {
    const chain = CHAIN_BY_ID[id];
    if (chain) {
      uniqueChains.set(id, chain);
    }
  }

  return Array.from(uniqueChains.values())
    .map((chain) => {
      const rpcUrl = resolveRpcUrl(chain);
      if (!rpcUrl) return null;
      return {
        chain,
        transport: http(rpcUrl),
        version: getMEEVersion(MEEVersion.V2_1_0),
      };
    })
    .filter((config): config is NonNullable<typeof config> => config !== null);
};

export interface UseBiconomyOrchestratorOptions {
  /**
   * For EIP-7702 mode (embedded wallets), set to EOA address
   * For Fusion mode (external wallets), leave undefined
   */
  accountAddress?: Address;
  /**
   * Enable Fusion mode for external EOA wallets
   * @default true for external wallets
   */
  useFusion?: boolean;
}

export interface UseBiconomyOrchestratorReturn {
  orchestrator: MultichainSmartAccount | null;
  meeClient: MeeClient | null;
  isInitializing: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  reset: () => void;
  /**
   * Get orchestrator address on a specific chain
   */
  getOrchestratorAddress: (chainId: number) => Address | null;
}

export function useBiconomyOrchestrator(
  options: UseBiconomyOrchestratorOptions = {}
): UseBiconomyOrchestratorReturn {
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [orchestrator, setOrchestrator] = useState<MultichainSmartAccount | null>(null);
  const [meeClient, setMeeClient] = useState<MeeClient | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialize = useCallback(async () => {
    if (!address || !walletClient) {
      setError('Wallet not connected');
      return;
    }

    setIsInitializing(true);
    setError(null);

    try {
      // For external wallets, use the wallet client directly
      // For embedded wallets (future), we'll pass a different signer
      const signer = walletClient;

      const chainConfigurations = buildMeeChainConfigurations(chainId);
      if (!chainConfigurations.length) {
        throw new Error('No RPC endpoints available for required chains');
      }

      // Create multichain orchestrator
      const multichainAccount = await toMultichainNexusAccount({
        signer: signer as any,
        chainConfigurations,
        // For EIP-7702 mode (embedded wallets), set accountAddress to EOA
        // For Fusion mode (external wallets), leave undefined
        ...(options.accountAddress ? { accountAddress: options.accountAddress } : {}),
      });

      // Create MEE client
      const client = await createMeeClient({
        account: multichainAccount,
      });

      setOrchestrator(multichainAccount);
      setMeeClient(client);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      console.error('[useBiconomyOrchestrator] Initialization failed:', err);
    } finally {
      setIsInitializing(false);
    }
  }, [address, walletClient, chainId, options.accountAddress]);

  const reset = useCallback(() => {
    setOrchestrator(null);
    setMeeClient(null);
    setError(null);
    setIsInitializing(false);
  }, []);

  const getOrchestratorAddress = useCallback(
    (chainId: number): Address | null => {
      if (!orchestrator) return null;
      try {
        return orchestrator.addressOn(chainId, true);
      } catch {
        return null;
      }
    },
    [orchestrator]
  );

  // Reset when wallet disconnects
  useEffect(() => {
    if (!address || !walletClient) {
      reset();
    }
  }, [address, walletClient, reset]);

  return {
    orchestrator,
    meeClient,
    isInitializing,
    error,
    initialize,
    reset,
    getOrchestratorAddress,
  };
}



