'use client'

import { MarkdownText } from '@/components/agents/chat/MarkdownText'

interface TextBlockProps {
  content: string
}

/**
 * Renders a text block inside an assistant message. No wrapper container —
 * sits as a "whisper" alongside Perry's avatar so block-typed messages
 * inherit the same hybrid look as plain-text answers (containers come from
 * data-bearing blocks like PoolTable / Allocation, not from text).
 */
export function TextBlock({ content }: TextBlockProps) {
  return <MarkdownText content={content} variant="whisper" />
}
