'use client'

import { useState } from 'react'
import { AnimateIn } from './AnimateIn'

const TABS = [
  { id: 'mcp',       label: 'MCP Config' },
  { id: 'api',       label: 'REST API' },
  { id: 'selfhost',  label: 'Self-host' },
] as const

type TabId = (typeof TABS)[number]['id']

const CODE: Record<TabId, { lang: string; code: string; caption: string }> = {
  mcp: {
    lang: 'json',
    caption: '~/Library/Application Support/Claude/claude_desktop_config.json. Works in Claude Desktop, Cursor, Windsurf & more.',
    code: `{
  "mcpServers": {
    "peridot": {
      "command": "npx",
      "args": ["-y", "@peridot-agent/agent-kit"],
      "env": {
        "PERIDOT_API_URL": "https://mcp.peridot.finance"
      }
    }
  }
}`,
  },
  api: {
    lang: 'bash',
    caption: 'Query live market data directly. No auth required for public endpoints.',
    code: `# Live APYs across all supported chains
curl https://mcp.peridot.finance/api/apy

# Protocol metrics snapshot
curl https://mcp.peridot.finance/api/markets/metrics

# Your portfolio (requires wallet signature)
curl -H "x-wallet-address: 0xYOUR_ADDRESS" \\
     https://mcp.peridot.finance/api/user/portfolio-data`,
  },
  selfhost: {
    lang: 'bash',
    caption: 'Run your own Peridot MCP server locally',
    code: `# Clone the agent kit
git clone https://github.com/AsyncSan/peridot-agent-kit
cd peridot-agent-kit

# Install dependencies (requires pnpm)
pnpm install

# Configure environment
cp .env.example .env
# Edit .env: set DATABASE_URL, NETWORK_PRESET, etc.

# Start the server
pnpm start
# → Server running on http://localhost:3001`,
  },
}

export function InstallSection() {
  const [active, setActive] = useState<TabId>('mcp')
  const [copied, setCopied] = useState(false)

  const current = CODE[active]

  function handleCopy() {
    navigator.clipboard.writeText(current.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <section id="install" className="py-24 sm:py-32">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <AnimateIn className="text-center mb-12">
          <p
            className="text-xs font-mono font-semibold tracking-[0.18em] uppercase mb-4"
            style={{ color: 'var(--accent-primary)' }}
          >
            Get started
          </p>
          <h2 className="text-3xl sm:text-4xl font-poppins font-bold tracking-tight mb-4">
            Integrate in{' '}
            <span className="gradient-text">minutes.</span>
          </h2>
          <p
            className="text-base sm:text-lg max-w-lg mx-auto"
            style={{ color: 'var(--text-secondary)' }}
          >
            Three integration paths: MCP config for Claude &amp; Cursor, raw
            REST API, or a fully self-hosted stack.
          </p>
        </AnimateIn>

        {/* Terminal card */}
        <AnimateIn type="scale" delay={100}>
          <div
            className="glass-strong rounded-2xl overflow-hidden"
            style={{ background: 'var(--bg-card-surface)' }}
          >

            {/* Window chrome bar */}
            <div
              className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b"
              style={{ borderColor: 'var(--border-cyber)' }}
            >
              <span className="w-3 h-3 rounded-full bg-red-400/70" />
              <span className="w-3 h-3 rounded-full bg-yellow-400/70" />
              <span className="w-3 h-3 rounded-full bg-green-400/70" />
              <span
                className="ml-3 text-xs font-mono hidden sm:block"
                style={{ color: 'var(--text-tertiary)' }}
              >
                peridot-agent-kit
              </span>
            </div>

            {/* Tab bar */}
            <div
              className="flex overflow-x-auto border-b px-4 sm:px-5 gap-1"
              style={{ borderColor: 'var(--border-cyber)' }}
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActive(t.id)}
                  className="flex-shrink-0 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-all duration-150 border-b-2 -mb-px"
                  style={{
                    color:
                      active === t.id
                        ? 'var(--accent-primary)'
                        : 'var(--text-tertiary)',
                    borderBottomColor:
                      active === t.id
                        ? 'var(--accent-primary)'
                        : 'transparent',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Code block */}
            <div className="relative">
              {/* Caption */}
              <div
                className="px-4 sm:px-6 pt-4 pb-1 text-xs font-mono"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {current.caption}
              </div>

              {/* Copy button */}
              <button
                onClick={handleCopy}
                className="absolute top-3 right-4 sm:right-5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all duration-150 hover:scale-105 active:scale-95"
                style={{
                  background: copied
                    ? 'rgba(16,185,129,0.12)'
                    : 'rgba(255,255,255,0.05)',
                  color: copied ? 'var(--status-success)' : 'var(--text-tertiary)',
                  border: `1px solid ${copied ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.07)'}`,
                }}
                aria-label="Copy code"
              >
                {copied ? (
                  <>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                      <path d="M3 8l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                      <rect x="5" y="5" width="9" height="9" rx="1.5" />
                      <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" strokeLinecap="round" />
                    </svg>
                    Copy
                  </>
                )}
              </button>

              {/* Code */}
              <pre
                className="px-4 sm:px-6 py-4 text-sm overflow-x-auto font-mono leading-relaxed"
                style={{ color: 'var(--text-primary)', minHeight: '160px' }}
              >
                <code>{current.code}</code>
              </pre>
            </div>
          </div>
        </AnimateIn>

        {/* GitHub CTA below */}
        <AnimateIn delay={200} className="text-center mt-8">
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Full documentation and examples on{' '}
            <a
              href="https://github.com/AsyncSan/peridot-agent-kit"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline underline-offset-2 transition-colors hover:no-underline"
              style={{ color: 'var(--accent-primary)' }}
            >
              GitHub
            </a>
            {' '}·{' '}
            <a
              href="https://www.npmjs.com/package/@peridot-agent/agent-kit"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline underline-offset-2 transition-colors hover:no-underline"
              style={{ color: 'var(--accent-primary)' }}
            >
              npm →
            </a>
          </p>
        </AnimateIn>
      </div>
    </section>
  )
}
