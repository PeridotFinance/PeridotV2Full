import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { getChainConfig, monadTestnetContracts } from '@/config/contracts'
import peridottrollerAbi from '@/app/abis/peridottrollerABI.json'
import { defineChain, encodeFunctionData } from 'viem'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useSmartExecution } from '@/hooks/use-smart-execution'
import { useState } from 'react'

// Define the Monad testnet chain object for viem
const monadTestnet = defineChain({
  id: monadTestnetContracts.chainId,
  name: monadTestnetContracts.chainNameReadable,
  nativeCurrency: { name: 'Monad', symbol: 'MONAD', decimals: 18 },
  rpcUrls: {
    default: { http: [monadTestnetContracts.rpcUrl] },
    public: { http: [monadTestnetContracts.rpcUrl] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: monadTestnetContracts.explorer },
  },
  testnet: true,
})


export function usePeridotRewards() {
  const { chain, chainId, isConnected } = useAccount()
  const { address, isSmartAccountActive } = useActiveWallet()
  const { execute: executeSmartTx } = useSmartExecution()
  const { writeContract, isPending: isEoaClaiming, isSuccess: isEoaClaimed, isError: isEoaClaimError, error: eoaClaimError } = useWriteContract()
  
  const [saClaiming, setSaClaiming] = useState(false)
  const [saClaimed, setSaClaimed] = useState(false)
  const [saClaimError, setSaClaimError] = useState<Error | null>(null)

  const currentChainId = isConnected ? chainId : monadTestnet.id
  const chainConfig = getChainConfig(currentChainId as number)
  const comptrollerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? (chainConfig.unitrollerProxy as `0x${string}`) : undefined

  const { data: accruedRewards, isLoading: isLoadingAccruedRewards, refetch } = useReadContract({
    address: comptrollerAddress,
    abi: peridottrollerAbi,
    functionName: 'peridotAccrued',
    args: [address],
    query: {
      enabled: !!address && !!comptrollerAddress,
      staleTime: 60 * 1000, // 1 minute
      gcTime: 10 * 60 * 1000,
    },
  })

  const claimRewards = async (pTokenAddresses?: `0x${string}`[]) => {
    if (!comptrollerAddress || !address || !chainId) {
      console.error('Missing required data for claiming rewards:', {
        comptrollerAddress: !!comptrollerAddress,
        address: !!address,
        chainId: !!chainId
      })
      return
    }
    
    console.log('Attempting to claim rewards:', {
      comptrollerAddress,
      pTokenAddresses,
      userAddress: address,
      chainId,
      isSmartAccountActive
    })
    
    try {
      if (isSmartAccountActive) {
        setSaClaiming(true)
        setSaClaimError(null)
        setSaClaimed(false)
        
        const data = pTokenAddresses && pTokenAddresses.length > 0
          ? encodeFunctionData({
              abi: peridottrollerAbi,
              functionName: 'claimPeridot',
              args: [address, pTokenAddresses],
            })
          : encodeFunctionData({
              abi: peridottrollerAbi,
              functionName: 'claimPeridot',
              args: [address],
            })

        try {
          await executeSmartTx({
            to: comptrollerAddress,
            data,
          }, {
            chainId: chainId as number,
            onSuccess: () => {
              setSaClaimed(true)
              refetch()
            },
            onError: (err) => {
              setSaClaimError(err)
            }
          })
        } finally {
          setSaClaiming(false)
        }
        return
      }

      if (pTokenAddresses && pTokenAddresses.length > 0) {
        // Use claimPeridot(address holder, contract PToken[] pTokens)
        writeContract({
          address: comptrollerAddress,
          abi: peridottrollerAbi,
          functionName: 'claimPeridot',
          args: [address, pTokenAddresses],
          account: address,
          chain: chain,
        })
      } else {
        // Use claimPeridot(address holder) - claims from all markets
        writeContract({
          address: comptrollerAddress,
          abi: peridottrollerAbi,
          functionName: 'claimPeridot',
          args: [address],
          account: address,
          chain: chain,
        })
      }
    } catch (error) {
      console.error('Error in claimRewards:', error)
    }
  }

  return {
    accruedRewards,
    isLoadingAccruedRewards,
    claimRewards,
    isClaiming: isSmartAccountActive ? saClaiming : isEoaClaiming,
    isClaimed: isSmartAccountActive ? saClaimed : isEoaClaimed,
    isClaimError: isSmartAccountActive ? !!saClaimError : isEoaClaimError,
    claimError: isSmartAccountActive ? saClaimError : eoaClaimError,
    refetchAccruedRewards: refetch,
  }
}
