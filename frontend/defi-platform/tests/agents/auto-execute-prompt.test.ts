/**
 * Fix 2 — buildSystemPrompt injects auto-execute awareness so Perry's
 * follow-up text doesn't instruct a "tap" that already happened.
 */

import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '@/lib/agents/system-prompt'

const BASE = {
  userAddress: '0xabc',
  chainId: 56,
}

describe('buildSystemPrompt — auto-execute awareness', () => {
  it('omits the auto-execute section when no profile passed', () => {
    const prompt = buildSystemPrompt({ ...BASE })
    expect(prompt).not.toContain('## Auto-execute context')
  })

  it('omits the auto-execute section when enabled=false', () => {
    const prompt = buildSystemPrompt({
      ...BASE,
      autoExecute: { enabled: false, limitUsd: 2, actions: ['deposit'] },
    })
    expect(prompt).not.toContain('## Auto-execute context')
  })

  it('adds the context section when enabled, with the limit + allow-list', () => {
    const prompt = buildSystemPrompt({
      ...BASE,
      autoExecute: {
        enabled: true,
        limitUsd: 2,
        actions: ['deposit', 'withdraw', 'pay_back'],
      },
    })
    expect(prompt).toContain('## Auto-execute context')
    expect(prompt).toContain('$2.00')
    expect(prompt).toContain('deposit, withdraw, pay_back')
  })

  it('tells Perry to follow the per-call hint embedded in the tool result', () => {
    const prompt = buildSystemPrompt({
      ...BASE,
      autoExecute: { enabled: true, limitUsd: 5, actions: ['deposit'] },
    })
    // The decision logic lives in the tool now, not in Perry's head
    expect(prompt).toMatch(/\[Auto-execute: \.\.\.\]/)
    expect(prompt).toMatch(/Follow that instruction verbatim/i)
  })

  it('explains both WILL-fire and NOT-eligible branches with correct phrasings', () => {
    const prompt = buildSystemPrompt({
      ...BASE,
      autoExecute: { enabled: true, limitUsd: 2, actions: ['deposit'] },
    })
    expect(prompt).toMatch(/auto-execute WILL fire/i)
    expect(prompt).toMatch(/auto-execute is NOT eligible/i)
    // Evergreen alternatives are still named so Perry doesn't improvise
    expect(prompt).toMatch(/On it — usually a few seconds/)
    // Stuck-reading phrasings remain banned
    expect(prompt).toMatch(/AVOID.*Handling it now/)
    // Manual-tap branch references the button-verb pattern
    expect(prompt).toMatch(/Tap the \*\*\{verb\}\*\* button above/)
  })

  // Still-valid regression test from the earlier fix: the base prompt must
  // ban "Handling it now." regardless of auto-execute path.
  it('base prompt bans present-progressive phrases', () => {
    const prompt = buildSystemPrompt({ ...BASE })
    expect(prompt).toMatch(/NEVER "Handling it now\."/)
  })
})
