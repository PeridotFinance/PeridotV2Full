import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { Address, erc20Abi, parseUnits } from 'viem'
import { toast } from 'sonner'
import { biconomyAdapter } from '@/lib/biconomyAdapter'
import { getChainConfig, CHAIN_IDS } from '@/config/contracts'
import { TOKENS as BICONOMY_TOKENS } from '@/biconomy/constants'
import { autoVerifyTransaction } from '@/lib/auto-leaderboard-verifier'
import { useSmartAccountUpgrade } from '@/components/providers/SmartAccountUpgradeProvider'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { isTransactionDismissed } from '@/lib/dismissedTransactionTracker'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { usePrivy } from '@privy-io/react-auth'

interface UseRepayBiconomyProps {
  assetId: string
  amount: string
  repayMax?: boolean
  onSuccess?: () => void
  onError?: (error: Error) => void
}

type Step = 'idle' | 'quoting' | 'approving' | 'signing' | 'submitting' | 'success' | 'error'

export function useRepayBiconomy({ assetId, amount, repayMax, onSuccess, onError }: UseRepayBiconomyProps) {
  const { getAccessToken } = usePrivy()
  const { chainId } = useAccount()
  const { address } = useActiveWallet()
  const { meeAuthorization } = useSmartAccountUpgrade()
  const [step, setStep] = useState<Step>('idle')
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [superTxHash, setSuperTxHash] = useState<string | undefined>(undefined)
  const [biconomyFee, setBiconomyFee] = useState<any | undefined>(undefined)
  const [biconomyFeeDetails, setBiconomyFeeDetails] = useState<any | undefined>(undefined)
  const [meeScanLink, setMeeScanLink] = useState<string | undefined>(undefined)
  const [trackingUrl, setTrackingUrl] = useState<string | undefined>(undefined)

  const onErrorRef = useRef(onError)
  useEffect(() => { onErrorRef.current = onError }, [onError])

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

  const bscConfig = useMemo(() => getChainConfig(CHAIN_IDS.BSC_MAINNET) as any, [])
  const assetSymbolUpper = useMemo(() => String(assetId || '').toUpperCase(), [assetId])
  const pTokenOnBsc = useMemo(() => (bscConfig?.markets?.[assetSymbolUpper]?.pToken) as Address | undefined, [bscConfig, assetSymbolUpper])
  const netKey = mapChainIdToBiconomyKey(chainId)
  const sourceTokenForBiconomy = useMemo(() => netKey ? (BICONOMY_TOKENS as any)[netKey]?.[assetSymbolUpper] as Address | undefined : undefined, [netKey, assetSymbolUpper])

  // Decimals for source token to parse user amount
  const { data: sourceTokenDecimals } = useReadContract({
    address: (sourceTokenForBiconomy as Address),
    abi: erc20Abi,
    functionName: 'decimals',
    args: [],
    query: { enabled: Boolean(sourceTokenForBiconomy) }
  })

  // Source token balance on source chain (for repayMax)
  const { data: sourceTokenBalance } = useReadContract({
    address: (sourceTokenForBiconomy as Address),
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [(address as Address)],
    query: { enabled: Boolean(sourceTokenForBiconomy && address) },
  } as any)

  // Outstanding debt on BSC (for repayMax)
  const { data: borrowDebt } = useReadContract({
    address: (pTokenOnBsc as Address),
    abi: combinedAbi,
    functionName: 'borrowBalanceStored',
    args: [(address as Address)],
    chainId: (CHAIN_IDS.BSC_MAINNET as number) as any,
    query: { enabled: Boolean(pTokenOnBsc && address) },
  } as any)

  const parsedAmount = useMemo(() => {
    if (!amount) return BigInt(0)
    const dec = typeof sourceTokenDecimals === 'number' ? sourceTokenDecimals : Number(sourceTokenDecimals || 18)
    try { return parseUnits(String(amount).replace(/[^0-9.]/g, ''), dec as number) } catch { return BigInt(0) }
  }, [amount, sourceTokenDecimals])

  // Phase-driven status and toasts - now using standard tx-update events
  useEffect(() => {
    const handler = (ev: any) => {
      const phase = ev?.detail?.phase as string
      const operation = ev?.detail?.meta?.operation as string
      if (!phase) return
      // Only process events for repay operations
      if (operation && operation !== 'repay') return
      try {
        console.log('[useRepayBiconomy] phase event', { phase, meta: ev?.detail?.meta })
      } catch {}
      
      let mappedStep = 'quoting'
      let mappedMessage = 'Preparing cross-chain route...'
      
      switch (phase) {
        case 'compose-start':
          mappedStep = 'quoting'
          mappedMessage = 'Preparing cross-chain route...'
          try { toast('Preparing route', { description: 'Setting up repayment path...' }) } catch {}
          break
        case 'compose-ok':
          mappedStep = 'quoting'
          mappedMessage = 'Route prepared. Calculating fees...'
          break
        case 'quote-start':
          mappedStep = 'quoting'
          mappedMessage = 'Quoting fees and funding method...'
          break
        case 'quote-ok':
          mappedStep = 'signing'
          mappedMessage = 'Quote received. Requesting signatures...'
          break
        case 'sign-start':
          mappedStep = 'signing'
          mappedMessage = 'Signing required payloads...'
          break
        case 'execute-start':
          mappedStep = 'submitting'
          mappedMessage = 'Submitting supertransaction...'
          break
        case 'execute-ok':
          mappedStep = 'success'
          mappedMessage = 'Submitted. Bridge in progress...'
          break
      }
      
      setStatusMessage(mappedMessage)
      setStep(mappedStep as any)
      
      // Emit standard tx-update event for unified dialog system
      // Check if this transaction was dismissed by user before emitting events
      if (superTxHash && isTransactionDismissed(superTxHash)) {
        // Transaction was dismissed, don't emit events
        return
      }
      
      try {
        window.dispatchEvent(new CustomEvent('peridot:tx-update', {
          detail: {
            action: 'repay',
            step: mappedStep,
            statusMessage: mappedMessage,
            isCrossChain: true,
            txHash: superTxHash,
            trackingUrl: trackingUrl,
            biconomyFee: biconomyFee,
            biconomyFeeDetails: biconomyFeeDetails,
            meeScanLink: meeScanLink
          }
        }))
      } catch {}
    }
    try { window.addEventListener('peridot:biconomy-phase', handler as any) } catch {}
    return () => { try { window.removeEventListener('peridot:biconomy-phase', handler as any) } catch {} }
  }, [superTxHash, trackingUrl, biconomyFee, biconomyFeeDetails, meeScanLink])

  useEffect(() => {
    try {
      console.log('[useRepayBiconomy] step update', { step, statusMessage })
    } catch {}
  }, [step, statusMessage])

  const executeRepay = useCallback(async () => {
    try {
      if (!address || !chainId) throw new Error('Wallet not connected')
      if (!sourceTokenForBiconomy || !pTokenOnBsc) throw new Error('Cross-chain configuration not ready')
      if (parsedAmount <= BigInt(0) && !repayMax) throw new Error('Please enter a valid amount')

      setError(null)
      setStep('quoting')
      setStatusMessage('Quoting fees and funding method...')
      
      // Emit standard tx-active event for unified dialog system
      try {
        window.dispatchEvent(new CustomEvent('peridot:tx-active'))
        // Note: tx-update events will be emitted by the phase handler, not here
      } catch {}
      
      try {
        console.log('[useRepayBiconomy] execute start', {
          assetId,
          amount,
          repayMax,
          address,
          chainId,
        })
      } catch {}

      // Determine base amount (repayMax: min(debt, balance); else parsedAmount)
      const srcBal = (() => { try { return BigInt((sourceTokenBalance as any) ?? 0) } catch { return BigInt(0) } })()
      const debtWei = (() => { try { return BigInt((borrowDebt as any) ?? 0) } catch { return BigInt(0) } })()
      let baseAmountWei = repayMax ? (srcBal > BigInt(0) && debtWei > BigInt(0) ? (srcBal < debtWei ? srcBal : debtWei) : BigInt(0)) : parsedAmount
      // If max path couldn't fetch debt/balance yet, fall back to parsedAmount if provided
      if (repayMax && baseAmountWei <= BigInt(0) && parsedAmount > BigInt(0)) {
        baseAmountWei = parsedAmount
      }
      if (baseAmountWei <= BigInt(0)) {
        throw new Error('Amount unavailable. Reduce Max or enter an amount, then retry.')
      }
      try {
        console.log('[useRepayBiconomy] resolved base amount', {
          repayMax,
          baseAmountWei: baseAmountWei.toString(),
          sourceBalanceWei: srcBal.toString(),
          debtWei: debtWei.toString(),
        })
      } catch {}

      // Pre-quote (best-effort)
      try {
        const pre = await (biconomyAdapter as any).preQuote?.({
          userAddress: address,
          sourceChainId: chainId,
          sourceTokenAddress: sourceTokenForBiconomy,
          pTokenAddress: pTokenOnBsc,
          amountWei: baseAmountWei,
        })
        if (pre?.fee) setBiconomyFee(pre.fee)
        if (pre?.feeDetails) setBiconomyFeeDetails(pre.feeDetails)
      } catch {}

      // Target mapping to bridge any excess back to source chain when possible
      const targetTokenAddress = sourceTokenForBiconomy
      const targetChainId = targetTokenAddress ? chainId : undefined

      const res = await (biconomyAdapter as any).startRepay?.({
        userAddress: address as Address,
        destinationChainId: CHAIN_IDS.BSC_MAINNET, // Repay is always on BSC for now
        pTokenAddress: pTokenOnBsc,
        amountWei: baseAmountWei,
        repayMax: Boolean(repayMax),
        targetChainId,
        targetTokenAddress,
        // Ensure bridge + funding happen from the source chain
        sourceChainId: chainId,
        sourceTokenAddress: sourceTokenForBiconomy,
        meeAuthorization,
        sponsorship: true,
      } as any)

      setSuperTxHash(res?.superTxHash)
      setTrackingUrl(res?.trackingUrl)
      if ((res as any)?.fee) setBiconomyFee((res as any).fee)
      if ((res as any)?.feeDetails) setBiconomyFeeDetails((res as any).feeDetails)
      if ((res as any)?.meeScanLink) setMeeScanLink((res as any).meeScanLink)
      try {
        console.log('[useRepayBiconomy] startRepay response', {
          superTxHash: res?.superTxHash,
          trackingUrl: res?.trackingUrl,
          fee: (res as any)?.fee,
          feeDetails: (res as any)?.feeDetails,
        })
      } catch {}

      try {
        const symbol = assetSymbolUpper
        const usd = parseFloat(String(amount).replace(/[^0-9.]/g, '')) * 0 // price not readily available here
        const pTokenAddr = pTokenOnBsc
        const token = await getAccessToken()
        await fetch('/api/leaderboard/verify-crosschain', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            walletAddress: address,
            superTxHash: res?.superTxHash,
            chainId,
            actionType: 'cross-chain_repay',
            tokenSymbol: symbol,
            amount: String(amount),
            usdValue: usd,
            contractAddress: pTokenAddr,
          }),
        })
      } catch {}

      setStep('success')
      
      // Emit success event for unified dialog system
      try {
        window.dispatchEvent(new CustomEvent('peridot:tx-success', {
          detail: {
            type: 'repay',
            txHash: res?.superTxHash,
            isCrossChain: true,
            trackingUrl: res?.trackingUrl,
            biconomyFee: (res as any)?.fee,
            biconomyFeeDetails: (res as any)?.feeDetails,
            meeScanLink: (res as any)?.meeScanLink
          }
        }))
      } catch {}
      
      onSuccess?.()
      try {
        let toastId: any
        toastId = toast('Repay submitted', { description: 'Cross-chain repayment in progress...', action: { label: 'Close', onClick: () => toast.dismiss(toastId) } })
      } catch {}
    } catch (e: any) {
      const raw = String(e?.message || e)
      try {
        console.error('[useRepayBiconomy] execute error', { message: raw, error: e })
      } catch {}
      if (raw.startsWith('BICONOMY_ONCHAIN_APPROVAL_REQUIRED:')) {
        setStep('approving')
        setStatusMessage('Approval required to fund your cross-chain repay...')
        setError(null)
        throw (e instanceof Error ? e : new Error(raw))
      }
      let friendly = raw
      if (/INSUFFICIENT_FOR_FEE_BUDGET/i.test(raw)) friendly = 'Not enough to cover cross-chain fee. Reduce “Max” or amount.'
      else if (/FEE_EXCEEDS_TOLERANCE/i.test(raw)) friendly = 'Fee jumped beyond tolerance. Retry, increase slippage, or increase amount.'
      else if (/BICONOMY_ROUTE_NOT_FOUND|Route not found/i.test(raw)) friendly = 'No route found. Increase amount or slippage (try 0.3–0.5%).'
      setError(friendly)
      setStep('error')
      
      // Emit error event for unified dialog system
      // Check if this transaction was dismissed by user before emitting events
      if (superTxHash && isTransactionDismissed(superTxHash)) {
        // Transaction was dismissed, don't emit events
        return
      }
      
      try {
        window.dispatchEvent(new CustomEvent('peridot:tx-update', {
          detail: {
            action: 'repay',
            step: 'error',
            statusMessage: friendly,
            isCrossChain: true,
            txHash: superTxHash
          }
        }))
      } catch {}
      
      onErrorRef.current?.(new Error(friendly))
      try {
        let toastId: any
        toastId = toast.error('Repay failed', { description: friendly, action: { label: 'Close', onClick: () => toast.dismiss(toastId) } })
      } catch {}
    }
  }, [address, chainId, sourceTokenForBiconomy, pTokenOnBsc, parsedAmount, repayMax, amount, assetSymbolUpper, meeAuthorization])

  return {
    executeRepay,
    step,
    statusMessage,
    error,
    superTxHash,
    trackingUrl,
    biconomyFee,
    biconomyFeeDetails,
    meeScanLink,
  }
}


