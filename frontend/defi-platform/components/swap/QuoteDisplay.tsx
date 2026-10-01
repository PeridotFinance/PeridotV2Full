'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { SwapQuote } from '@/lib/swap/types'
import { ArrowRightLeft, Clock, Route, Percent } from 'lucide-react'

interface QuoteDisplayProps {
  quote: SwapQuote | null | undefined
  isLoading: boolean
  error?: string | null
}

export function QuoteDisplay({ quote, isLoading, error }: QuoteDisplayProps) {
  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Fetching best rate...
      </div>
    )
  }

  return (
    <AnimatePresence mode="wait">
      {quote && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="space-y-2 rounded-xl bg-muted/30 px-4 py-3 text-sm"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Rate
            </span>
            <span className="font-medium">
              1 {quote.fromToken.symbol} ={' '}
              {Number(quote.exchangeRate).toFixed(6)} {quote.toToken.symbol}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Percent className="h-3.5 w-3.5" />
              Fee
            </span>
            <span>
              {(Number(quote.feeRate) * 100).toFixed(1)}%
              {Number(quote.feeUsd) > 0 && (
                <span className="ml-1 text-muted-foreground">
                  (~${Number(quote.feeUsd).toFixed(2)})
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Route className="h-3.5 w-3.5" />
              Route
            </span>
            <span className="flex items-center gap-1.5">
              {quote.route}
              <span className="rounded-md bg-[#33C47C]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#33C47C]">
                {quote.provider === 'bitget' ? 'Bitget' : 'Squid'}
              </span>
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Est. time
            </span>
            <span>
              ~{quote.estimatedTime < 60
                ? `${quote.estimatedTime}s`
                : `${Math.ceil(quote.estimatedTime / 60)} min`}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
