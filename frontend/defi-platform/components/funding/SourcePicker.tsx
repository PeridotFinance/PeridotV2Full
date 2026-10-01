"use client"

/**
 * "Pay with": where the money for a supply comes from. The Stellar wallet
 * first, then every other network that holds something, largest first, each as
 * token, network and amount. Sources below the transfer minimum stay visible
 * but cannot be picked, so the user sees why a balance is not offered.
 *
 * The same control is "Receive on" in the Withdraw tab, with a label, a line
 * under each option and a footer of its own.
 */
import { useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { formatTokenAmount, formatUsd, xcChainLogo, xcChainName, xcTokenLogo } from "@/lib/crosschain/present"
import { XC_MIN_USD, type XcChain } from "@/lib/crosschain/route"

export interface PickerOption {
  key: string
  chain: XcChain
  symbol: string
  amount: number
  usd: number | null
  /** Shown instead of the network name, e.g. "Stellar wallet". */
  title?: string
  /** Shown instead of the amount, e.g. the wallet the money goes to. */
  subtitle?: string
  disabledReason?: string
}

export function TokenOnChainLogo({ symbol, chain, size = 28 }: { symbol: string; chain: XcChain; size?: number }) {
  const token = xcTokenLogo(symbol)
  const chainLogo = xcChainLogo(chain)
  const badge = Math.round(size * 0.5)
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {token ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={token} alt="" width={size} height={size} className="rounded-full" />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full bg-muted text-[10px] font-bold">
          {symbol.slice(0, 3)}
        </span>
      )}
      {chainLogo && chain !== "stellar" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={chainLogo}
          alt=""
          width={badge}
          height={badge}
          className="absolute -bottom-0.5 -right-0.5 rounded-full bg-background ring-2 ring-background"
        />
      )}
    </span>
  )
}

function OptionBody({ o }: { o: PickerOption }) {
  return (
    <>
      <TokenOnChainLogo symbol={o.symbol} chain={o.chain} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium leading-tight">
          {o.title ?? `${o.symbol} on ${xcChainName(o.chain)}`}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {o.disabledReason ?? o.subtitle ?? `${formatTokenAmount(o.amount)} ${o.symbol}`}
        </span>
      </span>
      {o.usd != null && (
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{formatUsd(o.usd)}</span>
      )}
    </>
  )
}

export function SourcePicker({
  options,
  value,
  onChange,
  disabled,
  label = "Pay with",
  footer = `Balances from your connected wallets. Other networks are converted on the way, minimum ${formatUsd(XC_MIN_USD)}.`,
  testId = "xc-source-picker",
}: {
  options: PickerOption[]
  value: string
  onChange: (key: string) => void
  disabled?: boolean
  label?: string
  footer?: string
  testId?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.key === value) ?? options[0]
  if (!selected) return null

  return (
    <div className="space-y-1.5">
      <span className="px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 font-mono">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            type="button"
            data-testid={testId}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border border-border/60 bg-background/50 px-3 py-2.5 transition-colors",
              "hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60",
              open && "border-primary/40",
            )}
          >
            <OptionBody o={selected} />
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-1.5">
          <ul className="max-h-80 space-y-0.5 overflow-y-auto" role="listbox">
            {options.map((o) => (
              <li key={o.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.key === selected.key}
                  disabled={Boolean(o.disabledReason)}
                  onClick={() => {
                    onChange(o.key)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2 py-2 transition-colors",
                    "hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
                    o.key === selected.key && "bg-muted/40",
                  )}
                >
                  <OptionBody o={o} />
                  <Check className={cn("h-4 w-4 shrink-0 text-primary", o.key === selected.key ? "opacity-100" : "opacity-0")} />
                </button>
              </li>
            ))}
          </ul>
          <p className="px-2 pb-1 pt-2 text-[11px] leading-snug text-muted-foreground">
            {footer}
          </p>
        </PopoverContent>
      </Popover>
    </div>
  )
}
