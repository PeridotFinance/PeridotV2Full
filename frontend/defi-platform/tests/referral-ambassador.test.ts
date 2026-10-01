import { describe, it, expect } from 'vitest'
import {
  AMBASSADOR_PROGRAM,
  holdDaysFrom,
  toProgress,
} from '@/lib/referral/ambassador'

const day = (iso: string) => new Date(`${iso}T12:00:00Z`)

describe('holdDaysFrom', () => {
  it('counts the first day as day 1', () => {
    expect(holdDaysFrom('2026-08-01', day('2026-08-01'))).toBe(1)
  })

  it('counts inclusive calendar days, not 24h blocks', () => {
    expect(holdDaysFrom('2026-08-01', day('2026-08-30'))).toBe(30)
  })

  it('is zero with no streak running', () => {
    expect(holdDaysFrom(null, day('2026-08-30'))).toBe(0)
  })
})

describe('toProgress', () => {
  it('reports "no deposit" before anything is supplied', () => {
    const p = toProgress({ last_supply_usd: 0, last_checked_at: '2026-08-25' })
    expect(p.stage).toBe('no_deposit')
    expect(p.holdDays).toBe(0)
    expect(p.daysRemaining).toBe(AMBASSADOR_PROGRAM.holdDays)
  })

  it('reports "below" while the balance is under the threshold', () => {
    const p = toProgress({ last_supply_usd: 40 })
    expect(p.stage).toBe('below')
    expect(p.qualified).toBe(false)
  })

  it('keeps counting between sweeps instead of freezing on the stored day', () => {
    const started = new Date()
    started.setUTCDate(started.getUTCDate() - 9)
    const p = toProgress({
      last_supply_usd: 250,
      hold_streak_started_on: started.toISOString().slice(0, 10),
      // The last sweep wrote 5; the live count from the start date is 10.
      hold_streak_days: 5,
    })
    expect(p.stage).toBe('holding')
    expect(p.holdDays).toBe(10)
    expect(p.daysRemaining).toBe(AMBASSADOR_PROGRAM.holdDays - 10)
  })

  it('never reports more than the required number of days', () => {
    const started = new Date()
    started.setUTCDate(started.getUTCDate() - 200)
    const p = toProgress({
      last_supply_usd: 250,
      hold_streak_started_on: started.toISOString().slice(0, 10),
      hold_streak_days: 200,
    })
    expect(p.holdDays).toBe(AMBASSADOR_PROGRAM.holdDays)
  })

  it('locks to qualified once the reward is booked, whatever the balance now says', () => {
    const p = toProgress({
      last_supply_usd: 0,
      hold_streak_started_on: null,
      qualified_at: '2026-08-20T10:00:00Z',
    })
    expect(p.stage).toBe('qualified')
    expect(p.qualified).toBe(true)
    expect(p.holdDays).toBe(AMBASSADOR_PROGRAM.holdDays)
    expect(p.daysRemaining).toBe(0)
  })

  it('distinguishes "not checked yet" from "checked, zero"', () => {
    expect(toProgress({}).supplyUsd).toBeNull()
    expect(toProgress({ last_supply_usd: 0 }).supplyUsd).toBe(0)
  })
})
