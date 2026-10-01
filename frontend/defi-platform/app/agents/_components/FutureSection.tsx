import Image from 'next/image'
import { AnimateIn } from './AnimateIn'

export function FutureSection() {
  return (
    <section className="relative py-32 sm:py-40 overflow-hidden">

      {/* Dark panel background */}
      <div
        className="absolute inset-0"
        style={{ background: 'var(--bg-card-surface)' }}
      />

      {/* Top border */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: 'var(--border-cyber)' }}
      />

      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 50%, rgba(16,185,129,0.06) 0%, transparent 65%)',
        }}
      />

      {/* Dot grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-50"
        style={{
          backgroundImage:
            'radial-gradient(rgba(16,185,129,0.12) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">

        {/* Perry glowing */}
        <AnimateIn type="scale" className="flex justify-center mb-12">
          <div className="relative w-32 sm:w-40">
            <div
              className="absolute inset-[-30%] rounded-full pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle, rgba(16,185,129,0.25) 0%, transparent 70%)',
                animation: 'float-slow 8s ease-in-out infinite',
              }}
            />
            <Image
              src="/Owl Mascot - Mint Green.svg"
              alt="Perry mascot"
              width={160}
              height={160}
              className="relative z-10 w-full h-auto"
              style={{
                animation: 'float-slow 12s ease-in-out infinite',
                filter: 'drop-shadow(0 0 24px rgba(16,185,129,0.35))',
              }}
            />
          </div>
        </AnimateIn>

        {/* Label */}
        <AnimateIn>
          <p
            className="text-xs font-mono font-semibold tracking-[0.18em] uppercase mb-6"
            style={{ color: 'var(--accent-primary)' }}
          >
            What this means
          </p>
        </AnimateIn>

        {/* Big statement */}
        <AnimateIn type="up30" delay={60}>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-poppins font-bold tracking-tight leading-[1.05] mb-8">
            The agentic layer
            <br />
            <span className="gradient-text">is the new API.</span>
          </h2>
        </AnimateIn>

        {/* Body */}
        <AnimateIn type="up" delay={140}>
          <p
            className="text-base sm:text-lg lg:text-xl max-w-2xl mx-auto leading-relaxed mb-6"
            style={{ color: 'var(--text-secondary)' }}
          >
            DeFi protocols have always had smart-contract APIs and REST APIs.
            But for AI agents to act autonomously in DeFi, reading markets,
            evaluating risk, and executing strategy, they need a third layer:
            a native agentic interface.
          </p>
          <p
            className="text-base sm:text-lg max-w-2xl mx-auto leading-relaxed mb-12"
            style={{ color: 'var(--text-secondary)' }}
          >
            Peridot now has that. The MCP Server, the Skills, and the open-source
            agent kit are the foundation for a future where AI can participate
            in DeFi the same way humans do: intelligently, autonomously, at scale.
          </p>
        </AnimateIn>

        {/* CTA row */}
        <AnimateIn type="up" delay={220}>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="https://github.com/AsyncSan/peridot-agent-kit"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]"
              style={{ background: 'var(--accent-primary)', color: '#0A0B0F' }}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              Star on GitHub
            </a>
            <a
              href="/app/easy"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm glass transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
              style={{ color: 'var(--text-primary)' }}
            >
              Try Peridot →
            </a>
          </div>
        </AnimateIn>

        {/* Footer stamp */}
        <AnimateIn delay={300}>
          <p
            className="text-xs font-mono mt-14 tracking-wider uppercase"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Peridot Finance · 2026 · First DeFi protocol with native agentic support
          </p>
        </AnimateIn>
      </div>
    </section>
  )
}
