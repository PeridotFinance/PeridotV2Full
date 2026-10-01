import { describe, it, expect } from 'vitest'
import {
  isValidRecipient,
  validateSendAmount,
  formatSendAmount,
  shortenAddress,
  friendlyEvmError,
  friendlyStellarError,
  memoByteLength,
  validateMemo,
} from '@/lib/send/validation'

const EVM_ADDR = '0x1111111111111111111111111111111111111111'
const STELLAR_ADDR = 'G' + 'A'.repeat(55)

describe('isValidRecipient', () => {
  it('accepts a well-formed EVM address', () => {
    expect(isValidRecipient('evm', EVM_ADDR)).toBe(true)
    expect(isValidRecipient('evm', `  ${EVM_ADDR}  `)).toBe(true)
  })

  it('rejects malformed EVM addresses and cross-family addresses', () => {
    expect(isValidRecipient('evm', '0x123')).toBe(false)
    expect(isValidRecipient('evm', 'not-an-address')).toBe(false)
    expect(isValidRecipient('evm', STELLAR_ADDR)).toBe(false)
    expect(isValidRecipient('evm', '')).toBe(false)
  })

  it('accepts a well-formed Stellar account address', () => {
    expect(isValidRecipient('stellar', STELLAR_ADDR)).toBe(true)
  })

  it('rejects malformed Stellar addresses and cross-family addresses', () => {
    expect(isValidRecipient('stellar', 'GABC')).toBe(false)
    expect(isValidRecipient('stellar', STELLAR_ADDR.toLowerCase())).toBe(false)
    expect(isValidRecipient('stellar', EVM_ADDR)).toBe(false)
    // Contract addresses (C…) are not valid send recipients.
    expect(isValidRecipient('stellar', 'C' + 'A'.repeat(55))).toBe(false)
  })
})

describe('validateSendAmount', () => {
  // 10 tokens at 6 decimals.
  const balance = BigInt(10_000_000)

  it('treats an empty input as not-yet-valid without an error', () => {
    expect(validateSendAmount('', 6, balance)).toEqual({ valid: false, error: null })
    expect(validateSendAmount('   ', 6, balance)).toEqual({ valid: false, error: null })
  })

  it('rejects non-numeric input', () => {
    const r = validateSendAmount('abc', 6, balance)
    expect(r.valid).toBe(false)
    expect(r.error).toBe('Enter a valid amount.')
  })

  it('rejects zero and negative-equivalent amounts', () => {
    expect(validateSendAmount('0', 6, balance).error).toBe('Amount must be greater than 0.')
  })

  it('rejects amounts above the available balance', () => {
    const r = validateSendAmount('20', 6, balance)
    expect(r.valid).toBe(false)
    expect(r.error).toBe('More than your available balance.')
  })

  it('accepts a valid in-range amount', () => {
    expect(validateSendAmount('5', 6, balance)).toEqual({ valid: true, error: null })
    expect(validateSendAmount('10', 6, balance)).toEqual({ valid: true, error: null })
    expect(validateSendAmount('1.5', 6, balance)).toEqual({ valid: true, error: null })
  })

  it('respects token decimals when parsing', () => {
    // 1 unit at 7 decimals (Stellar) === 10_000_000 raw.
    expect(validateSendAmount('1', 7, BigInt(10_000_000)).valid).toBe(true)
    expect(validateSendAmount('1.0000001', 7, BigInt(10_000_000)).error).toBe(
      'More than your available balance.',
    )
  })
})

describe('formatSendAmount', () => {
  it('formats zero and empty values', () => {
    expect(formatSendAmount(0)).toBe('0')
    expect(formatSendAmount('')).toBe('0')
  })

  it('collapses dust amounts', () => {
    expect(formatSendAmount(0.00001)).toBe('<0.0001')
  })

  it('keeps small and whole amounts readable', () => {
    expect(formatSendAmount(5)).toBe('5')
    expect(formatSendAmount(0.5)).toBe('0.5')
  })
})

describe('shortenAddress', () => {
  it('leaves short strings untouched', () => {
    expect(shortenAddress('0x1234')).toBe('0x1234')
  })

  it('shortens long addresses', () => {
    expect(shortenAddress(EVM_ADDR)).toBe('0x1111…1111')
  })
})

describe('friendlyEvmError', () => {
  it('maps user rejection', () => {
    expect(friendlyEvmError('User rejected the request')).toBe('The transaction was cancelled.')
  })

  it('maps insufficient funds', () => {
    expect(friendlyEvmError('insufficient funds for gas')).toBe(
      'Not enough balance to complete this transfer.',
    )
  })

  it('passes through unknown errors and falls back when empty', () => {
    expect(friendlyEvmError('weird rpc error')).toBe('weird rpc error')
    expect(friendlyEvmError('')).toBe('An unknown error occurred.')
  })
})

describe('friendlyStellarError', () => {
  it('maps user rejection', () => {
    expect(friendlyStellarError('User declined access')).toBe('The transaction was cancelled.')
  })

  it('maps missing trustline', () => {
    expect(friendlyStellarError('op_no_trustline')).toContain('trustline')
    expect(friendlyStellarError('trust line not found')).toContain('trustline')
  })

  it('maps insufficient balance and missing accounts', () => {
    expect(friendlyStellarError('underfunded')).toBe(
      'Not enough balance to complete this transfer.',
    )
    expect(friendlyStellarError('account not found')).toBe(
      "The recipient account doesn't exist yet on the Stellar network.",
    )
  })

  it('passes through unknown errors and falls back when empty', () => {
    expect(friendlyStellarError('weird ledger error')).toBe('weird ledger error')
    expect(friendlyStellarError('')).toBe('An unknown error occurred.')
  })
})

describe('validateMemo', () => {
  it('treats an empty memo as valid — most transfers need none', () => {
    expect(validateMemo('text', '')).toEqual({ valid: true, error: null })
    expect(validateMemo('text', '   ')).toEqual({ valid: true, error: null })
    expect(validateMemo('id', '')).toEqual({ valid: true, error: null })
  })

  it('accepts a text memo up to 28 bytes and rejects longer ones', () => {
    expect(validateMemo('text', 'x'.repeat(28)).valid).toBe(true)
    const tooLong = validateMemo('text', 'x'.repeat(29))
    expect(tooLong.valid).toBe(false)
    expect(tooLong.error).toContain('29')
  })

  it('counts text memo length in bytes, not characters', () => {
    // 15 two-byte chars fit `length <= 28` but not the protocol's 28 bytes.
    expect(memoByteLength('é'.repeat(15))).toBe(30)
    expect(validateMemo('text', 'é'.repeat(15)).valid).toBe(false)
  })

  it('requires digits for an ID memo', () => {
    expect(validateMemo('id', '1234567890').valid).toBe(true)
    expect(validateMemo('id', ' 42 ').valid).toBe(true)
    expect(validateMemo('id', 'abc').valid).toBe(false)
    expect(validateMemo('id', '12.5').valid).toBe(false)
    expect(validateMemo('id', '-1').valid).toBe(false)
  })

  it('rejects an ID above uint64', () => {
    expect(validateMemo('id', '18446744073709551615').valid).toBe(true)
    expect(validateMemo('id', '18446744073709551616').valid).toBe(false)
  })

  it('lets a long numeric string through as text — only ID is range-bound', () => {
    expect(validateMemo('text', '18446744073709551616').valid).toBe(true)
  })
})
