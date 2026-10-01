'use client'

/**
 * use-stellar-margin-collateral
 *
 * Prepares / releases margin collateral (spec §8, §12).
 *
 *   moveToMargin(assetKey, amount):
 *     1. vault.deposit(user, amount)            → mints pTokens to the wallet
 *     2. read pToken balance delta              → exact minted amount
 *     3. transfer_spot_to_margin(user, token, delta)
 *
 *   moveToSpot(assetKey, ptokensRaw):
 *     1. transfer_margin_to_spot(user, token, ptokensRaw)
 *     2. vault.withdraw(user, ptokensRaw)       → underlying back to wallet
 *
 * Soroban vault deposits authorize the transfer inside the signed tx (no ERC20
 * approve step). The exact minted pToken amount comes from a before/after read,
 * never derived from the input amount (exchange rate can move — spec §8).
 */
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { usePrivy } from '@privy-io/react-auth'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'
import {
  STELLAR_MARGIN_CONFIG as CFG,
  type StellarMarginAssetKey,
} from '../config/stellarMarginConfig'
import { recordMarginTrade } from './use-stellar-margin-journal'
import {
  vaultDeposit,
  vaultWithdraw,
  vaultGetPtokenBalance,
  transferSpotToMargin,
  transferMarginToSpot,
  parseAmountToUnits,
  waitForLedgerBeyond,
} from '@/lib/stellar-margin'
import { readableMarginError } from '../lib/stellarMarginErrors'

export type CollateralStep = 'idle' | 'depositing' | 'moving' | 'withdrawing' | 'success' | 'error'

function emit(step: string, statusMessage: string, hash?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('peridot:tx-update', {
    detail: { action: 'margin-collateral', step, statusMessage, txHash: hash },
  }))
}

export interface UseStellarMarginCollateralResult {
  moveToMargin: (assetKey: StellarMarginAssetKey, underlyingAmount: string) => Promise<boolean>
  moveToSpot: (assetKey: StellarMarginAssetKey, ptokensRaw: bigint) => Promise<boolean>
  step: CollateralStep
  error: string | null
  statusMessage: string
  isLoading: boolean
  reset: () => void
}

export function useStellarMarginCollateral(onSuccess?: () => void): UseStellarMarginCollateralResult {
  const { address } = useStellarWallet()
  const { getAccessToken } = usePrivy()
  const [step, setStep] = useState<CollateralStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')

  const fail = useCallback((e: unknown) => {
    const msg = readableMarginError(e)
    setError(msg); setStep('error'); setStatusMessage(msg)
    emit('error', msg); toast.error(msg)
    return false
  }, [])

  const moveToMargin = useCallback(async (assetKey: StellarMarginAssetKey, underlyingAmount: string): Promise<boolean> => {
    const cfg = CFG.assets[assetKey]
    const amountUnits = parseAmountToUnits(underlyingAmount, cfg.decimals)
    if (amountUnits === '0') { toast.error('Enter an amount first.'); return false }

    if (!address) { toast.error('Connect your wallet first.'); return false }

    setError(null)
    try {
      // 1. Deposit underlying → vault mints pTokens to the wallet.
      setStep('depositing'); setStatusMessage(`Depositing ${cfg.label}…`)
      emit('depositing', `Depositing ${cfg.label}…`)
      const before = await vaultGetPtokenBalance(cfg.vault, address)
      const dep = await vaultDeposit(address, cfg.vault, amountUnits)
      // `getTransaction` says SUCCESS as soon as the deposit is in a ledger, but the
      // RPC's SIMULATION snapshot can still be a ledger behind. Both of the next two
      // calls read through that snapshot: the balance read would return the pre-deposit
      // figure (→ a bogus "Deposit minted no pTokens"), and the transfer would be
      // simulated against a world where the pTokens don't exist yet — producing a
      // footprint that traps on apply ("Move to margin reverted on ledger"). Same
      // cause as the open-path activate trap; wait for the snapshot to catch up.
      await waitForLedgerBeyond(dep.ledger)
      const after = await vaultGetPtokenBalance(cfg.vault, address)
      const minted = after - before
      if (minted <= BigInt(0)) throw new Error('Deposit minted no pTokens')

      // 2. Move the spot pTokens into margin custody. Sweep the FULL spot balance
      //    (`after`), not just this deposit's `minted` delta: if a previous attempt
      //    deposited but its transfer_spot_to_margin tail failed, those orphaned
      //    pTokens are sitting here too (invisible in wallet/margin totals). Moving
      //    the whole balance makes a retry self-healing — it can never strand funds
      //    in the spot bucket, and never double-deposits to recover them.
      setStep('moving'); setStatusMessage('Moving to margin…')
      emit('moving', 'Moving to margin…')
      const res = await transferSpotToMargin(address, cfg.token, after)

      setStep('success'); setStatusMessage('Collateral ready.')
      emit('success', 'Collateral ready.', res.hash)
      toast.success(`Moved ${cfg.label} to margin`)
      void recordMarginTrade(getAccessToken, address, {
        positionId: 'collateral',
        eventType: 'collateral_in',
        collateralSymbol: cfg.label,
        collateralAmount: parseFloat(underlyingAmount) || 0,
        txHash: res.hash,
      })
      onSuccess?.()
      return true
    } catch (e) {
      return fail(e)
    }
  }, [address, fail, onSuccess, getAccessToken])

  const moveToSpot = useCallback(async (assetKey: StellarMarginAssetKey, ptokensRaw: bigint): Promise<boolean> => {
    if (ptokensRaw <= BigInt(0)) { toast.error('Nothing to withdraw.'); return false }
    const cfg = CFG.assets[assetKey]

    if (!address) { toast.error('Connect your wallet first.'); return false }

    setError(null)
    try {
      // 1. Release pTokens from margin custody back to the spot vault balance.
      setStep('moving'); setStatusMessage('Releasing from margin…')
      emit('moving', 'Releasing from margin…')
      const rel = await transferMarginToSpot(address, cfg.token, ptokensRaw)
      // Let the RPC's simulation snapshot catch up before building the withdraw —
      // otherwise it is simulated against a ledger where the pTokens are still in
      // margin custody, and the resulting footprint traps on apply.
      await waitForLedgerBeyond(rel.ledger)

      // 2. Redeem pTokens for underlying back to the wallet.
      setStep('withdrawing'); setStatusMessage(`Withdrawing ${cfg.label}…`)
      emit('withdrawing', `Withdrawing ${cfg.label}…`)
      const res = await vaultWithdraw(address, cfg.vault, ptokensRaw)

      setStep('success'); setStatusMessage('Withdrawn to wallet.')
      emit('success', 'Withdrawn to wallet.', res.hash)
      toast.success(`Withdrew ${cfg.label} to wallet`)
      void recordMarginTrade(getAccessToken, address, {
        positionId: 'collateral',
        eventType: 'collateral_out',
        collateralSymbol: cfg.label,
        collateralAmount: Number(ptokensRaw) / 10 ** cfg.decimals,
        txHash: res.hash,
      })
      onSuccess?.()
      return true
    } catch (e) {
      return fail(e)
    }
  }, [address, fail, onSuccess, getAccessToken])

  const reset = useCallback(() => {
    setStep('idle'); setError(null); setStatusMessage('')
  }, [])

  return {
    moveToMargin, moveToSpot,
    step, error, statusMessage,
    isLoading: step === 'depositing' || step === 'moving' || step === 'withdrawing',
    reset,
  }
}
