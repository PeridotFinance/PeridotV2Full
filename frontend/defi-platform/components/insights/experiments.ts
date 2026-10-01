"use client"

import { getInsightsSessionId } from "@/components/insights/analytics"

export type HeroReadabilityVariant = "control" | "concise"
export type CardDensityVariant = "control" | "compact"
export type GlossaryCueVariant = "control" | "intense"

export interface InsightsExperimentAssignment {
  expD1HeroReadability: HeroReadabilityVariant
  expD2CardDensity: CardDensityVariant
  expD4GlossaryCue: GlossaryCueVariant
}

function hashToBucket(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  }
  return hash % 100
}

function pickVariant<T extends string>(seed: string, experimentKey: string, rules: Array<{ max: number; value: T }>): T {
  const bucket = hashToBucket(`${seed}:${experimentKey}`)
  for (const rule of rules) {
    if (bucket < rule.max) return rule.value
  }
  return rules[rules.length - 1].value
}

export function getInsightsExperimentAssignment(): InsightsExperimentAssignment {
  const sessionId = getInsightsSessionId()
  return {
    expD1HeroReadability: pickVariant(sessionId, "EXP-D1", [
      { max: 50, value: "control" },
      { max: 100, value: "concise" },
    ]),
    expD2CardDensity: pickVariant(sessionId, "EXP-D2", [
      { max: 50, value: "control" },
      { max: 100, value: "compact" },
    ]),
    expD4GlossaryCue: pickVariant(sessionId, "EXP-D4", [
      { max: 50, value: "control" },
      { max: 100, value: "intense" },
    ]),
  }
}
