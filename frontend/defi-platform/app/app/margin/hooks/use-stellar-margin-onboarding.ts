'use client'

/**
 * use-stellar-margin-onboarding
 *
 * Makes a Stellar wallet trade-ready on testnet — both freshly-provisioned Privy
 * embedded wallets and external wallets (Freighter / kit) — so a user never lands
 * on an empty page with disabled buttons (responsive-UX rule: never a dead state).
 * Two self-funded steps, no server secret:
 *   1. Friendbot activates + funds the account with XLM (for fees/reserve), via
 *      the server proxy (friendbot sends no CORS). Privy wallets authenticate
 *      with a Bearer; external wallets use the public-faucet path (no token).
 *   2. The wallet mints mock-USDT to itself (open testnet faucet), signed by the
 *      same signer the trades use (Privy embedded or Freighter, via signStellarXdr).
 *   3. The minted USDT is moved straight into the margin (trading) account —
 *      deposit → transfer_spot_to_margin — so the user lands ready to trade and
 *      never hits the separate "add collateral" step (the wallet→margin transfer
 *      is pure plumbing the consumer should never have to do by hand).
 *
 * `needsSetup` is true when connected on the real chain with no tradeable USDT
 * *anywhere* — wallet **or** margin (step 3 drains the wallet into margin, so a
 * wallet-only check would falsely re-trigger after a successful setup). Covers
 * "account not activated", "activated but empty", and "already funded into
 * margin".
 *
 * …AND when the account still has its grant. The zero-balance test alone is a
 * refill loop: trade the 250 to nothing and the next page load offers another
 * 250, which ranks the challenge leaderboard by who restarted most. The grant is
 * spent once per Peridot account, tracked server-side
 * (/api/margin/faucet-claim → lib/margin/faucet-claim.ts) and RESERVED BEFORE
 * the mint, so a client that skips straight to `mintMockUsdt` still only ever
 * gets counted once. A spent account simply doesn't see the faucet; it funds
 * itself through the ordinary "add collateral" path like any other trader.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { toast } from 'sonner'
import {
  isAccountActivated,
  mintMockUsdt,
  vaultDeposit,
  vaultGetPtokenBalance,
  transferSpotToMargin,
  waitForLedgerBeyond,
} from '@/lib/stellar-margin'
import { STELLAR_MARGIN_CONFIG as CFG } from '../config/stellarMarginConfig'
import { readableMarginError } from '../lib/stellarMarginErrors'

export type OnboardingStep = 'idle' | 'activating' | 'minting' | 'funding' | 'done' | 'error'

/** Testnet faucet grant, raw units. One per account, for the account's lifetime —
 *  the server hands out the same number (lib/margin/faucet-claim.ts). */
const FAUCET_USDT_UNITS = BigInt(
  Math.round(CFG.constants.FAUCET_GRANT_USDT * 10 ** CFG.assets.MOCK_USDT.decimals),
)

/** Shown when the account has already had its one stack. */
const GRANT_SPENT_MESSAGE =
  `You've already received your one-time ${CFG.constants.FAUCET_GRANT_USDT} USDT of test money. ` +
  'Add collateral from your wallet to keep trading.'

const STEP_MESSAGE: Record<OnboardingStep, string> = {
  idle: '',
  activating: 'Activating your test account…',
  minting: 'Adding test funds…',
  funding: 'Moving funds to your trading account…',
  done: 'Your trading account is ready.',
  error: 'Setup failed',
}

export interface UseStellarMarginOnboardingArgs {
  address: string | undefined
  /** Real chain, connected. */
  enabled: boolean
  /** Where the active wallet comes from. Only Privy embedded wallets carry a
   *  verifiable Bearer token + linked-account ownership; external wallets
   *  (Freighter / kit) fund through the public-faucet path with no token. */
  source?: "privy" | "kit"
  /** Current wallet USDT balance (underlying). */
  usdtWalletBalance: number
  /** Current margin-account USDT balance (underlying). Setup moves the faucet
   *  grant from wallet → margin, so "needs setup" must look at both: wallet +
   *  margin <= 0. A wallet-only check would re-trigger after a successful run. */
  usdtMarginBalance: number
  /**
   * Whether the user already has capital deployed (open positions or an open
   * in flight). A funded trader who puts ALL their margin into a trade lands on
   * wallet 0 + margin 0 — which the balance check alone reads as "brand new, needs
   * setup", firing the big auto-opening funding modal on top of a page where they
   * just successfully opened. Having a position is proof of the opposite.
   */
  hasDeployedCapital?: boolean
  /**
   * Whether the balances above have actually been read from chain yet. They are 0
   * until the first read lands, which is indistinguishable from an empty account —
   * so without this the funding modal auto-opened on top of every page load for
   * funded users, then vanished a beat later. Defaults to true so callers that
   * genuinely have no loading phase keep working.
   */
  balancesReady?: boolean
  onFunded?: () => void
}

export interface UseStellarMarginOnboardingResult {
  needsSetup: boolean
  /** The account already spent its one-time grant. Not an error — it's the normal
   *  state of every trader past their first session; the page uses it to explain
   *  an empty account instead of silently dropping the faucet. */
  grantSpent: boolean
  runSetup: () => Promise<boolean>
  step: OnboardingStep
  statusMessage: string
  isBusy: boolean
  /** Why the last run failed, in the user's words. Null once a new run starts.
   *  The funding modal is the only thing on screen while setup runs, so it has to
   *  be able to say this itself — a toast alone left a dead button behind. */
  error: string | null
}

export function useStellarMarginOnboarding({
  address,
  enabled,
  source,
  usdtWalletBalance,
  usdtMarginBalance,
  hasDeployedCapital = false,
  balancesReady = true,
  onFunded,
}: UseStellarMarginOnboardingArgs): UseStellarMarginOnboardingResult {
  const { getAccessToken } = usePrivy()
  const [step, setStep] = useState<OnboardingStep>('idle')
  const [error, setError] = useState<string | null>(null)
  /** null = not asked yet. Nothing offers the faucet until the server answers:
   *  showing it optimistically would auto-open the funding modal on a capped
   *  account and then yank it away a beat later. */
  const [claimAvailable, setClaimAvailable] = useState<boolean | null>(null)

  /** Authorization for the claim endpoints. Privy wallets prove ownership with a
   *  bearer; kit/Freighter wallets carry the stellar-session cookie the browser
   *  attaches on its own (same-origin), so they send no header. */
  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (source !== 'privy') return {}
    try {
      const token = await getAccessToken()
      return token ? { Authorization: `Bearer ${token}` } : {}
    } catch {
      return {}
    }
  }, [source, getAccessToken])

  const isEmpty =
    enabled &&
    Boolean(address) &&
    balancesReady &&
    usdtWalletBalance + usdtMarginBalance <= 0 &&
    !hasDeployedCapital

  // Ask once per empty episode whether this account's grant is still there.
  //
  // Re-armed whenever the account stops being empty, so a trader who funds up,
  // loses it all and lands back on zero is asked again rather than being offered
  // a faucet on a stale "yes" (which the POST would then 409). A failed read
  // answers "no": hiding a faucet the user may still be owed is a smaller wrong
  // than offering one that can't be delivered.
  const askedForRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isEmpty || !address) { askedForRef.current = null; return }
    if (askedForRef.current === address) return
    askedForRef.current = address
    let cancelled = false
    setClaimAvailable(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/margin/faucet-claim?address=${address}`, {
          headers: await authHeaders(),
        })
        const data = await res.json().catch(() => ({} as { available?: boolean }))
        if (!cancelled) setClaimAvailable(res.ok ? Boolean(data.available) : false)
      } catch {
        if (!cancelled) setClaimAvailable(false)
      }
    })()
    return () => { cancelled = true }
  }, [isEmpty, address, authHeaders])

  const needsSetup = isEmpty && claimAvailable === true && step !== 'done'

  const runSetup = useCallback(async (): Promise<boolean> => {
    if (!address) { toast.error('Connect your wallet first.'); return false }
    setError(null)
    try {
      // 0. Reserve the account's one grant BEFORE anything is minted. Server-side
      //    and ownership-checked, so this is the actual cap — the balance test
      //    below it only decides whether we bother asking.
      const claim = await fetch('/api/margin/faucet-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ address }),
      })
      if (!claim.ok) {
        if (claim.status === 409) {
          setClaimAvailable(false)
          setStep('idle')
          setError(GRANT_SPENT_MESSAGE)
          toast.error(GRANT_SPENT_MESSAGE)
          return false
        }
        throw new Error('Could not reach the test-money faucet. Please try again in a moment.')
      }

      // 1. Activate + fund XLM if the account isn't on-ledger yet. Friendbot has
      //    no CORS headers, so the funding goes through our server-side proxy
      //    (/api/stellar/testnet-faucet) — a direct browser fetch is blocked.
      const activated = await isAccountActivated(address)
      if (!activated) {
        setStep('activating')
        // Only Privy embedded wallets carry a Bearer the server can verify + own.
        // External wallets (Freighter) fund through the public-faucet path; sending
        // a stale Privy token for a non-owned address would 403.
        const token = source === 'privy' ? await getAccessToken() : null
        const res = await fetch('/api/stellar/testnet-faucet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ address }),
        })
        const data = await res.json().catch(() => ({} as { funded?: boolean }))
        if (!res.ok || !data.funded) {
          throw new Error('Could not reach the testnet faucet. Please try again in a moment.')
        }
        // Friendbot is near-instant but the entry can lag a beat — poll briefly.
        for (let i = 0; i < 10; i++) {
          if (await isAccountActivated(address)) break
          await new Promise((r) => setTimeout(r, 1500))
        }
      }

      // 2. Mint test USDT to self (signed by the embedded Privy wallet).
      setStep('minting')
      const mint = await mintMockUsdt(address, FAUCET_USDT_UNITS)

      // 3. Move the freshly-minted USDT straight into the margin (trading)
      //    account so the user lands ready to trade — no separate "add
      //    collateral" step. Mirrors use-stellar-margin-collateral.moveToMargin:
      //    deposit mints pTokens to the wallet, then transfer_spot_to_margin
      //    moves the exact minted delta into custody (delta read before/after —
      //    the exchange rate can move, so never derive it from the input, §8).
      setStep('funding')
      const usdt = CFG.assets.MOCK_USDT
      // Each of these three steps reads or spends what the previous one produced, and
      // the RPC's simulation snapshot lags `getTransaction` SUCCESS by up to a ledger.
      // Without the waits the deposit is simulated against a pre-mint balance and the
      // transfer against pre-deposit pTokens — the footprint then traps on apply
      // ("Move to margin reverted on ledger", seen live on the first funding run).
      await waitForLedgerBeyond(mint.ledger)
      const before = await vaultGetPtokenBalance(usdt.vault, address)
      const dep = await vaultDeposit(address, usdt.vault, FAUCET_USDT_UNITS)
      await waitForLedgerBeyond(dep.ledger)
      const after = await vaultGetPtokenBalance(usdt.vault, address)
      const minted = after - before
      if (minted <= BigInt(0)) throw new Error('Deposit minted no pTokens')
      // Sweep the full spot balance (not just `minted`) so a re-run after a failed
      // transfer never strands the orphaned pTokens — same self-healing rule as
      // use-stellar-margin-collateral.moveToMargin.
      await transferSpotToMargin(address, usdt.token, after)

      setStep('done')
      toast.success('Trading account funded — you’re ready to trade.')
      onFunded?.()
      return true
    } catch (e) {
      setStep('error')
      const msg = readableMarginError(e)
      setError(msg)
      toast.error(msg)
      return false
    }
  }, [address, source, onFunded, getAccessToken, authHeaders])

  return {
    needsSetup,
    grantSpent: isEmpty && claimAvailable === false,
    runSetup,
    step,
    statusMessage: STEP_MESSAGE[step],
    isBusy: step === 'activating' || step === 'minting' || step === 'funding',
    error,
  }
}
