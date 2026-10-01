import { AnimateIn } from './AnimateIn'

const FEATURES = [
  {
    icon: <ServerIcon />,
    badge: 'Live',
    badgeColor: 'success',
    title: 'MCP Server',
    description:
      'One lightweight REST API. Any AI model gets live Peridot market data: APYs, positions, protocol metrics, in real time. No wrapper, no lag.',
    detail: 'mcp.peridot.finance',
    href: 'https://mcp.peridot.finance/health',
  },
  {
    icon: <SparklesIcon />,
    badge: 'Available now',
    badgeColor: 'primary',
    title: 'Claude Skills',
    description:
      'Perry ships as native Skills in Claude Code. Query, analyse, and act on Peridot markets straight from the terminal.',
    detail: 'Claude Code · Skills API',
    href: '#install',
  },
  {
    icon: <OpenSourceIcon />,
    badge: 'MIT License',
    badgeColor: 'default',
    title: 'Open Source',
    description:
      'Every line on GitHub. Fork it, extend it, build your own DeFi agents on top. The agentic stack starts here, and it belongs to everyone.',
    detail: 'github.com/AsyncSan/peridot-agent-kit',
    href: 'https://github.com/AsyncSan/peridot-agent-kit',
  },
]

export function WhatsNewSection() {
  return (
    <section className="py-24 sm:py-32 relative overflow-hidden">

      {/* Section header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimateIn className="text-center mb-12">
          <p
            className="text-xs font-mono font-semibold tracking-[0.18em] uppercase mb-4"
            style={{ color: 'var(--accent-primary)' }}
          >
            What shipped
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-poppins font-bold tracking-tight mb-4">
            Talk to it.{' '}
            <span className="gradient-text">Or build on it.</span>
          </h2>
          <p
            className="text-base sm:text-lg max-w-xl mx-auto"
            style={{ color: 'var(--text-secondary)' }}
          >
            One agent, two front doors. A conversation anyone can use, and an
            open stack any AI can plug into.
          </p>
        </AnimateIn>

        {/* Featured: the conversation */}
        <AnimateIn type="up30" className="mb-5 lg:mb-6">
          <FeaturedChatCard />
        </AnimateIn>

        {/* Builder label */}
        <AnimateIn className="flex items-center gap-3 mb-5 lg:mb-6">
          <span
            className="text-xs font-mono font-semibold tracking-[0.18em] uppercase whitespace-nowrap"
            style={{ color: 'var(--text-tertiary)' }}
          >
            For builders
          </span>
          <span className="flex-1 h-px" style={{ background: 'var(--border-cyber)' }} />
        </AnimateIn>

        {/* Builder layers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
          {FEATURES.map((f, i) => (
            <AnimateIn key={f.title} type="up30" delay={i * 100}>
              <FeatureCard {...f} />
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeaturedChatCard() {
  return (
    <a
      href="/chat"
      className="group relative flex flex-col lg:flex-row items-stretch gap-8 lg:gap-12 p-7 sm:p-9 lg:p-10 rounded-3xl overflow-hidden no-underline transition-all duration-300 hover:shadow-2xl"
      style={{
        background: 'var(--bg-card-surface)',
        border: '1px solid var(--border-cyber)',
      }}
    >
      {/* Ambient glow that warms on hover */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-500 opacity-60 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(circle at 85% 15%, rgba(16,185,129,0.12) 0%, transparent 55%)',
        }}
      />

      {/* Left: copy */}
      <div className="relative z-10 flex-1 flex flex-col justify-center">
        <span
          className="inline-flex items-center gap-2 self-start px-2.5 py-1 rounded-full text-xs font-mono font-semibold mb-5"
          style={{
            background: 'rgba(16,185,129,0.12)',
            color: 'var(--status-success)',
            border: '1px solid rgba(16,185,129,0.2)',
          }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-70"
              style={{ background: 'var(--accent-primary)' }}
            />
            <span
              className="relative inline-flex rounded-full h-1.5 w-1.5"
              style={{ background: 'var(--accent-primary)' }}
            />
          </span>
          Live now
        </span>

        <h3
          className="text-2xl sm:text-3xl font-poppins font-bold tracking-tight mb-3"
          style={{ color: 'var(--text-primary)' }}
        >
          Perry, your co-pilot
        </h3>
        <p
          className="text-sm sm:text-base leading-relaxed max-w-md mb-7"
          style={{ color: 'var(--text-secondary)' }}
        >
          Skip the dashboards. Say what you want: “put my cash to work,” “am I
          at risk?,” “move me to the best rate.” Perry finds it, explains it in
          plain money, and makes the move once you approve.
        </p>

        <span
          className="inline-flex items-center gap-2 self-start px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-200 group-hover:scale-[1.03] group-hover:shadow-lg"
          style={{ background: 'var(--accent-primary)', color: '#0A0B0F' }}
        >
          Open Perry
          <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
        </span>
      </div>

      {/* Right: prompt chips preview */}
      <div className="relative z-10 flex-shrink-0 lg:w-80 flex flex-col justify-center gap-2.5">
        {[
          'Put my idle cash to work',
          'What’s my safest yield right now?',
          'Am I at risk of liquidation?',
          'Move $2,000 to the best rate',
        ].map((q, i) => (
          <div
            key={q}
            className="rounded-xl px-4 py-3 text-sm transition-all duration-300 group-hover:translate-x-0.5"
            style={{
              background: 'rgba(127,127,127,0.07)',
              border: '1px solid var(--border-cyber)',
              color: 'var(--text-secondary)',
              transitionDelay: `${i * 40}ms`,
            }}
          >
            <span style={{ color: 'var(--text-tertiary)' }}>“</span>
            {q}
            <span style={{ color: 'var(--text-tertiary)' }}>”</span>
          </div>
        ))}
      </div>
    </a>
  )
}

function FeatureCard({
  icon,
  badge,
  badgeColor,
  title,
  description,
  detail,
  href,
}: (typeof FEATURES)[number]) {
  const badgeStyles: Record<string, React.CSSProperties> = {
    success: {
      background: 'rgba(16,185,129,0.12)',
      color: 'var(--status-success)',
      border: '1px solid rgba(16,185,129,0.2)',
    },
    primary: {
      background: 'rgba(99,102,241,0.12)',
      color: 'var(--accent-secondary)',
      border: '1px solid rgba(99,102,241,0.2)',
    },
    default: {
      background: 'rgba(255,255,255,0.06)',
      color: 'var(--text-secondary)',
      border: '1px solid rgba(255,255,255,0.1)',
    },
  }

  return (
    <a
      href={href}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="glass-card group relative flex flex-col p-6 sm:p-7 rounded-2xl transition-all duration-300 hover:scale-[1.02] hover:shadow-xl no-underline"
      style={{
        background: 'var(--bg-card-surface)',
        ['--tw-shadow' as string]: '0 0 0 0 transparent',
      }}
    >
      {/* Hover glow overlay */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(16,185,129,0.06) 0%, transparent 60%)',
        }}
      />

      {/* Icon + badge row */}
      <div className="flex items-start justify-between mb-5 relative z-10">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(16,185,129,0.1)' }}
        >
          <span style={{ color: 'var(--accent-primary)' }}>{icon}</span>
        </div>
        <span
          className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full"
          style={badgeStyles[badgeColor]}
        >
          {badge}
        </span>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1">
        <h3
          className="text-xl font-poppins font-semibold mb-3"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h3>
        <p
          className="text-sm leading-relaxed mb-5"
          style={{ color: 'var(--text-secondary)' }}
        >
          {description}
        </p>
      </div>

      {/* Detail footer */}
      <div className="relative z-10 flex items-center justify-between pt-4 border-t"
        style={{ borderColor: 'var(--border-cyber)' }}
      >
        <span
          className="text-xs font-mono truncate max-w-[80%]"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {detail}
        </span>
        <svg
          className="w-4 h-4 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          style={{ color: 'var(--text-tertiary)' }}
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <path
            d="M3 13L13 3M13 3H7M13 3v6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </a>
  )
}

/* ── Icons ──────────────────────────────────────────────────────────── */

function ServerIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  )
}

function SparklesIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z" />
      <path d="M5 3L5.5 4.5L7 5L5.5 5.5L5 7L4.5 5.5L3 5L4.5 4.5L5 3Z" />
      <path d="M19 17L19.5 18.5L21 19L19.5 19.5L19 21L18.5 19.5L17 19L18.5 18.5L19 17Z" />
    </svg>
  )
}

function OpenSourceIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  )
}
