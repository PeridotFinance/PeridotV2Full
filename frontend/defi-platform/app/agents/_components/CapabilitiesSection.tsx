import { AnimateIn } from './AnimateIn'

const CAPABILITIES = [
  {
    icon: '📊',
    title: 'Live APY queries',
    desc: 'Read real-time supply and borrow rates across all markets and chains.',
    available: true,
  },
  {
    icon: '💼',
    title: 'Portfolio positions',
    desc: "Fetch a wallet's supplied assets, borrow balance, and health factor.",
    available: true,
  },
  {
    icon: '🌐',
    title: 'Cross-chain markets',
    desc: 'Compare protocol metrics across BSC, Monad, and spoke chains in one call.',
    available: true,
  },
  {
    icon: '📈',
    title: 'Protocol metrics',
    desc: 'TVL snapshots, utilization rates, and market health. All in one endpoint.',
    available: true,
  },
  {
    icon: '🔔',
    title: 'Yield monitoring',
    desc: 'Track APY changes over time and surface yield opportunities automatically.',
    available: true,
  },
  {
    icon: '⚡',
    title: 'Agent-driven execution',
    desc: 'Supply, borrow, and repay via AI agents without touching the UI.',
    available: false,
  },
]

export function CapabilitiesSection() {
  return (
    <section id="capabilities" className="py-24 sm:py-32 relative">

      {/* Subtle section divider */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: 'var(--border-cyber)' }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <AnimateIn className="text-center mb-16">
          <p
            className="text-xs font-mono font-semibold tracking-[0.18em] uppercase mb-4"
            style={{ color: 'var(--accent-primary)' }}
          >
            Capabilities
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-poppins font-bold tracking-tight mb-4">
            What an AI can do
            <br />
            <span className="gradient-text">with Peridot.</span>
          </h2>
          <p
            className="text-base sm:text-lg max-w-xl mx-auto"
            style={{ color: 'var(--text-secondary)' }}
          >
            Everything below is live and production-grade today.
            Agent-driven execution is next on the roadmap.
          </p>
        </AnimateIn>

        {/* Capabilities grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
          {CAPABILITIES.map((cap, i) => (
            <AnimateIn key={cap.title} type="up" delay={i * 80}>
              <CapabilityItem {...cap} />
            </AnimateIn>
          ))}
        </div>

        {/* Bottom note */}
        <AnimateIn className="text-center mt-12">
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            All available endpoints are open source.{' '}
            <a
              href="https://github.com/AsyncSan/peridot-agent-kit"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold transition-colors"
              style={{ color: 'var(--accent-primary)' }}
            >
              Contribute on GitHub →
            </a>
          </p>
        </AnimateIn>
      </div>
    </section>
  )
}

function CapabilityItem({
  icon,
  title,
  desc,
  available,
}: (typeof CAPABILITIES)[number]) {
  return (
    <div
      className="glass-card group relative flex items-start gap-4 p-5 rounded-xl transition-all duration-300 hover:scale-[1.015]"
      style={{
        background: 'var(--bg-card-surface)',
        opacity: available ? 1 : 0.6,
      }}
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 30% 50%, rgba(16,185,129,0.04) 0%, transparent 70%)',
        }}
      />

      {/* Icon */}
      <span
        className="text-2xl flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg"
        style={{ background: 'rgba(16,185,129,0.07)' }}
        aria-hidden
      >
        {icon}
      </span>

      {/* Text */}
      <div className="flex-1 min-w-0 relative z-10">
        <div className="flex items-center gap-2 mb-1.5">
          <h3
            className="text-sm font-semibold font-poppins"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </h3>
          {!available && (
            <span
              className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded"
              style={{
                background: 'rgba(251,191,36,0.1)',
                color: 'var(--status-warning)',
                border: '1px solid rgba(251,191,36,0.2)',
              }}
            >
              soon
            </span>
          )}
        </div>
        <p
          className="text-xs sm:text-sm leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          {desc}
        </p>
      </div>

      {/* Available check */}
      {available && (
        <svg
          className="w-4 h-4 flex-shrink-0 mt-0.5"
          viewBox="0 0 16 16"
          fill="none"
          aria-label="Available"
        >
          <circle cx="8" cy="8" r="7" fill="rgba(16,185,129,0.12)" />
          <path
            d="M5 8.5l2 2 4-4"
            stroke="var(--status-success)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  )
}
