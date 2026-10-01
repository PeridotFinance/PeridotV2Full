import { LiveChat } from './LiveChat'

export function HeroSection() {
  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden">

      {/* Dot-grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(rgba(16,185,129,0.18) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Ambient emerald glow, top-right */}
      <div
        className="absolute -top-32 right-0 w-[640px] h-[640px] pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(16,185,129,0.09) 0%, transparent 65%)',
          filter: 'blur(20px)',
        }}
      />

      {/* Ambient indigo glow, bottom-left */}
      <div
        className="absolute bottom-0 -left-24 w-96 h-96 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)',
          filter: 'blur(30px)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16 py-24 lg:py-0 min-h-[92vh]">

          {/* ── Left: copy ─────────────────────────────────────────────── */}
          <div className="flex-1 text-center lg:text-left">

            {/* Live badge */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-tab mb-8"
              style={{ animation: 'fadeInUpImmediate 0.5s ease-out both' }}
            >
              <span className="relative flex h-2 w-2">
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-70"
                  style={{ background: 'var(--accent-primary)' }}
                />
                <span
                  className="relative inline-flex rounded-full h-2 w-2"
                  style={{ background: 'var(--accent-primary)' }}
                />
              </span>
              <span
                className="text-xs font-mono font-medium tracking-wider"
                style={{ color: 'var(--accent-primary)' }}
              >
                AI-Native · Live Now
              </span>
            </div>

            {/* Headline */}
            <h1
              className="text-5xl sm:text-6xl lg:text-7xl font-poppins font-bold leading-[1.05] tracking-tight mb-6"
              style={{ animation: 'fadeInUpImmediate 0.6s 0.1s ease-out both' }}
            >
              Just tell
              <br />
              <span className="gradient-text">Peridot.</span>
            </h1>

            {/* Subtitle */}
            <p
              className="text-lg sm:text-xl max-w-lg mx-auto lg:mx-0 mb-10 leading-relaxed"
              style={{
                color: 'var(--text-secondary)',
                animation: 'fadeInUpImmediate 0.6s 0.22s ease-out both',
              }}
            >
              Perry is your AI co-pilot for earning. Tell him what you want in
              plain words. He finds the best yield, explains it, and makes the
              move the moment you approve. The same agent powers our native MCP
              server for Claude, Cursor, and whatever comes next.
            </p>

            {/* CTAs */}
            <div
              className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start"
              style={{ animation: 'fadeInUpImmediate 0.6s 0.36s ease-out both' }}
            >
              <a
                href="/chat"
                className="group inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]"
                style={{ background: 'var(--accent-primary)', color: '#0A0B0F' }}
              >
                Chat with Perry
                <span className="transition-transform duration-200 group-hover:translate-x-0.5">
                  →
                </span>
              </a>

              <a
                href="https://github.com/AsyncSan/peridot-agent-kit"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm glass transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                style={{ color: 'var(--text-primary)' }}
              >
                <GitHubIcon />
                Peridot Agent Kit
              </a>
            </div>

            {/* Trust strip */}
            <div
              className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-10 justify-center lg:justify-start"
              style={{
                animation: 'fadeInUpImmediate 0.6s 0.48s ease-out both',
                color: 'var(--text-tertiary)',
              }}
            >
              <TrustItem label="MCP Server" />
              <span className="opacity-30 hidden sm:block">·</span>
              <TrustItem label="Agent Skills" />
              <span className="opacity-30 hidden sm:block">·</span>
              <TrustItem label="Open Source" />
              <span className="opacity-30 hidden sm:block">·</span>
              <TrustItem label="MIT License" />
            </div>
          </div>

          {/* ── Right: live Perry conversation ─────────────────────────── */}
          <div className="flex-shrink-0 w-full max-w-md lg:w-[420px] xl:w-[440px] relative">
            <LiveChat />
          </div>

        </div>
      </div>

      {/* Bottom fade-out */}
      <div
        className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
        style={{
          background:
            'linear-gradient(to bottom, transparent, var(--background, #fff))',
        }}
      />
    </section>
  )
}

function GitHubIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        fillRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function TrustItem({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-medium">
      <svg
        className="w-3.5 h-3.5"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden
      >
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeOpacity="0.3" />
        <path
          d="M5 8.5l2 2 4-4"
          stroke="var(--accent-primary)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </span>
  )
}
