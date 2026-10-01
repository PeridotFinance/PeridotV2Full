import { describe, it, expect } from 'vitest'
import { isInternalHost, surfaceFor, shouldInitAnalytics } from '@/lib/analytics/host'

describe('analytics host classification', () => {
  it('treats local development hosts as internal', () => {
    for (const h of ['localhost', '127.0.0.1', '[::1]', 'peridot.local', 'app.localhost']) {
      expect(isInternalHost(h)).toBe(true)
    }
  })

  it('treats the real Peridot hosts as external', () => {
    for (const h of ['peridot.finance', 'www.peridot.finance', 'v1.peridot.finance']) {
      expect(isInternalHost(h)).toBe(false)
    }
  })

  it('labels v1 separately from the public app', () => {
    expect(surfaceFor('peridot.finance')).toBe('app')
    expect(surfaceFor('www.peridot.finance')).toBe('app')
    expect(surfaceFor('v1.peridot.finance')).toBe('v1')
    expect(surfaceFor('localhost')).toBe('preview')
  })

  it('is case-insensitive, because hostnames are', () => {
    expect(isInternalHost('LOCALHOST')).toBe(true)
    expect(surfaceFor('V1.Peridot.Finance')).toBe('v1')
  })

  // The whole point: a developer's session must not land in the production
  // project, but someone debugging the analytics wiring can opt back in.
  it('keeps local traffic out unless explicitly allowed', () => {
    expect(shouldInitAnalytics('localhost', false)).toBe(false)
    expect(shouldInitAnalytics('localhost', true)).toBe(true)
    expect(shouldInitAnalytics('peridot.finance', false)).toBe(true)
  })
})
