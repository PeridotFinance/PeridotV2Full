import { useState, useCallback } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, Address, encodeFunctionData } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'
import { getChainConfig } from '@/config/contracts'
import pTokenAbi from '@/app/abis/pTokenAbi.json'
import v3VaultAbi from '@/app/abis/v3VaultAbi.json'
import { toast } from 'sonner'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useSmartExecution, TransactionCall } from '@/hooks/use-smart-execution'
import { emitTxUpdate } from '@/lib/txFeedback'

interface UseBoostedRedeemTransactionProps {
  assetId: string
  amount: string
  redeemType: 'underlying' | 'pTokens'
  onSuccess?: () => void
  onError?: (error: Error) => void
}

type TransactionStep = 'idle' | 'checking-balance' | 'redeeming' | 'withdrawing' | 'success' | 'error'

export function useBoostedRedeemTransaction({
  assetId,
  amount,
  redeemType,
  onSuccess,
  onError,
}: UseBoostedRedeemTransactionProps) {
  const { chainId } = useAccount()
  const { address, isSmartAccountActive } = useActiveWallet()
  const { execute: executeSmartTx } = useSmartExecution()
  const [step, setStep] = useState<TransactionStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [redeemHash, setRedeemHash] = useState<`0x${string}` | undefined>()
  const [withdrawHash, setWithdrawHash] = useState<`0x${string}` | undefined>()

  // Drive the shared Expert-mode tx dialog. Without these emits the dialog
  // stays on its 'supply' default for the whole boosted withdraw, since this
  // hook otherwise only mutates local component state.
  const emit = useCallback((nextStep: string, message?: string, hash?: string) => {
    emitTxUpdate({ action: 'withdraw', step: nextStep, statusMessage: message, txHash: hash })
  }, [])

  const contractAddresses = getAssetContractAddresses(assetId, chainId || 143)
  const pTokenAddress = contractAddresses?.pTokenAddress as Address
  const vaultAddress = contractAddresses?.underlyingAddress as Address

  const boostedType = assetId.includes('morpho') ? 'morpho' : 'pancake'

  // Contract write functions
  const { writeContract: writeRedeem } = useWriteContract()
  const { writeContract: writeWithdraw } = useWriteContract()

  // Wait for receipts
  useWaitForTransactionReceipt({
    hash: redeemHash || withdrawHash,
    onSuccess: (receipt) => {
      if (receipt.transactionHash === redeemHash) {
        setRedeemHash(undefined)
        if (boostedType === 'pancake') {
          // For Pancake, we need to do a second transaction to withdraw from vault
          setStep('withdrawing')
          emit('withdrawing', 'Finalizing withdraw…')

          // Calculate slippage amounts (assume 0.5% slippage)
          const slippageMultiplier = 0.995
          const amount0Wei = parseUnits(amount, 6) // AUSD 6 decimals
          const amount1Wei = parseUnits(amount, 6) // USDC 6 decimals

          const amount0Min = (amount0Wei * BigInt(Math.floor(slippageMultiplier * 10000))) / 10000n
          const amount1Min = (amount1Wei * BigInt(Math.floor(slippageMultiplier * 10000))) / 10000n

          // Use the redeemed shares amount (simplified 1:1 ratio for now)
          const sharesToWithdraw = amountWei

          writeWithdraw({
            address: vaultAddress,
            abi: v3VaultAbi,
            functionName: 'withdrawDual',
            args: [{
              owner: address,
              receiver: address,
              shares: sharesToWithdraw,
              amount0Min,
              amount1Min,
              deadline: Math.floor(Date.now() / 1000) + 3600
            }],
          })
        } else {
          setStep('success')
          emit('success', '', receipt.transactionHash)
          onSuccess?.()
          toast.success('Successfully redeemed from boosted market!')
        }
      } else if (receipt.transactionHash === withdrawHash) {
        setWithdrawHash(undefined)
        setStep('success')
        emit('success', '', receipt.transactionHash)
        onSuccess?.()
        toast.success('Successfully redeemed from Pancake boosted market!')
      }
    },
    onError: (error) => {
      console.error('Transaction failed:', error)
      setError('Transaction failed')
      setStep('error')
      emit('error', 'Withdraw failed. Please try again.')
      onError?.(new Error('Transaction failed'))
    },
  })

  const executeRedeem = useCallback(async () => {
    if (!address || !chainId || !amount || !pTokenAddress) {
      setError('Missing required parameters')
      setStep('error')
      return
    }

    try {
      setStep('checking-balance')
      setError(null)

      // Calculate amount to redeem
      const decimals = boostedType === 'morpho' ? 6 : 18 // Morpho pToken: 6 decimals, Pancake: 18 decimals
      const amountWei = parseUnits(amount, decimals)

      setStep('redeeming')
      emit('redeeming', 'Submitting withdraw…')

      const functionName = redeemType === 'underlying' ? 'redeemUnderlying' : 'redeem'

      if (isSmartAccountActive) {
        // Smart Account Path
        if (boostedType === 'pancake' && redeemType === 'pTokens') {
          // Pancake: Batch (Redeem pTokens + Withdraw Dual from Vault)
          // For pTokens redeem, amountWei is the shares amount
          setStep('withdrawing')
          emit('withdrawing', 'Finalizing withdraw…')

          const slippageMultiplier = 0.995
          const amount0Wei = parseUnits(amount, 6)
          const amount1Wei = parseUnits(amount, 6)
          const amount0Min = (amount0Wei * BigInt(Math.floor(slippageMultiplier * 10000))) / 10000n
          const amount1Min = (amount1Wei * BigInt(Math.floor(slippageMultiplier * 10000))) / 10000n

          const calls: TransactionCall[] = [
            {
              to: pTokenAddress,
              data: encodeFunctionData({
                abi: pTokenAbi,
                functionName: 'redeem',
                args: [amountWei],
              }),
            },
            {
              to: vaultAddress,
              data: encodeFunctionData({
                abi: v3VaultAbi,
                functionName: 'withdrawDual',
                args: [{
                  owner: address,
                  receiver: address,
                  shares: amountWei,
                  amount0Min,
                  amount1Min,
                  deadline: Math.floor(Date.now() / 1000) + 3600
                }],
              }),
            }
          ]

          try {
            const hash = await executeSmartTx(calls, {
              chainId: chainId as number,
              onSuccess: (h) => {
                setWithdrawHash(h)
                setStep('success')
                emit('success', '', h)
                onSuccess?.()
                toast.success('Successfully redeemed and withdrawn from Pancake market!')
              }
            })
            return
          } catch (err) {
            console.error('Smart account pancake redeem batch error:', err)
            setStep('error')
            emit('error', 'Withdraw failed. Please try again.')
            return
          }
        }

        // Standard Single Call (Morpho or Pancake underlying)
        try {
          const hash = await executeSmartTx({
            to: pTokenAddress,
            data: encodeFunctionData({
              abi: pTokenAbi,
              functionName: functionName,
              args: [amountWei],
            }),
          }, {
            chainId: chainId as number,
            onSuccess: (h) => {
              setRedeemHash(h)
              // Receipt handler will catch this and trigger Pancake withdraw if needed
            }
          })
          return
        } catch (err) {
          console.error('Smart account boosted redeem error:', err)
          setStep('error')
          emit('error', 'Withdraw failed. Please try again.')
          return
        }
      }

      // EOA Path
      // Redeem pTokens
      writeRedeem({
        address: pTokenAddress,
        abi: pTokenAbi,
        functionName: functionName,
        args: [amountWei],
      })

    } catch (err) {
      console.error('Redemption execution error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStep('error')
      emit('error', 'Withdraw failed. Please try again.')
      onError?.(err instanceof Error ? err : new Error('Unknown error'))
    }
  }, [address, chainId, amount, pTokenAddress, redeemType, writeRedeem, boostedType, vaultAddress, address, writeWithdraw, onError, onSuccess, emit])

  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setRedeemHash(undefined)
    setWithdrawHash(undefined)
  }, [])

  return {
    executeRedeem,
    step,
    error,
    redeemHash,
    withdrawHash,
    reset,
    isLoading: step === 'checking-balance' || step === 'redeeming' || step === 'withdrawing',
  }
}
