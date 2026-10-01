'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/**
 * A code line with a copy button. Used for API endpoints and contract
 * addresses — both are things people paste into a terminal or an explorer, and
 * a Stellar contract id is 56 characters of unreadable base32, so re-typing it
 * is not a realistic option.
 */
export function CopyableCode({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
      <div className="min-w-0 flex-1">
        {label && (
          <div className="text-[11px] uppercase tracking-wider text-text/45 mb-0.5">{label}</div>
        )}
        <code className="block truncate font-mono text-xs text-text/85">{value}</code>
      </div>
      <button
        onClick={handleCopy}
        aria-label={`Copy ${label || value}`}
        className="shrink-0 rounded-lg border border-border/50 p-2 text-text/60 transition-colors hover:text-text hover:border-border"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
