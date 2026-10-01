"use client"

import { useEffect, useMemo, useState } from "react"
import { usePostHog } from "posthog-js/react"
import { captureInsightsEvent, getInsightsSessionId } from "@/components/insights/analytics"

const reactions = [
  { id: "love", label: "Love" },
  { id: "helpful", label: "Helpful" },
  { id: "neutral", label: "Neutral" },
  { id: "unclear", label: "Unclear" },
]

type Aggregate = Record<"love" | "helpful" | "neutral" | "unclear", number>
const emptyAggregate: Aggregate = { love: 0, helpful: 0, neutral: 0, unclear: 0 }

export function ArticleFeedback({ articleId, articleSlug }: { articleId: string; articleSlug: string }) {
  const posthog = usePostHog()
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [aggregate, setAggregate] = useState<Aggregate>(emptyAggregate)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch(`/api/insights/feedback?articleId=${encodeURIComponent(articleId)}`, { cache: "no-store" })
        if (!response.ok) return
        const json = (await response.json()) as { aggregate?: Aggregate }
        if (!cancelled && json.aggregate) setAggregate(json.aggregate)
      } catch {
        // Ignore aggregate read failures.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [articleId])

  const totalVotes = useMemo(() => Object.values(aggregate).reduce((sum, count) => sum + count, 0), [aggregate])

  const submit = async (reaction: { id: string; label: string }) => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setSubmitted(reaction.id)
    captureInsightsEvent(posthog, "insights_feedback_submit", { articleSlug, reaction: reaction.id })
    try {
      const response = await fetch("/api/insights/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-insights-session-id": getInsightsSessionId(),
        },
        body: JSON.stringify({
          articleId,
          articleSlug,
          reaction: reaction.id,
          sessionId: getInsightsSessionId(),
        }),
      })
      if (!response.ok) return
      const json = (await response.json()) as { aggregate?: Aggregate }
      if (json.aggregate) setAggregate(json.aggregate)
    } catch {
      // Non-blocking feedback write.
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="insights-feedback" aria-label="Article Feedback">
      <h3>Was this article helpful?</h3>
      <div className="insights-feedback__row">
        {reactions.map((reaction) => (
          <button
            key={reaction.id}
            type="button"
            className={`insights-feedback__btn ${submitted === reaction.id ? "is-selected" : ""}`}
            onClick={() => submit(reaction)}
            aria-pressed={submitted === reaction.id}
            disabled={isSubmitting}
          >
            {reaction.label} ({aggregate[reaction.id as keyof Aggregate] ?? 0})
          </button>
        ))}
      </div>
      <p className="insights-feedback__meta">{totalVotes} Votes</p>
    </section>
  )
}
