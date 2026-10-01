import { useState, useEffect, useRef, useMemo } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { Address, createWalletClient, custom, encodeFunctionData } from 'viem'
import { bsc } from 'viem/chains'
import { getAssetContractAddresses } from '@/data/market-data'
import { getChainConfig, isStellarNetwork, resolveHubReadChainId } from '@/config/contracts'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { toast } from 'sonner'
import { TOKENS as BICONOMY_TOKENS } from '@/biconomy/constants'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useSmartExecution } from '@/hooks/use-smart-execution'
import { useNetworkContext } from '@/context'
import { getStellarVaultConfig, stellarEnterMarket } from '@/lib/stellar-soroban-lending'

interface UseEnterMarketProps {
  assetId: string
  onSuccess?: () => void
  onError?: (error: Error) => void
  // Fee mode: 'sponsored' (default) or a specific token address to pay fees
  feeMode?: 'sponsored' | { tokenAddress: Address }
}

type TransactionStep = 'idle' | 'entering' | 'success' | 'error'

export function useEnterMarket({
  assetId,
  onSuccess,
  onError,
  feeMode = 'sponsored',
}: UseEnterMarketProps) {
  const { selectedNetworkId } = useNetworkContext()
  const { chainId } = useAccount()
  const { address, isSmartAccountActive } = useActiveWallet()
  const { execute: executeSmartTx } = useSmartExecution()
  const { switchChain } = useSwitchChain()
  const [step, setStep] = useState<TransactionStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [enterMarketHash, setEnterMarketHash] = useState<string | undefined>()
  const useStellarFlow = isStellarNetwork(selectedNetworkId)
  const stellarConfig = useMemo(
    () => (useStellarFlow ? getStellarVaultConfig(assetId) : null),
    [useStellarFlow, assetId]
  )

  const onErrorRef = useRef(onError);
  useEffect(() => {
      onErrorRef.current = onError;
  });

  // Determine effective chain for reads/writes (route spoke chains to hub chain when applicable)
  const effectiveChainId = useMemo(() => {
    const resolved = resolveHubReadChainId(chainId ?? null)
    return resolved ?? null
  }, [chainId]) as number | null

  // Get contract addresses for the asset on the effective chain
  const contractAddresses = effectiveChainId ? getAssetContractAddresses(assetId, effectiveChainId) : null
  
  // Get chain config for controller address
  const chainConfig = effectiveChainId ? getChainConfig(effectiveChainId) : null
  const controllerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy : null

  // Check if we have valid contract addresses
  const canEnterMarket = useStellarFlow
    ? Boolean(address && stellarConfig?.vaultId)
    : Boolean(contractAddresses && contractAddresses.pTokenAddress && controllerAddress)

  // Write contract hook for entering markets
  const { 
    writeContract: writeEnterMarket,
    isPending: isEnterMarketPending,
    data: enterMarketData,
    error: enterMarketError,
    reset: resetEnterMarket,
  } = useWriteContract()

  // Set hash when transaction is submitted
  useEffect(() => {
    if (enterMarketData) {
      setEnterMarketHash(enterMarketData)
    }
  }, [enterMarketData])

  // Wait for transaction receipt
  const { 
    isLoading: isEnterMarketConfirming, 
    isSuccess: isEnterMarketSuccess,
    error: enterMarketReceiptError 
  } = useWaitForTransactionReceipt({
    hash: useStellarFlow ? undefined : (enterMarketHash as `0x${string}` | undefined),
  })

  // Handle enter market success
  useEffect(() => {
    if (isEnterMarketSuccess) {
      setStep('success')
      onSuccess?.()
    }
  }, [isEnterMarketSuccess, onSuccess])

  // Handle errors
  useEffect(() => {
    const combinedError = enterMarketError || enterMarketReceiptError
    if (combinedError) {
      const errorObject = combinedError instanceof Error ? combinedError : new Error(String(combinedError))
      console.error("An enter market error occurred:", errorObject)
      
      if (errorObject.message.includes('User rejected')) {
        setError('Transaction rejected. Please try again.')
        reset() // Reset state if user rejects
      } else {
        onErrorRef.current?.(errorObject)
        setError(errorObject.message)
        setStep('error')
      }
    }
  }, [enterMarketError, enterMarketReceiptError])

  // Execute enter market transaction
  const executeEnterMarket = async () => {
    try {
      setError(null)
      
      if (!canEnterMarket) {
        throw new Error('Smart contracts for this asset are not available on this network')
      }

      if (!address) {
        throw new Error('Please connect your wallet first')
      }

      if (useStellarFlow) {
        if (!stellarConfig) {
          throw new Error('Stellar market configuration not found for this asset')
        }
        setStep('entering')
        const hash = await stellarEnterMarket(address, stellarConfig.vaultId)
        setEnterMarketHash(hash)
        setStep('success')
        onSuccess?.()
        return
      }

      if (!contractAddresses || !controllerAddress) {
        throw new Error('Contract addresses not found')
      }

      // If user is on a spoke chain and asset is cross-chain, initiate cross-chain enable via Biconomy
      if (chainId && chainId !== effectiveChainId) {
        // Not yet supported cross-chain: prompt user to switch to BSC hub
        try {
          toast('Enable collateral on BSC', {
            description: 'This action is not available cross-chain yet. Please switch to BSC to enable collateral.',
            action: {
              label: 'Switch to BSC',
              onClick: () => {
                try { if (effectiveChainId) switchChain({ chainId: effectiveChainId }) } catch {}
              },
            },
          })
        } catch {}
        try { ;(window as any).__PERIDOT_TX_ACTIVE = false } catch {}
        setStep('idle')
        return
        // The cross-chain path below can be re-enabled in future once supported
        setStep('entering')
        // Compose a single enterMarkets call on the hub chain controller
        const composeBody = {
          ownerAddress: address,
          mode: 'eoa',
          composeFlows: [
            {
              type: '/instructions/build',
              data: {
                functionSignature: 'function enterMarkets(address[] memory)',
                args: [[contractAddresses.pTokenAddress as Address]],
                to: controllerAddress,
                chainId: effectiveChainId as number,
                value: '0',
              },
              batch: true,
            },
          ],
        }

        const composeRes = await fetch('/api/biconomy/compose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(composeBody),
        })
        if (!composeRes.ok) {
          const err = await composeRes.text()
          throw new Error(`Compose failed: ${err}`)
        }
        const { instructions } = await composeRes.json()
        // Build funding preference helper (avoid permit/nonces() issues)
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
        const prefer = (netKey && (BICONOMY_TOKENS as any)[netKey]) || {}
        const assetSymbolUpper = String(assetId || '').toUpperCase()
        const fundingTokenPreferred = (prefer && prefer[assetSymbolUpper]) as Address | undefined
        const fallbackFunding = (fundingTokenPreferred || prefer.USDC || prefer.USDT || prefer.WETH) as Address | undefined
        const buildQuotePayload = (opts?: { preferOnChainFunding?: boolean }) => {
          const payload: any = {
            ownerAddress: address,
            mode: 'eoa',
            instructions,
            sponsorship: feeMode === 'sponsored',
          }
          if (feeMode !== 'sponsored' && chainId) {
            const t = (feeMode as any).tokenAddress as Address
            payload.feeToken = { address: t, chainId }
            payload.fundingTokens = [{ tokenAddress: t, chainId, amount: '1' }]
          } else if (feeMode === 'sponsored' && fallbackFunding && chainId) {
            payload.feeToken = { address: fallbackFunding, chainId }
            payload.fundingTokens = [{ tokenAddress: fallbackFunding, chainId, amount: '1' }]
          }
          if (opts?.preferOnChainFunding) payload.preferOnChainFunding = true
          return payload
        }

        // Initial quote
        let quoteRes = await fetch('/api/biconomy/quote', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildQuotePayload()),
        })
        if (!quoteRes.ok) {
          const errText = await quoteRes.text()
          // Retry with on-chain funding if nonces()/permit path fails
          if (/nonces\(\)|permit signing failed|EIP-2612/i.test(errText)) {
            quoteRes = await fetch('/api/biconomy/quote', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildQuotePayload({ preferOnChainFunding: true })),
            })
          }
          if (!quoteRes.ok) throw new Error(`Quote failed: ${errText}`)
        }
        const quote = await quoteRes.json()

        // If on-chain funding approval is required, surface typed error so UI can prompt approval
        try {
          const quoteType: string | undefined = (quote?.quoteType || quote?.type || quote?.funding?.type || '').toString().toLowerCase?.()
          const funding = quote?.funding || quote?.payloads?.funding || null
          const requiresOnchain = quoteType === 'onchain' || funding?.mode === 'onchain' || funding?.type === 'onchain'
          const spender: string | undefined = funding?.spender || funding?.approval?.spender || funding?.transactions?.[0]?.to
          const tokenAddr: Address | undefined = (feeMode !== 'sponsored' ? (feeMode as any).tokenAddress : (fallbackFunding as Address))
          if (requiresOnchain && spender && typeof spender === 'string' && tokenAddr && chainId) {
            const data = { spender, tokenAddress: tokenAddr, amount: '1', chainId }
            throw new Error(`BICONOMY_ONCHAIN_APPROVAL_REQUIRED:${JSON.stringify(data)}`)
          }
        } catch {}
        // Build signable payloads
        const payloads: any[] = (Array.isArray(quote?.payloadToSign) && quote.payloadToSign)
          || (Array.isArray(quote?.payloads?.toSign) && quote.payloads.toSign)
          || (Array.isArray(quote?.result?.payloadToSign) && quote.result.payloadToSign)
          || []
        const winAny = (globalThis as any) || (globalThis as any)?.window
        const ethBase = winAny?.ethereum || winAny?.window?.ethereum
        if (!ethBase) throw new Error('No wallet provider found for signing')
        const candidates = Array.isArray(ethBase?.providers) && ethBase.providers.length ? ethBase.providers : [ethBase]
        const walletClient = createWalletClient({ transport: custom(candidates[0]) })
        const chainById: Record<number, any> = { [bsc.id]: bsc }
        const signedPayloads = [] as any[]
        for (const pRaw of payloads) {
          const hasWrapperTypeData = pRaw && pRaw.type && pRaw.data
          const hasSignableWrapper = pRaw && pRaw.signablePayload
          const signable = hasWrapperTypeData ? pRaw.data : hasSignableWrapper ? pRaw.signablePayload : pRaw
          const meta = hasSignableWrapper ? pRaw.metadata : undefined
          const eip712 = signable?.eip712 || signable
          if (eip712?.domain && eip712?.types && eip712?.message) {
            const primaryType: string = eip712?.primaryType || (Object.keys(eip712.types || {}).find(k => k !== 'EIP712Domain') || 'Permit')
            const signature = await walletClient.signTypedData({
              account: address as Address,
              domain: eip712.domain,
              types: eip712.types,
              primaryType,
              message: eip712.message,
            } as any)
            signedPayloads.push(
              hasSignableWrapper
                ? { signablePayload: pRaw.signablePayload, metadata: meta, signature }
                : { message: eip712.message, signature }
            )
            continue
          }
          if (signable?.to && signable?.data != null && signable?.chainId) {
            const chain = chainById[signable.chainId] || undefined
            const valueBig = (() => { try { return BigInt(signable?.value ?? '0') } catch { return BigInt(0) } })()
            const signed = await walletClient.signTransaction({
              account: address as Address,
              chain,
              to: signable.to as Address,
              data: signable.data as `0x${string}`,
              value: valueBig,
            } as any)
            signedPayloads.push(
              hasSignableWrapper
                ? { signablePayload: pRaw.signablePayload, metadata: meta, signature: signed }
                : { to: signable.to, data: signable.data, value: signable?.value ?? '0', chainId: signable.chainId, signature: signed }
            )
            continue
          }
          signedPayloads.push(signable)
        }
        const innerQuote: any = (quote?.quote || quote?.result?.quote || quote)
        const execRes = await fetch('/api/biconomy/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerAddress: address,
            fee: (quote as any)?.fee,
            quoteType: ((quote as any)?.quoteType || (quote as any)?.type || '').toString().toLowerCase?.(),
            quote: innerQuote,
            payloadToSign: signedPayloads,
          }),
        })
        if (!execRes.ok) {
          const err = await execRes.text()
          throw new Error(`Execute failed: ${err}`)
        }
        const exec = (await execRes.json()) as { hash?: string; trackingUrl?: string }
        if (exec?.hash) setEnterMarketHash(exec.hash)
        setStep('success')
        toast.success('Enable collateral initiated cross-chain. It may take a minute to finalize.')
        try {
          ;(window as any).__PERIDOT_TX_ACTIVE = false
        } catch (_) {}
        onSuccess?.()
        return
      }

      // Hub chain or non-cross-chain asset: call directly
      setStep('entering')

      if (isSmartAccountActive) {
        // Smart Account: Enter Market
        try {
          const hash = await executeSmartTx({
            to: controllerAddress as Address,
            data: encodeFunctionData({
              abi: combinedAbi,
              functionName: 'enterMarkets',
              args: [[contractAddresses.pTokenAddress as Address]],
            }),
          }, {
            chainId: chainId as number,
            onSuccess: (h) => {
              setEnterMarketHash(h as string)
              setStep('success')
              onSuccess?.()
            }
          })
          if (hash) {
            setEnterMarketHash(hash as string)
            setStep('success')
            onSuccess?.()
          }
          return
        } catch (err) {
          console.error('Smart account enter market error:', err)
          return
        }
      }

      writeEnterMarket({
        address: controllerAddress as Address,
        abi: combinedAbi,
        functionName: 'enterMarkets',
        args: [[contractAddresses.pTokenAddress as Address]],
      } as any)
      
    } catch (err) {
      const error = err as Error
      setError(error.message)
      setStep('error')
      onError?.(error)
    }
  }

  // Reset function
  const reset = () => {
    setStep('idle')
    setError(null)
    setEnterMarketHash(undefined)
    resetEnterMarket()
  }

  // Get current loading state
  const isLoading = step === 'entering' || isEnterMarketPending || isEnterMarketConfirming

  // Get status message
  const getStatusMessage = () => {
    switch (step) {
      case 'entering':
        return !useStellarFlow && isEnterMarketPending ? 'Please confirm in wallet...' : 'Enabling as collateral...'
      case 'success':
        return 'Successfully enabled as collateral!'
      case 'error':
        return 'Transaction failed'
      default:
        return ''
    }
  }

  return {
    executeEnterMarket,
    step,
    error,
    isLoading,
    canEnterMarket,
    reset,
    contractAddresses,
    statusMessage: getStatusMessage(),
    enterMarketHash,
  }
} 
