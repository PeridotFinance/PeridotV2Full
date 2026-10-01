'use client'

/**
 * Inline editor for an OPEN position's Take-Profit / Stop-Loss.
 *
 * A popover wrapping the same `StellarTpSlControls` used at open time, prefilled
 * with the position's current triggers. Validation anchors on the live price (not
 * the original entry) so you can't set a target that would fire instantly. Save
 * resolves the controls to trigger prices and hands them up; Clear removes both.
 */
import { useEffect, useState } from 'react'
import { Pencil, Check, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { StellarTpSlControls, type TpSlState } from './StellarTpSlControls'
import { validateTpSlDraft } from '../../lib/marginMath'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { useStellarMarginKeeper } from '../../hooks/use-stellar-margin-keeper'
import { useStellarKeeperArms } from '../../hooks/use-stellar-keeper-arms'
import type { StellarMarginPosition } from '../../types/stellarMargin'

interface Props {
  position: StellarMarginPosition
  current: { takeProfit: number | null; stopLoss: number | null }
  /** Live XLM/USD price — the validation + preview anchor. */
  referencePrice: number
  /**
   * Whether `referencePrice` is the real market feed. When false it's the oracle
   * fallback (flat $1 on testnet), which would mis-validate every realistic
   * trigger — so saving is blocked until the feed ticks.
   */
  markIsLive?: boolean
  liqPrice: number | null
  onSave: (positionId: string, next: { takeProfit: number | null; stopLoss: number | null }) => void | Promise<void>
  /** Compact icon-only trigger (Positions table) vs. a labelled button. */
  variant?: 'icon' | 'button'
  /** Offer the always-on keeper toggle (real on-chain positions only). */
  allowAlwaysOn?: boolean
  /** Leverage chosen at open. `position.leverage` is the live ratio, so the header
   *  otherwise labels a 2× trade "Long 1.2×" — contradicting the row it opened from. */
  entryLeverage?: number
  /** Price the position was actually opened at (journal `entry_price_usd`). Without
   *  it the payoff preview measures profit from today's price and calls it entry. */
  entryPrice?: number
}

function stateFromCurrent(c: { takeProfit: number | null; stopLoss: number | null }): TpSlState {
  return {
    tpEnabled: c.takeProfit != null,
    slEnabled: c.stopLoss != null,
    tpPrice: c.takeProfit != null ? String(c.takeProfit) : '',
    slPrice: c.stopLoss != null ? String(c.stopLoss) : '',
  }
}

export function StellarTpSlEditPopover({ position, current, referencePrice, markIsLive = true, liqPrice, onSave, variant = 'icon', allowAlwaysOn, entryLeverage, entryPrice }: Props) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<TpSlState>(() => stateFromCurrent(current))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const hasAny = current.takeProfit != null || current.stopLoss != null

  // Always-on keeper: closes this position even with the tab shut. Only offered
  // for real on-chain positions when the server keeper is configured.
  const keeperOffered = Boolean(allowAlwaysOn) && FEATURE_FLAGS.MARGIN_KEEPER_ALWAYS_ON
  const { armPosition, disarmPosition, fetchKeeperInfo, isArming, armProgress } = useStellarMarginKeeper()
  // Shared arm cache — drives the "how long is this cover good for" line and the
  // re-confirm prompt. Same source as the row chip, so the two can't disagree.
  const keeperArms = useStellarKeeperArms(keeperOffered)
  const armState = keeperArms.stateFor(String(position.positionId))
  const [keeperReady, setKeeperReady] = useState(false)
  const [alwaysOn, setAlwaysOn] = useState(false)
  const [wasArmed, setWasArmed] = useState(false)

  // On open, learn whether the keeper is available + whether THIS position is armed.
  useEffect(() => {
    if (!open || !keeperOffered) return
    let cancelled = false
    ;(async () => {
      const info = await fetchKeeperInfo()
      if (cancelled) return
      const ready = Boolean(info?.enabled && info?.keeperPublicKey)
      setKeeperReady(ready)
      const armed = Boolean(
        info?.arms?.some((a) => a.position_id === String(position.positionId) && a.status === 'armed'),
      )
      setAlwaysOn(armed)
      setWasArmed(armed)
    })()
    return () => { cancelled = true }
  }, [open, keeperOffered, fetchKeeperInfo, position.positionId])

  // Reset the form to the latest current values each time the popover opens.
  const onOpenChange = (o: boolean) => {
    // Never while a save or an arming signature is in flight. Closing unmounts the
    // content, and with it the "Signing… 40%" line, the error branch that puts the
    // Always-on switch back, and any chance of telling the user whether their
    // stop-loss ended up armed — the one thing they must not be wrong about.
    if (!o && (saving || isArming)) return
    if (o) { setValue(stateFromCurrent(current)); setSaveError(null); setRenewed(false) }
    setOpen(o)
  }

  const [renewed, setRenewed] = useState(false)

  /**
   * Re-sign the same levels, nothing else.
   *
   * Always-on expires with its pre-signed auth (~5–6 days), and until now the
   * only way back was to re-enter take-profit and stop-loss and save — which
   * rewrites the journal, re-validates against the live price, and asks the
   * trader to retype numbers they never changed. On a stop-loss that has drifted
   * far from spot, that re-validation can even refuse the very levels that are
   * already stored.
   *
   * So renewal is its own action: same triggers, fresh signatures, no journal
   * write. Offered whenever an arm exists — expired, expiring, or simply because
   * the trader wants to top it up before a weekend.
   */
  const renew = async () => {
    setSaveError(null)
    const ok = await armPosition(position, { takeProfit: current.takeProfit, stopLoss: current.stopLoss })
    if (ok) {
      setRenewed(true)
      setAlwaysOn(true)
      setWasArmed(true)
      keeperArms.refetch()
    } else {
      setSaveError('Always-on could not be renewed. Your levels are unchanged and still run while this page is open.')
    }
  }

  /** Renewing only makes sense with levels to re-sign and an arm to replace. */
  const canRenew = keeperOffered && keeperReady && hasAny && (wasArmed || Boolean(armState?.label))

  /**
   * Turn the form into trigger prices — or into a reason we refuse to save.
   *
   * An enabled row whose price doesn't validate is an ERROR, never a silent null:
   * writing null here would persist "no stop-loss" while the user believes they
   * set one, and (because a `tpsl_set` row supersedes the open's triggers) would
   * also wipe whatever they had before.
   *
   * The rule itself lives in `validateTpSlDraft`: the open panel used to carry its
   * own, laxer copy of it and dropped invalid triggers silently, so a position
   * could be opened with a stop-loss this popover would have refused to save.
   */
  const validate = (): { next: { takeProfit: number | null; stopLoss: number | null } } | { error: string } => {
    const r = validateTpSlDraft({ side: position.side, mark: referencePrice, markIsLive, draft: value })
    return r.ok ? { next: r.triggers } : { error: r.error }
  }

  const save = async () => {
    const r = validate()
    if ('error' in r) { setSaveError(r.error); return }
    await commit(r.next)
  }

  const commit = async (next: { takeProfit: number | null; stopLoss: number | null }) => {
    setSaving(true)
    setSaveError(null)
    try {
      // Throws if the journal row didn't land — TP/SL lives only there, so a failed
      // write must not look like success.
      await onSave(position.id, next)
      // Sync the always-on keeper with the toggle. Arming needs a live trigger;
      // clearing TP/SL or turning the switch off disarms. Both are best-effort —
      // the in-tab monitor stays the fallback either way.
      if (keeperOffered && keeperReady) {
        const hasTrigger = next.takeProfit != null || next.stopLoss != null
        if (alwaysOn && hasTrigger) {
          // Arming can fail while the trigger write succeeds. Closing the popover
          // on that path left the switch looking on and the position unwatched —
          // the one outcome the user must not be wrong about. Keep it open, put
          // the switch back, and say plainly what did and didn't happen.
          const armed = await armPosition(position, next)
          if (!armed) {
            setAlwaysOn(false)
            setSaveError('Your take-profit and stop-loss are saved. Always-on could not be switched on, so they only run while this tab is open.')
            return
          }
        } else if (wasArmed && (!alwaysOn || !hasTrigger)) {
          await disarmPosition(position.positionId)
        }
        // The row chip and the page notice read the shared cache — refresh it now
        // so they don't keep showing "expired" next to a freshly renewed arm.
        keeperArms.refetch()
      }
      setOpen(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  // ROI denominator = equity (collateral − debt); notional = collateral USD.
  const equityUsd = Math.max(position.collateralUsd - position.debtUsd, 0.01)

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {variant === 'icon' ? (
          <button
            type="button"
            className={cn(
              'inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors',
              hasAny ? 'text-muted-foreground/60 hover:text-primary hover:bg-white/5' : 'text-muted-foreground/30 hover:text-primary hover:bg-white/5',
            )}
            title="Edit take-profit / stop-loss"
          >
            <Pencil className="w-3 h-3" />
          </button>
        ) : (
          <Button size="sm" variant="ghost" className="h-7 px-2.5 text-[11px]">
            <Pencil className="w-3 h-3 mr-1" /> {hasAny ? 'Edit TP/SL' : 'Set TP/SL'}
          </Button>
        )}
      </PopoverTrigger>
      {/* Scrollable: TP/SL controls + the always-on block + buttons run past a
          phone's viewport height, and a popover taller than the screen just clips
          its own Save button. `max-h` is relative to the viewport, matching Radix's
          own collision handling. */}
      <PopoverContent
        data-testid="keeper-tpsl-popover"
        align="end"
        collisionPadding={12}
        className="max-h-[85vh] w-80 overflow-y-auto overflow-x-hidden p-3 bg-background/95 backdrop-blur-xl border-white/10"
        onEscapeKeyDown={(e) => { if (saving || isArming) e.preventDefault() }}
        onInteractOutside={(e) => { if (saving || isArming) e.preventDefault() }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold">
            {position.side} {(entryLeverage ?? position.leverage).toFixed(1)}× · Protection
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            Mark ${markIsLive && referencePrice > 0 ? referencePrice.toFixed(4) : '—'}
          </span>
        </div>

        {!markIsLive && (
          <p className="flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[10px] text-amber-700 dark:text-amber-300">
            <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
            Waiting for the live price — triggers can&apos;t be validated yet.
          </p>
        )}

        {/* `alwaysOnActive` reads `wasArmed` — what the server actually holds — not
            `alwaysOn`, which is just the switch position and flips before anything
            is signed. */}
        {/* `markIsLive` has to reach the controls too, not just the banner above:
            without it they still prefill +25% off the oracle's flat $1 and quote a
            payoff against a price that isn't the market's, under a warning saying
            the price isn't known yet. */}
        <StellarTpSlControls
          side={position.side}
          entryPrice={referencePrice}
          markIsLive={markIsLive}
          costBasis={entryPrice}
          positionUsd={position.collateralUsd}
          collateralUsd={equityUsd}
          liqPrice={liqPrice}
          alwaysOnActive={wasArmed}
          value={value}
          onChange={setValue}
        />

        {keeperOffered && keeperReady && (
          <div className="mt-3 px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/5">
            {/* Only the toggle row is a <label>. The renew button must sit outside
                it — a click anywhere inside a label activates the label's control,
                so a button in here would flip the switch on its way. */}
            <label className="flex items-start gap-2.5 cursor-pointer">
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold">Always-on</span>
                  <Switch data-testid="keeper-alwayson-switch" checked={alwaysOn} onCheckedChange={setAlwaysOn} disabled={saving || isArming} />
                </div>
                <p className="text-[10px] leading-snug text-muted-foreground mt-0.5">
                  {isArming
                    ? `Signing… ${Math.round(armProgress * 100)}%`
                    : 'We close this automatically even if your tab is closed. You sign once now; renew every few days.'}
                </p>
              </div>
            </label>

            {/* What the server actually holds for THIS position: how long the cover
                lasts, or why it isn't working. Without it, "renew every few days"
                is advice with no clock attached — and an arm that expired last
                night looks identical to one that runs. */}
            {!isArming && (renewed || armState?.detail) && (
              <p
                data-testid="keeper-arm-state"
                data-tone={renewed ? 'ok' : armState?.tone}
                className={cn(
                  'text-[10px] leading-snug mt-2 pt-2 pl-6 border-t border-white/5',
                  !renewed && armState?.tone === 'alert' && 'text-red-600 dark:text-red-400',
                  !renewed && armState?.tone === 'warn' && 'text-amber-600 dark:text-amber-400',
                  (renewed || armState?.tone === 'ok') && 'text-muted-foreground',
                )}
              >
                {renewed ? 'Renewed — your cover runs for another few days.' : armState?.detail}
              </p>
            )}

            {canRenew && !renewed && (
              <Button
                size="sm"
                variant={armState?.needsUser ? 'default' : 'outline'}
                disabled={saving || isArming}
                onClick={() => void renew()}
                data-testid="keeper-renew"
                className="h-7 px-2.5 mt-2 ml-6 text-[10px] font-bold"
              >
                {isArming ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Renewing…</> : 'Renew cover'}
              </Button>
            )}
          </div>
        )}

        {saveError && (
          <p
            data-testid="keeper-tpsl-error"
            className="flex items-start gap-1.5 mt-3 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/25 text-[10px] leading-snug text-red-700 dark:text-red-300"
          >
            <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
            <span>{saveError}</span>
          </p>
        )}

        <div className="flex items-center gap-2 mt-3">
          {hasAny && (
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => commit({ takeProfit: null, stopLoss: null })}
              className="h-8 px-3 text-[11px] text-muted-foreground hover:text-red-400"
            >
              Clear
            </Button>
          )}
          <Button
            size="sm"
            disabled={saving}
            data-testid="keeper-tpsl-save"
            onClick={save}
            className="h-8 px-3 text-[11px] font-bold ml-auto bg-primary hover:bg-primary/90"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3 mr-1" /> Save</>}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
