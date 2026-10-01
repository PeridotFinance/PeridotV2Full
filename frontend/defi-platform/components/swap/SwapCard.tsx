'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useAccount, useSwitchChain, useBalance } from 'wagmi'
import { formatUnits } from 'viem'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChainSelector } from './ChainSelector'
import { TokenSelector } from './TokenSelector'
import { AmountInput } from './AmountInput'
import { QuoteDisplay } from './QuoteDisplay'
import { SwapStatusTracker } from './SwapStatusTracker'
import { useSwapQuote } from '@/hooks/use-swap-quote'
import { useSwap } from '@/hooks/use-swap'
import { fetchSwapData } from '@/lib/swap/chains'
import type { SwapChain } from '@/lib/swap/chains'
import type { TokenInfo } from '@/lib/swap/types'
import { isNativeToken } from '@/lib/swap/bitget-chains'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'

export function SwapCard() {
  const { address: evmAddress } = useActiveWallet()
  const { chainId: activeChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const stellarWallet = useStellarWallet()

  // Chain + Token state (separate for source and destination)
  const [fromChain, setFromChain] = useState<SwapChain | null>(null)
  const [toChain, setToChain] = useState<SwapChain | null>(null)
  const [fromToken, setFromToken] = useState<TokenInfo | null>(null)
  const [toToken, setToToken] = useState<TokenInfo | null>(null)
  const [amount, setAmount] = useState('')

  // Resolve active address based on source chain type
  const address = useMemo(() => {
    if (fromChain?.type === 'stellar') return stellarWallet.address
    return evmAddress
  }, [fromChain?.type, stellarWallet.address, evmAddress])

  // Fetch all chains + tokens from Squid API
  const { data: swapData, isLoading: isLoadingData } = useQuery({
    queryKey: ['swap-chains-tokens'],
    queryFn: fetchSwapData,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  const chains = swapData?.chains ?? []
  const tokensByChain = swapData?.tokensByChain ?? {}

  // Tokens for selected chains
  const fromTokens = useMemo(
    () => (fromChain ? tokensByChain[fromChain.chainId] ?? [] : []),
    [fromChain, tokensByChain],
  )
  const toTokens = useMemo(
    () => (toChain ? tokensByChain[toChain.chainId] ?? [] : []),
    [toChain, tokensByChain],
  )

  // Reset token when chain changes
  const handleFromChainChange = useCallback((chain: SwapChain) => {
    setFromChain(chain)
    setFromToken(null)
  }, [])

  const handleToChainChange = useCallback((chain: SwapChain) => {
    setToChain(chain)
    setToToken(null)
  }, [])

  // Debounce amount for quote
  const [debouncedAmount, setDebouncedAmount] = useState('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    debounceTimer.current = setTimeout(() => setDebouncedAmount(amount), 400)
    return () => clearTimeout(debounceTimer.current)
  }, [amount])

  // Wallet balance for "from" token
  // Pass token only for ERC20s; native tokens (empty, 0x000...0, 0xEee...eE) use native balance
  const isFromNative = fromToken ? isNativeToken(fromToken.address) : true
  const { data: balanceData } = useBalance({
    address: address as `0x${string}` | undefined,
    token: !isFromNative && fromToken?.address ? (fromToken.address as `0x${string}`) : undefined,
    chainId: fromToken?.chainId,
  })

  const balance = useMemo(() => {
    if (!balanceData) return undefined
    return formatUnits(balanceData.value, balanceData.decimals)
  }, [balanceData])

  // Quote
  const {
    data: quote,
    isLoading: isQuoting,
    error: quoteError,
  } = useSwapQuote({
    fromToken,
    toToken,
    amount: debouncedAmount,
    userAddress: address,
  })

  // Swap execution
  const {
    step,
    error: swapError,
    txHash,
    explorerUrl,
    receiveAmount,
    executeSwap,
    reset: resetSwap,
    isLoading: isSwapping,
  } = useSwap()

  // Flip source ↔ destination
  const handleFlip = useCallback(() => {
    const tmpChain = fromChain
    const tmpToken = fromToken
    setFromChain(toChain)
    setFromToken(toToken)
    setToChain(tmpChain)
    setToToken(tmpToken)
    setAmount('')
  }, [fromChain, toChain, fromToken, toToken])

  // Determine source chain type
  const sourceChainType = fromChain?.type ?? 'evm'
  const isEvmSource = sourceChainType === 'evm'

  // Execute swap
  const handleSwap = useCallback(async () => {
    if (!quote || !address) return

    // Switch chain if needed (EVM only)
    if (isEvmSource && fromToken && activeChainId !== fromToken.chainId) {
      try {
        await switchChainAsync({ chainId: fromToken.chainId })
      } catch {
        return
      }
    }

    await executeSwap(quote, address, sourceChainType as any)
  }, [quote, address, fromToken, activeChainId, switchChainAsync, executeSwap, isEvmSource, sourceChainType])

  const isUnsupportedSource = sourceChainType === 'cosmos' || sourceChainType === 'sui'

  const needsChainSwitch = isEvmSource && fromToken && activeChainId !== fromToken.chainId
  const canSwap = !!quote && !!address && !isSwapping && Number(amount) > 0 && !isUnsupportedSource

  // For Stellar source: offer Freighter connect if not connected
  const needsStellarConnect = sourceChainType === 'stellar' && !stellarWallet.isConnected

  const buttonLabel = isUnsupportedSource
    ? `${fromChain?.name ?? 'This chain'} as source not yet supported`
    : needsStellarConnect
      ? 'Connect a Stellar wallet'
      : !address
        ? 'Connect Wallet'
        : !fromChain || !toChain
          ? 'Select chains'
          : !fromToken || !toToken
            ? 'Select tokens'
            : !amount || Number(amount) === 0
              ? 'Enter amount'
              : isQuoting
                ? 'Fetching quote...'
                : quoteError
                  ? 'No route available'
                  : needsChainSwitch
                    ? `Switch to ${fromChain.name}`
                    : isSwapping
                      ? 'Swapping...'
                      : 'Swap'

  const showStatus = step !== 'idle'

  // Format output amount safely
  // Both adapters return toAmount in raw (smallest-unit) form.
  // If the value already contains a decimal point it's human-readable — use as-is.
  const formatOutput = () => {
    if (!quote) return null
    try {
      const raw = quote.toAmount
      const human = raw.includes('.')
        ? Number(raw)
        : Number(formatUnits(BigInt(raw), quote.toToken.decimals))
      return human.toLocaleString(undefined, { maximumFractionDigits: 6 })
    } catch {
      return quote.toAmount
    }
  }

  return (
    <div className="mx-auto w-full max-w-[440px] space-y-4">
      <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-lg">
        <h2 className="mb-5 text-lg font-semibold">Swap & Bridge</h2>

        {/* ── FROM ── */}
        <div className="rounded-xl bg-muted/30 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">From</span>
            <div className="flex items-center gap-1.5">
              <ChainSelector
                chains={chains}
                selected={fromChain}
                onSelect={handleFromChainChange}
                isLoading={isLoadingData}
                label="Chain"
              />
              <TokenSelector
                tokens={fromTokens}
                selected={fromToken}
                chainId={fromChain ? Number(fromChain.chainId) : null}
                onSelect={setFromToken}
                isLoading={isLoadingData}
                label="Token"
                userAddress={address}
              />
            </div>
          </div>
          <AmountInput
            value={amount}
            onChange={setAmount}
            balance={balance}
            disabled={isSwapping}
            label=""
          />
        </div>

        {/* ── FLIP ── */}
        <div className="flex justify-center -my-2 relative z-10">
          <button
            type="button"
            onClick={handleFlip}
            disabled={isSwapping}
            className="rounded-full border-2 border-background bg-card p-2 text-muted-foreground shadow-md transition-all hover:text-[#33C47C] hover:shadow-lg active:scale-95 disabled:opacity-50"
          >
            <ArrowDownUp className="h-4 w-4" />
          </button>
        </div>

        {/* ── TO ── */}
        <div className="rounded-xl bg-muted/30 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">To</span>
            <div className="flex items-center gap-1.5">
              <ChainSelector
                chains={chains}
                selected={toChain}
                onSelect={handleToChainChange}
                isLoading={isLoadingData}
                label="Chain"
              />
              <TokenSelector
                tokens={toTokens}
                selected={toToken}
                chainId={toChain ? Number(toChain.chainId) : null}
                onSelect={setToToken}
                isLoading={isLoadingData}
                label="Token"
                userAddress={evmAddress}
              />
            </div>
          </div>
          <div className="rounded-xl bg-muted/50 px-3 py-2.5">
            <p className="text-lg font-medium">
              {isQuoting && debouncedAmount && Number(debouncedAmount) > 0 ? (
                <span className="text-muted-foreground animate-pulse">Calculating...</span>
              ) : quote ? (
                `~${formatOutput()}`
              ) : (
                <span className="text-muted-foreground/40">0.00</span>
              )}
            </p>
          </div>
        </div>

        {/* ── QUOTE DETAILS ── */}
        <div className="mt-4">
          <QuoteDisplay
            quote={quote}
            isLoading={isQuoting && !!debouncedAmount && Number(debouncedAmount) > 0}
            error={quoteError?.message}
          />
        </div>

        {/* ── SWAP BUTTON ── */}
        {!showStatus && (
          <Button
            onClick={needsStellarConnect ? () => stellarWallet.connect() : handleSwap}
            disabled={needsStellarConnect ? false : !canSwap}
            className="mt-4 w-full bg-[#33C47C] text-white hover:bg-[#2AA066] disabled:bg-muted disabled:text-muted-foreground"
            size="lg"
          >
            {buttonLabel}
          </Button>
        )}
      </div>

      {/* ── STATUS TRACKER ── */}
      {showStatus && (
        <SwapStatusTracker
          step={step}
          error={swapError}
          txHash={txHash}
          explorerUrl={explorerUrl}
          receiveAmount={receiveAmount}
          toSymbol={toToken?.symbol}
          fromChainId={fromToken?.chainId}
          onReset={resetSwap}
        />
      )}
    </div>
  )
}
