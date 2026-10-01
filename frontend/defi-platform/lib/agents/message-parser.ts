/**
 * Parses Anthropic streaming events into our ContentBlock format.
 * Handles text accumulation and tool result → block conversion.
 */

import type { ContentBlock, TextBlock, StreamEvent } from '@/types/agents'

/**
 * Accumulates streaming text deltas and tool results into an ordered
 * array of ContentBlocks. Text segments between tool results become
 * separate TextBlocks.
 */
export class MessageBlockAccumulator {
  private blocks: ContentBlock[] = []
  private currentText = ''

  /** Append a text delta to the current text segment */
  appendText(delta: string): void {
    this.currentText += delta
  }

  /** Flush any accumulated text into a TextBlock, then add the given block */
  addBlock(block: ContentBlock): void {
    this.flushText()
    this.blocks.push(block)
  }

  /** Get the full accumulated plain-text content (for DB storage) */
  getPlainContent(): string {
    const textParts: string[] = []
    for (const block of this.blocks) {
      if (block.type === 'text') {
        textParts.push(block.content)
      }
    }
    if (this.currentText.trim()) {
      textParts.push(this.currentText)
    }
    return textParts.join('\n\n')
  }

  /** Finalize: flush remaining text and return all blocks */
  finalize(): ContentBlock[] {
    this.flushText()
    return [...this.blocks]
  }

  /**
   * Flush any accumulated text as a TextBlock and return it (or null if no
   * pending text). Public counterpart to the internal flush — lets the route
   * forward the just-flushed block over the SSE wire so the client can put
   * it in `blocks[]` instead of leaving it stranded in `streamingText`. Without
   * this, the optimistic insert at `done` would drop trailing/inter-block
   * text (the persisted row has it; the optimistic mirror didn't).
   */
  flushTextAsBlock(): TextBlock | null {
    if (!this.currentText.trim()) return null
    const block: TextBlock = {
      type: 'text',
      content: this.currentText.trim(),
    }
    this.blocks.push(block)
    this.currentText = ''
    return block
  }

  private flushText(): void {
    if (this.currentText.trim()) {
      const textBlock: TextBlock = {
        type: 'text',
        content: this.currentText.trim(),
      }
      this.blocks.push(textBlock)
      this.currentText = ''
    }
  }
}

/**
 * Parse a raw SSE line (after stripping "data: " prefix) into a StreamEvent.
 * Returns null for empty lines or parse errors.
 */
export function parseSSELine(line: string): StreamEvent | null {
  if (!line || line.trim() === '') return null

  try {
    const parsed = JSON.parse(line)

    if (parsed.type === 'text_delta' && typeof parsed.delta === 'string') {
      return { type: 'text_delta', delta: parsed.delta }
    }

    if (parsed.type === 'block' && parsed.block) {
      return { type: 'block', block: parsed.block }
    }

    if (parsed.type === 'done') {
      return { type: 'done', messageId: parsed.messageId || '' }
    }

    if (parsed.type === 'error') {
      return { type: 'error', message: parsed.message || 'Unknown error' }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Create an SSE-formatted event string from a StreamEvent.
 */
export function formatSSEEvent(event: StreamEvent): string {
  try {
    return `data: ${JSON.stringify(event)}\n\n`
  } catch {
    return `data: ${JSON.stringify({ type: 'error', message: 'Serialization error' })}\n\n`
  }
}
