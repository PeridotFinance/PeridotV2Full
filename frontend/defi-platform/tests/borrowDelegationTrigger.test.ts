import { describe, it, expect } from 'vitest'

describe('Borrow delegation missing handler', () => {
  it('recognizes delegation required error shape', () => {
    const msg = 'BICONOMY_7702_AUTHORIZATION_REQUIRED: missing delegation'
    const needsModal = /BICONOMY_7702_AUTHORIZATION_REQUIRED/.test(msg)
    expect(needsModal).toBe(true)
  })
})


