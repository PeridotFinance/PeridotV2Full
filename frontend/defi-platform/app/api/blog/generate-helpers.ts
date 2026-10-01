const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const MODEL_FAST = 'gpt-4.1-mini'   // metadata, FAQ, meta tags
const MODEL_PRO  = 'gpt-4.1'        // outline, long-form article content

// ── Peridot Voice & Style Guide ───────────────────────────────────────────────
// Injected into every Insights content-generation prompt to ensure a consistent
// tone, structure, and reading experience across all articles and authors.
const PERIDOT_VOICE = `
## Peridot Voice & Style

TONE: Direct, peer-to-peer. Write as a knowledgeable friend explaining DeFi — not a textbook, not a sales pitch. Assume curiosity, not prior knowledge.

ANALOGY RULE: Every technical concept must be preceded by a physical or everyday analogy BEFORE the technical term is introduced. Structure: "[Analogy]. [Technical term] works the same way." Example: "Think of collateral like a security deposit on an apartment — the protocol holds it while you have an outstanding loan. That deposit is collateral."

DEFINITIONS: Define every term on first use in plain parentheses immediately after. Example: "liquidation (when the protocol automatically sells your collateral to cover your debt)"

NUMBERS: Always ground abstract concepts in realistic ranges. Write "typically 70%–85% LTV" not "a high ratio." Use ranges, not single values. If a figure may change over time, add "(as of writing)".

SENTENCE RHYTHM: Vary length deliberately. Short sentences for impact, emphasis, conclusions. Longer sentences for nuance, mechanism, cause-and-effect. Never chain more than two dependent clauses in one sentence.

SECTION STRUCTURE: Each section must follow this arc — Context (what is this?), Mechanism (how does it work?), Implication (why does this matter to the reader?), Action (what should the reader do or watch for?).

PARAGRAPHS: 2–4 sentences per paragraph. Each paragraph covers exactly one idea. Never start consecutive paragraphs with the same word.

TRANSITIONS: The last sentence of every section must either (a) resolve the central tension introduced in the opening sentence of that section, or (b) pose a question that the very next section answers. Never close a section with a restatement of what was just covered.

PROHIBITED: em-dashes (—) anywhere — in body text, headings, callouts, or any other field. Replace with a comma, period, or rewrite the sentence. Also prohibited: "simply", "just remember", "it's important to note", "in conclusion", "to summarize", "as mentioned", "look no further", passive voice in action instructions, invented protocol names, unsourced specific numbers presented as current fact.
`.trim()

export type BaseInfo = {
  title: string
  slug: string
  excerpt: string
  category: string
  tags: string[]
  keywords: string[]
  primaryKeyword: string
  funnelStage: FunnelStage
  peridotCta: string
  peridotRelevance: "high" | "medium" | "low" | "none"
  actionArticleSuggestion: { title: string; slug: string } | null
  tone: string
  summary: string
}

export type ArticleInfo = {
  content: string
}

export type InsightsPath = "starter" | "yield" | "risk" | "market" | "action"

export type FunnelStage = "awareness" | "consideration" | "conversion"

export type InsightsSectionInfo = {
  heading: string
  /** Each element is a full paragraph (2–4 sentences / 50–150 words). */
  sentences: string[]
  callout: string
  imageUrl?: string
  imageAlt?: string
}

export type VisualType =
  | 'flow-diagram'
  | 'comparison-chart'
  | 'anatomy'
  | 'scale-balance'
  | 'before-after'
  | 'timeline'
  | 'none'

export type SectionPlan = {
  heading: string
  purpose: string
  wordTarget: number
  visualType: VisualType
  visualConcept: string
  transitionHook: string
  keyTerms: string[]
}

export type InsightsOutline = {
  learningObjective: string
  narrativeArc: string
  recommendedDifficulty: 'beginner' | 'intermediate' | 'advanced'
  sectionPlans: SectionPlan[]
}

export type InsightsDraftInfo = {
  path: InsightsPath
  sections: InsightsSectionInfo[]
  content: string
  interactiveBlocks?: InteractiveBlockPlacement[]
}

export type InteractiveBlockPlacement = {
  afterSectionIndex: number  // 0-based; insert this block after sections[afterSectionIndex]
  block: InteractiveBlockSpec
}

// Mirrors InsightsBlock from lib/insights-data.ts but without React imports
export type InteractiveBlockSpec =
  | { type: "calculator"; variant: "health-factor" | "apy-vs-apr" | "yield-return"; label?: string }
  | { type: "predict"; prompt: string; options: string[]; correctIndex: number; reveal: string }
  | { type: "checkpoint"; question: string; options: Array<{ text: string; correct: boolean; explanation: string }> }
  | { type: "jenga"; loanAmount?: number; liqLtv?: number; initialBlocks?: number }
  | { type: "vault-builder"; initialCoins?: Array<"eth" | "btc" | "usdc">; targetCollateral?: number }
  | { type: "borrowing-power"; assets?: Array<"eth" | "btc" | "usdc"> }
  | { type: "leverage-seesaw"; maxLeverage?: number }
  | { type: "rate-highway"; kinkUtilization?: number }
  | { type: "liquidation-dominoes" }
  | { type: "apy-snowball"; rate?: number; months?: number }
  | { type: "position-builder" }

export type MetaInfo = {
  metaTitle: string
  metaDescription: string
  canonicalUrl: string | null
  metaRobots: string
}

export type FAQItem = {
  question: string
  answer: string
}

export type FAQInfo = {
  faq: FAQItem[]
}

export type TopicPlan = {
  validation: {
    isRelevant: boolean
    relevanceScore: number
    relevanceBreakdown: {
      defiRelevance: number
      peridotAlignment: number
      educationalValue: number
      marketDemand: number
      contentGap: number
    }
    recommendedTopics?: string[]
    rejectionReason?: string | null
  }
  direction: {
    recommendedAngle: string
    angleRationale: string
    primaryAngle?: {
      type: string
      description: string
      targetAudience: string
      uniqueValue: string
      peridotConnection: string
      confidence: number
    }
    alternativeAngles?: Array<{
      type: string
      description: string
      targetAudience: string
      uniqueValue: string
      peridotConnection: string
      confidence: number
    }>
  }
  objectives: {
    userIntent: string
    contentObjectives?: {
      educateOn: string[]
      answerQuestions: string[]
      provideExamples: string[]
      includeActionableSteps: boolean
    }
    businessObjectives?: {
      driveTraffic: boolean
      buildAuthority: boolean
      promotePeridot: boolean
      generateLeads: boolean
    }
    userObjectives?: {
      knowledgeLevel: string
      takeawayValue: string
      actionItems: string[]
    }
  }
  recommendations?: string[]
  proceedWithGeneration: boolean
  searchIntent: "informational" | "commercial_investigation" | "transactional" | "navigational"
}

export async function callOpenAI(systemPrompt: string, userPrompt: string, model?: string) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model ?? MODEL_FAST,
      input: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.6,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  const outputText = data.output_text || data.output?.[0]?.content?.[0]?.text
  if (!outputText) {
    throw new Error('OpenAI API returned an invalid response')
  }
  return outputText.trim()
}

/**
 * Replace em-dashes (—) with a comma-space in any string field.
 * Em-dashes are prohibited by PERIDOT_VOICE but the model occasionally
 * slips them into callout fields. This strips them at the output layer.
 */
export function stripEmDash(text: string): string {
  // "word — word"  →  "word, word"
  // "word—word"    →  "word, word"
  return text.replace(/ ?— ?/g, ', ')
}

export function parseModelJson<T>(raw: string): T {
  try {
    let cleaned = raw.trim()
    if (cleaned.startsWith('```')) {
      const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
      if (fenceMatch) {
        cleaned = fenceMatch[1].trim()
      }
    }
    return JSON.parse(cleaned) as T
  } catch (error) {
    // If JSON parsing fails, try to extract valid JSON from the response
    console.error('Error parsing JSON:', error)
    console.error('Raw input (first 500 chars):', raw.slice(0, 500))
    
    // Try to find JSON object boundaries
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T
      } catch (e) {
        // If that also fails, throw the original error
        throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    
    throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export async function generateTopicPlan(titleOrKeyword: string): Promise<TopicPlan> {
  const systemPrompt = `You are a senior DeFi content strategist. Articles will be published on peridot.finance, a cross-chain lending and borrowing platform with margin trading and further plans. Evaluate topics, set direction, and define objectives. Always reply with valid JSON.`
  const userPrompt = `
Assess the following working title or keyword for a blog article and create a structured plan.

Topic: "${titleOrKeyword}"

Note: This article will be published on peridot.finance (a cross-chain lending platform with margin trading). However, the peridotConnection field should only mention Peridot if the topic directly relates to cross-chain lending/borrowing or margin trading. For general DeFi topics, keep the connection generic.

Return JSON with:
{
  "validation": {
    "isRelevant": boolean,
    "relevanceScore": number, // 0-100
    "relevanceBreakdown": {
      "defiRelevance": number,
      "peridotAlignment": number,
      "educationalValue": number,
      "marketDemand": number,
      "contentGap": number
    },
    "recommendedTopics": string[]?,
    "rejectionReason": string | null
  },
  "direction": {
    "recommendedAngle": string,
    "angleRationale": string,
    "primaryAngle": {
      "type": string,
      "description": string,
      "targetAudience": string,
      "uniqueValue": string,
      "peridotConnection": string, // Only mention Peridot if topic is cross-chain lending/borrowing or margin trading
      "confidence": number
    },
    "alternativeAngles": Array<{
      "type": string,
      "description": string,
      "targetAudience": string,
      "uniqueValue": string,
      "peridotConnection": string, // Only mention Peridot if topic is cross-chain lending/borrowing or margin trading
      "confidence": number
    }>
  },
  "objectives": {
    "userIntent": string,
    "contentObjectives": {
      "educateOn": string[],
      "answerQuestions": string[],
      "provideExamples": string[],
      "includeActionableSteps": boolean
    },
    "businessObjectives": {
      "driveTraffic": boolean,
      "buildAuthority": boolean,
      "promotePeridot": boolean,
      "generateLeads": boolean
    },
    "userObjectives": {
      "knowledgeLevel": string,
      "takeawayValue": string,
      "actionItems": string[]
    }
  },
  "recommendations": string[],
  "proceedWithGeneration": boolean, // true only when relevanceScore >= 60
  "searchIntent": "informational" | "commercial_investigation" | "transactional" | "navigational"
}
`
  const output = await callOpenAI(systemPrompt, userPrompt)
  return parseModelJson<TopicPlan>(output)
}

export async function generateBaseInfo(titleOrKeyword: string, topicPlan?: TopicPlan): Promise<BaseInfo> {
  const systemPrompt = `You are an expert fintech content strategist who writes accessible but technically sound articles for Peridot, a cross-chain DeFi platform. Always produce valid JSON.`
  const userPrompt = `
Create foundational metadata for a professional Peridot blog article using the provided working title or keyword.

Input: "${titleOrKeyword}"

${topicPlan ? `Use this validated topic plan to guide your decisions:
${JSON.stringify(topicPlan, null, 2)}
` : ''}

Return a JSON object with:
- "title": refined human-friendly title (string)
- "slug": URL-safe slug in kebab-case (string) — derive from the topic/title only, never append path names like "risk-insights" or "starter-insights"
- "excerpt": 1-2 sentence teaser (string, 260 characters max)
- "category": best-fit category (string)
- "tags": 5-7 topical tags (array of strings)
- "keywords": 6-8 SEO keywords/phrases (array of strings)
- "primaryKeyword": the single most important keyword to rank for — the term a user would most likely search to find this article (string, 2-5 words)
- "funnelStage": classify as "awareness" (teaches a concept, builds trust), "consideration" (helps evaluate options, compare protocols), or "conversion" (drives the reader to take a specific action on Peridot right now)
- "peridotCta": a short action phrase for this article's Peridot call to action (e.g. "Start earning yield on Peridot", "Deposit USDC on Peridot", "Monitor your Health Factor on Peridot") — use empty string if the topic is not Peridot-specific
- "peridotRelevance": how naturally Peridot fits into this article — "high" (Peridot is the primary actor or the article is specifically about using Peridot), "medium" (a natural Peridot mention or CTA fits at the end), "low" (Peridot could be mentioned briefly), "none" (topic is too general or unrelated for any Peridot mention)
- "actionArticleSuggestion": if peridotRelevance is "medium" or "high", suggest the most relevant step-by-step "Use Peridot" guide the reader should follow after finishing this article — return { "title": string, "slug": string } where slug is kebab-case. Examples: { "title": "How to Deposit on Peridot", "slug": "how-to-deposit-on-peridot" } or { "title": "How to Monitor Your Health Factor on Peridot", "slug": "how-to-monitor-health-factor-peridot" }. Return null if not applicable.
- "tone": short tone description for writers (string)
- "summary": concise summary (string, <= 320 chars)
`
  const output = await callOpenAI(systemPrompt, userPrompt)
  return parseModelJson<BaseInfo>(output)
}

export async function generateInsightsOutline(
  base: BaseInfo,
  path: InsightsPath,
  chapterContext?: { title?: string; chapterOrder?: number; lessonOrder?: number }
): Promise<InsightsOutline> {
  const pathGuidance: Record<InsightsPath, string> = {
    starter: "Beginners learning DeFi from scratch. Build concepts from the ground up — wallet → assets → protocols → first transaction.",
    yield:   "Yield-focused users who want to understand and compare earning strategies. Ground every concept in realistic APY ranges and explicit risk trade-offs.",
    risk:    "Risk-aware users who want to protect their positions. Structure each section around a specific risk layer with concrete thresholds, warning signs, and mitigation actions.",
    market:  "Market-informed users translating signals into decisions. Connect concepts to observable market conditions and give clear frameworks for acting on them.",
    action:  "Users who want step-by-step Peridot walkthroughs. Every section is a numbered step with a clear action, expected result, and a pro-tip or warning.",
  }

  const chapterLine = chapterContext?.title
    ? `Chapter: "${chapterContext.title}" (Chapter ${chapterContext.chapterOrder ?? '?'}, Lesson ${chapterContext.lessonOrder ?? '?'} within that chapter).`
    : ''

  const systemPrompt = `You are a DeFi curriculum designer building structured learning outlines for Peridot Insights. Always return valid JSON only.`

  const userPrompt = `
Design a detailed section-by-section outline for an Insights learning article.

Title: "${base.title}"
Path: "${path}"
${chapterLine ? chapterLine + '\n' : ''}Path audience: ${pathGuidance[path]}
Primary keyword: "${base.primaryKeyword}"
Summary: "${base.summary}"
Tone: "${base.tone}"

Requirements:
- Plan exactly 6 to 8 sections (not fewer — deep coverage is the goal).
- Section 1 MUST open the article by establishing why this topic matters and must naturally contain the primary keyword.
- Sections 2–N progressively deepen understanding: Why → What → How → Implications → Action.
- The final section MUST be action-oriented (what the reader does right now).
- wordTarget per section is a MINIMUM — the writer must reach it, not merely approach it. Introductory sections: min 200 words. Explanatory sections: min 300 words. Action sections: min 200 words. Writing more is always preferred over cutting short.
- Assign visualType "none" only if the concept genuinely has no spatial or relational structure worth illustrating.
- transitionHook must be a complete sentence that would naturally open the NEXT section — it creates narrative continuity.
- keyTerms are the 1–3 most important terms introduced in that section.

Visual type guide:
- "flow-diagram"     → processes, sequences, step-by-step flows
- "comparison-chart" → two or more options side by side
- "anatomy"          → what's inside something (pool, position, protocol)
- "scale-balance"    → risk/reward, tradeoffs, ratios
- "before-after"     → what changes when action X is taken
- "timeline"         → historical development, multi-phase processes
- "none"             → purely narrative, no clear spatial structure

Return JSON:
{
  "learningObjective": "After reading this article, the reader will be able to... (complete sentence)",
  "narrativeArc": "One or two sentences describing the mental journey from opening to close",
  "recommendedDifficulty": "beginner" | "intermediate" | "advanced",
  "sectionPlans": [
    {
      "heading": "Concise, action-oriented section heading",
      "purpose": "Why this section exists in the learning arc (1 sentence)",
      "wordTarget": 300,
      "visualType": "flow-diagram",
      "visualConcept": "What the illustration should depict — one concrete sentence",
      "transitionHook": "Complete sentence that would naturally open the next section",
      "keyTerms": ["term1", "term2"]
    }
  ]
}
`

  const output = await callOpenAI(systemPrompt, userPrompt, MODEL_PRO)
  const parsed = parseModelJson<InsightsOutline>(output)

  // Validate and sanitize
  const allowedDifficulties = ['beginner', 'intermediate', 'advanced'] as const
  const allowedVisualTypes: VisualType[] = ['flow-diagram', 'comparison-chart', 'anatomy', 'scale-balance', 'before-after', 'timeline', 'none']

  return {
    learningObjective: String(parsed.learningObjective || '').trim(),
    narrativeArc:      String(parsed.narrativeArc || '').trim(),
    recommendedDifficulty: allowedDifficulties.includes(parsed.recommendedDifficulty)
      ? parsed.recommendedDifficulty
      : 'beginner',
    sectionPlans: Array.isArray(parsed.sectionPlans)
      ? parsed.sectionPlans
          .map((p: any) => ({
            heading:       String(p?.heading || '').trim(),
            purpose:       String(p?.purpose || '').trim(),
            wordTarget:    typeof p?.wordTarget === 'number' ? Math.min(500, Math.max(150, p.wordTarget)) : 300,
            visualType:    allowedVisualTypes.includes(p?.visualType) ? (p.visualType as VisualType) : 'none',
            visualConcept: String(p?.visualConcept || '').trim(),
            transitionHook: String(p?.transitionHook || '').trim(),
            keyTerms:      Array.isArray(p?.keyTerms) ? p.keyTerms.map(String) : [],
          }))
          .filter((p) => p.heading)
          .slice(0, 8)
      : [],
  }
}

export async function generateArticleContent(
  base: BaseInfo,
  topicPlan?: TopicPlan,
  relatedArticles?: Array<{ title: string; slug: string }>,
  existingContent?: string
): Promise<ArticleInfo> {
  const searchIntent = topicPlan?.searchIntent ?? "informational"
  const funnelStage = base.funnelStage ?? "awareness"

  const intentGuidance: Record<string, string> = {
    informational: "Prioritise depth, clear definitions, and educational takeaways. Include a direct-answer paragraph at the start of the most definitional section (40-60 words, plain prose — Google uses this for featured snippets).",
    commercial_investigation: "Prioritise comparison tables, pros/cons lists, and concrete numbers. Help the reader evaluate options. Include at least one comparison table.",
    transactional: "Prioritise numbered step-by-step instructions. Each step must state the action, the expected result, and any risk to watch for.",
    navigational: "Prioritise clarity and brevity. Get the reader to the right place fast.",
  }

  const funnelGuidance: Record<string, string> = {
    awareness: "This is an awareness-stage article. The reader is learning. Prioritise education and trust-building. Avoid promotional language.",
    consideration: "This is a consideration-stage article. The reader is evaluating options. Include Peridot in comparisons only where directly relevant. Use comparison tables and balanced pros/cons.",
    conversion: `This is a conversion-stage article. The reader is ready to act. Make Peridot the primary actor. Use numbered step-by-step instructions throughout. End with a strong, actionable CTA: "${base.peridotCta || "Start using Peridot today"}"`,
  }

  const systemPrompt = `You are a senior fintech copywriter creating deeply informative, SEO-optimised blog articles for a DeFi finance platform. You write for human readers first, search engines second. Always reply with valid JSON only.`

  const rewriteNote = existingContent
    ? `\nREWRITE MODE: You are regenerating an existing article. Generate completely fresh, improved content on the same topic — better structure, clearer explanations, sharper examples. Do NOT copy the existing text verbatim.\n\nExisting content (for reference only — do not reuse):\n${existingContent.slice(0, 3000)}${existingContent.length > 3000 ? '\n[...truncated]' : ''}\n`
    : ''

  const userPrompt = `
Write a complete, publication-ready Markdown blog article using the context below.
${rewriteNote}
Context JSON:
${JSON.stringify(base, null, 2)}

Search intent: ${searchIntent}
${intentGuidance[searchIntent]}

Funnel stage: ${funnelStage}
${funnelGuidance[funnelStage]}

━━━ CRITICAL SEO REQUIREMENTS ━━━

PRIMARY KEYWORD: "${base.primaryKeyword}"
- Must appear in the H1 title (naturally, not forced)
- Must appear within the first 100 words of the article body
- Must appear naturally in at least 2 H2 subheadings
- Must appear 3-5 more times in body copy — varied phrasing is fine

WORD COUNT: 1800-2400 words. Short articles do not rank for competitive DeFi queries.

OPENING HOOK (first paragraph):
- Directly answer the core question or state the core value proposition
- Never open with "DeFi has been growing…" or generic scene-setting
- The reader must know within 2 sentences what they will gain from reading

FEATURED SNIPPET TARGETING:
- The most definitional section must open with a direct 40-60 word answer paragraph before expanding
- Use numbered lists for any process that has sequential steps
- Use Markdown tables for any comparison of 2+ options

━━━ CONTENT STRUCTURE ━━━
- H2 for main sections, H3 for subsections
- Paragraphs: 2-4 sentences max
- Use bullet lists and numbered lists throughout
- Bold key terms on first use
- Blockquotes for important callouts or definitions

━━━ E-E-A-T REQUIREMENTS (finance content is YMYL — Google scrutinises it) ━━━
- Reference real, well-known protocols by name where relevant (Aave, Compound, Uniswap, Chainlink, etc.) — not invented examples
- Include realistic figures or ranges where applicable (e.g. typical APY ranges, collateral ratios, liquidation thresholds)
- Explicitly acknowledge key risks and limitations — do not oversell or omit downsides
- Where you state a fact that may change over time, flag it inline with "(as of writing)" or "rates vary"

━━━ INTERNAL LINKS ━━━
${
  relatedArticles && relatedArticles.length > 0
    ? `You have access to the following published articles on this site. Link to 2-3 of them inline wherever naturally relevant — use real Markdown links with the path /blog/<slug>:
${relatedArticles.map((a) => `- [${a.title}](/blog/${a.slug})`).join("\n")}
Only link where it adds clear value to the reader. Never force a link. Do not link to an article more than once.`
    : `Suggest 2-3 places where an internal link would be natural. Mark them as: [INTERNAL: suggested topic or article title]. Place them inline within relevant sentences, not as a separate list.`
}

━━━ PERIDOT MENTIONS ━━━
- DO NOT mention Peridot unless the topic directly relates to cross-chain lending/borrowing or margin trading
- When explaining general DeFi concepts, use generic or real-protocol examples
- Avoid promotional language

━━━ WRITING STYLE ━━━
- Active voice, clear and concise sentences
- Accessible to non-technical readers without sacrificing accuracy
- Avoid fluff and filler words
- NEVER use em dashes (—) as list markers or sentence separators

━━━ STRUCTURE ━━━
- Introduction (hook + what the reader will learn)
- Main sections with H2/H3 headings
- Conclusion with 3-5 concrete takeaways
- No front matter or YAML in the Markdown

Return JSON: { "content": "<markdown>" }
`
  const output = await callOpenAI(systemPrompt, userPrompt)
  const parsed = parseModelJson<ArticleInfo>(output)
  return { content: stripEmDash(parsed.content) }
}

export async function generateInsightsArticleContent(
  base: BaseInfo,
  path: InsightsPath,
  chapterContext?: { title?: string; chapterOrder?: number; lessonOrder?: number },
  outline?: InsightsOutline,
  existingSections?: Array<{ heading: string; sentences: string[]; callout: string }>
): Promise<InsightsDraftInfo> {
  const chapterLine = chapterContext?.title
    ? `Chapter: "${chapterContext.title}" (Chapter ${chapterContext.chapterOrder ?? "?"}, Lesson ${chapterContext.lessonOrder ?? "?"} within that chapter).`
    : ""

  const pathGuidance: Record<InsightsPath, string> = {
    starter: "Write for DeFi beginners. Use simple language, define every technical term on first use, build confidence step by step. Lead with analogies before introducing any protocol concept.",
    yield:   "Write for yield-focused users who want real numbers. Include realistic APY ranges with clear risk trade-offs. Compare strategies explicitly. Never state a yield figure without also stating its main risk.",
    risk:    "Write for risk-aware users who want to protect their capital. Structure around specific risk layers: define the threshold, explain what pushes past it, give the exact mitigation action. Be precise, never vague.",
    market:  "Write for market-informed users translating signals into decisions. Connect every concept to something observable in current market conditions. Provide a clear decision framework, not just information.",
    action:  `This is a CONVERSION article. The reader wants to use Peridot right now. Each section heading must be a numbered step (e.g. "Step 1: Connect your wallet"). Every sentence must be a concrete UI action: what to click, what to enter, what to expect on screen. The callout must be either a pro tip or a critical warning for that step. Mention Peridot directly throughout.${base.peridotCta ? ` End the final section with a strong CTA: "${base.peridotCta}"` : ""}`,
  }

  const funnelStage = base.funnelStage ?? "awareness"
  const funnelLine = path !== "action"
    ? `Funnel stage: ${funnelStage}. ${
        funnelStage === "conversion" && base.peridotCta
          ? `End the article with a CTA: "${base.peridotCta}".`
          : funnelStage === "consideration"
          ? "Include Peridot as one comparison option where naturally relevant."
          : "Focus on education and trust-building. Keep the reader engaged, not sold to."
      }`
    : ""

  const rewriteBlock = existingSections && existingSections.length > 0
    ? `\nREWRITE MODE: You are regenerating an existing article. The sections below are for reference only. Generate completely fresh content on the same topic — improved clarity, greater depth, better examples. Do NOT copy headings or sentences verbatim.\n\nExisting sections:\n${existingSections.map((s, i) => `Section ${i + 1}: ${s.heading}\n${s.sentences.join(' ')}\nCallout: ${s.callout}`).join('\n\n')}\n`
    : ''

  // Build section-by-section brief from outline
  const sectionBrief = outline?.sectionPlans.length
    ? `\n━━━ SECTION PLAN (follow this narrative arc) ━━━\n${outline.sectionPlans.map((p, i) =>
        `Section ${i + 1}: "${p.heading}"\n  Purpose: ${p.purpose}\n  Word target: ~${p.wordTarget} words\n  Key terms to introduce: ${p.keyTerms.join(', ') || 'none'}\n  Transition hook (last sentence of this section): ${p.transitionHook}`
      ).join('\n\n')}\n\nLearning objective: ${outline.learningObjective}\nNarrative arc: ${outline.narrativeArc}\n`
    : ''

  const systemPrompt = `You are an expert DeFi education writer creating in-depth Insights learning articles for Peridot. You write substantive, well-structured long-form content that readers genuinely learn from. Always return valid JSON only.

${PERIDOT_VOICE}`

  const userPrompt = `
Write a complete, long-form Insights learning article for path: "${path}".${chapterLine ? `\n${chapterLine}` : ""}
${rewriteBlock}
Path audience: ${pathGuidance[path]}
${funnelLine}
${sectionBrief}
Context JSON:
${JSON.stringify(base, null, 2)}

━━━ CONTENT REQUIREMENTS ━━━

PRIMARY KEYWORD: "${base.primaryKeyword}"
- Must appear naturally in the first section heading or its first paragraph
- Must appear at least once every 300 words in the body

MINIMUM TOTAL ARTICLE LENGTH: ${outline ? `${outline.sectionPlans.reduce((s, p) => s + p.wordTarget, 0)} words` : '1400 words'} — write more if needed, never less.

PER SECTION:
- "heading": clear, action-oriented, specific to the content of that section
- "sentences": an array where EACH ELEMENT IS ONE FULL PARAGRAPH (2–4 sentences, 50–130 words). Return 3–5 paragraph-level elements per section. Each section MUST reach its planned wordTarget — do not shorten.
- "callout": one punchy, self-contained insight (15–40 words). Must be fully meaningful without surrounding context — AI search engines and pull-quote renderers cite these directly.

SEO REQUIREMENTS (Insights articles are indexed and must rank):
- First section opens with a direct-answer paragraph covering what the article teaches and why it matters
- Use H2-level headings that a user might naturally search for (e.g. "How does liquidation work in DeFi?" not "Understanding Liquidations")
- Ground every factual claim with a realistic range or reference to a known protocol (Aave, Compound, Uniswap, etc.)

WRITING RULES:
- Follow the PERIDOT VOICE guide above — analogy before technical term, define on first use, vary sentence length
- NEVER use em dashes (—) in any field
- NEVER include Markdown links, URLs, or hyperlink syntax — all text must be plain prose
- Mention Peridot only if the path is "action" or the topic directly relates to cross-chain lending/borrowing or margin trading
- Each section must follow the Context → Mechanism → Implication → Action arc
- The last sentence of each section must either resolve a tension or set up the next section

Return JSON with this exact shape:
{
  "path": "${path}",
  "sections": [
    {
      "heading": "string",
      "sentences": ["paragraph 1 text", "paragraph 2 text", "paragraph 3 text"],
      "callout": "string"
    }
  ],
  "content": "full markdown article string"
}

The "content" field must be a complete Markdown document:
- # title
- One-line intro (the direct-answer hook)
- ## per section heading
- section paragraphs as plain prose
- > callout line
`

  const output = await callOpenAI(systemPrompt, userPrompt, MODEL_PRO)
  const parsed = parseModelJson<InsightsDraftInfo>(output)

  const allowedPaths: InsightsPath[] = ["starter", "yield", "risk", "market", "action"]
  const safePath: InsightsPath = allowedPaths.includes(parsed.path) ? parsed.path : path
  const safeSections: InsightsSectionInfo[] = Array.isArray(parsed.sections)
    ? parsed.sections
        .map((section: any) => ({
          heading: String(section?.heading || "").trim(),
          sentences: Array.isArray(section?.sentences)
            ? section.sentences
                .map((s: any) => stripEmDash(String(s || "").trim()))
                .filter(Boolean)
                .slice(0, 6)
            : [],
          callout: stripEmDash(String(section?.callout || "").trim()),
        }))
        .filter((section) => section.heading && section.sentences.length > 0)
    : []

  const safeContent = stripEmDash(
    String(parsed.content || "").trim() ||
    [
      `# ${base.title}`,
      "",
      base.excerpt,
      "",
      ...safeSections.flatMap((section) => [
        `## ${section.heading}`,
        "",
        ...section.sentences,
        "",
        section.callout ? `> ${section.callout}` : "",
        "",
      ]),
    ]
      .filter(Boolean)
      .join("\n")
      .trim()
  )

  return {
    path: safePath,
    sections: safeSections,
    content: safeContent,
  }
}

export async function generateMetaInfo(base: BaseInfo, article: ArticleInfo): Promise<MetaInfo> {
  const systemPrompt = `You are a seasoned SEO strategist crafting metadata for fintech content. Always respond with valid JSON.`
  const userPrompt = `
Produce SEO metadata for the article using the following context.

Base Info:
${JSON.stringify(base, null, 2)}

An excerpt from the article:
${article.content.slice(0, 1500)}

Primary keyword to target: "${base.primaryKeyword}"

Return JSON with:
- "metaTitle": <= 60 characters. Must start with or prominently feature the primary keyword. Compelling and accurate.
- "metaDescription": 150-160 characters. Must include the primary keyword naturally and end with a clear action phrase (e.g. "Learn how to…", "Find out…", "Discover…"). Enticing and accurate.
- "canonicalUrl": relative path such as "/blog/<slug>" (string) or null if unknown
- "metaRobots": default to "index,follow" unless a good reason not to
`
  const output = await callOpenAI(systemPrompt, userPrompt)
  return parseModelJson<MetaInfo>(output)
}

export async function generateFAQ(base: BaseInfo, article: ArticleInfo): Promise<FAQInfo> {
  const systemPrompt = `You are an expert educator translating technical DeFi knowledge into clear FAQ answers. Respond with valid JSON.`
  const userPrompt = `
Create a FAQ section aligned with this article.

Base Info:
${JSON.stringify(base, null, 2)}

Article excerpt:
${article.content.slice(0, 2000)}

Requirements:
- Provide 4-6 questions
- Phrase every question exactly as a real user search query (e.g. "What is X?", "How does Y work?", "Why does Z happen?", "Is X safe?") — not as editorial headings
- At least 2 questions must target "People Also Ask" style queries directly related to the article's primary keyword
- Each answer must open with a direct 1-sentence response that fully answers the question on its own (Google pulls this for FAQ snippets), then expand in 1-3 more sentences
- Plain language, no Markdown formatting in answers
- DO NOT mention Peridot unless the question specifically relates to cross-chain lending/borrowing or margin trading
- Keep answers educational and platform-agnostic when possible

Return JSON: { "faq": [ { "question": "...", "answer": "..." }, ... ] }
`
  const output = await callOpenAI(systemPrompt, userPrompt)
  return parseModelJson<FAQInfo>(output)
}

export type ExplanationPlacement = {
  lineIndex: number
  contextText: string
  explanation: string
  shouldPlace: boolean
}

export type ExplanationPlacementRaw = {
  paragraphIndex: number
  contextText: string
  explanation: string
  shouldPlace: boolean
}

export type ExplanationPlacements = {
  placements: ExplanationPlacement[]
}

export type ExplanationPlacementsRaw = {
  placements: ExplanationPlacementRaw[]
}

/**
 * Generate explanations for complex concepts in the article
 */
export async function generateInteractiveBlockPlacements(
  base: BaseInfo,
  path: InsightsPath,
  sections: InsightsSectionInfo[]
): Promise<InteractiveBlockPlacement[]> {
  const systemPrompt = `You are a DeFi education designer selecting interactive learning components for Insights articles on Peridot. Each component makes an abstract concept tangible through hands-on exploration. Always return valid JSON only.`

  const sectionSummary = sections.map((s, i) => ({
    index: i,
    heading: s.heading,
    content: s.sentences.join(" "),
  }))

  const userPrompt = `
You are placing interactive DeFi learning components inside an Insights article.

Article title: "${base.title}"
Path: "${path}"
Primary keyword: "${base.primaryKeyword}"
Summary: "${base.summary}"

Sections (0-indexed):
${JSON.stringify(sectionSummary, null, 2)}

Available interactive block types and when to use them:
- "calculator" variant "health-factor" → article covers health factor, collateral safety, liquidation risk
- "calculator" variant "apy-vs-apr" → article covers APY vs APR, compound interest mechanics
- "calculator" variant "yield-return" → article covers yield farming, expected returns
- "jenga" (params: loanAmount, liqLtv, initialBlocks) → article covers collateral management, what happens when you remove collateral, liquidation thresholds. loanAmount should reflect the article's example scale (e.g. $500-$2000), liqLtv between 0.7 and 0.85
- "vault-builder" (params: initialCoins as array of "eth"|"btc"|"usdc", targetCollateral) → article covers building collateral positions, diversification
- "borrowing-power" (params: assets as array of "eth"|"btc"|"usdc") → article covers LTV ratios, borrowing capacity, collateral mix
- "leverage-seesaw" (params: maxLeverage 2-10) → article covers leverage loops, amplified gains/losses, margin
- "rate-highway" (params: kinkUtilization 0.6-0.9) → article covers interest rate models, utilization rate, deposit incentives
- "liquidation-dominoes" → article covers cascading liquidations, market risk, systemic effects
- "apy-snowball" (params: rate as decimal 0.05-0.5, months 6-24) → article covers compounding, APY growth over time. Set rate and months to illustrate the article's point (e.g. rate: 0.24 for a high-yield article)
- "position-builder" → article covers position sizing, advanced strategy, building a full lending position
- "predict" (params: prompt, options string[], correctIndex, reveal) → mid-article knowledge check. You MUST write a complete, meaningful question as "prompt", 3-4 answer options as "options" array, the 0-based index of the correct answer as "correctIndex", and a full explanation sentence as "reveal". Base all content directly on this article's sections.
- "checkpoint" (params: question, options[]) → end-of-article knowledge check. You MUST write a complete question as "question" and a "options" array of objects, each with "text" (the answer choice), "correct" (boolean), and "explanation" (why it is or isn't correct). Base all content directly on this article's sections.

Rules:
- Select 1 to 2 blocks maximum. Quality over quantity.
- Each block must DIRECTLY relate to the section it follows.
- Place each block AFTER the section it reinforces (afterSectionIndex = that section's 0-based index).
- At most one "predict" or "checkpoint" block per article. Prefer "predict" for mid-article, "checkpoint" for the final section.
- Configure all numeric parameters to match the scale and context of the article.
- ALL text fields (prompt, reveal, question, options, explanations) must contain real, meaningful content — never leave them empty or as placeholders.
- If no block is a genuinely good fit, return an empty array rather than forcing a placement.

Return JSON exactly in this format (the block object must be complete with all required fields filled):
{
  "placements": [
    {
      "afterSectionIndex": 1,
      "block": {
        "type": "predict",
        "prompt": "What happens to your health factor when you add more collateral?",
        "options": ["It increases, reducing liquidation risk", "It decreases, increasing liquidation risk", "It stays the same"],
        "correctIndex": 0,
        "reveal": "Adding more collateral raises your health factor because the ratio of collateral value to borrowed value improves, pushing you further from the liquidation threshold."
      }
    }
  ]
}

For a checkpoint block the format is:
{
  "type": "checkpoint",
  "question": "Which of the following best describes a liquidation threshold?",
  "options": [
    { "text": "The point at which your collateral is sold to repay debt", "correct": true, "explanation": "Correct — when your health factor drops below 1, the protocol liquidates part of your collateral." },
    { "text": "The maximum amount you can borrow", "correct": false, "explanation": "That describes the borrow limit, not the liquidation threshold." },
    { "text": "The interest rate charged on your loan", "correct": false, "explanation": "Interest rates and liquidation thresholds are separate concepts." }
  ]
}
`

  const output = await callOpenAI(systemPrompt, userPrompt)
  const result = parseModelJson<{ placements: InteractiveBlockPlacement[] }>(output)

  if (!Array.isArray(result?.placements)) return []

  const totalSections = sections.length
  return result.placements
    .filter((p) => {
      if (typeof p.afterSectionIndex !== "number") return false
      if (p.afterSectionIndex < 0 || p.afterSectionIndex >= totalSections) return false
      if (!p.block?.type) return false
      return true
    })
    .slice(0, 2)
}

export async function generateExplanations(
  articleContent: string,
  articleTitle: string
): Promise<ExplanationPlacements> {
  const systemPrompt = `You are an expert content strategist identifying complex concepts that would benefit from deeper explanations. Focus on educational clarity without platform promotion. Always respond with valid JSON.`
  
  // Split article into paragraphs for analysis
  const paragraphs = articleContent
    .split('\n\n')
    .filter(p => p.trim().length > 50 && !p.trim().startsWith('#') && !p.trim().startsWith('!'))
    .slice(0, 20) // Limit to first 20 paragraphs
  
  const userPrompt = `
Analyze this article and identify 1-3 complex concepts that would benefit from expanded explanations.

Article Title: "${articleTitle}"

Article Paragraphs:
${paragraphs.map((p, i) => `[${i}] ${p.slice(0, 200)}...`).join('\n\n')}

Requirements:
- Identify 1-3 paragraphs that discuss complex concepts (technical terms, processes, mechanisms, comparisons)
- Each explanation should be 2-4 sentences, clear and accessible
- Focus on concepts that readers might struggle to understand without additional context
- Avoid explanations for simple concepts or definitions
- Prioritize concepts that are central to understanding the article
- CRITICAL: DO NOT mention Peridot or any specific platforms in explanations - keep them educational and platform-agnostic

For each selected paragraph, provide:
- The paragraph index (0-based from the paragraphs array above)
- The context text (first 150 chars of the paragraph)
- A clear, concise explanation (2-4 sentences)

Return JSON:
{
  "placements": [
    {
      "paragraphIndex": number,
      "contextText": string,
      "explanation": string,
      "shouldPlace": boolean
    }
  ]
}

Maximum 3 placements. If no good placements found, return empty array.
`

  const output = await callOpenAI(systemPrompt, userPrompt)
  const result = parseModelJson<ExplanationPlacementsRaw>(output)
  
  // Convert paragraph indices to line indices
  const lines = articleContent.split('\n')
  const processedPlacements: ExplanationPlacement[] = []
  
  // Build a map of paragraph text to line indices
  const paragraphToLines: Map<number, number> = new Map()
  let currentParagraphIndex = 0
  let currentParagraphLines: number[] = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.length === 0) {
      // Empty line - end of paragraph
      if (currentParagraphLines.length > 0 && currentParagraphIndex < paragraphs.length) {
        paragraphToLines.set(currentParagraphIndex, currentParagraphLines[currentParagraphLines.length - 1])
        currentParagraphIndex++
        currentParagraphLines = []
      }
    } else if (!line.startsWith('#') && !line.startsWith('!') && !line.startsWith('```')) {
      currentParagraphLines.push(i)
    }
  }
  
  // Handle last paragraph
  if (currentParagraphLines.length > 0 && currentParagraphIndex < paragraphs.length) {
    paragraphToLines.set(currentParagraphIndex, currentParagraphLines[currentParagraphLines.length - 1])
  }
  
  // Process placements
  for (const placement of result.placements) {
    if (placement.shouldPlace && paragraphToLines.has(placement.paragraphIndex)) {
      const lineIndex = paragraphToLines.get(placement.paragraphIndex)!
      processedPlacements.push({
        lineIndex,
        contextText: placement.contextText,
        explanation: placement.explanation,
        shouldPlace: true,
      })
    }
  }
  
  return { placements: processedPlacements }
}
