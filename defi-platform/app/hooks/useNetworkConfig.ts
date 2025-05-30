import { useAccount } from 'wagmi';
import { 
  getNetworkConfig, 
  getPeridottrollerAddress, 
  getNetworkDisplayInfo, 
  isSupportedNetwork,
  currentActiveNetwork,
  currentActiveNetworkContracts
} from '../../config/networks';

export function useNetworkConfig() {
  const { chain, isConnected } = useAccount();

  // Current network info
  const currentChainId = chain?.id;
  const isCurrentNetworkSupported = currentChainId ? isSupportedNetwork(currentChainId) : false;
  
  // Network configuration
  const networkConfig = currentChainId && isCurrentNetworkSupported 
    ? getNetworkConfig(currentChainId) 
    : currentActiveNetworkContracts; // Fallback to default
    
  // Network display information
  const networkDisplayInfo = currentChainId 
    ? getNetworkDisplayInfo(currentChainId)
    : getNetworkDisplayInfo(currentActiveNetwork.id);

  // Contract addresses
  const peridottrollerAddress = currentChainId && isCurrentNetworkSupported
    ? getPeridottrollerAddress(currentChainId)
    : getPeridottrollerAddress(currentActiveNetwork.id);

  // Helper functions
  const getTokenAddress = (symbol: string): `0x${string}` | undefined => {
    if (!networkConfig.pTokens || typeof networkConfig.pTokens !== 'object') {
      return undefined;
    }
    return (networkConfig.pTokens as Record<string, `0x${string}`>)[symbol];
  };

  const getContractAddress = (contractName: keyof typeof networkConfig): `0x${string}` | undefined => {
    const address = networkConfig[contractName];
    return typeof address === 'string' && address.startsWith('0x') ? address as `0x${string}` : undefined;
  };

  return {
    // Network state
    isConnected,
    currentChainId,
    isCurrentNetworkSupported,
    networkConfig,
    networkDisplayInfo,
    
    // Contract addresses
    peridottrollerAddress,
    getTokenAddress,
    getContractAddress,
    
    // Network utilities
    isTestnet: networkDisplayInfo.isTestnet,
    networkName: networkDisplayInfo.name,
    readableName: networkDisplayInfo.readable,
    
    // Current active network (fallback)
    activeNetwork: currentActiveNetwork,
    activeNetworkContracts: currentActiveNetworkContracts,
  };
} 