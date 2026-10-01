'use client'

import { useCallback } from 'react'

interface AmountInputProps {
  value: string
  onChange: (value: string) => void
  balance?: string
  disabled?: boolean
  label?: string
  usdValue?: string
}

const NUMERIC_RE = /^[0-9]*\.?[0-9]*$/

export function AmountInput({
  value,
  onChange,
  balance,
  disabled,
  label = 'Amount',
  usdValue,
}: AmountInputProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value
      if (v === '' || NUMERIC_RE.test(v)) {
        onChange(v)
      }
    },
    [onChange],
  )

  const handleMax = useCallback(() => {
    if (balance) onChange(balance)
  }, [balance, onChange])

  return (
    <div className="space-y-1">
      {label && <label className="text-xs text-muted-foreground">{label}</label>}
      <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5">
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          onChange={handleChange}
          disabled={disabled}
          className="flex-1 bg-transparent text-lg font-medium outline-none placeholder:text-muted-foreground/50 disabled:opacity-50"
        />
        {balance && (
          <button
            type="button"
            onClick={handleMax}
            className="shrink-0 rounded-md bg-[#33C47C]/15 px-2 py-0.5 text-xs font-semibold text-[#33C47C] transition-colors hover:bg-[#33C47C]/25"
          >
            MAX
          </button>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {usdValue ? <span>~${usdValue}</span> : <span />}
        {balance && <span>Balance: {Number(balance).toLocaleString()}</span>}
      </div>
    </div>
  )
}
