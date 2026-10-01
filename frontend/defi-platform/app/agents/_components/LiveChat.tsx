'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Live, self-typing Perry conversation. The hero centerpiece of /agents.
 *
 * Tells the whole story in one calm exchange: Perry understands intent,
 * quantifies it in plain money terms, asks for consent, then acts. The
 * sequence is a small timed state machine (`stage`) with a per-character
 * typewriter for Perry's reply. It settles, holds, then gently replays so
 * the card always feels alive without being frantic.
 *
 * Honors `prefers-reduced-motion`: jumps straight to the settled state and
 * never loops.
 */

const PERRY_REPLY =
  'You’ve got $5,000 sitting idle. I can move it to 8.2% APY. That’s about $410 a year. Want me to do it?'

// stage: 0 idle · 1 user bubble · 2 Perry typing · 3 Perry replying · 4 settled
type Stage = 0 | 1 | 2 | 3 | 4

export function LiveChat() {
  const [stage, setStage] = useState<Stage>(0)
  const [typed, setTyped] = useState('')
  const reduced = useRef(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    reduced.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced.current) {
      setTyped(PERRY_REPLY)
      setStage(4)
      return
    }

    let charTimer: ReturnType<typeof setInterval> | null = null

    const run = () => {
      const at = (ms: number, fn: () => void) =>
        timers.current.push(setTimeout(fn, ms))

      setStage(0)
      setTyped('')

      at(500, () => setStage(1)) // user message lands
      at(1100, () => setStage(2)) // Perry starts thinking
      at(2200, () => {
        setStage(3) // Perry begins replying (typewriter)
        let i = 0
        charTimer = setInterval(() => {
          i += 1
          setTyped(PERRY_REPLY.slice(0, i))
          if (i >= PERRY_REPLY.length) {
            if (charTimer) clearInterval(charTimer)
            timers.current.push(setTimeout(() => setStage(4), 350))
          }
        }, 22)
      })
      // hold the settled state, then replay
      at(2200 + PERRY_REPLY.length * 22 + 6500, () => {
        if (charTimer) clearInterval(charTimer)
        run()
      })
    }

    run()

    return () => {
      timers.current.forEach(clearTimeout)
      timers.current = []
      if (charTimer) clearInterval(charTimer)
    }
  }, [])

  return (
    <div
      className="relative w-full max-w-md mx-auto lg:mx-0"
      style={{ animation: 'fadeInUpImmediate 0.8s 0.2s ease-out both' }}
    >
      {/* Soft glow behind the card */}
      <div
        className="absolute inset-[-12%] rounded-[2rem] pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 70% 30%, rgba(16,185,129,0.16) 0%, transparent 68%)',
          animation: 'float-slow 12s ease-in-out infinite',
        }}
      />

      <div
        className="relative rounded-2xl border overflow-hidden backdrop-blur-xl"
        style={{
          background: 'var(--bg-card-surface)',
          borderColor: 'var(--border-cyber)',
          boxShadow: '0 24px 60px -24px rgba(16,185,129,0.18)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3.5 border-b"
          style={{ borderColor: 'var(--border-cyber)' }}
        >
          <div className="relative flex-shrink-0">
            <Image
              src="/Owl Mascot - Mint Green.svg"
              alt="Perry"
              width={32}
              height={32}
              className="w-8 h-8"
            />
          </div>
          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Perry
            </div>
            <div className="text-[11px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
              Peridot · AI co-pilot
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5">
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
              className="text-[11px] font-mono tracking-wider"
              style={{ color: 'var(--accent-primary)' }}
            >
              live
            </span>
          </span>
        </div>

        {/* Conversation */}
        <div className="px-5 py-5 space-y-3 min-h-[248px] flex flex-col justify-end">
          {/* User message */}
          <div
            className={`flex justify-end transition-all duration-500 ${
              stage >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
            }`}
          >
            <div
              className="max-w-[78%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm"
              style={{ background: 'var(--accent-primary)', color: '#0A0B0F' }}
            >
              Put my idle cash to work.
            </div>
          </div>

          {/* Perry: typing indicator */}
          {stage === 2 && (
            <div className="flex justify-start">
              <div
                className="rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5"
                style={{ background: 'rgba(127,127,127,0.10)' }}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{
                      background: 'var(--text-tertiary)',
                      animationDelay: `${i * 0.15}s`,
                      animationDuration: '0.9s',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Perry: reply (typewriter) */}
          {stage >= 3 && (
            <div className="flex justify-start animate-[fadeInUpImmediate_0.4s_ease-out_both]">
              <div className="max-w-[88%] space-y-2.5">
                <div
                  className="rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed"
                  style={{
                    background: 'rgba(127,127,127,0.10)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {renderReply(typed)}
                  {stage === 3 && (
                    <span
                      className="inline-block w-[2px] h-4 ml-0.5 align-middle"
                      style={{
                        background: 'var(--accent-primary)',
                        animation: 'caretBlink 1s steps(1) infinite',
                      }}
                    />
                  )}
                </div>

                {/* Consent chips, revealed once Perry finishes */}
                <div
                  className={`flex flex-wrap gap-2 transition-all duration-500 ${
                    stage >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                  }`}
                >
                  <span
                    className="px-3.5 py-1.5 rounded-full text-xs font-semibold"
                    style={{ background: 'var(--accent-primary)', color: '#0A0B0F' }}
                  >
                    Yes, do it
                  </span>
                  <span
                    className="px-3.5 py-1.5 rounded-full text-xs font-medium border"
                    style={{
                      borderColor: 'var(--border-cyber)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Show me options
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer reassurance */}
        <div
          className="px-5 py-3 border-t flex items-center gap-2 text-[11px]"
          style={{ borderColor: 'var(--border-cyber)', color: 'var(--text-tertiary)' }}
        >
          <ShieldCheck />
          Perry only acts with your approval. Every time.
        </div>
      </div>
    </div>
  )
}

/** Highlights the rate + figure inside Perry's reply as it types in. */
function renderReply(text: string) {
  const accent = (s: string) => (
    <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{s}</span>
  )
  // Split on the two figures so partial (typing) strings still render.
  const parts: ReactNode[] = []
  let rest = text
  for (const token of ['8.2% APY', '$410']) {
    const idx = rest.indexOf(token)
    if (idx === -1) continue
    parts.push(rest.slice(0, idx), accent(token))
    rest = rest.slice(idx + token.length)
  }
  parts.push(rest)
  return <>{parts}</>
}

function ShieldCheck() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5l5 2v3.5c0 3.2-2.1 5.6-5 6.5-2.9-.9-5-3.3-5-6.5V3.5l5-2z"
        stroke="var(--accent-primary)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M5.8 8l1.6 1.6 3-3.2"
        stroke="var(--accent-primary)"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
