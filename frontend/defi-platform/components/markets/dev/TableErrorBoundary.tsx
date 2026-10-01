"use client"

/**
 * TableErrorBoundary — catches render errors inside FastMarketTable.
 *
 * Design decisions:
 * - Fallback stays within the table container (glass-card).
 *   Reason: Error shouldn't blow the whole page layout.
 *   User still sees header, navbar, network switcher.
 * - "Reload" resets the boundary (clears error state).
 *   Reason: Most DeFi errors are transient (RPC hiccup, stale data).
 *   One tap = fresh render, no full page reload required.
 * - Error message: shown only in dev (process.env.NODE_ENV !== 'production').
 *   Reason: Don't expose internals in production. Show only in dev for debugging.
 */

import { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class TableErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In production, this would go to Sentry / your error reporting tool
    if (process.env.NODE_ENV !== 'production') {
      console.error('[FastMarketTable] render error:', error, info.componentStack)
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="w-11 h-11 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-destructive" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Something went wrong</p>
          <p className="text-xs text-muted-foreground max-w-[240px]">
            The market table hit an unexpected error. This is usually temporary.
          </p>
          {process.env.NODE_ENV !== 'production' && this.state.error && (
            <p className="text-[10px] font-mono text-muted-foreground/50 mt-2 max-w-xs break-all">
              {this.state.error.message}
            </p>
          )}
        </div>
        <button
          onClick={() => this.setState({ hasError: false, error: undefined })}
          className="flex items-center gap-2 h-9 px-4 rounded-xl glass border border-[var(--border-cyber-hover)] text-sm font-medium hover:bg-white/[0.08] transition-colors active:scale-[0.97]"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      </div>
    )
  }
}
