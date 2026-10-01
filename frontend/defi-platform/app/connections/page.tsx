import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowUpRight,
  Bot,
  Database,
  FileSpreadsheet,
  Link2,
  ScrollText,
  Terminal,
} from 'lucide-react'
import { stellarSorobanMainnetContracts } from '@/config/contracts'
import { CopyableCode } from './_components/CopyableCode'

/**
 * /connections — every way to reach Peridot from outside the app.
 *
 * Why this page exists: experts should be able to take the protocol's data with them and plug their own tooling in,
 * instead of the integration surfaces being scattered across /agents, the
 * Expert charts tab and the docs. Everything listed here is something that
 * actually ships today; nothing is aspirational.
 */

export const metadata: Metadata = {
  title: 'Connections | Peridot Protocol — API, MCP & Data Exports',
  description:
    'Connect to Peridot: MCP server for AI agents, public market data API, per-market CSV exports and on-chain contract addresses.',
  alternates: { canonical: '/connections' },
  openGraph: {
    title: 'Connections | Peridot Protocol',
    description:
      'MCP server, public market API, CSV exports and contract addresses — every way to reach Peridot from outside the app.',
    url: '/connections',
  },
}

const s = stellarSorobanMainnetContracts

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/markets/timeseries?assetId=xlm-stellar&chainId=56457&days=30',
    description:
      'Daily history per market: TVL, utilization, supply and borrow APY, price and verified transaction flow. Append &format=csv for a spreadsheet.',
  },
  {
    method: 'GET',
    path: '/api/markets/metrics',
    description: 'Current TVL, utilization, price and collateral factor for every market.',
  },
  {
    method: 'GET',
    path: '/api/markets/details?assetId=usdc&chainId=56',
    description: 'Liquidity and reserve detail for a single market.',
  },
  {
    method: 'GET',
    path: '/api/markets/xlm-price?range=1M',
    description: 'XLM/USD candles, the same feed the margin chart draws.',
  },
]

const CONTRACTS = [
  { label: 'Peridottroller (controller)', value: s.controller },
  { label: 'Price oracle', value: s.oracle },
  { label: 'XLM market vault', value: s.markets.XLM.vaultId },
  { label: 'USDC market vault', value: s.markets.USDC.vaultId },
  { label: 'EURC market vault', value: s.markets.EURC.vaultId },
  { label: 'Rate model — XLM (volatile)', value: s.jumpRateModelVolatile },
  { label: 'Rate model — USDC / EURC (stable)', value: s.jumpRateModelStable },
]

const MCP_CONFIG = `{
  "mcpServers": {
    "peridot": {
      "command": "npx",
      "args": ["-y", "@peridot-agent/agent-kit"],
      "env": { "PERIDOT_API_URL": "https://mcp.peridot.finance" }
    }
  }
}`

export default function Connections() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-liquid py-20 md:py-28">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="noise" />

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-7 rounded-full glass-tab text-sm font-medium text-text/80">
              <Link2 className="w-4 h-4 text-primary" />
              Build on Peridot
            </div>

            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              <span className="gradient-text">Connections</span>
            </h1>

            <p className="text-lg md:text-xl text-text/70 max-w-2xl mx-auto leading-relaxed">
              Every way to reach the protocol from outside the app — agents, raw market data,
              spreadsheets and the contracts themselves. No key, no sign-up: the market endpoints
              are public.
            </p>
          </div>
        </div>
      </section>

      {/* AI agents / MCP */}
      <section className="py-16 md:py-20 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">
              Agents
            </p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-8">
              MCP server &amp; agent kit
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-border/60 bg-card p-7 soft-shadow">
                <Bot className="h-6 w-6 text-primary mb-4" />
                <h3 className="text-xl font-bold mb-2">Talk to Peridot from your assistant</h3>
                <p className="text-text/70 text-sm leading-relaxed mb-5">
                  The Peridot MCP server exposes markets, rates and portfolios as tools. It works
                  in Claude Desktop, Claude Code, Cursor and anything else that speaks MCP — and it
                  understands Stellar markets, not just EVM.
                </p>
                <Link
                  href="/agents"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all"
                >
                  Setup guide, capabilities and self-hosting
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card p-7 soft-shadow">
                <div className="flex items-center gap-2 mb-4">
                  <Terminal className="h-5 w-5 text-primary" />
                  <span className="text-[11px] uppercase tracking-wider text-text/50">
                    claude_desktop_config.json
                  </span>
                </div>
                <pre className="overflow-x-auto rounded-xl border border-border/50 bg-muted/30 p-4 font-mono text-[11px] leading-relaxed text-text/85">
                  {MCP_CONFIG}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Market data API */}
      <section className="py-16 md:py-20 bg-muted/20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">
              Data
            </p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
              Public market API
            </h2>
            <p className="text-text/70 max-w-2xl mb-8 leading-relaxed">
              Read-only, no authentication, same numbers the app renders. Rate limits apply per IP;
              the CSV form is metered separately because it reads uncached.
            </p>

            <div className="space-y-4">
              {ENDPOINTS.map((e) => (
                <div
                  key={e.path}
                  className="rounded-2xl border border-border/60 bg-card p-6 soft-shadow"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-bold text-primary">
                      {e.method}
                    </span>
                    <code className="min-w-0 truncate font-mono text-xs text-text/85">
                      {e.path}
                    </code>
                  </div>
                  <p className="text-sm text-text/70 leading-relaxed">{e.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Exports */}
      <section className="py-16 md:py-20 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">
              Exports
            </p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-8">
              Take the numbers with you
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-border/60 bg-card p-7 soft-shadow">
                <FileSpreadsheet className="h-6 w-6 text-primary mb-4" />
                <h3 className="text-xl font-bold mb-2">Per-market history (CSV)</h3>
                <p className="text-text/70 text-sm leading-relaxed mb-5">
                  Open any market in Expert mode and switch to the Charts tab: TVL, utilization,
                  both APYs, price and verified flow, day by day, exportable for 7 days up to a
                  year. Opens directly in Excel, Numbers or Sheets.
                </p>
                <Link
                  href="/app"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all"
                >
                  Open Expert mode
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card p-7 soft-shadow">
                <Database className="h-6 w-6 text-primary mb-4" />
                <h3 className="text-xl font-bold mb-2">Your own transactions</h3>
                <p className="text-text/70 text-sm leading-relaxed mb-5">
                  Every deposit, withdrawal, borrow and repayment on your account, with USD values
                  at the time — per tax year, as a CSV. Requires a connected wallet, because it is
                  your data and nobody else&apos;s.
                </p>
                <Link
                  href="/app/easy/account/tax"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all"
                >
                  Tax &amp; transaction export
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contracts */}
      <section className="py-16 md:py-20 bg-muted/20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">
              On-chain
            </p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
              Stellar mainnet contracts
            </h2>
            <p className="text-text/70 max-w-2xl mb-8 leading-relaxed">
              Read the protocol state yourself, without going through us. Every market is a
              ReceiptVault; the controller holds account health and the rate models set the borrow
              curve.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {CONTRACTS.map((c) => (
                <CopyableCode key={c.value} label={c.label} value={c.value} />
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-6">
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all"
              >
                <ScrollText className="h-4 w-4" />
                Protocol documentation
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              <Link
                href="/audits"
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all"
              >
                Security audits
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
