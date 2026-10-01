import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import type { Address } from 'viem'
import { CHAIN_IDS, getChainConfig, isHubChain } from '@/config/contracts'
import { getMarketsForChain } from '@/data/market-data'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { TOKENS as BICONOMY_TOKENS } from '@/biconomy/constants'
import { biconomyAdapter } from '@/lib/biconomyAdapter'
import { useSmartAccountUpgrade } from '@/components/providers/SmartAccountUpgradeProvider'
import { bsc } from 'viem/chains'
import { selectInjectedProvider, createWalletClientForProvider, CHAIN_BY_ID } from '@/lib/biconomy/wallet'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { toast } from 'sonner'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useSmartExecution } from '@/hooks/use-smart-execution'
import { encodeFunctionData } from 'viem'
import { useSendTransaction } from '@privy-io/react-auth'

type Step = 'idle' | 'entering' | 'success' | 'error'

export function useEnableCollateralTransaction({ assetId }: { assetId: string }) {
  const { chainId } = useAccount()
  const { address, isSmartAccountActive } = useActiveWallet()
  const { execute: executeSmartTx } = useSmartExecution()
  const { switchChainAsync } = useSwitchChain()
  // Privy gasless: sponsor: true covers gas from Privy credits (no BNB needed on BSC)
  const { sendTransaction: privySendTransaction } = useSendTransaction()
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const [enterHash, setEnterHash] = useState<`0x${string}` | undefined>()
  const [crossChainStatus, setCrossChainStatus] = useState<'idle' | 'pending' | 'executed' | 'failed' | 'refunded' | 'unknown'>('idle')
  const [biconomyTrackingUrl, setBiconomyTrackingUrl] = useState<string | undefined>(undefined)
  const [biconomyExplorerLinks, setBiconomyExplorerLinks] = useState<string[] | undefined>(undefined)
  const [biconomyBscTxHash, setBiconomyBscTxHash] = useState<`0x${string}` | undefined>(undefined)
  const [biconomyFee, setBiconomyFee] = useState<any | undefined>(undefined)
  const [biconomyFeeDetails, setBiconomyFeeDetails] = useState<any | undefined>(undefined)
  const [biconomyMeeLink, setBiconomyMeeLink] = useState<string | undefined>(undefined)

  const biconomySuperTxHashRef = useRef<string | undefined>(undefined)
  const { meeAuthorization } = useSmartAccountUpgrade()
  const DEBUG = typeof window !== 'undefined' && (process.env.NEXT_PUBLIC_PERIDOT_DEBUG === '1' || process.env.NEXT_PUBLIC_PERIDOT_DEBUG === 'true' || process.env.NODE_ENV !== 'production')

  // Local direct-enter fallback writer (BSC switch + direct controller call)
  const { writeContract: writeDirectEnter, data: directEnterData } = useWriteContract()
  useEffect(() => {
    if (directEnterData) {
      try { setEnterHash(directEnterData as any) } catch {}
    }
  }, [directEnterData])

  const { isSuccess: isDirectEnterSuccess } = useWaitForTransactionReceipt({ hash: enterHash })
  useEffect(() => {
    if (isDirectEnterSuccess && !biconomySuperTxHashRef.current) {
      setStep('success')
      try {
        window.dispatchEvent(new CustomEvent('peridot:tx-success', { detail: { type: 'enable-collateral' } }))
      } catch {}
    }
  }, [isDirectEnterSuccess])

  const isBiconomyCrossChain = useMemo(() => Boolean(
    FEATURE_FLAGS.CROSS_CHAIN_COLLATERAL_BICONOMY && typeof chainId === 'number' && !isHubChain(chainId)
  ), [chainId])

  const asset = useMemo(() => {
    if (!chainId) return undefined
    const all = getMarketsForChain(chainId)
    return all.find(a => a.id === assetId)
  }, [chainId, assetId])

  const pTokenOnBsc = useMemo(() => {
    try {
      const bscConfig: any = getChainConfig(CHAIN_IDS.BSC_MAINNET)
      const key = String(asset?.symbol || '').toUpperCase()
      return (bscConfig?.markets?.[key]?.pToken) as Address | undefined
    } catch { return undefined }
  }, [asset?.symbol])

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

  const sourceTokenForBiconomy = useMemo(() => {
    const netKey = mapChainIdToBiconomyKey(chainId)
    const key = String(asset?.symbol || '').toUpperCase()
    return (netKey && (BICONOMY_TOKENS as any)[netKey]?.[key]) as Address | undefined
  }, [chainId, asset?.symbol])

  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setEnterHash(undefined)
    setCrossChainStatus('idle')
    setBiconomyTrackingUrl(undefined)
    setBiconomyExplorerLinks(undefined)
    setBiconomyBscTxHash(undefined)
    setBiconomyFee(undefined)
    setBiconomyFeeDetails(undefined)
    setBiconomyMeeLink(undefined)
    biconomySuperTxHashRef.current = undefined
  }, [])

  const checkStatus = useCallback(async () => {
    if (!biconomySuperTxHashRef.current) return { status: 'unknown' as const }
    const { status, explorerLinks, bscTxHash } = await biconomyAdapter.getStatus({ superTxHash: biconomySuperTxHashRef.current })
    if (explorerLinks && explorerLinks.length) setBiconomyExplorerLinks(explorerLinks)
    if (bscTxHash && bscTxHash !== (biconomyBscTxHash as any)) setBiconomyBscTxHash(bscTxHash)
    setCrossChainStatus(status)
    return { status }
  }, [biconomyBscTxHash])

  const executeEnableCollateral = useCallback(async () => {
    try {
      setError(null)
      if (!address) throw new Error('Please connect your wallet first')

      // Same-chain / direct BSC path
      if (!isBiconomyCrossChain) {
        if (isSmartAccountActive) {
          if (!asset || !asset.symbol) throw new Error('Asset not available on this network')
          const chainConfig = getChainConfig(chainId!)
          const controllerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy : null
          const pTokenAddress = asset.pToken

          if (!controllerAddress || !pTokenAddress) {
            throw new Error('Contract addresses not found for this network')
          }

          setStep('entering')
          const hash = await executeSmartTx({
            to: controllerAddress as Address,
            data: encodeFunctionData({
              abi: combinedAbi,
              functionName: 'enterMarkets',
              args: [[pTokenAddress as Address]],
            }),
          }, {
            chainId: chainId as number,
            onSuccess: (h) => {
              setEnterHash(h)
              setStep('success')
            }
          })
          if (hash) {
            setEnterHash(hash)
            setStep('success')
          }
          return
        }

        // EOA fallback: switch to BSC and call enterMarkets directly.
        // Collateral is always on the BSC hub, so we look up the pToken from BSC config
        // regardless of which chain the user's wallet is currently on.
        const isTestnetPreset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || '').startsWith('testnet')
        const bscChainId = isTestnetPreset ? CHAIN_IDS.BSC_TESTNET : CHAIN_IDS.BSC_MAINNET
        const bscConfig = getChainConfig(bscChainId) as any
        const bscMarkets = getMarketsForChain(bscChainId)
        const bscAsset = bscMarkets.find(a => a.id === assetId) || bscMarkets.find(a => a.symbol === asset?.symbol)
        const assetKey = String(bscAsset?.symbol || asset?.symbol || '').toUpperCase()
        const controllerOnBsc = bscConfig?.unitrollerProxy as Address | undefined
        const pTokenOnBscEoa = bscConfig?.markets?.[assetKey]?.pToken as Address | undefined

        if (!controllerOnBsc || !pTokenOnBscEoa) {
          throw new Error('Contract configuration not found for BSC. Please switch to BSC manually and retry.')
        }

        if (chainId !== bscChainId) {
          const chainName = isTestnetPreset ? 'BSC Testnet' : 'BSC'
          try {
            toast(`Switching to ${chainName} to enable collateral`, {
              description: 'A quick signature on BSC is needed — your collateral lives there.',
            })
            await switchChainAsync({ chainId: bscChainId })
          } catch {
            throw new Error('Network switch to BSC was declined. Please switch manually and retry.')
          }
        }

        setStep('entering')

        const enterTxData = encodeFunctionData({
          abi: combinedAbi as any,
          functionName: 'enterMarkets',
          args: [[pTokenOnBscEoa]],
        })

        // Try Privy sponsored gas first (user needs no BNB on BSC)
        if (FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT) {
          try {
            const { hash } = await privySendTransaction(
              { to: controllerOnBsc, data: enterTxData, chainId: bscChainId },
              { sponsor: true },
            )
            setEnterHash(hash as `0x${string}`)
            return // receipt watcher handles step → 'success'
          } catch (sponsorErr) {
            console.warn('[EnableCollateral] Privy sponsorship failed, falling back to wallet gas:', sponsorErr)
          }
        }

        // Fallback: standard wallet write (requires BNB for gas)
        writeDirectEnter({
          address: controllerOnBsc,
          abi: combinedAbi as any,
          functionName: 'enterMarkets',
          args: [[pTokenOnBscEoa]],
        } as any)
        return
      }

      if (!pTokenOnBsc) {
        throw new Error('Cross-chain configuration not ready. Please wait and try again.')
      }

      // Compose & execute a single enterMarkets call on BSC via adapter's internal helpers
      setStep('entering')
      const result = await (async () => {
        // Inline minimal compose/quote/execute using existing adapter utilities in supply/borrow
        // Reuse the adapter's post-enable pattern by triggering a supply-like flow with zero transfer
        // Instead, we directly call a thin helper inside adapter via a private method-like call if exposed
        const res = await (biconomyAdapter as any).startEnableCollateral?.({
          userAddress: address as Address,
          destinationChainId: CHAIN_IDS.BSC_MAINNET, // Enable collateral is always on BSC for now
          pTokenAddress: pTokenOnBsc,
        })
        if (res) return res
        // Fallback: manually compose the single call through app API
        const composeBody = {
          ownerAddress: address,
          mode: 'eoa',
          composeFlows: [
            {
              type: '/instructions/build',
              data: {
                functionSignature: 'function enterMarkets(address[])',
                args: [[pTokenOnBsc]],
                to: (getChainConfig(CHAIN_IDS.BSC_MAINNET) as any).unitrollerProxy,
                chainId: CHAIN_IDS.BSC_MAINNET,
                value: '0',
              },
            },
          ],
        }
        const composeRes = await fetch('/api/biconomy/compose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(composeBody) })
        if (!composeRes.ok) throw new Error(await composeRes.text())
        const { instructions } = await composeRes.json()
        // Determine one funding token (Fusion requires exactly one)
        const netKey = mapChainIdToBiconomyKey(chainId)
        const assetKey = String(asset?.symbol || '').toUpperCase()
        const preferred = (netKey && (BICONOMY_TOKENS as any)[netKey]?.[assetKey]) as Address | undefined
        const fallback = (netKey && ((BICONOMY_TOKENS as any)[netKey]?.USDC || (BICONOMY_TOKENS as any)[netKey]?.USDT || (BICONOMY_TOKENS as any)[netKey]?.WETH)) as Address | undefined
        const feeTokenAddr = (preferred || fallback) as Address | undefined
        if (!feeTokenAddr || !chainId) throw new Error('No supported fee token found on this network')

        const buildQuotePayload = (opts?: { preferOnChainFunding?: boolean; sponsorship?: boolean }) => ({
          ownerAddress: address,
          mode: 'eoa',
          instructions,
          sponsorship: opts?.sponsorship ?? true,
          fundingTokens: [{ tokenAddress: feeTokenAddr, chainId, amount: '1' }],
          feeToken: { address: feeTokenAddr, chainId },
          ...(meeAuthorization ? { delegate: true, authorization: meeAuthorization } : {}),
          ...(opts?.preferOnChainFunding ? { preferOnChainFunding: true } : {}),
        })
        // Attempt sequence: sponsored → sponsored+onchainFunding → non-sponsored → non-sponsored+onchainFunding
        const attempts: Array<{ sponsorship?: boolean; onChain?: boolean }> = [
          { sponsorship: true, onChain: false },
          { sponsorship: true, onChain: true },
          { sponsorship: false, onChain: false },
          { sponsorship: false, onChain: true },
        ]
        let quote: any = null
        let lastErrText: string | null = null
        for (const a of attempts) {
          try {
            const payload = buildQuotePayload({ sponsorship: a.sponsorship, preferOnChainFunding: a.onChain })
            if (DEBUG) { try { console.debug('[EnableCollateral] Quoting', { sponsorship: payload.sponsorship, preferOnChainFunding: payload.preferOnChainFunding }) } catch {} }
            let res = await fetch('/api/biconomy/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            if (!res.ok) {
              const t = await res.text()
              lastErrText = t
              // Retry permit failure with on-chain funding if not already set
              if (/nonces\(\)|permit signing failed|EIP-2612/i.test(t) && !a.onChain) {
                const retryPayload = buildQuotePayload({ sponsorship: a.sponsorship, preferOnChainFunding: true })
                res = await fetch('/api/biconomy/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(retryPayload) })
                if (!res.ok) {
                  lastErrText = await res.text()
                  continue
                }
              } else {
                continue
              }
            }
            quote = await res.json()
            break
          } catch (e: any) {
            lastErrText = String(e?.message || e)
          }
        }
        if (!quote) {
          if (DEBUG) { try { console.error('[EnableCollateral] Quote failed after attempts', { lastErrText }) } catch {} }
          throw new Error('Failed to prepare cross-chain enable route. Please try again or switch to BSC to sign directly.')
        }
        if (DEBUG) {
          try {
            console.debug('[EnableCollateral] Quote received', {
              hasPayloadToSign: Array.isArray((quote as any)?.payloadToSign),
              hasPayloadsToSign: Array.isArray((quote as any)?.payloads?.toSign),
              hasResultPayloadToSign: Array.isArray((quote as any)?.result?.payloadToSign),
              hasTransactions: Array.isArray((quote as any)?.transactions),
              quoteType: (quote as any)?.quoteType || (quote as any)?.type,
              funding: (quote as any)?.funding || (quote as any)?.payloads?.funding,
            })
          } catch {}
        }
        let payloads: any[] = (Array.isArray(quote?.payloadToSign) && quote.payloadToSign)
          || (Array.isArray(quote?.payloads?.toSign) && quote.payloads.toSign)
          || (Array.isArray(quote?.result?.payloadToSign) && quote.result.payloadToSign)
          || []
        // Fallback: some flows return raw transactions instead of toSign
        const hasEip712InPayloads = payloads.some((p: any) => {
          const s = (p?.data || p?.signablePayload || p)
          const e = s?.eip712 || s
          return Boolean(e?.domain && e?.types && e?.message)
        })
        const allBscTxs = payloads.length > 0 && payloads.every((p: any) => {
          const s = p?.data || p
          return Number(s?.chainId) === CHAIN_IDS.BSC_MAINNET
        })
        if (!payloads.length || (!hasEip712InPayloads && allBscTxs)) {
          const txs = (Array.isArray(quote?.transactions) && quote.transactions)
            || (Array.isArray(quote?.payloads?.transactions) && quote.payloads.transactions)
            || (Array.isArray(quote?.result?.transactions) && quote.result.transactions)
            || []
          if (txs.length) payloads = txs
        }
        if (!payloads.length) {
          if (DEBUG) { try { console.error('[EnableCollateral] No signable payloads in quote', { quoteKeys: Object.keys(quote || {}) }) } catch {} }
          // Fallback: prompt BSC switch and call direct enterMarkets
          const controllerOnBsc = (getChainConfig(CHAIN_IDS.BSC_MAINNET) as any)?.unitrollerProxy as Address | undefined
          if (!controllerOnBsc || !pTokenOnBsc) {
            throw new Error('Unable to resolve controller address on BSC for fallback path.')
          }
          try { toast('Switching to BSC to enable collateral', { description: 'A one-time signature on BSC will be requested.' }) } catch {}
          try { await switchChainAsync({ chainId: CHAIN_IDS.BSC_MAINNET }) } catch (e: any) {
            throw new Error('User declined network switch to BSC.')
          }
          setStep('entering')
          try {
            await writeDirectEnter({
              address: controllerOnBsc as Address,
              abi: combinedAbi as any,
              functionName: 'enterMarkets',
              args: [[pTokenOnBsc as Address]],
            } as any)
            setStep('success')
            return
          } catch (e: any) {
            throw new Error('Failed to submit enable transaction on BSC.')
          }
        }
        if (DEBUG) {
          try {
            const preview = (payloads || []).slice(0, 2).map((p: any) => ({
              hasWrapper: Boolean(p?.type && p?.data),
              hasSignableWrapper: Boolean(p?.signablePayload),
              hasEip712: Boolean((p?.data || p?.signablePayload || p)?.eip712),
              hasTxFields: Boolean((p?.data || p)?.to && (p?.data || p)?.data && (p?.data || p)?.chainId),
              keys: Object.keys(p || {}).slice(0, 8),
            }))
            console.debug('[EnableCollateral] Payloads preview', { count: payloads.length, preview })
          } catch {}
        }
        const winAny = (globalThis as any) || (globalThis as any)?.window
        const ethBase = winAny?.ethereum || winAny?.window?.ethereum
        if (!ethBase) throw new Error('No wallet provider found for signing')
        const candidates = Array.isArray(ethBase?.providers) && ethBase.providers.length ? ethBase.providers : [ethBase]
        const { provider, matched } = await selectInjectedProvider(address)
        if (DEBUG) { try { console.debug('[EnableCollateral] Provider selected', { matched }) } catch {} }
        const walletClient = createWalletClientForProvider(provider as any)
        const signedPayloads = [] as any[]
        for (const pRaw of payloads) {
          const hasWrapperTypeData = pRaw && pRaw.type && pRaw.data
          const hasSignableWrapper = pRaw && pRaw.signablePayload
          const signable = hasWrapperTypeData ? pRaw.data : hasSignableWrapper ? pRaw.signablePayload : pRaw
          const meta = hasSignableWrapper ? pRaw.metadata : undefined
          const eip712 = signable?.eip712 || signable
          if (eip712?.domain && eip712?.types && eip712?.message) {
            const primaryType: string = eip712?.primaryType || (Object.keys(eip712.types || {}).find(k => k !== 'EIP712Domain') || 'Permit')
            const signature = await walletClient.signTypedData({ account: address as Address, domain: eip712.domain, types: eip712.types, primaryType, message: eip712.message } as any)
            signedPayloads.push(hasSignableWrapper ? { signablePayload: pRaw.signablePayload, metadata: meta, signature } : { message: eip712.message, signature })
            continue
          }
          if (signable?.to && signable?.data != null && signable?.chainId) {
            const chain = (CHAIN_BY_ID as any)[signable.chainId] || undefined
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
        if (DEBUG) {
          try { console.debug('[EnableCollateral] Signed payloads', { count: signedPayloads.length }) } catch {}
        }
        const execRes = await fetch('/api/biconomy/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ownerAddress: address, fee: (quote as any)?.fee, quoteType: String((quote as any)?.quoteType || (quote as any)?.type || '').toLowerCase?.(), quote: (quote?.quote || quote?.result?.quote || quote), payloadToSign: signedPayloads, mode: 'eoa', ...(meeAuthorization ? { delegate: true, authorization: meeAuthorization } : {}) }) })
        if (!execRes.ok) throw new Error(await execRes.text())
        const exec = await execRes.json()
        return { superTxHash: exec?.hash, trackingUrl: exec?.trackingUrl }
      })()

      if (result?.superTxHash) {
        biconomySuperTxHashRef.current = result.superTxHash
        setEnterHash(result.superTxHash as any)
        setBiconomyTrackingUrl(result.trackingUrl)
      }

      setStep('success')
      setCrossChainStatus('pending')
      // Removed cc-dialog-open - now using unified tx-update events
    } catch (e: any) {
      setError(String(e?.message || e))
      setStep('error')
    }
  }, [address, asset, chainId, isBiconomyCrossChain, sourceTokenForBiconomy, pTokenOnBsc])

  const statusMessage = useMemo(() => {
    switch (step) {
      case 'entering':
        return 'Enabling as collateral...'
      case 'success':
        return ''
      case 'error':
        return 'Transaction failed'
      default:
        return ''
    }
  }, [step])

  return {
    executeEnableCollateral,
    reset,
    step,
    statusMessage,
    error,
    enterHash,
    crossChainStatus,
    biconomyTrackingUrl,
    biconomyExplorerLinks,
    biconomyBscTxHash,
    biconomyFee,
    biconomyFeeDetails,
    biconomyMeeLink,
    hasResumableCrossChain: Boolean(biconomySuperTxHashRef.current),
  }
}

export default useEnableCollateralTransaction


