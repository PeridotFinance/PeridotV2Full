import { describe, it, expect } from 'vitest'
import { friendlyTxError, friendlyTxErrorOrGeneric } from '@/lib/tx-errors'

const GENERIC = 'Something went wrong. Please try again.'

describe('friendlyTxError', () => {
  it('returns null for empty input so the UI can hide the row', () => {
    expect(friendlyTxError(null)).toBeNull()
    expect(friendlyTxError(undefined)).toBeNull()
    expect(friendlyTxError('   ')).toBeNull()
  })

  it('never leaks a raw viem / RPC error blob (the regression from the screenshot)', () => {
    // The exact shape that leaked into the Easy-mode deposit sheet: a JSON-RPC
    // payload + RPC URL carrying the Alchemy API key + viem version banner.
    const raw = [
      'HTTP request failed. Status: 400',
      'URL: https://bnb-mainnet.g.alchemy.com/v2/demo-key',
      'Request body: {"method":"wallet_sendTransaction","params":[]}',
      'Contract Call: address 0x1A726... function mint(uint256 mintAmount)',
      'ContractFunctionExecutionError',
      'Details: {"code":-32602,"message":"Unsupported method wallet_sendTransaction."}',
      'Version: viem@2.33.2',
    ].join('\n')

    const out = friendlyTxError(raw)
    expect(out).toBe(GENERIC)
    // Hard guarantees: no API key, no URL, no method names reach the UI.
    expect(out).not.toContain('alchemy')
    expect(out).not.toContain('NoAAqI2NHNL8')
    expect(out).not.toContain('wallet_sendTransaction')
    expect(out).not.toContain('viem')
  })

  it('maps known conditions to friendly copy', () => {
    expect(friendlyTxError('User rejected the request')).toBe('Cancelled.')
    expect(friendlyTxError('insufficient balance for transfer')).toBe(
      'Not enough balance to cover this deposit.',
    )
    expect(friendlyTxError('INSUFFICIENT_FOR_FEE_BUDGET')).toBe(
      'Not enough balance to cover this deposit.',
    )
    expect(friendlyTxError('429 too many requests')).toMatch(/wait a moment/i)
    expect(friendlyTxError('request timed out')).toMatch(/took too long/i)
  })

  it('passes through short, already-clean messages unchanged', () => {
    expect(friendlyTxError('Please enter a valid amount')).toBe('Please enter a valid amount')
  })

  it('collapses anything over-long or machine-shaped to the generic fallback', () => {
    expect(friendlyTxError('x'.repeat(200))).toBe(GENERIC)
    expect(friendlyTxError('execution reverted: SafeMath')).toBe(GENERIC)
    expect(friendlyTxError('see https://example.com/docs')).toBe(GENERIC)
  })

  it('friendlyTxErrorOrGeneric never returns null', () => {
    expect(friendlyTxErrorOrGeneric(null)).toBe(GENERIC)
    expect(friendlyTxErrorOrGeneric('')).toBe(GENERIC)
  })
})
