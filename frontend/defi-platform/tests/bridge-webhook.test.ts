/**
 * Unit tests — Bridge webhook RSA signature verification (lib/bridge/webhook.ts)
 *
 * Generates a throwaway RSA keypair and signs payloads exactly the way Bridge
 * does (`"<timestamp>.<rawBody>"`, RSA-SHA256) so the verifier is exercised for
 * real — no mocking of crypto.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import crypto from 'crypto'
import {
  verifyWebhookSignature,
  parseWebhookEvent,
} from '@/lib/bridge/webhook'

let publicKeyPem: string
let privateKey: crypto.KeyObject

beforeAll(() => {
  const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  privateKey = pair.privateKey
  publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
})

function sign(timestamp: number, rawBody: string): string {
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(`${timestamp}.${rawBody}`)
  signer.end()
  return signer.sign(privateKey, 'base64')
}

function header(timestamp: number, signature: string): string {
  return `t=${timestamp},v0=${signature}`
}

const BODY = JSON.stringify({ event_id: 'wh_1', event_category: 'customer' })

describe('verifyWebhookSignature', () => {
  it('accepts a correctly signed, fresh delivery', () => {
    const ts = Date.now()
    const result = verifyWebhookSignature(header(ts, sign(ts, BODY)), BODY, {
      publicKey: publicKeyPem,
    })
    expect(result.valid).toBe(true)
  })

  it('rejects a tampered body', () => {
    const ts = Date.now()
    const sig = sign(ts, BODY)
    const result = verifyWebhookSignature(header(ts, sig), BODY + ' ', {
      publicKey: publicKeyPem,
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/mismatch/i)
  })

  it('rejects a delivery outside the freshness window', () => {
    const ts = Date.now() - 20 * 60 * 1000 // 20 min old
    const result = verifyWebhookSignature(header(ts, sign(ts, BODY)), BODY, {
      publicKey: publicKeyPem,
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/tolerance/i)
  })

  it('respects a custom tolerance and "now"', () => {
    const ts = 1_000_000
    const result = verifyWebhookSignature(header(ts, sign(ts, BODY)), BODY, {
      publicKey: publicKeyPem,
      now: ts + 5_000,
      toleranceMs: 10_000,
    })
    expect(result.valid).toBe(true)
  })

  it('rejects a malformed or missing header', () => {
    expect(
      verifyWebhookSignature('garbage', BODY, { publicKey: publicKeyPem }).valid,
    ).toBe(false)
    expect(
      verifyWebhookSignature(null, BODY, { publicKey: publicKeyPem }).valid,
    ).toBe(false)
    expect(
      verifyWebhookSignature('t=,v0=', BODY, { publicKey: publicKeyPem }).valid,
    ).toBe(false)
  })

  it('rejects when no public key is configured', () => {
    const ts = Date.now()
    const result = verifyWebhookSignature(header(ts, sign(ts, BODY)), BODY, {
      publicKey: null,
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/not configured/i)
  })

  it('rejects a signature made by a different key', () => {
    const otherKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    const ts = Date.now()
    const signer = crypto.createSign('RSA-SHA256')
    signer.update(`${ts}.${BODY}`)
    signer.end()
    const foreignSig = signer.sign(otherKey.privateKey, 'base64')
    const result = verifyWebhookSignature(header(ts, foreignSig), BODY, {
      publicKey: publicKeyPem,
    })
    expect(result.valid).toBe(false)
  })
})

describe('parseWebhookEvent', () => {
  it('parses a JSON body into a typed event', () => {
    const event = parseWebhookEvent(BODY)
    expect(event.event_id).toBe('wh_1')
    expect(event.event_category).toBe('customer')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseWebhookEvent('not json')).toThrow()
  })
})
