import { describe, it, expect } from 'vitest'
import { validateLimitOrderDraft, evaluateLimitOrderTrigger } from '../app/app/margin/lib/marginMath'

describe('validateLimitOrderDraft', () => {
  it('a Long limit must sit below the mark', () => {
    expect(validateLimitOrderDraft({ side: 'Long', mark: 0.2, limitPrice: '0.19' }).ok).toBe(true)
    expect(validateLimitOrderDraft({ side: 'Long', mark: 0.2, limitPrice: '0.21' }).ok).toBe(false)
    // inside the safety band = a market order in disguise
    expect(validateLimitOrderDraft({ side: 'Long', mark: 0.2, limitPrice: '0.19999' }).ok).toBe(false)
  })
  it('a Short limit must sit above the mark', () => {
    expect(validateLimitOrderDraft({ side: 'Short', mark: 0.2, limitPrice: '0.21' }).ok).toBe(true)
    expect(validateLimitOrderDraft({ side: 'Short', mark: 0.2, limitPrice: '0.19' }).ok).toBe(false)
  })
  it('refuses without a live mark or a price', () => {
    expect(validateLimitOrderDraft({ side: 'Long', mark: 1, markIsLive: false, limitPrice: '0.5' }).ok).toBe(false)
    expect(validateLimitOrderDraft({ side: 'Long', mark: 0.2, limitPrice: '' }).ok).toBe(false)
    expect(validateLimitOrderDraft({ side: 'Long', mark: 0.2, limitPrice: '-1' }).ok).toBe(false)
  })
  it('returns the parsed price', () => {
    expect(validateLimitOrderDraft({ side: 'Long', mark: 0.2, limitPrice: '0.15' }).limitPrice).toBe(0.15)
  })
})

describe('evaluateLimitOrderTrigger', () => {
  it('Long fires at or below the limit, Short at or above', () => {
    expect(evaluateLimitOrderTrigger({ side: 'Long', limitPrice: 0.19, price: 0.19 })).toBe(true)
    expect(evaluateLimitOrderTrigger({ side: 'Long', limitPrice: 0.19, price: 0.18 })).toBe(true)
    expect(evaluateLimitOrderTrigger({ side: 'Long', limitPrice: 0.19, price: 0.191 })).toBe(false)
    expect(evaluateLimitOrderTrigger({ side: 'Short', limitPrice: 0.21, price: 0.21 })).toBe(true)
    expect(evaluateLimitOrderTrigger({ side: 'Short', limitPrice: 0.21, price: 0.209 })).toBe(false)
  })
  it('never fires on a dead feed', () => {
    expect(evaluateLimitOrderTrigger({ side: 'Long', limitPrice: 0.19, price: 0 })).toBe(false)
    expect(evaluateLimitOrderTrigger({ side: 'Short', limitPrice: 0, price: 1 })).toBe(false)
  })
})
