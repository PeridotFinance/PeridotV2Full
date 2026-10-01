"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Banknote, ChevronLeft, Info, TrendingUp } from "lucide-react"
import { usePrivy } from "@privy-io/react-auth"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { normalizeDecimalString } from "@/lib/token-units"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { openAddMoney } from "@/lib/onramp/add-money"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { AddMoneyBody } from "@/components/onramp/AddMoneySheet"
import { useBridgeBalance } from "@/hooks/use-bridge-balance"
import { useBridgePayout } from "@/hooks/use-bridge-payout"
import { useBridgePayoutAddress } from "@/hooks/use-bridge-payout-address"
import type { OnrampDestinationCurrency } from "@/app/api/bridge/_state"
import { SheetShell } from "./SheetShell"
import { useEasySupply } from "@/hooks/use-easy-supply"
import { useTxBusyPhase } from "@/hooks/use-tx-busy-phase"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { ButtonProgress } from "@/components/easy/ButtonProgress"
import { friendlyTxError } from "@/lib/tx-errors"
import { useApyData } from "@/hooks/use-apy-data"
import { useCrossChainWalletBalances } from "@/hooks/use-cross-chain-wallet-balances"
import { useStellarSheets } from "@/context/stellar-sheets"
import { combinedMarkets, getStellarSorobanMarkets } from "@/data/market-data"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { useStellarSupplyTransaction } from "@/hooks/use-stellar-supply-transaction"
import { useStellarTrustline } from "@/hooks/use-stellar-trustline"
import { StellarTopUpHint } from "@/components/wallet/StellarTopUpHint"
import { ConnectChooser } from "@/components/wallet/ConnectChooser"
import { CrossChainTopUpNotice, TOP_UP_STEP_LABEL } from "@/components/cctp/CrossChainTopUpNotice"
import { useCrossChainTopUp } from "@/hooks/use-cross-chain-top-up"
import {
  getStellarVaultConfig,
  stellarFetchPrice,
  stellarGetNativeXlmBalance,
  stellarGetTokenBalance,
} from "@/lib/stellar-soroban-lending"

// ─── Asset lookup ─────────────────────────────────────────────────────────────

function findAsset(assetId: string) {
  const all = [...combinedMarkets, ...getStellarSorobanMarkets()]
  return all.find((m) => m.id === assetId)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUsd(n: number) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function sanitizeAmount(input: string): string {
  // A pasted, locale-grouped amount ("9.959,66" / "9,959.66") carries both
  // separators. Naively mapping comma→dot turns that into 9.95966 — a hundred-
  // fold loss. Resolve those through the shared normalizer; plain typing
  // (single separator, partial input like "9.") keeps the permissive path so
  // the field stays editable mid-keystroke.
  const hasBoth = input.includes(",") && input.includes(".")
  if (hasBoth) {
    const normalized = normalizeDecimalString(input)
    if (normalized) return normalized
  }
  return input.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DepositSheetInnerProps {
  assetId: string
  defaultAmount?: string
  onClose: () => void
}

/**
 * Inner sheet — instantiated only when a deposit slot is open. Mounting it
 * conditionally keeps `useEasySupply` from running for every page view.
 */
/**
 * Tells the Easy success card what was just deposited, so it can say "$100 is
 * earning now" instead of a generic confirmation. The card listens for this
 * event whichever surface ran the deposit; the mobile card used to be the only
 * sender, and since it hands deposits to this sheet the sheet has to send it.
 */
function announceDeposit(usd: number, apy: number, symbol: string) {
  if (typeof window === "undefined" || !(usd > 0)) return
  window.dispatchEvent(
    new CustomEvent("peridot:tx-deposit-meta", { detail: { usd, apy, symbol } }),
  )
}

function DepositSheetInner({ assetId, defaultAmount, onClose }: DepositSheetInnerProps) {
  const asset = findAsset(assetId)
  const [raw, setRaw] = useState(defaultAmount ?? "")

  const { bestApyPerAsset } = useApyData()
  const apy = bestApyPerAsset[assetId] ?? asset?.supplyApy ?? 0

  // Wallet balance for this asset across chains.
  const { balances } = useCrossChainWalletBalances(assetId)
  const walletTotal = balances.reduce((s, b) => s + b.balance, 0)

  const amount = parseFloat(raw) || 0
  const yearly = amount > 0 ? (amount * apy) / 100 : 0
  const enough = walletTotal >= amount

  // useEasySupply is the source of truth for the action and its state.
  // We only consume what we need; everything else is handled globally by
  // <TxToast />, which subscribes to the `peridot:tx-*` events the hook
  // dispatches.
  const { executeSupply, isLoading, error, reset, step, statusMessage, isBiconomyCrossChain } = useEasySupply({
    assetId,
    amount: raw,
    onSuccess: () => {
      announceDeposit(parseFloat(raw) || 0, apy, asset?.symbol ?? "")
      onClose()
    },
  })

  const { isEmbeddedWallet } = useActiveWallet()

  // Live, morphing busy label from the hook's phase stream — shared with the
  // mobile card so desktop and mobile speak the same language during a tx.
  const busyPhase = useTxBusyPhase({
    active: isLoading,
    step,
    statusMessage,
    isCrossChain: isBiconomyCrossChain,
    isEmbedded: isEmbeddedWallet,
  })

  // Reset the hook between sheet opens.
  useEffect(() => {
    reset?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId])

  const ctaLabel = useMemo(() => {
    if (amount <= 0) return "Enter an amount"
    if (!enough) return "Add money →"
    if (isLoading) return busyPhase.label
    return `Deposit $${formatUsd(amount)}`
  }, [amount, enough, isLoading, busyPhase.label])

  const ctaDisabled = amount <= 0 || isLoading

  function handleConfirm() {
    if (ctaDisabled) return
    if (!enough) {
      // Not enough in the wallet: hand over to the "Add money" sheet, seeded
      // with what is missing. A confirmed card purchase comes back to this
      // deposit through /app/funded.
      onClose()
      openAddMoney({
        assetId,
        defaultAmount: Math.ceil(amount - walletTotal),
        defaultAmountCurrency: "usd",
      })
      return
    }
    executeSupply()
  }

  return (
    <SheetShell
      open
      onClose={onClose}
      title="Deposit"
      subtitle={asset?.name ? `Earn interest on ${asset.name}` : "Earn interest on your dollars"}
      testId="deposit-sheet"
    >
      <div className="flex flex-col gap-5 pt-2">
        {/* Asset header */}
        <div className="flex items-center gap-3">
          {asset?.icon ? (
            <div className="relative w-10 h-10 shrink-0">
              <Image
                src={asset.icon}
                alt={asset.symbol}
                fill
                sizes="40px"
                className="rounded-full object-cover"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).src =
                    "/tokenimages/app/placeholder.svg"
                }}
              />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold shrink-0">
              $
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {asset?.name ?? "US Dollar"}
            </p>
            <p className="text-xs text-emerald-600 font-medium">
              Earn {apy.toFixed(1)}% per year
            </p>
          </div>
          <TrendingUp size={18} className="text-emerald-500 shrink-0" />
        </div>

        {/* Amount input */}
        <div>
          <label
            htmlFor="deposit-sheet-amount"
            className="block text-xs font-medium text-muted-foreground mb-1.5"
          >
            How much do you want to deposit?
          </label>
          <div className="relative flex items-center">
            <span className="absolute left-4 text-2xl font-bold text-muted-foreground/80 pointer-events-none select-none">
              $
            </span>
            <input
              id="deposit-sheet-amount"
              data-testid="deposit-sheet-amount"
              autoFocus
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={raw}
              onChange={(e) => setRaw(sanitizeAmount(e.target.value))}
              className={cn(
                "w-full pl-10 pr-20 py-4 rounded-2xl border border-foreground/[0.08] bg-background",
                "text-2xl font-black text-foreground tabular-nums",
                "placeholder:text-muted-foreground/60 placeholder:font-normal",
                "focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-300",
                "transition-all"
              )}
            />
            <span className="absolute right-4 text-xs font-semibold text-muted-foreground/80 pointer-events-none uppercase tracking-wider">
              USD
            </span>
          </div>
        </div>

        {/* Available + projection rows */}
        <div className="rounded-xl bg-muted/40 px-4 py-3 flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Available</span>
            <span
              data-testid="deposit-sheet-available"
              className={cn(
                "font-semibold tabular-nums",
                enough ? "text-foreground" : "text-amber-600"
              )}
            >
              ${formatUsd(walletTotal)}
            </span>
          </div>
          <AnimatePresence mode="wait">
            {amount > 0 && (
              <motion.div
                key="projection"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-baseline justify-between text-sm"
              >
                <span className="text-muted-foreground">Yearly earnings</span>
                <span className="font-semibold tabular-nums text-emerald-600">
                  +${formatUsd(yearly)}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Inline error */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="text-xs text-rose-600 px-1"
            >
              {friendlyTxError(error)}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Confirm */}
        <button
          type="button"
          onClick={handleConfirm}
          disabled={ctaDisabled}
          data-testid="deposit-sheet-confirm"
          className={cn(
            "relative flex h-14 w-full items-center justify-center rounded-2xl text-base font-bold transition-all",
            ctaDisabled
              ? "bg-muted text-muted-foreground/80 cursor-not-allowed"
              : !enough
              ? "bg-amber-500 text-white hover:bg-amber-400 active:scale-[0.99]"
              : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.99]"
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={ctaLabel}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {ctaLabel}
            </motion.span>
          </AnimatePresence>
          {isLoading && <ButtonProgress progress={busyPhase.progress} />}
        </button>

        <p className="text-[11px] text-muted-foreground/80 text-center">
          You can withdraw any time. Your money keeps earning until you do.
        </p>
      </div>
    </SheetShell>
  )
}

// ─── Stellar variant ──────────────────────────────────────────────────────────
// Used when the asset id resolves to a Soroban vault (XLM / USDC / EURC).
// Uses Freighter directly for both wallet auth and transaction signing.

interface StellarDepositSheetInnerProps {
  assetId: string
  defaultAmount?: string
  onClose: () => void
}

function StellarDepositSheetInner({ assetId, defaultAmount, onClose }: StellarDepositSheetInnerProps) {
  const asset = findAsset(assetId)
  // Memoize so the {vaultId, underlying, decimals} reference is stable across
  // renders. Without useMemo this would change on every render and re-trigger
  // the wallet-balance effect on every state update → flicker.
  const vaultConfig = useMemo(() => getStellarVaultConfig(assetId), [assetId])
  const [raw, setRaw] = useState(defaultAmount ?? "")
  const [walletBalance, setWalletBalance] = useState(0) // in token units
  const [price, setPrice] = useState<number | null>(null)
  const [isBalanceLoading, setIsBalanceLoading] = useState(false)
  // When a Stellar-connected user wants EURC but is short, we let them step
  // into the SEPA top-up inline (same overlay, no nested dialog). Sticky
  // until they manually back out — keeps the state on remount if they pop
  // back to amend the amount.
  const [bankTransferFallback, setBankTransferFallback] = useState(false)

  const { bestApyPerAsset } = useApyData()
  const apy = bestApyPerAsset[assetId] ?? asset?.supplyApy ?? 0

  const stellarWallet = useStellarWallet()
  const supplyTx = useStellarSupplyTransaction({
    assetId,
    amount: raw,
    onSuccess: () => {
      // `raw` is in tokens here; the card speaks dollars.
      announceDeposit((parseFloat(raw) || 0) * (price ?? 0), apy, asset?.symbol ?? "")
      onClose()
    },
  })

  // Soroban deposits are single-chain and signed in an external wallet
  // (Freighter et al.) — no cross-chain stages, never an embedded pop-up.
  const busyPhase = useTxBusyPhase({
    active: supplyTx.isLoading,
    step: supplyTx.step,
    statusMessage: supplyTx.statusMessage,
  })
  // Classic Stellar assets (EURC/USDC) need a trustline before the wallet can
  // receive or hold them; XLM is native and resolves to "not_needed". We check
  // when the sheet opens and surface a one-tap activation step if it's missing,
  // so funds (bank-transfer auto-forward or an external send) don't bounce.
  const trustline = useStellarTrustline(assetId)
  const showActivation = stellarWallet.isConnected && trustline.isMissing

  // Fetch live oracle price independent of network selection (asset id is enough).
  useEffect(() => {
    let cancelled = false
    stellarFetchPrice(assetId).then((p) => {
      if (!cancelled) setPrice(p)
    })
    return () => { cancelled = true }
  }, [assetId])

  // Read the wallet balance. Pulled out of the effect because a cross-chain
  // top-up needs to re-run it while the sheet stays open: the money lands from
  // Circle's side, with no transaction of ours to hang a refresh on.
  const readWalletBalance = useCallback(
    async (silent = false) => {
      const address = stellarWallet.address
      if (!address || !vaultConfig) return null
      if (!silent) setIsBalanceLoading(true)
      try {
        const rawUnits = await (assetId === "xlm-stellar"
          ? stellarGetNativeXlmBalance(address)
          : stellarGetTokenBalance(vaultConfig.underlying, address))
        const tokens = Number(BigInt(rawUnits || "0")) / Math.pow(10, vaultConfig.decimals)
        return Number.isFinite(tokens) ? tokens : 0
      } catch {
        // A failed read is not a zero balance. Leaving the last known figure
        // standing beats telling the user their money is gone.
        return null
      } finally {
        if (!silent) setIsBalanceLoading(false)
      }
    },
    [stellarWallet.address, assetId, vaultConfig],
  )

  // Refresh wallet balance whenever Freighter address becomes available.
  useEffect(() => {
    if (!stellarWallet.address || !vaultConfig) {
      setWalletBalance(0)
      return
    }
    let cancelled = false
    void readWalletBalance().then((tokens) => {
      if (!cancelled && tokens !== null) setWalletBalance(tokens)
    })
    return () => { cancelled = true }
  }, [stellarWallet.address, vaultConfig, readWalletBalance])

  const amount = parseFloat(raw) || 0
  const tokenSymbol = asset?.symbol ?? "TOKEN"
  const yearly = amount > 0 ? (amount * apy) / 100 : 0
  const enough = walletBalance >= amount

  // What the user has *everywhere* we can reach it, and what the button should
  // therefore do. Balance line and CTA both read this one object: they used to
  // ask separately and contradict each other — "0 USDC" over a box offering to
  // bring $100 over, under a primary button reading "Insufficient balance".
  const topUp = useCrossChainTopUp({ assetId, amount, stellarBalance: walletBalance })
  // Spendable, counting the USDC still sitting on an EVM chain. It genuinely is
  // available — it just takes one extra hop, which is the button's job to say.
  //
  // For up to a minute after a top-up arrives this double-counts: the Stellar
  // side is read every 8s while we wait, the EVM side on its own 60s cycle. The
  // figure only ever reads high, never low, and it corrects itself — worth more
  // than the coordination it would take to avoid.
  const availableTotal = walletBalance + topUp.total

  // A cross-chain top-up lands without any transaction of ours: Circle attests
  // and our relayer mints, both while the user just sits here. So the sheet
  // watches for the arrival itself and the button turns into "Deposit" the
  // moment the money is there — the alternative is sending the user away to a
  // dashboard banner and back for a deposit they already asked for.
  //
  // Silent reads, so the figure never blinks to "…" underneath them. Stops on
  // its own when the balance covers the amount, which is what ends
  // `awaitingArrival`.
  useEffect(() => {
    if (!topUp.awaitingArrival) return
    let cancelled = false
    const tick = async () => {
      const tokens = await readWalletBalance(true)
      if (!cancelled && tokens !== null) setWalletBalance(tokens)
    }
    const id = setInterval(() => void tick(), 8_000)
    void tick()
    return () => { cancelled = true; clearInterval(id) }
  }, [topUp.awaitingArrival, readWalletBalance])

  // SEPA top-up: Bridge gives the user a EUR-IBAN whose deposits convert to
  // EURC or USDC on the same custodial Stellar wallet, then auto-forward to
  // their own wallet. EUR→EURC is 0% FX; EUR→USDC carries up to 1% spread
  // (surfaced in the bank-transfer sheet). XLM has no fiat path.
  const bankTopUpCurrency: OnrampDestinationCurrency | null =
    !FEATURE_FLAGS.FIAT_ONRAMP_BRIDGE
      ? null
      : assetId === "eurc-stellar"
        ? "eurc"
        : assetId === "usdc-stellar"
          ? "usdc"
          : null
  const canBankTopUp = bankTopUpCurrency !== null
  const shouldOfferBankTopUp = canBankTopUp && stellarWallet.isConnected && !enough && amount > 0

  const ctaLabel = useMemo(() => {
    if (!stellarWallet.isConnected) {
      return stellarWallet.isLoading ? "Connecting…" : "Connect a Stellar wallet"
    }
    if (amount <= 0) return "Enter an amount"
    if (!enough) {
      // Already on its way — the only honest thing the button can do is wait.
      if (topUp.awaitingArrival) return "Waiting for it to arrive…"
      // Money the user already holds beats a bank transfer that takes days, so
      // the cross-chain top-up is offered first when both are possible.
      if (topUp.shouldOffer) {
        if (topUp.isWorking) return TOP_UP_STEP_LABEL[topUp.step] ?? "Working…"
        return `Add $${formatUsd(topUp.moveAmount)} from ${topUp.best?.chainName ?? "your wallet"}`
      }
      return shouldOfferBankTopUp
        ? "Top up with bank transfer →"
        : `Insufficient ${tokenSymbol} balance`
    }
    if (supplyTx.isLoading) return busyPhase.label
    return `Deposit ${amount.toFixed(4)} ${tokenSymbol}`
  }, [stellarWallet.isConnected, stellarWallet.isLoading, amount, enough, supplyTx.isLoading, busyPhase.label, tokenSymbol, shouldOfferBankTopUp, topUp.shouldOffer, topUp.isWorking, topUp.step, topUp.moveAmount, topUp.best, topUp.awaitingArrival])

  const ctaDisabled =
    stellarWallet.isLoading ||
    (stellarWallet.isConnected && amount <= 0) ||
    // Insufficient is only "dead" when there's no fallback funding path.
    (stellarWallet.isConnected && !enough && !shouldOfferBankTopUp && !topUp.shouldOffer) ||
    topUp.isWorking ||
    topUp.awaitingArrival ||
    supplyTx.isLoading

  async function handleConfirm() {
    if (!stellarWallet.isConnected) {
      await stellarWallet.connect()
      return
    }
    // Classic asset not yet trusted → set that up first; the wallet can't hold
    // (or be funded with) the asset until it does.
    if (showActivation) {
      await trustline.ensure()
      return
    }
    if (amount <= 0 || supplyTx.isLoading) return
    if (!enough) {
      // Nothing to do but wait — and above all, do not start a second burn or
      // fall through to the bank-transfer step for money that is already here
      // in all but the last minute.
      if (topUp.awaitingArrival) return
      // Same order as the label: bring over what they already own before
      // sending them to a bank transfer.
      if (topUp.shouldOffer) {
        await topUp.run()
        return
      }
      if (shouldOfferBankTopUp) {
        // Swap this same overlay into the bank-transfer step. Comes back to
        // the amount input automatically once the user toggles back via the
        // EurBankDepositSheet's "Already have a Stellar wallet?" link, or
        // after they leave and re-enter the deposit flow.
        setBankTransferFallback(true)
      }
      return
    }
    await supplyTx.executeSupply()
  }

  const usdValueAtAmount = price ? amount * price : null

  // Stablecoin market + no Stellar wallet → don't dead-end on "Connect wallet".
  // A social-login user funds via bank transfer; the Stellar wallet stays
  // optional and can be linked any time after KYC.
  if (canBankTopUp && bankTopUpCurrency && !stellarWallet.isConnected) {
    const connect = () => {
      void stellarWallet.connect()
    }
    return (
      <BankDepositSheet
        asset={asset}
        apy={apy}
        currency={bankTopUpCurrency}
        onClose={onClose}
        onConnectWallet={connect}
        connecting={stellarWallet.isLoading}
        secondaryAction={connect}
        secondaryLabel={
          stellarWallet.isLoading
            ? "Connecting…"
            : "Already have a Stellar wallet? Connect it"
        }
      />
    )
  }

  // Connected Stellar user picked a fiat-toppable asset but is short — show
  // the same SEPA top-up flow inline. Auto-forward (or the user's already-set
  // payout address) will deliver the funds to this same wallet.
  if (bankTransferFallback && canBankTopUp && bankTopUpCurrency && stellarWallet.isConnected) {
    return (
      <BankDepositSheet
        asset={asset}
        apy={apy}
        currency={bankTopUpCurrency}
        onClose={onClose}
        onConnectWallet={() => {
          // Already connected in this branch; the custody banner doesn't
          // render. Keep the prop satisfied with a no-op rather than asking
          // the wallet kit to re-open its picker.
        }}
        connecting={false}
        secondaryAction={() => setBankTransferFallback(false)}
        secondaryLabel="Back to deposit"
      />
    )
  }

  return (
    <SheetShell
      open
      onClose={onClose}
      title="Deposit"
      subtitle={asset?.name ? `Earn interest on ${asset.name}` : undefined}
      testId="deposit-sheet"
    >
      <div className="flex flex-col gap-5 pt-2">
        <div className="flex items-center gap-3">
          {asset?.icon ? (
            <div className="relative w-10 h-10 shrink-0">
              <Image
                src={asset.icon}
                alt={asset.symbol}
                fill
                sizes="40px"
                className="rounded-full object-cover"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).src = "/tokenimages/app/placeholder.svg"
                }}
              />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold shrink-0">
              {tokenSymbol[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {asset?.name ?? tokenSymbol}
            </p>
            <p className="text-xs text-emerald-600 font-medium">
              {apy > 0
                ? `Earn ${apy.toFixed(1)}% per year`
                // Stellar Soroban vaults backed by DefIndex/Blend show 0% in
                // the API until the manager `report()` realizes vault gains.
                // Until then we signal that the market is live but pre-yield.
                : "Earning soon · first yield realizing"}
            </p>
          </div>
          <TrendingUp size={18} className="text-emerald-500 shrink-0" />
        </div>

        {/* Trustline activation — classic assets (EURC/USDC) can't be received
            or held until the wallet opens a trustline. A quick one-time tap that
            reserves a little XLM; after it, bank-transfer auto-forwards and
            external sends land. When the wallet is short on XLM for the reserve,
            we surface a top-up hint instead of a doomed Enable tap. */}
        {showActivation && (
          <div
            data-testid="deposit-sheet-trustline"
            className="rounded-2xl border border-emerald-200 bg-emerald-500/[0.06] px-4 py-3.5"
          >
            <p className="text-[13px] leading-relaxed text-foreground/75">
              Your account needs a quick one-time setup to receive and hold{" "}
              <span className="font-semibold">{tokenSymbol}</span>. It takes just a
              few seconds and reserves a small amount of XLM.
            </p>
            <button
              type="button"
              onClick={() => void trustline.ensure()}
              disabled={trustline.isWorking}
              data-testid="deposit-sheet-enable-asset"
              className="mt-3 w-full h-10 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {trustline.isWorking
                ? "Setting up…"
                : trustline.needsTopUp
                  ? "Retry"
                  : `Enable ${tokenSymbol}`}
            </button>
            {trustline.needsTopUp && <StellarTopUpHint className="mt-3" />}
            {trustline.status === "error" && trustline.error && (
              <p className="mt-2 text-[11px] text-rose-600">{friendlyTxError(trustline.error)}</p>
            )}
          </div>
        )}

        <div>
          <label
            htmlFor="deposit-sheet-amount"
            className="block text-xs font-medium text-muted-foreground mb-1.5"
          >
            How much {tokenSymbol} do you want to deposit?
          </label>
          <div className="relative flex items-center">
            <input
              id="deposit-sheet-amount"
              data-testid="deposit-sheet-amount"
              autoFocus
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={raw}
              onChange={(e) => setRaw(sanitizeAmount(e.target.value))}
              className={cn(
                "w-full pl-4 pr-20 py-4 rounded-2xl border border-foreground/[0.08] bg-background",
                "text-2xl font-black text-foreground tabular-nums",
                "placeholder:text-muted-foreground/60 placeholder:font-normal",
                "focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-300",
                "transition-all"
              )}
            />
            <span className="absolute right-4 text-xs font-semibold text-muted-foreground/80 pointer-events-none uppercase tracking-wider">
              {tokenSymbol}
            </span>
          </div>
          {usdValueAtAmount !== null && amount > 0 && (
            <p className="text-[11px] text-muted-foreground/80 mt-1.5 px-1">
              ≈ ${formatUsd(usdValueAtAmount)}
            </p>
          )}
        </div>

        <div className="rounded-xl bg-muted/40 px-4 py-3 flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Available in your wallet</span>
            <span
              data-testid="deposit-sheet-available"
              className={cn(
                "font-semibold tabular-nums",
                // Amber means "you can't do this". With a top-up on offer the
                // user still can, so a short Stellar balance is not a warning.
                amount === 0 || amount <= availableTotal ? "text-foreground" : "text-amber-600"
              )}
            >
              {isBalanceLoading
                ? "…"
                : `${availableTotal.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${tokenSymbol}`}
            </span>
          </div>
          {/* Where that figure comes from, but only when it is not all in one
              place. Naming the source is not decoration: the total includes
              money that has to be moved first, and hiding that would make the
              extra step in the button come out of nowhere. */}
          {topUp.available && topUp.total > 0.01 && (
            <p
              data-testid="deposit-sheet-available-breakdown"
              className="text-[11px] leading-relaxed text-muted-foreground/80 -mt-1"
            >
              ${formatUsd(walletBalance)} on Stellar
              {topUp.best ? `, $${formatUsd(topUp.best.balance)} on ${topUp.best.chainName}` : ""}
              {topUp.balances.length > 2
                ? ` and ${topUp.balances.length - 1} other networks`
                : topUp.balances.length === 2
                  ? ` and $${formatUsd(topUp.total - (topUp.best?.balance ?? 0))} elsewhere`
                  : ""}
            </p>
          )}
          <AnimatePresence mode="wait">
            {amount > 0 && (
              <motion.div
                key="projection"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-baseline justify-between text-sm"
              >
                <span className="text-muted-foreground">Yearly earnings</span>
                <span className="font-semibold tabular-nums text-emerald-600">
                  +{yearly.toFixed(4)} {tokenSymbol}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Only what the button cannot say: the burn is on its way, the source
            is under the floor, or it failed. Renders nothing otherwise — the
            action itself is the primary button now. */}
        <CrossChainTopUpNotice topUp={topUp} />

        <button
          type="button"
          onClick={handleConfirm}
          disabled={ctaDisabled}
          data-testid="deposit-sheet-confirm"
          className={cn(
            "relative flex h-14 w-full items-center justify-center rounded-2xl text-base font-bold transition-all",
            ctaDisabled
              ? "bg-muted text-muted-foreground/80 cursor-not-allowed"
              : !stellarWallet.isConnected
              ? "bg-emerald-600 text-white hover:bg-emerald-500 active:scale-[0.99]"
              : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.99]"
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={ctaLabel}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {ctaLabel}
            </motion.span>
          </AnimatePresence>
          {supplyTx.isLoading && <ButtonProgress progress={busyPhase.progress} />}
        </button>

        {stellarWallet.error && !stellarWallet.isConnected && (
          <p className="text-xs text-rose-600 px-1 text-center">{friendlyTxError(stellarWallet.error)}</p>
        )}

        <p className="text-[11px] text-muted-foreground/80 text-center">
          You can withdraw any time. Your money keeps earning until you do.
        </p>
      </div>
    </SheetShell>
  )
}

// Stablecoin-market deposit funded by SEPA bank transfer (Bridge on-ramp).
// Handles both EURC (zero-FX) and USDC (EUR→USD spread, up to 1% per Bridge).
// The user picks the asset upstream; this sheet just shows the matching IBAN
// and balance, then auto-forwards arrivals to the user's own Stellar wallet.
//
// Single-overlay design: the bank-transfer flow is a second *step* inside this
// same SheetShell — never a nested dialog. A nested Radix dialog rendered below
// the SheetShell backdrop (z-50 vs z-80), so any click hit the backdrop and
// closed the whole sheet. One overlay = one backdrop, one focus trap.
function BankDepositSheet({
  asset,
  apy,
  currency,
  onClose,
  onConnectWallet,
  connecting,
  secondaryAction,
  secondaryLabel,
}: {
  asset: ReturnType<typeof findAsset>
  apy: number
  /** Stablecoin the user is receiving — drives balance + copy. */
  currency: OnrampDestinationCurrency
  onClose: () => void
  /**
   * Trigger the Stellar wallet picker (Freighter, xBull, Albedo, Ledger,
   * WalletConnect…). Used by the custody-stranded amber banner to let the
   * user attach a wallet so funds can be forwarded out of custody.
   */
  onConnectWallet: () => void
  /** True while a wallet picker / connection handshake is in flight. */
  connecting: boolean
  /**
   * Optional bottom-of-sheet secondary action. The "no wallet" entrypoint
   * uses it to offer "Already have a Stellar wallet? Connect it"; the
   * connected-but-short fallback uses it to offer "Back to deposit". Omit
   * to hide entirely.
   */
  secondaryAction?: () => void
  secondaryLabel?: string
}) {
  const [view, setView] = useState<"intro" | "flow">("intro")
  const tokenSymbol = asset?.symbol ?? (currency === "usdc" ? "USDC" : "EURC")
  const isUsdc = currency === "usdc"
  const fiatCode = isUsdc ? "USD" : "EUR"
  const balanceLabel = isUsdc ? "Your dollar balance" : "Your euro balance"
  const sheetSubtitle = isUsdc
    ? "Add dollars from your bank"
    : "Add euros from your bank"
  const bankRowCopy = isUsdc
    ? "Transfer euros from your bank and they convert to dollars (up to 1% FX). Usually arrives within one business day."
    : "Transfer euros straight from your bank account, no crypto wallet needed. It usually arrives within one business day."
  const balance = useBridgeBalance()
  const payout = useBridgePayout()
  const payoutAddress = useBridgePayoutAddress()
  const assetBalance = isUsdc ? balance.usdc : balance.eurc
  // Combined display number — the user thinks in "what I've put in",
  // not "settled-on-chain vs in-flight at the payments partner".
  const totalFiat = assetBalance.available + assetBalance.pending
  const hasBalance = totalFiat > 0
  // Withdraw is offered only against the actually-settled balance — pending
  // SEPA can't be moved on-chain yet, and surfacing it would invite a click
  // that returns "no_balance".
  const hasPayoutAddress = Boolean(payoutAddress.address)
  const isCustodyStranded = assetBalance.available > 0 && !hasPayoutAddress
  const canWithdraw =
    assetBalance.available > 0 && hasPayoutAddress && !payout.isPending
  const formatFiat = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: fiatCode })

  return (
    <SheetShell
      open
      onClose={onClose}
      title="Deposit"
      subtitle={view === "flow" ? "Add money by bank transfer" : sheetSubtitle}
      testId="deposit-sheet"
    >
      <div className="flex flex-col gap-5 pt-2">
        {/* Asset header — shown in both steps for continuity */}
        <div className="flex items-center gap-3">
          {asset?.icon ? (
            <div className="relative w-10 h-10 shrink-0">
              <Image
                src={asset.icon}
                alt={asset.symbol}
                fill
                sizes="40px"
                className="rounded-full object-cover"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).src = "/tokenimages/app/placeholder.svg"
                }}
              />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold shrink-0">
              {tokenSymbol[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {asset?.name ?? (isUsdc ? "US Dollar" : "Euro")}
            </p>
            <p className="text-xs text-emerald-600 font-medium">
              {apy > 0
                ? `Earn ${apy.toFixed(1)}% per year`
                : "Earning soon · first yield realizing"}
            </p>
          </div>
          <TrendingUp size={18} className="text-emerald-500 shrink-0" />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {view === "intro" ? (
            <motion.div
              key="intro"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col gap-5"
            >
              {/* Current fiat balance — shown only once Bridge actually holds
                  funds for the user. We hide it for first-time users so the
                  intro doesn't loudly announce "€0.00" / "$0.00". */}
              {hasBalance && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-500/10 px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs font-medium text-emerald-700/80 uppercase tracking-wide">
                      {balanceLabel}
                    </span>
                    <span
                      data-testid="deposit-sheet-fiat-balance"
                      className="text-xl font-black text-emerald-700 tabular-nums"
                    >
                      {formatFiat(assetBalance.available)}
                    </span>
                  </div>
                  {assetBalance.pending > 0 && (
                    <p className="mt-1 text-[11px] text-emerald-700/70 text-right">
                      +{formatFiat(assetBalance.pending)} on the way
                    </p>
                  )}
                  {assetBalance.available > 0 && hasPayoutAddress && (
                    <button
                      type="button"
                      onClick={() => payout.withdraw({ currency })}
                      disabled={!canWithdraw}
                      data-testid="deposit-sheet-withdraw"
                      className="mt-3 w-full h-10 rounded-xl text-xs font-semibold text-emerald-700 bg-background border border-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {payout.isPending
                        ? "Sending…"
                        : "Withdraw to my Stellar wallet"}
                    </button>
                  )}
                </div>
              )}

              {/* Custody-stranded warning: user has funds sitting in the Bridge
                  custodial wallet but no Stellar destination to send them to.
                  Shown instead of (not alongside) the withdraw button so the
                  copy reads as one coherent next-step. */}
              {isCustodyStranded && (
                <div
                  data-testid="deposit-sheet-custody-warning"
                  className="rounded-2xl border border-amber-200 bg-amber-500/10 px-4 py-3.5"
                >
                  <p className="text-xs font-medium text-amber-800 leading-relaxed">
                    Your {formatFiat(assetBalance.available)} is waiting.
                    Connect your Stellar wallet to send it to your own account.
                  </p>
                  <button
                    type="button"
                    onClick={onConnectWallet}
                    disabled={connecting}
                    data-testid="deposit-sheet-custody-connect"
                    className="mt-3 w-full h-10 rounded-xl text-xs font-semibold text-amber-900 bg-background border border-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                  >
                    {connecting ? "Connecting…" : "Connect Stellar wallet to receive"}
                  </button>
                </div>
              )}

              <div className="rounded-2xl border border-foreground/[0.08] bg-muted/40 px-4 py-3.5 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <Banknote size={18} className="text-emerald-600" />
                </div>
                <p className="text-[13px] leading-relaxed text-foreground/70">{bankRowCopy}</p>
              </div>

              <button
                type="button"
                onClick={() => setView("flow")}
                data-testid="deposit-sheet-bank-transfer"
                className="h-14 w-full rounded-2xl text-base font-bold bg-emerald-600 text-white hover:bg-emerald-500 active:scale-[0.99] transition-all"
              >
                Add money by bank transfer
              </button>

              {secondaryAction && (
                <button
                  type="button"
                  onClick={secondaryAction}
                  disabled={connecting}
                  data-testid="deposit-sheet-secondary"
                  className="text-xs text-muted-foreground/80 hover:text-foreground/70 transition-colors disabled:opacity-50"
                >
                  {secondaryLabel}
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="flow"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col gap-4"
            >
              <button
                type="button"
                onClick={() => setView("intro")}
                data-testid="deposit-sheet-bank-back"
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground/80 hover:text-foreground/80 transition-colors -mb-1"
              >
                <ChevronLeft size={14} />
                Back
              </button>
              <AddMoneyBody embedded destinationCurrency={currency} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SheetShell>
  )
}

// ─── US-Dollar entry step ───────────────────────────────────────────────────
// Demo (not-signed-in) users land here when they tap Deposit on US Dollar. It
// used to be a chooser between the Stellar and the BSC pool; dollars now always
// go to Stellar, so what is left is the sign-in step with the rate the user is
// signing in for. The BSC pool stays reachable from the advanced market list,
// where the chain is named — it is just no longer somewhere you end up by
// default. Signed-in users get a concrete asset id from AssetTable.

const USD_POOLS = [
  {
    key: "stellar",
    label: "Stellar",
    assetId: "usdc-stellar",
    blurb: "Add money straight from your bank.",
    tipTitle: "Dollars on Stellar",
    tip: "Your dollars earn on the Stellar network. Top up by bank transfer (SEPA) — no crypto needed — and withdraw any time.",
  },
] as const

function UsdPoolChooserSheet({ onClose }: { onClose: () => void }) {
  const { bestApyPerAsset } = useApyData()
  const { authenticated } = usePrivy()
  const stellarWallet = useStellarWallet()
  const { openDeposit } = useStellarSheets()
  const [picked, setPicked] = useState<string | null>(null)
  const [chooserOpen, setChooserOpen] = useState(false)
  // A Stellar wallet is a full sign-in here — the pools on offer are Stellar
  // ones. Gating purely on `authenticated` sent a connected Freighter user
  // into Privy, i.e. asked him for a second, EVM wallet he does not need.
  const signedIn = authenticated || stellarWallet.isConnected

  const apyFor = (assetId: string) => bestApyPerAsset[assetId] ?? 0

  // The chooser stays mounted across the login overlay (it's an overlay, not a
  // navigation), so the picked id survives in state — no persistence needed.
  // Once sign-in completes we swap this sheet for the chosen pool's deposit
  // sheet; the explicit pick wins over the signed-in routing heuristic.
  useEffect(() => {
    if (signedIn && picked) openDeposit({ assetId: picked })
  }, [signedIn, picked, openDeposit])

  function choose(assetId: string) {
    setPicked(assetId)
    if (signedIn) openDeposit({ assetId })
    else setChooserOpen(true)
  }

  return (
    <SheetShell
      open
      onClose={onClose}
      title="Deposit"
      subtitle="Where your dollars earn"
      testId="deposit-sheet"
    >
      <div className="flex flex-col gap-3 pt-2">
        {USD_POOLS.map((p) => {
          const apy = apyFor(p.assetId)
          return (
            <div
              key={p.key}
              className="flex items-center gap-2 rounded-2xl border border-foreground/[0.08] bg-background hover:border-emerald-300 hover:bg-emerald-500/[0.04] transition-all"
            >
              <button
                type="button"
                onClick={() => choose(p.assetId)}
                data-testid={`usd-pool-${p.key}`}
                className="flex-1 min-w-0 flex items-center gap-3 text-left px-4 py-4 active:scale-[0.99] transition-transform"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold shrink-0">
                  $
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground">{p.label}</p>
                  <p className="text-xs text-muted-foreground/80">{p.blurb}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-emerald-600 tabular-nums">
                    {apy > 0 ? `${apy.toFixed(1)}%` : "Earning soon"}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
                    per year
                  </p>
                </div>
              </button>
              <InfoTooltip
                title={p.tipTitle}
                content={p.tip}
                side="left"
                className="mr-3 text-muted-foreground/50 shrink-0"
              >
                <Info size={16} />
              </InfoTooltip>
            </div>
          )
        })}
        <p className="text-[11px] text-muted-foreground/80 text-center pt-1">
          You&apos;ll sign in to continue. You can withdraw any time.
        </p>
      </div>
      <ConnectChooser open={chooserOpen} onOpenChange={setChooserOpen} />
    </SheetShell>
  )
}

// ─── Outer ────────────────────────────────────────────────────────────────────
// Mounts only when the deposit slot is set, so we avoid running heavy hooks
// for every page view. Stellar assets route to the Freighter-aware variant.

export function DepositSheet() {
  const { deposit, closeDeposit } = useStellarSheets()
  if (!deposit) return null
  // Virtual "usd" id → demo pool chooser (Stellar vs BSC) before sign-in.
  if (deposit.assetId === "usd") {
    return <UsdPoolChooserSheet onClose={closeDeposit} />
  }
  const isStellarAsset = !!getStellarVaultConfig(deposit.assetId)
  if (isStellarAsset) {
    return (
      <StellarDepositSheetInner
        key={deposit.assetId}
        assetId={deposit.assetId}
        defaultAmount={deposit.defaultAmount}
        onClose={closeDeposit}
      />
    )
  }
  return (
    <DepositSheetInner
      key={deposit.assetId}
      assetId={deposit.assetId}
      defaultAmount={deposit.defaultAmount}
      onClose={closeDeposit}
    />
  )
}
