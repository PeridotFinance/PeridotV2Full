/**
 * Provider-neutral token count estimator.
 *
 * We deliberately avoid shipping a real tokenizer (tiktoken adds ~2MB of WASM
 * and pins us to OpenAI tokenization). Instead, a conservative character-based
 * heuristic: ~3.5 chars/token for English + code mix. That overestimates by
 * 10–15%, which is the direction you want when sizing a context budget.
 *
 * If/when this becomes a bottleneck, swap the implementation here — the
 * rest of the codebase only calls the exported functions.
 */

/** Rough token count for a raw string. */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 3.5)
}

/** Tokens for one chat message, including per-message framing overhead. */
export function estimateMessageTokens(msg: { role: string; content: string }): number {
  return 4 + estimateTokens(msg.role) + estimateTokens(msg.content)
}

/** Total tokens for a conversation slice plus a small reply-primer allowance. */
export function estimateMessagesTokens(
  msgs: ReadonlyArray<{ role: string; content: string }>,
): number {
  let sum = 2 // chat reply primer (openai-style overhead)
  for (const m of msgs) sum += estimateMessageTokens(m)
  return sum
}
