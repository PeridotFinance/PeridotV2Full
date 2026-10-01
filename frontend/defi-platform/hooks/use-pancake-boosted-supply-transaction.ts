import { useState, useEffect, useCallback } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { parseUnits, formatUnits, Address, erc20Abi, encodeFunctionData } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'
import { getChainConfig } from '@/config/contracts'
import pTokenAbi from '@/app/abis/pTokenAbi.json'
import v3VaultAbi from '@/app/abis/v3VaultAbi.json' // Need to create this
import { toast } from 'sonner'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useSmartExecution, TransactionCall } from '@/hooks/use-smart-execution'

interface UsePancakeBoostedSupplyTransactionProps {
  assetId: string
  amount0: string // AUSD amount
  amount1: string // USDC amount
  slippage?: number // Slippage tolerance in percentage (default 0.5%)
  deadline?: number // Deadline in seconds (default 3600)
  onSuccess?: () => void
  onError?: (error: Error) => void
}

type TransactionStep = 'idle' | 'checking-allowances' | 'approving-tokens' | 'approved-tokens' | 'depositing-vault' | 'approved-shares' | 'supplying' | 'success' | 'error'

export function usePancakeBoostedSupplyTransaction({
  assetId,
  amount0,
  amount1,
  slippage = 0.5, // 0.5% default slippage
  deadline = 3600, // 1 hour default
  onSuccess,
  onError,
}: UsePancakeBoostedSupplyTransactionProps) {
  const { chainId } = useAccount()
  const { address, isSmartAccountActive } = useActiveWallet()
  const { execute: executeSmartTx } = useSmartExecution()
  const [step, setStep] = useState<TransactionStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [approve0Hash, setApprove0Hash] = useState<`0x${string}` | undefined>()
  const [approve1Hash, setApprove1Hash] = useState<`0x${string}` | undefined>()
  const [depositHash, setDepositHash] = useState<`0x${string}` | undefined>()
  const [approveSharesHash, setApproveSharesHash] = useState<`0x${string}` | undefined>()
  const [supplyHash, setSupplyHash] = useState<`0x${string}` | undefined>()
  const [depositedShares, setDepositedShares] = useState<bigint>(0n)

  const contractAddresses = getAssetContractAddresses(assetId, chainId || 143)
  const vaultAddress = contractAddresses?.underlyingAddress as Address // V3LPVault4626
  const pTokenAddress = contractAddresses?.pTokenAddress as Address

  // Contract addresses for tokens
  const ausdAddress = '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a' as Address
  const usdcAddress = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603' as Address

  // Check allowances
  const { data: allowance0, refetch: refetchAllowance0 } = useReadContract({
    address: ausdAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && vaultAddress ? [address, vaultAddress] : undefined,
    query: { enabled: !!address && !!vaultAddress },
  })

  const { data: allowance1, refetch: refetchAllowance1 } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && vaultAddress ? [address, vaultAddress] : undefined,
    query: { enabled: !!address && !!vaultAddress },
  })

  // Check vault shares allowance to pToken
  const { data: sharesAllowance, refetch: refetchSharesAllowance } = useReadContract({
    address: vaultAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && pTokenAddress ? [address, pTokenAddress] : undefined,
    query: { enabled: !!address && !!pTokenAddress },
  })

  // Check vault shares balance after deposit
  const { data: vaultSharesBalance, refetch: refetchVaultShares } = useReadContract({
    address: vaultAddress,
    abi: v3VaultAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!vaultAddress && step === 'approved-shares' },
  })

  // Contract write functions
  const { writeContract: writeApprove0 } = useWriteContract()
  const { writeContract: writeApprove1 } = useWriteContract()
  const { writeContract: writeDeposit } = useWriteContract()
  const { writeContract: writeApproveShares } = useWriteContract()
  const { writeContract: writeSupply } = useWriteContract()

  // Wait for approve0 receipt
  useWaitForTransactionReceipt({
    hash: approve0Hash,
    onSuccess: (receipt) => {
      setApprove0Hash(undefined)
      checkNextStep()
    },
    onError: (error) => {
      console.error('Approve0 transaction failed:', error)
      setError('AUSD approval failed')
      setStep('error')
      onError?.(new Error('AUSD approval failed'))
    },
  })

  // Wait for approve1 receipt
  useWaitForTransactionReceipt({
    hash: approve1Hash,
    onSuccess: (receipt) => {
      setApprove1Hash(undefined)
      checkNextStep()
    },
    onError: (error) => {
      console.error('Approve1 transaction failed:', error)
      setError('USDC approval failed')
      setStep('error')
      onError?.(new Error('USDC approval failed'))
    },
  })

  // Wait for deposit receipt and capture shares
  useWaitForTransactionReceipt({
    hash: depositHash,
    onSuccess: (receipt) => {
      setDepositHash(undefined)
      // In a real implementation, you'd parse the logs to get the shares returned
      // For now, we'll query balance after deposit
      setTimeout(() => checkVaultShares(), 2000) // Wait 2s for indexing
    },
    onError: (error) => {
      console.error('Deposit transaction failed:', error)
      setError('Vault deposit failed')
      setStep('error')
      onError?.(new Error('Vault deposit failed'))
    },
  })

  // Wait for approve shares receipt
  useWaitForTransactionReceipt({
    hash: approveSharesHash,
    onSuccess: (receipt) => {
      setApproveSharesHash(undefined)
      checkNextStep()
    },
    onError: (error) => {
      console.error('Approve shares transaction failed:', error)
      setError('Shares approval failed')
      setStep('error')
      onError?.(new Error('Shares approval failed'))
    },
  })

  // Wait for supply receipt
  useWaitForTransactionReceipt({
    hash: supplyHash,
    onSuccess: (receipt) => {
      setSupplyHash(undefined)
      setStep('success')
      onSuccess?.()
      toast.success('Successfully supplied to Pancake Boosted market!')
    },
    onError: (error) => {
      console.error('Supply transaction failed:', error)
      setError('pToken mint failed')
      setStep('error')
      onError?.(new Error('pToken mint failed'))
    },
  })

  const needsApproval0 = useCallback(() => {
    if (!allowance0 || !amount0) return true
    const amountWei = parseUnits(amount0, 6) // AUSD has 6 decimals
    return allowance0 < amountWei
  }, [allowance0, amount0])

  const needsApproval1 = useCallback(() => {
    if (!allowance1 || !amount1) return true
    const amountWei = parseUnits(amount1, 6) // USDC has 6 decimals
    return allowance1 < amountWei
  }, [allowance1, amount1])

  const checkVaultShares = useCallback(async () => {
    // Trigger a refetch of vault shares balance
    refetchVaultShares()
  }, [refetchVaultShares])

  // Update deposited shares when balance is fetched
  useEffect(() => {
    if (vaultSharesBalance && vaultSharesBalance > 0n && step === 'approved-shares') {
      setDepositedShares(vaultSharesBalance)
    }
  }, [vaultSharesBalance, step])

  const needsSharesApproval = useCallback(() => {
    return depositedShares > 0n
  }, [depositedShares])

  const checkNextStep = useCallback(() => {
    if (step === 'approving-tokens' && needsApproval0() === false && needsApproval1() === false) {
      setStep('approved-tokens')
    } else if (step === 'approved-tokens') {
      setStep('depositing-vault')
    } else if (step === 'approved-shares' && needsSharesApproval()) {
      setStep('supplying')
    }
  }, [step, needsApproval0, needsApproval1, needsSharesApproval])

  const executeSupply = useCallback(async () => {
    if (!address || !chainId || !vaultAddress || !pTokenAddress) {
      setError('Missing required parameters')
      setStep('error')
      return
    }

    try {
      setStep('checking-allowances')
      setError(null)

      const requiresApproval0 = needsApproval0()
      const requiresApproval1 = needsApproval1()

      if (isSmartAccountActive) {
        // Smart Account: Batch (Approve AUSD + Approve USDC + Deposit Dual)
        setStep('depositing-vault')
        const calls: TransactionCall[] = []
        
        const amount0Wei = parseUnits(amount0, 6)
        const amount1Wei = parseUnits(amount1, 6)
        const slippageMultiplier = (100 - slippage) / 100
        const amount0Min = (amount0Wei * BigInt(Math.floor(slippageMultiplier * 10000))) / 10000n
        const amount1Min = (amount1Wei * BigInt(Math.floor(slippageMultiplier * 10000))) / 10000n

        if (requiresApproval0) {
          calls.push({
            to: ausdAddress,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: 'approve',
              args: [vaultAddress, amount0Wei],
            }),
          })
        }

        if (requiresApproval1) {
          calls.push({
            to: usdcAddress,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: 'approve',
              args: [vaultAddress, amount1Wei],
            }),
          })
        }

        calls.push({
          to: vaultAddress,
          data: encodeFunctionData({
            abi: v3VaultAbi,
            functionName: 'depositDual',
            args: [{
              receiver: address,
              refundReceiver: address,
              amount0Desired: amount0Wei,
              amount1Desired: amount1Wei,
              amount0Min,
              amount1Min,
              minShares: 0n,
              deadline: Math.floor(Date.now() / 1000) + deadline
            }],
          }),
        })

        try {
          const hash = await executeSmartTx(calls, {
            chainId: chainId as number,
            onSuccess: (h) => {
              setDepositHash(h)
              // This will trigger the useEffect that checks for vault shares
              setTimeout(() => checkVaultShares(), 2000)
            }
          })
          return
        } catch (err) {
          console.error('Smart account pancake supply error:', err)
          return
        }
      }

      if (requiresApproval0 || requiresApproval1) {
        setStep('approving-tokens')

        // Approve both tokens
        if (requiresApproval0) {
          writeApprove0({
            address: ausdAddress,
            abi: erc20Abi,
            functionName: 'approve',
            args: [vaultAddress, parseUnits(amount0, 6)],
          })
        }

        if (requiresApproval1) {
          writeApprove1({
            address: usdcAddress,
            abi: erc20Abi,
            functionName: 'approve',
            args: [vaultAddress, parseUnits(amount1, 6)],
          })
        }
      } else {
        setStep('approved-tokens')
      }
    } catch (err) {
      console.error('Transaction execution error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStep('error')
      onError?.(err instanceof Error ? err : new Error('Unknown error'))
    }
  }, [address, chainId, vaultAddress, pTokenAddress, amount0, amount1, needsApproval0, needsApproval1, writeApprove0, writeApprove1, onError])

  // Auto-execute deposit after token approvals
  useEffect(() => {
    if (step === 'approved-tokens' && !depositHash) {
      setStep('depositing-vault')

      // Calculate slippage amounts
      const amount0Wei = parseUnits(amount0, 6) // AUSD 6 decimals
      const amount1Wei = parseUnits(amount1, 6) // USDC 6 decimals
      const slippageMultiplier = (100 - slippage) / 100

      const amount0Min = (amount0Wei * BigInt(Math.floor(slippageMultiplier * 10000))) / 10000n
      const amount1Min = (amount1Wei * BigInt(Math.floor(slippageMultiplier * 10000))) / 10000n

      // Deposit dual tokens to vault
      writeDeposit({
        address: vaultAddress,
        abi: v3VaultAbi,
        functionName: 'depositDual',
        args: [{
          receiver: address,
          refundReceiver: address,
          amount0Desired: amount0Wei,
          amount1Desired: amount1Wei,
          amount0Min,
          amount1Min,
          minShares: 0n,
          deadline: Math.floor(Date.now() / 1000) + deadline
        }],
      })
    }
  }, [step, depositHash, vaultAddress, address, amount0, amount1, slippage, deadline, writeDeposit])

  // Auto-approve shares after deposit
  useEffect(() => {
    if (step === 'approved-shares' && depositedShares > 0n && !approveSharesHash) {
      if (isSmartAccountActive) {
        // Smart Account: Approve Shares + Mint (Batch)
        setStep('supplying')
        const calls: TransactionCall[] = [
          {
            to: vaultAddress,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: 'approve',
              args: [pTokenAddress, depositedShares],
            }),
          },
          {
            to: pTokenAddress,
            data: encodeFunctionData({
              abi: pTokenAbi,
              functionName: 'mint',
              args: [depositedShares],
            }),
          }
        ]
        
        executeSmartTx(calls, {
          chainId: chainId as number,
          onSuccess: (h) => {
            setSupplyHash(h)
            setStep('success')
            onSuccess?.()
            toast.success('Successfully supplied to Pancake Boosted market!')
          }
        }).catch(err => console.error('Smart account pancake supply batch error:', err))
      } else {
        writeApproveShares({
          address: vaultAddress,
          abi: erc20Abi,
          functionName: 'approve',
          args: [pTokenAddress, depositedShares],
        })
      }
    }
  }, [step, depositedShares, approveSharesHash, vaultAddress, pTokenAddress, writeApproveShares, isSmartAccountActive, executeSmartTx])

  // Auto-mint pTokens after share approval (EOA path)
  useEffect(() => {
    if (step === 'approved-shares' && depositedShares > 0n && !supplyHash && !isSmartAccountActive) {
      setStep('supplying')
      writeSupply({
        address: pTokenAddress,
        abi: pTokenAbi,
        functionName: 'mint',
        args: [depositedShares],
      })
    }
  }, [step, depositedShares, supplyHash, pTokenAddress, writeSupply, isSmartAccountActive])

  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setApprove0Hash(undefined)
    setApprove1Hash(undefined)
    setDepositHash(undefined)
    setApproveSharesHash(undefined)
    setSupplyHash(undefined)
  }, [])

  return {
    executeSupply,
    step,
    error,
    needsApproval: needsApproval0() || needsApproval1(),
    approve0Hash,
    approve1Hash,
    depositHash,
    approveSharesHash,
    supplyHash,
    reset,
    isLoading: step !== 'idle' && step !== 'success' && step !== 'error',
  }
}
