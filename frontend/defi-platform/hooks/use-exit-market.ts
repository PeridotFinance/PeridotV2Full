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
import {
  getStellarVaultConfig,
  stellarExitMarket,
  stellarGetBorrowBalance,
  stellarGetPtokenBalance,
} from '@/lib/stellar-soroban-lending'

interface UseExitMarketProps {
  assetId: string
  onSuccess?: () => void
  onError?: (error: Error) => void
  // Fee mode: 'sponsored' (default) or a specific token address to pay fees
  feeMode?: 'sponsored' | { tokenAddress: Address }
}

type TransactionStep = 'idle' | 'exiting' | 'success' | 'error'

function toPositiveBigIntOrZero(value: string): bigint {
  try {
    const parsed = BigInt(String(value ?? '0'))
    return parsed > BigInt(0) ? parsed : BigInt(0)
  } catch {
    return BigInt(0)
  }
}

export function useExitMarket({
  assetId,
  onSuccess,
  onError,
  feeMode = 'sponsored',
}: UseExitMarketProps) {
  const { selectedNetworkId } = useNetworkContext()
  const { chainId } = useAccount()
  const { address, isSmartAccountActive } = useActiveWallet()
  const { execute: executeSmartTx } = useSmartExecution()
  const { switchChain } = useSwitchChain()
  const [step, setStep] = useState<TransactionStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [exitMarketHash, setExitMarketHash] = useState<string | undefined>()
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
  const canExitMarket = useStellarFlow
    ? Boolean(address && stellarConfig?.vaultId)
    : Boolean(contractAddresses && contractAddresses.pTokenAddress && controllerAddress)

  // Write contract hook for exiting markets
  const {
    writeContract: writeExitMarket,
    isPending: isExitMarketPending,
    data: exitMarketData,
    error: exitMarketError,
    reset: resetExitMarket,
  } = useWriteContract()

  // Set hash when transaction is submitted
  useEffect(() => {
    if (exitMarketData) {
      setExitMarketHash(exitMarketData)
    }
  }, [exitMarketData])

  // Wait for transaction receipt
  const {
    isLoading: isExitMarketConfirming,
    isSuccess: isExitMarketSuccess,
    error: exitMarketReceiptError
  } = useWaitForTransactionReceipt({
    hash: useStellarFlow ? undefined : (exitMarketHash as `0x${string}` | undefined),
  })

  // Handle exit market success
  useEffect(() => {
    if (isExitMarketSuccess) {
      setStep('success')
      onSuccess?.()
    }
  }, [isExitMarketSuccess, onSuccess])

  // Handle errors
  useEffect(() => {
    const combinedError = exitMarketError || exitMarketReceiptError
    if (combinedError) {
      const errorObject = combinedError instanceof Error ? combinedError : new Error(String(combinedError))
      console.error("An exit market error occurred:", errorObject)

      if (errorObject.message.includes('User rejected')) {
        setError('Transaction rejected. Please try again.')
        reset() // Reset state if user rejects
      } else {
        onErrorRef.current?.(errorObject)
        setError(errorObject.message)
        setStep('error')
      }
    }
  }, [exitMarketError, exitMarketReceiptError])

  // Execute exit market transaction
  const executeExitMarket = async () => {
    try {
      setError(null)

      if (!canExitMarket) {
        throw new Error('Smart contracts for this asset are not available on this network')
      }

      if (!address) {
        throw new Error('Please connect your wallet first')
      }

      if (useStellarFlow) {
        if (!stellarConfig) {
          throw new Error('Stellar market configuration not found for this asset')
        }

        // Soroban controller blocks exit_market when pToken balance or borrow debt is non-zero.
        const [pTokenBalanceRaw, borrowBalanceRaw] = await Promise.all([
          stellarGetPtokenBalance(stellarConfig.vaultId, address),
          stellarGetBorrowBalance(stellarConfig.vaultId, address),
        ])
        const pTokenBalance = toPositiveBigIntOrZero(pTokenBalanceRaw)
        const borrowBalance = toPositiveBigIntOrZero(borrowBalanceRaw)
        if (pTokenBalance > BigInt(0)) {
          throw new Error('Cannot disable collateral on Stellar while supplied balance exists in this market. Withdraw first.')
        }
        if (borrowBalance > BigInt(0)) {
          throw new Error('Cannot disable collateral on Stellar while borrow debt exists in this market. Repay first.')
        }

        setStep('exiting')
        const hash = await stellarExitMarket(address, stellarConfig.vaultId)
        setExitMarketHash(hash)
        setStep('success')
        onSuccess?.()
        return
      }

      if (!contractAddresses || !controllerAddress) {
        throw new Error('Contract addresses not found')
      }

      // If user is on a spoke chain and asset is cross-chain, initiate cross-chain disable via Biconomy
      if (chainId && chainId !== effectiveChainId) {
        // Not yet supported cross-chain: prompt user to switch to BSC hub
        try {
          toast('Disable collateral on BSC', {
            description: 'This action is not available cross-chain yet. Please switch to BSC to disable collateral.',
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
        setStep('exiting')
        // Compose a single exitMarket call on the hub chain controller
        const composeBody = {
          ownerAddress: address,
          mode: 'eoa',
          composeFlows: [
            {
              type: '/instructions/build',
              data: {
                functionSignature: 'function exitMarket(address)',
                args: [contractAddresses.pTokenAddress as Address],
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
        if (exec?.hash) setExitMarketHash(exec.hash)
        setStep('success')
        toast.success('Disable collateral initiated cross-chain. It may take a minute to finalize.')
        try {
          ;(window as any).__PERIDOT_TX_ACTIVE = false
        } catch (_) {}
        onSuccess?.()
        return
      }

      // Hub chain or non-cross-chain asset: call directly
      setStep('exiting')

      if (isSmartAccountActive) {
        // Smart Account: Exit Market
        try {
          const hash = await executeSmartTx({
            to: controllerAddress as Address,
            data: encodeFunctionData({
              abi: combinedAbi,
              functionName: 'exitMarket',
              args: [contractAddresses.pTokenAddress as Address],
            }),
          }, {
            chainId: chainId as number,
            onSuccess: (h) => {
              setExitMarketHash(h as string)
              setStep('success')
              onSuccess?.()
            }
          })
          if (hash) {
            setExitMarketHash(hash as string)
            setStep('success')
            onSuccess?.()
          }
          return
        } catch (err) {
          console.error('Smart account exit market error:', err)
          return
        }
      }

      writeExitMarket({
        address: controllerAddress as Address,
        abi: combinedAbi,
        functionName: 'exitMarket',
        args: [contractAddresses.pTokenAddress as Address],
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
    setExitMarketHash(undefined)
    resetExitMarket()
  }

  // Get current loading state
  const isLoading = step === 'exiting' || isExitMarketPending || isExitMarketConfirming

  // Get status message
  const getStatusMessage = () => {
    switch (step) {
      case 'exiting':
        return !useStellarFlow && isExitMarketPending ? 'Please confirm in wallet...' : 'Disabling collateral...'
      case 'success':
        return 'Successfully disabled collateral!'
      case 'error':
        return 'Transaction failed'
      default:
        return ''
    }
  }

  return {
    executeExitMarket,
    step,
    error,
    isLoading,
    canExitMarket,
    reset,
    contractAddresses,
    statusMessage: getStatusMessage(),
    exitMarketHash,
  }
}
