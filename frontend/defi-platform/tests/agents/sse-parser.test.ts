/**
 * P6 — SSE parser edge cases.
 *
 * The activity stream parser handles:
 *   - Multi-line `data:` fields (JSON.stringify output rarely needs it,
 *     but the spec permits it and some proxies rewrite)
 *   - Comment lines (`:heartbeat`) which MUST be ignored
 *   - Partial frames split across TCP reads (remainder buffer)
 *   - Malformed JSON in a single frame without killing the stream
 *   - Missing `event:` defaults to `message`
 */

import { describe, it, expect } from 'vitest'
import { parseFrame, takeCompleteFrames } from '@/lib/agents/sse-parser'

describe('parseFrame', () => {
  it('parses a standard action_event frame', () => {
    const frame = 'event: action_event\ndata: {"actionId":"a-1","toStatus":"succeeded"}'
    const r = parseFrame(frame)
    expect(r?.event).toBe('action_event')
    expect((r?.data as any).actionId).toBe('a-1')
    expect((r?.data as any).toStatus).toBe('succeeded')
  })

  it('defaults event to "message" when no event: line is present', () => {
    const r = parseFrame('data: {"x":1}')
    expect(r?.event).toBe('message')
  })

  it('ignores SSE comment lines (starting with ":")', () => {
    const r = parseFrame(':keepalive\nevent: ping\ndata: {"ts":"2026-04-22"}')
    expect(r?.event).toBe('ping')
  })

  it('returns null when no data: line is present', () => {
    expect(parseFrame('event: ping')).toBeNull()
    expect(parseFrame(':comment-only')).toBeNull()
  })

  it('returns null on malformed JSON rather than throwing', () => {
    expect(parseFrame('event: action_event\ndata: {broken')).toBeNull()
  })

  it('joins multiple data: lines with a newline per SSE spec', () => {
    const r = parseFrame('event: snapshot\ndata: {"a":1,\ndata: "b":"x"}')
    expect((r?.data as any).a).toBe(1)
    expect((r?.data as any).b).toBe('x')
  })
})

describe('takeCompleteFrames', () => {
  it('splits a buffer into complete frames and leaves a partial remainder', () => {
    const buf = [
      'event: ping',
      'data: {"ts":"t1"}',
      '',                      // end of frame 1
      'event: action_event',
      'data: {"actionId":"a-1"',   // partial — no closing brace yet
    ].join('\n')

    const { frames, remainder } = takeCompleteFrames(buf)
    expect(frames).toHaveLength(1)
    expect(frames[0].event).toBe('ping')
    expect(remainder).toContain('"actionId":"a-1"')
  })

  it('parses two back-to-back frames in one read', () => {
    const buf =
      'event: a\ndata: {"n":1}\n\n' +
      'event: b\ndata: {"n":2}\n\n'
    const { frames, remainder } = takeCompleteFrames(buf)
    expect(frames).toHaveLength(2)
    expect(frames[0].event).toBe('a')
    expect(frames[1].event).toBe('b')
    expect(remainder).toBe('')
  })

  it('drops malformed frames silently instead of blocking', () => {
    const buf =
      'event: bad\ndata: {broken\n\n' +        // malformed → skipped
      'event: good\ndata: {"ok":true}\n\n'     // valid → emitted
    const { frames } = takeCompleteFrames(buf)
    expect(frames).toHaveLength(1)
    expect(frames[0].event).toBe('good')
  })

  it('returns empty frames + full remainder when nothing complete', () => {
    const buf = 'event: a\ndata: {incomplete'
    const { frames, remainder } = takeCompleteFrames(buf)
    expect(frames).toHaveLength(0)
    expect(remainder).toBe(buf)
  })
})
