/**
 * SSE frame parser — pure string helpers, no DOM or network dependencies.
 *
 * Used by `useAgentActivityStream` on the client and by the P6 test suite.
 * Keeping this file side-effect-free lets tests import it without dragging
 * in wallet / wagmi initialization.
 */

export interface ParsedFrame {
  event: string
  data: unknown
}

/**
 * Parse a single SSE frame (everything between two consecutive `\n\n`
 * separators). Returns null on malformed data so callers can silently skip
 * garbage without crashing the stream.
 */
export function parseFrame(frame: string): ParsedFrame | null {
  const lines = frame.split('\n')
  let event = 'message'
  const dataLines: string[] = []
  for (const line of lines) {
    if (line.startsWith(':')) continue // SSE comment
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return null
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) }
  } catch {
    return null
  }
}

/**
 * Split an incoming string buffer into complete frames. Returns the parsed
 * frames and a `remainder` string holding any partial frame at the end of
 * the buffer (waiting for the next `read()` to complete it). Guarantees
 * that callers never double-process or drop bytes across reads.
 */
export function takeCompleteFrames(buffer: string): {
  frames: ParsedFrame[]
  remainder: string
} {
  const frames: ParsedFrame[] = []
  let buf = buffer
  let idx: number
  while ((idx = buf.indexOf('\n\n')) !== -1) {
    const frame = buf.slice(0, idx)
    buf = buf.slice(idx + 2)
    const parsed = parseFrame(frame)
    if (parsed) frames.push(parsed)
  }
  return { frames, remainder: buf }
}
