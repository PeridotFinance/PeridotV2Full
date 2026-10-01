import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, usePublicClient, useSwitchChain } from 'wagmi'
import { parseUnits, Address, erc20Abi, encodeFunctionData } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { autoVerifyTransaction } from '@/lib/auto-leaderboard-verifier'
import { emitTxUpdate, attachScopedRetryListeners, mapFriendlyError, isRateLimit, isTimeoutError } from '@/lib/txFeedback'
import { parseAndDecodeError } from '@/lib/compound-errors'
import { toast } from 'sonner'
import { resolveHubReadChainId, getChainConfig, CHAIN_IDS } from '@/config/contracts'
import { biconomyAdapter } from '@/lib/biconomyAdapter'
import { TOKENS as BICONOMY_TOKENS } from '@/biconomy/constants'
import { useSmartAccountUpgrade } from '@/components/providers/SmartAccountUpgradeProvider'
import { useSmartAccountStatus } from '@/hooks/use-smart-account-status'
import { useAccountType } from '@/hooks/use-account-type'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useSmartExecution } from '@/hooks/use-smart-execution'
import { usePrivy, useSendTransaction } from '@privy-io/react-auth'
import { FEATURE_FLAGS } from '@/config/featureFlags'

interface UseRedeemTransactionProps {
  assetId: string
  amount: string
  redeemType: 'pTokens' | 'underlying' // Whether to redeem specific pTokens or underlying amount
  onSuccess?: () => void
  onError?: (error: Error) => void
  // Optional override for executing with precomputed raw amount/function
  overrideFunctionName?: 'redeem' | 'redeemUnderlying'
  overrideRawAmount?: bigint
  // Optional chain override: when set, use this chain's contracts instead of the wallet's current chain.
  // The caller is responsible for switching the wallet to this chain before calling executeRedeem.
  overrideChainId?: number
}

type TransactionStep = 'idle' | 'redeeming' | 'success' | 'error'

export function useRedeemTransaction({
  assetId,
  amount,
  redeemType,
  onSuccess,
  onError,
  overrideFunctionName,
  overrideRawAmount,
  overrideChainId,
}: UseRedeemTransactionProps) {
  const { getAccessToken } = usePrivy()
  const { sendTransaction: privySendTransaction } = useSendTransaction()
  const { chainId } = useAccount()
  const { address, isSmartAccountActive } = useActiveWallet()
  const { execute: executeSmartTx } = useSmartExecution()
  const { meeAuthorization } = useSmartAccountUpgrade()
  const { isSmartAccount: statusSmartAccount, smartAccountAddress: detectedSmartAccountAddress } = useSmartAccountStatus()
  const { accountType } = useAccountType()
  const publicClient = usePublicClient()
  const [step, setStep] = useState<TransactionStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [redeemHash, setRedeemHash] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const emitUpdate = useCallback((nextStep: string, message?: string, hash?: string) => {
    emitTxUpdate({ action: 'withdraw', step: nextStep, statusMessage: message, txHash: hash })
  }, [])

  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  const onErrorRef = useRef(onError);
  useEffect(() => {
      onErrorRef.current = onError;
  }, [onError]);

  // Resolve hub chain for reads/writes (e.g., Arbitrum/Mainnet → BSC hub).
  // When overrideChainId is set (e.g. from EasyManagementModal), use that chain directly
  // so the correct position's contracts are used regardless of the wallet's current chain.
  const effectiveChainId = useMemo(() => {
    const base = overrideChainId ?? chainId ?? null
    return resolveHubReadChainId(base) ?? base
  }, [overrideChainId, chainId]) as number | null

  // Get contract addresses for the asset on the effective (hub) chain
  const contractAddresses = effectiveChainId ? getAssetContractAddresses(assetId, effectiveChainId) : null

  // Read pToken decimals (might be 8 instead of 18)
  const { data: pTokenDecimals } = useReadContract({
    address: contractAddresses?.pTokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'decimals',
    args: [],
    query: {
      enabled: !!contractAddresses?.pTokenAddress,
    }
    ,
    chainId: effectiveChainId as any,
  })

  // Read underlying token decimals (usually 18)
  const { data: underlyingDecimals } = useReadContract({
    address: contractAddresses?.underlyingAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'decimals',
    args: [],
    query: {
      enabled: !!contractAddresses?.underlyingAddress,
    }
    ,
    chainId: effectiveChainId as any,
  })

  // Check if we have valid contract addresses
  const canRedeem = Boolean(contractAddresses && contractAddresses.pTokenAddress)

  // Use correct decimals based on redeem type
  const getDecimals = (): number => {
    if (redeemType === 'pTokens') {
      return pTokenDecimals || 8 // Default to 8 for pTokens if not available
    } else {
      return underlyingDecimals || 18 // Default to 18 for underlying tokens
    }
  }
  
  // Normalize user/input amounts: remove commas, handle scientific notation, clamp sub-wei to 0
  const normalizeDecimalString = (raw: string, decimals: number): string => {
    if (!raw) return '0'
    const s = String(raw).trim().replace(/,/g, '')
    if (s === '' || s === '.') return '0'
    // If scientific notation, convert using JS number safely for small magnitudes
    const hasExp = /e/i.test(s)
    if (hasExp) {
      const n = Number(s)
      if (!isFinite(n) || isNaN(n)) return '0'
      const minUnit = Math.pow(10, -Math.max(0, decimals))
      if (Math.abs(n) < minUnit) return '0'
      const fixed = n.toFixed(Math.min(18, Math.max(0, decimals)))
      // Strip trailing zeros
      return fixed.replace(/\.?(0+)$/, '')
    }
    // Limit fractional digits to token decimals to avoid overly long strings
    if (s.includes('.')) {
      const [intPart, fracPart] = s.split('.')
      const trimmedFrac = fracPart.slice(0, Math.max(0, decimals)).replace(/0+$/, '')
      return trimmedFrac.length ? `${intPart}.${trimmedFrac}` : intPart
    }
    return s
  }

  const parsedAmount = amount ? parseUnits(normalizeDecimalString(amount, getDecimals()), getDecimals()) : BigInt(0)

  const biconomySmartAccountAddress = useMemo(() => {
    if (!statusSmartAccount) return undefined
    if (!detectedSmartAccountAddress) return undefined
    return detectedSmartAccountAddress as Address
  }, [statusSmartAccount, detectedSmartAccountAddress])

  // Write contract hook for redeem transaction
  const { writeContract, isPending, error: writeError, data: redeemData, reset: resetWrite } = useWriteContract()
  const { switchChainAsync } = useSwitchChain()

  // Set hash when transaction data is available
  useEffect(() => {
    if (redeemData) {
      setRedeemHash(redeemData)
    }
  }, [redeemData])

  // Wait for transaction confirmation
  const { isLoading: isConfirming, isSuccess: isTransactionSuccess, error: transactionError } = useWaitForTransactionReceipt({
    hash: redeemHash as `0x${string}`,
  })

  // Handle transaction success/error
  useEffect(() => {
    if (isTransactionSuccess && redeemHash) {
      setStep('success')
      setStatusMessage('Withdraw successful! Tokens withdrawn.')
      emitUpdate('success', '', redeemHash)
      onSuccessRef.current?.()

      try {
        window.dispatchEvent(new CustomEvent('peridot:tx-success', {
          detail: {
            type: 'redeem',
            address,
            chainId,
            assetId,
            txHash: redeemHash,
            observed_at: new Date().toISOString(),
            tokenSymbol: assetId?.toUpperCase?.(),
          }
        }))
      } catch {}

      // Auto-verify redeem transaction in leaderboard
      if (redeemHash && address && chainId) {
        getAccessToken().then(token => {
          autoVerifyTransaction({
            txHash: redeemHash,
            walletAddress: address,
            chainId,
            privyToken: token,
            // Ensure correct mainnet insertion when viewing from a spoke that mirrors BSC markets
            overrideChainId: chainId,
            onSuccess: (result) => {
              console.log('Redeem transaction automatically verified and added to leaderboard:', result)
            },
            onError: (error) => {
              console.warn('Auto-verification failed (user can still verify manually):', error.message)
            },
          }).catch(() => {
            // Silent fail - user can still verify manually if needed
          })
        })
      }
    }
  }, [isTransactionSuccess, redeemHash, address, chainId])

  // Suppress modal for handled rate-limit fallback
  const handledRateLimitRef = useRef(false)

  useEffect(() => {
    const combinedError = transactionError || writeError;
    if (combinedError) {
      const errorObject = combinedError instanceof Error ? combinedError : new Error(String(combinedError))
      const decodedError = parseAndDecodeError(errorObject.message);
      (errorObject as any).shortMessage = decodedError;
      
      console.error("A redeem error occurred:", errorObject)
      
      // Build a friendly message
      const rawMsg = String(errorObject.message || '')
      const isRateLimited = isRateLimit(rawMsg)
      const friendlyMap = mapFriendlyError(rawMsg)
      if (handledRateLimitRef.current && isRateLimited) {
        // Clear handled flag and write error to avoid modal
        handledRateLimitRef.current = false
        try { resetWrite?.() } catch {}
        emitUpdate('error', 'Temporarily rate limited. Please retry shortly.')
        setStep('error')
        return
      }

      if (errorObject.message.includes('User rejected')) {
        setError('Redeem transaction rejected. Please try again.')
        emitUpdate('error', 'Redeem transaction rejected. Please try again.')
        reset() // Reset state if user rejects
      } else {
        if (isRateLimited) {
          const friendlyRate = 'Temporarily rate limited. Please wait 30–60 seconds, then try again.'
          setError(friendlyRate)
          emitUpdate('error', friendlyRate)
        } else if (isTimeoutError(rawMsg)) {
          const friendlyTimeout = 'Transaction timed out. Please check your connection and try again.'
          setError(friendlyTimeout)
          emitUpdate('error', friendlyTimeout)
        } else {
          const msg = friendlyMap || `Transaction failed: ${decodedError}`
          setError(msg)
          emitUpdate('error', msg)
        }
        onErrorRef.current?.(errorObject)
        setStep('error')
      }
    }
  }, [transactionError, writeError])

  const executeRedeem = useCallback(async () => {
    console.log('--- Initiating Redeem Transaction ---');
    const hasOverride = Boolean(overrideFunctionName && overrideRawAmount && overrideRawAmount > BigInt(0))
    if (!address || !contractAddresses || (!amount && !hasOverride) || (!hasOverride && parsedAmount <= 0)) {
      const errorMsg = 'Invalid parameters for redeem. Aborting.';
      console.error(errorMsg, {
        address,
        contractAddresses,
        amount,
        parsedAmount: parsedAmount.toString(),
        hasOverride,
        overrideFunctionName,
        overrideRawAmount: overrideRawAmount?.toString(),
      });
      setError(errorMsg);
      return;
    }


    try {
      // When on a spoke chain, prefer cross-chain withdraw via Biconomy (no network switch)

      setError(null)
      setStep('redeeming')
      emitUpdate('redeeming', 'Submitting withdraw...')
      
      const decimals = getDecimals()
      const defaultFunctionToCall = redeemType === 'pTokens' ? 'redeem' : 'redeemUnderlying';
      const functionToCall = hasOverride ? (overrideFunctionName as 'redeem' | 'redeemUnderlying') : defaultFunctionToCall;
      const argAmount = hasOverride ? (overrideRawAmount as bigint) : parsedAmount;

      // Preflight cap: avoid under/overflow by capping to pool cash / balances and simulating
      const getCappedAmount = async (): Promise<bigint> => {
        if (!publicClient) return argAmount
        let desired = argAmount
        try {
          if (functionToCall === 'redeemUnderlying') {
            // Cap by pool cash (minus 1 wei safety)
            const cash = await (publicClient as any).readContract({
              address: contractAddresses!.pTokenAddress as any,
              abi: combinedAbi as any,
              functionName: 'getCash',
            }) as bigint
            if (typeof cash === 'bigint') {
              const maxByCash = cash > BigInt(0) ? (cash - BigInt(1)) : BigInt(0)
              if (desired > maxByCash) desired = maxByCash
            }
          } else {
            // Cap by user's pToken balance (minus 1 wei safety)
            const pBal = await (publicClient as any).readContract({
              address: contractAddresses!.pTokenAddress as any,
              abi: combinedAbi as any,
              functionName: 'balanceOf',
              args: [address as any],
            }) as bigint
            if (typeof pBal === 'bigint') {
              const maxPTokens = pBal > BigInt(0) ? (pBal - BigInt(1)) : BigInt(0)
              if (desired > maxPTokens) desired = maxPTokens
            }
          }

          // Try simulate and progressively back off a tiny fraction if it still reverts
          let tryAmount = desired
          for (let i = 0; i < 5; i++) {
            if (tryAmount <= BigInt(0)) break
            try {
              await (publicClient as any).simulateContract({
                address: contractAddresses!.pTokenAddress as any,
                abi: combinedAbi as any,
                functionName: functionToCall,
                args: [tryAmount],
                account: address as any,
              })
              return tryAmount
            } catch {
              // Reduce by 0.01% and retry
              tryAmount = (tryAmount * BigInt(9999)) / BigInt(10000)
            }
          }
          return tryAmount
        } catch {
          return desired
        }
      }
      const cappedAmount = await getCappedAmount()
      
      // Debug logging
      console.log('🔍 REDEEM DEBUG CHECKPOINT');
      console.log('================================');
      console.log(`  Asset ID: ${assetId}`);
      console.log(`  Redeem Type: ${redeemType}`);
      console.log(`  Function to Call: ${functionToCall}`);
      console.log('--------------------------------');
      console.log(`  Input Amount (string): "${amount}"`);
      console.log(`  pToken Decimals: ${pTokenDecimals || 'N/A'}`);
      console.log(`  Underlying Decimals: ${underlyingDecimals || 'N/A'}`);
      console.log(`  Decimals Used for Parsing: ${decimals}`);
      console.log(`  Parsed Amount (BigInt): ${parsedAmount.toString()}`);
      if (hasOverride) {
        console.log(`  Override Function: ${overrideFunctionName}`);
        console.log(`  Override Raw Amount (BigInt): ${overrideRawAmount?.toString()}`);
      }
      console.log(`  Final Capped Amount (BigInt): ${cappedAmount.toString()}`)
      console.log('--------------------------------');
      console.log(`  Target Contract: ${contractAddresses.pTokenAddress}`);
      console.log(`  User Address: ${address}`);
      console.log('================================');

      setStatusMessage(`Submitting transaction to ${functionToCall}...`);
      
      const tryWrite = async () => {
        try {
          if (isSmartAccountActive && contractAddresses) {
            // Smart Account: Redeem
            emitUpdate('redeeming', 'Withdrawing with smart account...')
            
            const hash = await executeSmartTx({
              to: contractAddresses.pTokenAddress as Address,
              data: encodeFunctionData({
                abi: combinedAbi,
                functionName: functionToCall,
                args: [cappedAmount],
              }),
            }, {
              chainId: chainId as number,
              onSuccess: (h) => {
                setRedeemHash(h as any)
              }
            })
            if (hash) {
              setRedeemHash(hash as any)
            }
          } else {
            // Privy sponsored gas path — mirrors use-borrow-transaction.ts.
            // We don't compute USD value here because a) redeem amounts are
            // already past the easy-card preflight that gates by USD, and
            // b) the threshold the product wants is effectively "any non-zero
            // redeem" ($0.01). Skipping the price lookup keeps this hook free
            // of an oracle dependency. The wallet-gas fallback below covers
            // sponsorship rejections (credits exhausted, policy mismatch).
            const isTestnetPreset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || '').startsWith('testnet')
            const bscChainId = isTestnetPreset ? CHAIN_IDS.BSC_TESTNET : CHAIN_IDS.BSC_MAINNET
            const canSponsor =
              FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT &&
              chainId === bscChainId &&
              cappedAmount > BigInt(0)
            let sponsoredOk = false
            if (canSponsor) {
              try {
                emitUpdate('redeeming', 'Withdrawing with sponsored gas...')
                const { hash } = await privySendTransaction(
                  {
                    to: contractAddresses.pTokenAddress as Address,
                    data: encodeFunctionData({
                      abi: combinedAbi,
                      functionName: functionToCall,
                      args: [cappedAmount],
                    }),
                    chainId: bscChainId,
                  },
                  { sponsor: true },
                )
                setRedeemHash(hash as any)
                emitUpdate('redeeming', 'Withdraw submitted (Privy sponsored)...', hash as any)
                sponsoredOk = true
              } catch (sponsorErr) {
                // Credits exhausted / policy mismatch / user rejected — fall through
                console.warn('[Redeem] Privy sponsorship failed, falling back to wallet gas:', sponsorErr)
              }
            }
            if (!sponsoredOk) {
              await writeContract({
                address: contractAddresses.pTokenAddress as Address,
                abi: combinedAbi,
                functionName: functionToCall,
                args: [cappedAmount],
              } as any)
              emitUpdate('redeeming', 'Withdraw submitted...')
            }
          }
        } catch (e: any) {
          const msg = String(e?.message || '')
          const isRateLimited = /rate limited|rate\s*limit/i.test(msg)
          if (isRateLimited && functionToCall === 'redeemUnderlying') {
            handledRateLimitRef.current = true
            try { 
              let toastId: any
              toastId = toast('Network is rate limited', {
                description: 'Switching to alternative withdraw method…',
                action: { label: 'Close', onClick: () => toast.dismiss(toastId) },
              })
            } catch {}
            // Fallback: try redeeming pTokens directly with simulate/backoff
            try {
              const pBal = await (publicClient as any).readContract({
                address: contractAddresses!.pTokenAddress as any,
                abi: combinedAbi as any,
                functionName: 'balanceOf',
                args: [address as any],
              }) as bigint
              let tryAmount = pBal
              for (let i = 0; i < 5; i++) {
                if (tryAmount <= BigInt(0)) break
                try {
                  await (publicClient as any).simulateContract({
                    address: contractAddresses!.pTokenAddress as any,
                    abi: combinedAbi as any,
                    functionName: 'redeem',
                    args: [tryAmount],
                    account: address as any,
                  })
                  await writeContract({
                    address: contractAddresses.pTokenAddress as Address,
                    abi: combinedAbi,
                    functionName: 'redeem',
                    args: [tryAmount],
                  } as any)
                  try {
                    let toastIdOk: any
                    toastIdOk = toast.success('Withdraw submitted', {
                      description: 'Used alternative method due to temporary rate limit.',
                      action: { label: 'Close', onClick: () => toast.dismiss(toastIdOk) },
                    })
                  } catch {}
                  handledRateLimitRef.current = false
                  try { resetWrite?.() } catch {}
                  return
                } catch {
                  tryAmount = (tryAmount * BigInt(9999)) / BigInt(10000)
                }
              }
              throw e
            } catch {
              try {
                let toastIdErr: any
                toastIdErr = toast.error('Withdraw failed', {
                  description: 'Rate limited. Please try again shortly.',
                  action: { label: 'Close', onClick: () => toast.dismiss(toastIdErr) },
                })
              } catch {}
              handledRateLimitRef.current = false
              throw e
            }
          }
          throw e
        }
      }

      // If user is on a spoke chain, use Biconomy cross-chain withdraw to avoid manual switching.
      // When overrideChainId is provided the caller (EasyManagementModal) has already switched the
      // wallet to the position's chain, so we always do a direct write.
      if (!overrideChainId && effectiveChainId && chainId !== effectiveChainId) {
        try {
          const bscConfig = getChainConfig(CHAIN_IDS.BSC_MAINNET) as any
          const assetSymbolUpper = String(assetId || '').toUpperCase()
          const pTokenOnBsc = (bscConfig?.markets?.[assetSymbolUpper]?.pToken) as Address | undefined
          if (!pTokenOnBsc) throw new Error('Missing BSC market address for asset')

          const mapChainIdToBiconomyKey = (cid?: number | null): keyof typeof BICONOMY_TOKENS | undefined => {
            switch (cid) {
              case 1: return 'mainnet'
              case 10: return 'optimism'
              case 137: return 'polygon'
              case 42161: return 'arbitrum'
              case 8453: return 'base'
              case 43114: return 'avalanche'
              default: return undefined
            }
          }
          const netKey = mapChainIdToBiconomyKey(chainId)
          const targetTokenAddress = netKey ? (BICONOMY_TOKENS as any)[netKey]?.[assetSymbolUpper] as Address | undefined : undefined

          const res = await (biconomyAdapter as any).startWithdraw({
            userAddress: address as Address,
            smartAccountAddress: biconomySmartAccountAddress,
            withdrawMarket: pTokenOnBsc,
            // Prefer underlying amount for withdraw; adapter will redeemUnderlying
            withdrawAmount: argAmount,
            // Bridge to source chain if mapping available
            targetChainId: (targetTokenAddress ? chainId : undefined),
            targetTokenAddress: targetTokenAddress,
            meeAuthorization,
          })
          if (res?.superTxHash) setRedeemHash(res.superTxHash)
          setStatusMessage('Withdraw submitted cross-chain. Tracking available in Biconomy.')
        } catch (e: any) {
          console.error('Cross-chain withdraw failed; falling back to direct withdraw:', e)
          await tryWrite()
        }
      } else {
        await tryWrite()
      }
        
      setStatusMessage('Transaction submitted. Waiting for confirmation...')

    } catch (err: any) {
      console.error('💥 Withdraw transaction failed during preparation:', err)
      setStep('error')
      const errorMsg = err.message || 'An unexpected error occurred during withdraw preparation.';
      setError(errorMsg);
      onError?.(new Error(errorMsg));
    }
  }, [address, contractAddresses, assetId, amount, parsedAmount, redeemType, writeContract, pTokenDecimals, underlyingDecimals, getDecimals, onError, overrideFunctionName, overrideRawAmount])

  // Listen to Biconomy phase events for cross-chain withdraw progress
  useEffect(() => {
    const handler = (ev: any) => {
      const phase = ev?.detail?.phase as string
      const operation = ev?.detail?.meta?.operation as string
      if (!phase) return
      // Only process events for withdraw operations
      if (operation && operation !== 'withdraw') return
      
      let mappedStep = 'quoting'
      let mappedMessage = 'Preparing cross-chain route...'
      
      try {
        switch (phase) {
          case 'compose-start':
            mappedStep = 'quoting'
            mappedMessage = 'Preparing cross-chain route...'
            setStatusMessage(mappedMessage)
            break
          case 'compose-ok':
            mappedStep = 'quoting'
            mappedMessage = 'Route prepared. Calculating fees...'
            setStatusMessage(mappedMessage)
            break
          case 'quote-start':
            mappedStep = 'quoting'
            mappedMessage = 'Quoting fees and funding method...'
            setStatusMessage(mappedMessage)
            break
          case 'quote-ok':
            mappedStep = 'signing'
            mappedMessage = 'Quote received. Requesting signatures...'
            setStatusMessage(mappedMessage)
            break
          case 'sign-start':
            mappedStep = 'signing'
            mappedMessage = 'Signing required payloads...'
            setStatusMessage(mappedMessage)
            break
          case 'execute-start':
            mappedStep = 'submitting'
            mappedMessage = 'Submitting supertransaction...'
            setStatusMessage(mappedMessage)
            break
          case 'execute-ok':
            mappedStep = 'success'
            mappedMessage = 'Submitted. Bridge in progress...'
            setStatusMessage(mappedMessage)
            break
        }
      } catch {}
      
      // Emit standard tx-update event for unified dialog system
      try {
        window.dispatchEvent(new CustomEvent('peridot:tx-update', {
          detail: {
            action: 'withdraw',
            step: mappedStep,
            statusMessage: mappedMessage,
            isCrossChain: true,
            txHash: redeemHash
          }
        }))
      } catch {}
    }
    try { window.addEventListener('peridot:biconomy-phase', handler as any) } catch {}
    return () => { try { window.removeEventListener('peridot:biconomy-phase', handler as any) } catch {} }
  }, [redeemHash])

  useEffect(() => {
    return attachScopedRetryListeners('withdraw', () => {
      try {
        if (step === 'redeeming' || step === 'idle' || step === 'error') executeRedeem()
      } catch {}
    })
  }, [step, executeRedeem])

  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setRedeemHash(null)
    setStatusMessage('')
    try {
      if (typeof window !== 'undefined') {
        ;(window as any).__PERIDOT_TX_ACTIVE = false
        window.dispatchEvent(new CustomEvent('peridot:tx-idle'))
      }
    } catch {}
  }, [])

  const isLoading = isPending || isConfirming

  return {
    executeRedeem,
    isLoading,
    canRedeem,
    error,
    step,
    statusMessage,
    redeemHash,
    reset,
  }
} 
