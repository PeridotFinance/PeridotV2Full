import { useState, useCallback, useRef, useEffect } from 'react'
import { useAccount, useWriteContract, useReadContract, usePublicClient } from 'wagmi'
import { parseUnits, Address, erc20Abi, encodeFunctionData } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'
import pTokenAbi from '@/app/abis/pTokenAbi.json'
import { toast } from 'sonner'
import { autoVerifyTransaction } from '@/lib/auto-leaderboard-verifier'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useSmartExecution, TransactionCall } from '@/hooks/use-smart-execution'
import { usePrivy } from '@privy-io/react-auth'

const WMON_ABI = [
  { type: 'function', stateMutability: 'payable', name: 'deposit', inputs: [], outputs: [] },
] as const

interface UseMagmaBoostedSupplyTransactionProps {
  assetId: string
  amount: string
  useNative: boolean
  onSuccess?: () => void
  onError?: (error: Error) => void
}

export type TransactionStep = 'idle' | 'checking-allowance' | 'wrapping' | 'approving' | 'supplying' | 'success' | 'error'

export function useMagmaBoostedSupplyTransaction({
  assetId,
  amount,
  useNative,
  onSuccess,
  onError,
}: UseMagmaBoostedSupplyTransactionProps) {
  const { getAccessToken } = usePrivy()
  const { chainId } = useAccount()
  const { address, isSmartAccountActive } = useActiveWallet()
  const { execute: executeSmartTx } = useSmartExecution()
  const publicClient = usePublicClient()
  const [step, setStep] = useState<TransactionStep>('idle')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Specific hashes for tracking
  const [wrapHash, setWrapHash] = useState<`0x${string}` | undefined>()
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>()
  const [supplyHash, setSupplyHash] = useState<`0x${string}` | undefined>()

  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  const onErrorRef = useRef(onError);
  useEffect(() => {
      onErrorRef.current = onError;
  }, [onError]);

  const targetChainId = chainId || 143
  const contractAddresses = getAssetContractAddresses(assetId, targetChainId)
  const underlyingAddress = contractAddresses?.underlyingAddress as Address // WMON
  const pTokenAddress = contractAddresses?.pTokenAddress as Address

  // Read current allowance of WMON for the pToken
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: underlyingAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && pTokenAddress ? [address, pTokenAddress] : undefined,
    query: {
      enabled: !!address && !!pTokenAddress && !!underlyingAddress,
    },
  })

  // Read user's WMON balance
  const { data: wmonBalance, refetch: refetchWmonBalance } = useReadContract({
    address: underlyingAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address!],
    query: {
      enabled: !!address && !!underlyingAddress,
    }
  })

  const { writeContractAsync } = useWriteContract()

  const emitUpdate = useCallback((nextStep: string, message?: string, hash?: string) => {
    try {
      if (typeof window !== 'undefined') {
        const detail: any = { 
          action: 'supply', 
          step: nextStep,
          isMagma: true,
          useNative 
        }
        if (message) detail.statusMessage = message
        if (hash) detail.txHash = hash
        window.dispatchEvent(new CustomEvent('peridot:tx-update', { detail }))
      }
    } catch {}
  }, [useNative])

  const executeSupply = useCallback(async () => {
    if (!address || !amount || !pTokenAddress || !underlyingAddress || !publicClient) {
      setError('Missing required parameters or public client')
      setStep('error')
      setStatusMessage('Missing parameters')
      return
    }

    try {
      if (typeof window !== 'undefined') {
        ;(window as any).__PERIDOT_TX_ACTIVE = true
        window.dispatchEvent(new CustomEvent('peridot:tx-active'))
      }

      console.log('MagmaSupply: Starting flow', { amount, useNative, targetChainId })
      setStep('checking-allowance')
      setStatusMessage('Checking balances and allowances...')
      emitUpdate('checking-allowance', 'Checking balances and allowances...')
      setError(null)
      const amountWei = parseUnits(amount, 18)

      // Handle Smart Account Batch Path
      if (isSmartAccountActive) {
        console.log('MagmaSupply: Smart Account path detected')
        const calls: TransactionCall[] = []
        
        const { data: currentWmonBalance } = await refetchWmonBalance()
        const balance = currentWmonBalance || BigInt(0)
        
        // 1. Wrap if needed
        if (useNative && balance < amountWei) {
          const needed = amountWei - balance
          calls.push({
            to: underlyingAddress,
            data: encodeFunctionData({
              abi: WMON_ABI,
              functionName: 'deposit',
              args: [],
            }),
            value: needed,
          })
        }

        // 2. Approve (always included in batch for simplicity if SA)
        calls.push({
          to: underlyingAddress,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [pTokenAddress, amountWei],
          }),
        })

        // 3. Mint
        calls.push({
          to: pTokenAddress,
          data: encodeFunctionData({
            abi: pTokenAbi,
            functionName: 'mint',
            args: [amountWei],
          }),
        })

        setStep('supplying')
        setStatusMessage('Supplying with smart account...')
        emitUpdate('supplying', 'Supplying with smart account...')

        try {
          const hash = await executeSmartTx(calls, {
            chainId: chainId as number,
            onSuccess: (h) => {
              setSupplyHash(h)
              setStep('success')
              setStatusMessage('Transaction completed successfully!')
              emitUpdate('success', 'Transaction completed successfully!', h)
              toast.success("Successfully supplied to Magma Boosted market")
              onSuccessRef.current?.()
            }
          })
          return
        } catch (err) {
          console.error('Smart account magma supply error:', err)
          return
        }
      }

      // EOA Path (Original Flow)
      // 1. Handle Native MON -> WMON wrapping if necessary
      if (useNative) {
        console.log('MagmaSupply: Checking WMON balance for wrap')
        const { data: currentWmonBalance } = await refetchWmonBalance()
        const balance = currentWmonBalance || BigInt(0)
        console.log('MagmaSupply: WMON balance', balance.toString())
        
        if (balance < amountWei) {
          const needed = amountWei - balance
          console.log('MagmaSupply: Wrapping needed', needed.toString())
          setStep('wrapping')
          setStatusMessage(`Wrapping ${amount} MON to WMON...`)
          emitUpdate('wrapping', `Wrapping ${amount} MON to WMON...`)
          
          const hash = await writeContractAsync({
            address: underlyingAddress,
            abi: WMON_ABI,
            functionName: 'deposit',
            value: needed,
            chainId: targetChainId,
          } as any)
          setWrapHash(hash)
          emitUpdate('wrapping', 'Waiting for wrap confirmation...', hash)
          
          console.log('MagmaSupply: Wrap tx sent', hash)
          setStatusMessage('Waiting for wrap confirmation...')
          await publicClient.waitForTransactionReceipt({ hash })
          console.log('MagmaSupply: Wrap confirmed')
          toast.success("Successfully wrapped MON to WMON")
          await refetchWmonBalance()
        } else {
          console.log('MagmaSupply: Sufficient WMON balance, skipping wrap')
        }
      }

      // 2. Handle Approval if needed
      console.log('MagmaSupply: Checking allowance')
      const { data: currentAllowance } = await refetchAllowance()
      const allowanceVal = currentAllowance || BigInt(0)
      console.log('MagmaSupply: Current allowance', allowanceVal.toString())

      if (allowanceVal < amountWei) {
        console.log('MagmaSupply: Approval needed')
        setStep('approving')
        setStatusMessage(`Approving WMON for supply...`)
        emitUpdate('approving', `Approving WMON for supply...`)
        const hash = await writeContractAsync({
          address: underlyingAddress,
          abi: erc20Abi,
          functionName: 'approve',
          args: [pTokenAddress, amountWei],
          chainId: targetChainId,
        } as any)
        setApproveHash(hash)
        emitUpdate('approving', 'Waiting for approval confirmation...', hash)
        
        console.log('MagmaSupply: Approval tx sent', hash)
        setStatusMessage('Waiting for approval confirmation...')
        await publicClient.waitForTransactionReceipt({ hash })
        console.log('MagmaSupply: Approval confirmed')
        await refetchAllowance()
      } else {
        console.log('MagmaSupply: Sufficient allowance, skipping approve')
      }

      // 3. Handle Mint
      console.log('MagmaSupply: Supplying (minting)')
      setStep('supplying')
      setStatusMessage(`Estimating gas for supply...`)
      emitUpdate('supplying', `Estimating gas for supply...`)
      
      // Estimate gas for mint call - Magma staking requires more gas
      let gasLimit: bigint | undefined
      try {
        const estimatedGas = await publicClient.estimateGas({
          account: address,
          to: pTokenAddress,
          data: encodeFunctionData({
            abi: pTokenAbi as any,
            functionName: 'mint',
            args: [amountWei],
          }),
        })
        // Add 30% buffer for safety (Magma staking operations can be gas-intensive)
        gasLimit = (estimatedGas * 130n) / 100n
        console.log('MagmaSupply: Estimated gas', estimatedGas.toString(), 'with buffer', gasLimit.toString())
      } catch (gasErr) {
        console.warn('MagmaSupply: Gas estimation failed, using fallback', gasErr)
        // Fallback to a higher gas limit for Magma staking (500k is conservative)
        gasLimit = 500000n
      }
      
      setStatusMessage(`Supplying ${amount} WMON...`)
      emitUpdate('supplying', `Supplying ${amount} WMON...`)
      const hash = await writeContractAsync({
        address: pTokenAddress,
        abi: pTokenAbi as any,
        functionName: 'mint',
        args: [amountWei],
        chainId: targetChainId,
        gas: gasLimit,
      } as any)
      setSupplyHash(hash)
      emitUpdate('supplying', 'Waiting for supply confirmation...', hash)
      
      console.log('MagmaSupply: Supply tx sent', hash)
      setStatusMessage('Waiting for supply confirmation...')
      await publicClient.waitForTransactionReceipt({ hash })
      console.log('MagmaSupply: Supply confirmed')

      setStep('success')
      setStatusMessage('Transaction completed successfully!')
      emitUpdate('success', 'Transaction completed successfully!', hash)
      toast.success("Successfully supplied to Magma Boosted market")
      
      // Dispatch success event for dialogs
      window.dispatchEvent(new CustomEvent('peridot:tx-success', {
        detail: {
          type: 'supply',
          address,
          chainId: targetChainId,
          assetId,
          txHash: hash,
          tokenSymbol: 'WMON'
        }
      }))

      // Points verification
      const asset = { symbol: 'WMON', price: 2.85 } // Placeholder or fetch actual
      const cleanAmt = amount.replace(/[^0-9.]/g, '')
      
      getAccessToken().then(token => {
        fetch('/api/leaderboard/pre-verify', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            txHash: hash,
            walletAddress: address,
            chainId: targetChainId,
            actionType: 'supply',
            amount: cleanAmt,
            usdValue: parseFloat(cleanAmt) * asset.price,
            tokenSymbol: asset.symbol,
          }),
        }).then(async r => {
          if (r.ok) {
            autoVerifyTransaction({
              txHash: hash,
              walletAddress: address,
              chainId: targetChainId,
              privyToken: token,
            }).catch(() => {})
          }
        }).catch(() => {})
      })

      onSuccessRef.current?.()

    } catch (err: any) {
      console.error('MagmaSupply: Error in flow', err)
      const errorMsg = err?.message || 'Unknown error'
      setError(errorMsg)
      setStep('error')
      setStatusMessage(errorMsg)
      emitUpdate('error', errorMsg)
      onErrorRef.current?.(err instanceof Error ? err : new Error(errorMsg))
    } finally {
      if (typeof window !== 'undefined') {
        ;(window as any).__PERIDOT_TX_ACTIVE = false
        window.dispatchEvent(new CustomEvent('peridot:tx-idle'))
      }
    }
  }, [address, amount, useNative, underlyingAddress, pTokenAddress, writeContractAsync, publicClient, targetChainId, chainId, refetchWmonBalance, refetchAllowance, emitUpdate, assetId, isSmartAccountActive, executeSmartTx])

  const reset = useCallback(() => {
    setStep('idle')
    setStatusMessage(null)
    setError(null)
    setWrapHash(undefined)
    setApproveHash(undefined)
    setSupplyHash(undefined)
  }, [])

  return {
    executeSupply,
    step,
    statusMessage,
    error,
    isLoading: ['checking-allowance', 'wrapping', 'approving', 'supplying'].includes(step),
    reset,
    wrapHash,
    approveHash,
    supplyHash,
  }
}
