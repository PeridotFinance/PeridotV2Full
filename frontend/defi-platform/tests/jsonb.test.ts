/**
 * Unit tests — jsonb column coercion (lib/jsonb.ts)
 *
 * Guards the class of bug that took the Bridge on-ramp down for every user:
 * postgres.js double-encodes any JS *string* handed to a jsonb column, so the
 * column holds a JSON string and `row.col.field` silently reads `undefined`.
 */

import { describe, it, expect } from 'vitest'
import { jsonbArray, jsonbObject, jsonbValue } from '@/lib/jsonb'

describe('jsonbObject', () => {
  it('passes a real object through untouched', () => {
    const obj = { sepa: 'approved' }
    expect(jsonbObject(obj)).toBe(obj)
  })

  it('decodes the double-encoded string form', () => {
    expect(jsonbObject('{"sepa":"approved","base":"approved"}')).toEqual({
      sepa: 'approved',
      base: 'approved',
    })
  })

  it('falls back for null, undefined and unparseable input', () => {
    expect(jsonbObject(null)).toEqual({})
    expect(jsonbObject(undefined)).toEqual({})
    expect(jsonbObject('{not json')).toEqual({})
  })

  it('honours an explicit fallback', () => {
    expect(jsonbObject(null, { a: 1 })).toEqual({ a: 1 })
  })

  it('never yields a spreadable string — the corruption this prevents', () => {
    // `{...'{"a":1}'}` would produce {0:'{',1:'"',...}; every caller that
    // shallow-merges metadata depended on this not happening.
    const merged = { ...jsonbObject('{"a":1}'), b: 2 }
    expect(merged).toEqual({ a: 1, b: 2 })
    expect(Object.keys({ ...jsonbObject('nonsense') })).toEqual([])
  })

  it('rejects arrays and scalars so spreads stay safe', () => {
    expect(jsonbObject('[1,2,3]')).toEqual({})
    expect(jsonbObject('"plain"')).toEqual({})
    expect(jsonbObject('42')).toEqual({})
  })
})

describe('jsonbArray', () => {
  it('passes a real array through and decodes the string form', () => {
    expect(jsonbArray([1, 2])).toEqual([1, 2])
    expect(jsonbArray('[{"assetId":"usdc"}]')).toEqual([{ assetId: 'usdc' }])
  })

  it('falls back for objects, nullish and unparseable input', () => {
    expect(jsonbArray('{"a":1}')).toEqual([])
    expect(jsonbArray(null)).toEqual([])
    expect(jsonbArray('nope')).toEqual([])
  })
})

describe('jsonbValue', () => {
  it('preserves arrays, objects and scalars alike', () => {
    expect(jsonbValue('[1,2]')).toEqual([1, 2])
    expect(jsonbValue('{"a":1}')).toEqual({ a: 1 })
    expect(jsonbValue('42')).toBe(42)
    expect(jsonbValue('"txt"')).toBe('txt')
  })

  it('returns the fallback only when decoding fails', () => {
    expect(jsonbValue('nope', 'fb')).toBe('fb')
    expect(jsonbValue(null)).toBe(null)
  })
})
