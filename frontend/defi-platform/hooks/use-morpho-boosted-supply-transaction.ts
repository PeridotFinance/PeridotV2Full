import { useState, useEffect, useCallback } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { parseUnits, formatUnits, Address, erc20Abi, encodeFunctionData } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'
import { getChainConfig } from '@/config/contracts'
import pTokenAbi from '@/app/abis/pTokenAbi.json'
import { toast } from 'sonner'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useSmartExecution, TransactionCall } from '@/hooks/use-smart-execution'

interface UseMorphoBoostedSupplyTransactionProps {
  assetId: string
  amount: string
  onSuccess?: () => void
  onError?: (error: Error) => void
}

type TransactionStep = 'idle' | 'checking-allowance' | 'approving' | 'approved' | 'supplying' | 'success' | 'error'

export function useMorphoBoostedSupplyTransaction({
  assetId,
  amount,
  onSuccess,
  onError,
}: UseMorphoBoostedSupplyTransactionProps) {
  const { chainId } = useAccount()
  const { address, isSmartAccountActive } = useActiveWallet()
  const { execute: executeSmartTx } = useSmartExecution()
  const [step, setStep] = useState<TransactionStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>()
  const [supplyHash, setSupplyHash] = useState<`0x${string}` | undefined>()

  const contractAddresses = getAssetContractAddresses(assetId, chainId || 143)
  const underlyingAddress = contractAddresses?.underlyingAddress as Address
  const pTokenAddress = contractAddresses?.pTokenAddress as Address

  // Check allowance for AUSD -> pToken
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: underlyingAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && pTokenAddress ? [address, pTokenAddress] : undefined,
    query: {
      enabled: !!address && !!pTokenAddress && !!underlyingAddress,
    },
  })

  // Approve transaction
  const { writeContract: writeApprove, data: approveTxData } = useWriteContract()

  // Supply transaction (mint pTokens)
  const { writeContract: writeSupply, data: supplyTxData } = useWriteContract()

  // Wait for approve receipt
  useWaitForTransactionReceipt({
    hash: approveTxData,
    onSuccess: (receipt) => {
      setApproveHash(receipt.transactionHash)
      setStep('approved')
    },
    onError: (error) => {
      console.error('Approve transaction failed:', error)
      setError('Approval failed')
      setStep('error')
      onError?.(new Error('Approval failed'))
    },
  })

  // Wait for supply receipt
  useWaitForTransactionReceipt({
    hash: supplyTxData,
    onSuccess: (receipt) => {
      setSupplyHash(receipt.transactionHash)
      setStep('success')
      onSuccess?.()
      toast.success('Successfully supplied to Morpho Boosted market!')
    },
    onError: (error) => {
      console.error('Supply transaction failed:', error)
      setError('Supply failed')
      setStep('error')
      onError?.(new Error('Supply failed'))
    },
  })

  const needsApproval = useCallback(() => {
    if (!allowance || !amount) return true
    const amountWei = parseUnits(amount, 6) // AUSD has 6 decimals
    return allowance < amountWei
  }, [allowance, amount])

  const executeSupply = useCallback(async () => {
    if (!address || !chainId || !amount || !pTokenAddress || !underlyingAddress) {
      setError('Missing required parameters')
      setStep('error')
      return
    }

    try {
      setStep('checking-allowance')
      setError(null)

      const requiresApproval = needsApproval()

      if (isSmartAccountActive) {
        // Smart Account: Atomic Batch (Approve + Mint)
        setStep('supplying')
        const calls: TransactionCall[] = []
        
        if (requiresApproval) {
          calls.push({
            to: underlyingAddress,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: 'approve',
              args: [pTokenAddress, parseUnits(amount, 6)],
            }),
          })
        }

        calls.push({
          to: pTokenAddress,
          data: encodeFunctionData({
            abi: pTokenAbi,
            functionName: 'mint',
            args: [parseUnits(amount, 6)],
          }),
        })

        try {
          const hash = await executeSmartTx(calls, {
            chainId: chainId as number,
            onSuccess: (h) => {
              setSupplyHash(h)
              setStep('success')
              onSuccess?.()
              toast.success('Successfully supplied to Morpho Boosted market!')
            }
          })
          if (hash) {
            setSupplyHash(hash)
          }
          return
        } catch (err) {
          console.error('Smart account morpho supply error:', err)
          return
        }
      }

      if (requiresApproval) {
        setStep('approving')

        // Approve AUSD to pToken
        writeApprove({
          address: underlyingAddress,
          abi: erc20Abi,
          functionName: 'approve',
          args: [pTokenAddress, parseUnits(amount, 6)],
        })
      } else {
        setStep('supplying')

        // Mint pTokens directly
        writeSupply({
          address: pTokenAddress,
          abi: pTokenAbi,
          functionName: 'mint',
          args: [parseUnits(amount, 6)],
        })
      }
    } catch (err) {
      console.error('Transaction execution error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStep('error')
      onError?.(err instanceof Error ? err : new Error('Unknown error'))
    }
  }, [address, chainId, amount, pTokenAddress, underlyingAddress, needsApproval, writeApprove, writeSupply, onError])

  // Auto-execute supply after approval
  useEffect(() => {
    if (step === 'approved' && !supplyTxData) {
      setStep('supplying')
      writeSupply({
        address: pTokenAddress,
        abi: pTokenAbi,
        functionName: 'mint',
        args: [parseUnits(amount, 6)],
      })
    }
  }, [step, supplyTxData, pTokenAddress, amount, writeSupply])

  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setApproveHash(undefined)
    setSupplyHash(undefined)
  }, [])

  return {
    executeSupply,
    step,
    error,
    needsApproval: needsApproval(),
    approveHash,
    supplyHash,
    reset,
    isLoading: step === 'checking-allowance' || step === 'approving' || step === 'supplying',
  }
}
