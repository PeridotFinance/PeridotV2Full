"use client"

import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'
import { Wallet, HandCoins, PiggyBank, ReceiptText, Coins, type LucideIcon } from 'lucide-react'
import { toBaseUnits, toDecimalStringDown } from '@/lib/token-units'

interface AmountInputProps {
  value: string
  onChange: (val: string) => void
  /**
   * The maximum, as a NUMBER. Never pass a display-formatted balance string:
   * `numericBalance.toLocaleString()` renders 9959.66 as "9.959,66" (de) or
   * "9,959.66" (en), and parsing that back yields 9.959 / 9 — a MAX button
   * that deposits 1000× too little. Balance hooks expose `numericBalance`
   * alongside `formattedBalance`; this prop wants the former.
   */
  maxAmount: number
  /**
   * The balance shown in the header row, when it differs from what MAX fills.
   * Native XLM keeps 10% back for the account reserve + fees, so the wallet
   * still holds more than MAX will deposit. Defaults to `maxAmount`.
   */
  balanceAmount?: number
  maxLabel?: string
  symbol?: string
  disabled?: boolean
  placeholder?: string
  /**
   * Underlying token decimals. When given, the exact integer amount that will
   * be sent to the contract is shown under the field, so a mis-scaled amount
   * is visible before signing rather than after.
   */
  decimals?: number
}

const PCT_CHIPS = [
  { label: '25%', pct: 0.25 },
  { label: '50%', pct: 0.50 },
  { label: '75%', pct: 0.75 },
  { label: 'MAX', pct: 1.00 },
]

// The in-field balance shows where the max amount is drawn from. The wallet
// icon only fits Supply, so the icon follows the action's `maxLabel`. The
// active tab already names the context, so the icon alone reads clearly.
const MAX_SOURCE_ICONS: Record<string, LucideIcon> = {
  Wallet,                 // supply   — spendable funds in your wallet
  Available: HandCoins,   // borrow   — how much you can take out
  Supplied: PiggyBank,    // withdraw — your deposited position
  Borrowed: ReceiptText,  // repay    — your outstanding debt
}

function isChipActive(value: string, target: number): boolean {
  if (!value || !target) return false
  return Math.abs(parseFloat(value) - target) < 0.000001
}

function formatBalance(n: number): string {
  if (!n || n <= 0) return '0'
  if (n < 0.0001) return n.toExponential(2)
  const fixed = n < 1 ? n.toFixed(6) : n < 100 ? n.toFixed(4) : n.toFixed(2)
  // Only trim fractional zeros — a bare `/\.?0+$/` turns "100" into "1".
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
}

export default function AmountInput({
  value,
  onChange,
  maxAmount,
  balanceAmount,
  maxLabel = 'Balance',
  symbol,
  disabled = false,
  placeholder = '0.00',
  decimals,
}: AmountInputProps) {
  const max = Number.isFinite(maxAmount) && maxAmount > 0 ? maxAmount : 0
  // Percentage chips must not round UP past the balance, and they must not
  // lose precision on 7-decimal Stellar assets either.
  const chipDecimals = Math.min(decimals ?? 6, 8)

  // The percentage chips read off the real balance; only MAX is capped, so a
  // reserved-balance asset (XLM) still gets an honest 25/50/75.
  const balance = Number.isFinite(balanceAmount as number) && (balanceAmount as number) > 0
    ? (balanceAmount as number)
    : max

  function targetFor(pct: number) {
    return pct === 1 ? max : Math.min(balance * pct, max)
  }

  function handlePct(pct: number) {
    if (!max) return
    onChange(toDecimalStringDown(targetFor(pct), chipDecimals))
  }

  // The slider is a view of the typed amount, not its own state — typing,
  // tapping a chip and dragging all stay in sync because there is one source
  // of truth (`value`). Anything above MAX pins the handle to the right end
  // rather than letting it wrap or disappear.
  const parsed = parseFloat(value)
  const sliderPct = max > 0 && Number.isFinite(parsed) && parsed > 0
    ? Math.min(100, (parsed / max) * 100)
    : 0

  function handleSlider([pct]: number[]) {
    if (!max) return
    // 100% must land on exactly MAX — deriving it from the percentage would
    // reintroduce float drift on a full deposit.
    onChange(pct >= 100 ? toDecimalStringDown(max, chipDecimals) : toDecimalStringDown((max * pct) / 100, chipDecimals))
  }

  // Header shows what the wallet holds; the in-field button shows (and fills)
  // what MAX actually deposits — the two differ only where a reserve is held
  // back (native XLM).
  const displayBalance = formatBalance(max)
  const headerBalance = formatBalance(balance)
  // What the contract will actually receive. Shown verbatim so a scaling bug
  // is caught by eye before signing.
  const baseUnits =
    decimals != null && value ? (() => { try { return toBaseUnits(value, decimals) } catch { return null } })() : null
  const MaxIcon = MAX_SOURCE_ICONS[maxLabel] ?? Coins

  return (
    <div className="space-y-2">
      {/* Label — the balance moved into the input itself (see below), so this
          row is just the field title now. */}
      <div className="px-0.5 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/70">
          Amount
        </span>
        {/* The available balance in full, right where the amount is entered —
            not tucked away behind the profile sheet. */}
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground/70">
          {maxLabel}:{' '}
          <span className="text-foreground/80 font-semibold">
            {headerBalance}{symbol ? ` ${symbol}` : ''}
          </span>
        </span>
      </div>

      {/* Input */}
      <div className={cn(
        "group rounded-2xl px-4 h-14",
        "bg-gradient-to-br from-card/90 to-card/60",
        "border border-border/50 backdrop-blur-sm",
        "flex items-center gap-3",
        "transition-all duration-200",
        "focus-within:border-primary/50 focus-within:shadow-[0_0_0_3px_theme(colors.primary/0.12)]",
        disabled && "opacity-50 pointer-events-none"
      )}>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "flex-1 bg-transparent outline-none min-w-0",
            "text-xl font-bold font-mono tabular-nums tracking-tight",
            "placeholder:text-muted-foreground/30 placeholder:font-normal",
            // Hide native number input spinners
            "[appearance:textfield]",
            "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0",
            "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0"
          )}
        />
        {/* Available balance, right inside the field — tap = MAX. Expert users
            know which asset they opened, so we drop the ticker and the word
            label to save space; a wallet icon carries the meaning. The context
            (`maxLabel`: Wallet / Available / Supplied / Borrowed) and `symbol`
            live on as the accessible label/title rather than visible text. */}
        <button
          type="button"
          onClick={() => handlePct(1)}
          disabled={disabled || !max}
          aria-label={`${maxLabel} ${displayBalance}${symbol ? ` ${symbol}` : ''} — tap to use max`}
          title={`${maxLabel}: ${displayBalance}${symbol ? ` ${symbol}` : ''}`}
          className={cn(
            "shrink-0 flex items-center gap-1.5 pl-2.5 pr-3 h-8 rounded-xl select-none",
            "bg-muted/40 border border-border/30",
            "text-xs font-semibold font-mono tabular-nums text-foreground/80",
            "hover:bg-muted/70 hover:text-foreground hover:border-border/60 transition-colors",
            "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-muted/40 disabled:hover:text-foreground/80 disabled:hover:border-border/30"
          )}
        >
          <MaxIcon className="h-3.5 w-3.5 text-muted-foreground/70" />
          {displayBalance}
        </button>
      </div>

      {/* Percent chips */}
      <div className="grid grid-cols-4 gap-1.5">
        {PCT_CHIPS.map(chip => {
          const active = isChipActive(value, targetFor(chip.pct))
          return (
            <button
              key={chip.label}
              type="button"
              onClick={() => handlePct(chip.pct)}
              disabled={disabled || !max}
              className={cn(
                "h-9 rounded-xl text-xs font-semibold",
                "flex items-center justify-center",
                "border transition-all duration-150",
                "active:scale-[0.97]",
                "disabled:opacity-30 disabled:cursor-not-allowed",
                active
                  ? cn(
                      "bg-primary text-primary-foreground border-primary/60",
                      "shadow-sm shadow-primary/25"
                    )
                  : cn(
                      "bg-background/40 text-muted-foreground border-border/30",
                      "hover:bg-background/70 hover:text-foreground hover:border-border/60"
                    )
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* Drag slider — the chips are the four common stops, this is everything
          in between. 0 → MAX (the same capped ceiling the MAX chip fills), so
          the far right is always a valid amount. Percent granularity; typing
          into the field stays authoritative for exact amounts. */}
      {max > 0 && (
        <div className="pt-0.5 px-0.5">
          <SliderPrimitive.Root
            value={[sliderPct]}
            onValueChange={handleSlider}
            min={0}
            max={100}
            step={1}
            disabled={disabled}
            aria-label={`Amount as a share of ${maxLabel.toLowerCase()}`}
            className={cn(
              "relative flex w-full touch-none select-none items-center h-5",
              disabled && "opacity-40 pointer-events-none"
            )}
          >
            <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted/60">
              <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary" />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb
              className={cn(
                "block h-4 w-4 rounded-full bg-background border-2 border-primary",
                "shadow-sm transition-transform",
                "hover:scale-110 active:scale-95 cursor-grab active:cursor-grabbing",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              )}
            />
          </SliderPrimitive.Root>
        </div>
      )}

      {/* Exact contract amount — the value that gets signed. */}
      {baseUnits != null && baseUnits > BigInt(0) && (
        <p className="px-0.5 text-[10px] font-mono tabular-nums text-muted-foreground/50">
          Sends {baseUnits.toString()} base units ({decimals} decimals)
        </p>
      )}
    </div>
  )
}
