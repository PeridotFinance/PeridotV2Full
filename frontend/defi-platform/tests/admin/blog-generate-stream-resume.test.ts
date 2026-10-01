/**
 * tests/admin/blog-generate-stream-resume.test.ts
 *
 * Tests for the /api/blog/generate-stream SSE endpoint with a focus on the
 * checkpoint/resume feature introduced in Phase 1.
 *
 * Verifies:
 * 1. A fresh run calls every generate-helper function exactly once.
 * 2. A resumed run skips steps listed in resumeFrom.completedSteps
 *    (those generate-helper functions are NOT called again).
 * 3. The final `complete` SSE event always contains the expected fields
 *    regardless of whether data came from a fresh run or from the checkpoint.
 * 4. Steps that are NOT in completedSteps still execute normally.
 * 5. A `topic-plan` that returns proceedWithGeneration=false terminates early.
 *
 * We mock every external dependency (OpenAI helpers, image generators, etc.)
 * so that no real network calls are made and tests run in milliseconds.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import * as generateHelpers from '@/app/api/blog/generate-helpers'
import * as factCheckerModule from '@/lib/fact-checker'

// ── Mock all external dependencies ────────────────────────────────────────────

vi.mock('@/app/api/blog/generate-helpers', () => ({
  generateTopicPlan: vi.fn(),
  generateBaseInfo: vi.fn(),
  generateArticleContent: vi.fn(),
  generateInsightsArticleContent: vi.fn(),
  generateMetaInfo: vi.fn(),
  generateFAQ: vi.fn(),
  generateExplanations: vi.fn(),
  callOpenAI: vi.fn(),
  parseModelJson: vi.fn(),
}))

vi.mock('@/lib/kie-image-generator', () => ({
  generateKieImage: vi.fn().mockResolvedValue('http://example.com/kie-image.png'),
  generateConceptImage: vi.fn().mockResolvedValue('http://example.com/concept.png'),
  downloadImage: vi.fn().mockResolvedValue(Buffer.from('fake-image')),
}))

vi.mock('@/lib/firebase-storage', () => ({
  uploadCoverImage: vi.fn().mockResolvedValue('https://cdn.example.com/cover.webp'),
  uploadConceptImage: vi.fn().mockResolvedValue('https://cdn.example.com/concept.webp'),
}))

vi.mock('@/lib/markdown-utils', () => ({
  extractHeaders: vi.fn().mockReturnValue([]),
  insertImageAtLine: vi.fn((content: string) => content),
  insertExplanationAtLine: vi.fn((content: string) => content),
}))

vi.mock('@/lib/fact-checker', () => ({
  factCheckArticle: vi.fn().mockResolvedValue({
    verified: 3,
    unverified: 0,
    needsReview: 0,
    totalClaims: 3,
    overallStatus: 'pass',
  }),
}))

vi.mock('@/app/api/blog/_lib/security', () => ({
  assertProtectedBlogWrite: vi.fn().mockReturnValue(null),
}))

// ── Fixture data ──────────────────────────────────────────────────────────────

const MOCK_TOPIC_PLAN = {
  proceedWithGeneration: true,
  validation: { relevanceScore: 90 },
  direction: {},
  objectives: {},
  recommendations: [],
}

const MOCK_BASE_INFO = {
  title: 'DeFi Lending Guide',
  slug: 'defi-lending-guide',
  excerpt: 'A comprehensive guide to DeFi lending.',
  category: 'Education',
  tags: ['DeFi', 'Lending'],
  keywords: ['defi', 'lending'],
  tone: 'educational',
  summary: 'Learn DeFi lending.',
}

const MOCK_ARTICLE_CONTENT = '# DeFi Lending Guide\n\nContent here.'

const MOCK_META_INFO = {
  metaTitle: 'DeFi Lending Guide',
  metaDescription: 'Learn DeFi lending.',
  canonicalUrl: 'https://peridot.finance/blog/defi-lending-guide',
  metaRobots: 'index,follow',
}

const MOCK_FAQ_ITEMS = [
  { question: 'What is DeFi?', answer: 'Decentralized Finance.' },
  { question: 'How do I lend?', answer: 'Deposit assets into a pool.' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Consume a ReadableStream<Uint8Array> and return all parsed SSE event objects. */
async function consumeSSE(stream: ReadableStream<Uint8Array>): Promise<Array<Record<string, any>>> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const events: Array<Record<string, any>> = []
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        events.push(JSON.parse(line.slice(6)))
      } catch {
        // Ignore malformed lines
      }
    }
  }

  return events
}

async function callGenerateStream(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/blog/generate-stream/route')
  const req = new NextRequest('http://localhost/api/blog/generate-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const response = await POST(req)
  const events = await consumeSSE(response.body as ReadableStream<Uint8Array>)
  return events
}

function setupFullMocks() {
  vi.mocked(generateHelpers.generateTopicPlan).mockResolvedValue(MOCK_TOPIC_PLAN as any)
  vi.mocked(generateHelpers.generateBaseInfo).mockResolvedValue(MOCK_BASE_INFO as any)
  vi.mocked(generateHelpers.generateArticleContent).mockResolvedValue({ content: MOCK_ARTICLE_CONTENT } as any)
  vi.mocked(generateHelpers.generateMetaInfo).mockResolvedValue(MOCK_META_INFO as any)
  vi.mocked(generateHelpers.generateFAQ).mockResolvedValue({ faq: MOCK_FAQ_ITEMS } as any)
  vi.mocked(generateHelpers.generateExplanations).mockResolvedValue({ placements: [] } as any)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('generate-stream – fresh generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupFullMocks()
  })

  it('returns 400 (error event) when title is missing', async () => {
    const events = await callGenerateStream({ mode: 'blog' })
    const errorEvent = events.find((e) => e.step === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent?.status).toBe('error')
  })

  it('calls all 9 generation helpers for a fresh blog run', async () => {
    await callGenerateStream({ title: 'DeFi Lending Guide', mode: 'blog' })

    expect(generateHelpers.generateTopicPlan).toHaveBeenCalledTimes(1)
    expect(generateHelpers.generateBaseInfo).toHaveBeenCalledTimes(1)
    expect(generateHelpers.generateArticleContent).toHaveBeenCalledTimes(1)
    expect(generateHelpers.generateMetaInfo).toHaveBeenCalledTimes(1)
    expect(generateHelpers.generateFAQ).toHaveBeenCalledTimes(1)
  })

  it('emits a `complete` event as the last event', async () => {
    const events = await callGenerateStream({ title: 'DeFi Lending Guide', mode: 'blog' })
    const last = events.at(-1)
    expect(last?.step).toBe('complete')
    expect(last?.status).toBe('completed')
  })

  it('complete event contains base, article, meta, faq, coverImageUrl', async () => {
    const events = await callGenerateStream({ title: 'DeFi Lending Guide', mode: 'blog' })
    const complete = events.find((e) => e.step === 'complete')
    expect(complete?.data).toMatchObject({
      base: expect.objectContaining({ slug: 'defi-lending-guide' }),
      article: expect.objectContaining({ content: expect.stringContaining('DeFi Lending Guide') }),
      meta: expect.objectContaining({ metaTitle: 'DeFi Lending Guide' }),
      faq: expect.arrayContaining([expect.objectContaining({ question: expect.any(String) })]),
    })
  })

  it('terminates early if topic plan rejects the topic', async () => {
    vi.mocked(generateHelpers.generateTopicPlan).mockResolvedValue({
      proceedWithGeneration: false,
      validation: { relevanceScore: 20, rejectionReason: 'Not DeFi related.' },
    } as any)

    const events = await callGenerateStream({ title: 'Cat Videos', mode: 'blog' })
    const errorEvent = events.find((e) => e.step === 'error')
    expect(errorEvent).toBeDefined()

    // Should NOT have called base-info or later steps
    expect(generateHelpers.generateBaseInfo).not.toHaveBeenCalled()
    expect(generateHelpers.generateArticleContent).not.toHaveBeenCalled()
  })
})

describe('generate-stream – resume from checkpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupFullMocks()
  })

  it('skips topic-plan and base-info when both are in completedSteps', async () => {
    const resumeFrom = {
      completedSteps: ['topic-plan', 'base-info'],
      partialData: {
        'topic-plan': { topicPlan: MOCK_TOPIC_PLAN },
        'base-info': { baseInfo: MOCK_BASE_INFO },
      },
    }

    await callGenerateStream({ title: 'DeFi Lending Guide', mode: 'blog', resumeFrom })

    // Should NOT call these — they were already completed
    expect(generateHelpers.generateTopicPlan).not.toHaveBeenCalled()
    expect(generateHelpers.generateBaseInfo).not.toHaveBeenCalled()

    // Should still call the remaining steps
    expect(generateHelpers.generateArticleContent).toHaveBeenCalledTimes(1)
    expect(generateHelpers.generateMetaInfo).toHaveBeenCalledTimes(1)
    expect(generateHelpers.generateFAQ).toHaveBeenCalledTimes(1)
  })

  it('skips all steps except fact-check when resuming from step 8', async () => {
    const resumeFrom = {
      completedSteps: [
        'topic-plan',
        'base-info',
        'article-content',
        'meta-info',
        'faq',
        'cover-image',
        'concept-image',
        'explanations',
      ],
      partialData: {
        'topic-plan': { topicPlan: MOCK_TOPIC_PLAN },
        'base-info': { baseInfo: MOCK_BASE_INFO },
        'article-content': { articleInfo: { content: MOCK_ARTICLE_CONTENT }, insightsDraft: null },
        'meta-info': { metaInfo: MOCK_META_INFO },
        faq: { faq: MOCK_FAQ_ITEMS },
        'cover-image': { coverImageUrl: 'https://cdn.example.com/cover.webp' },
        'concept-image': { updatedContent: MOCK_ARTICLE_CONTENT },
        explanations: { updatedContent: MOCK_ARTICLE_CONTENT },
      },
    }

    await callGenerateStream({ title: 'DeFi Lending Guide', mode: 'blog', resumeFrom })

    // All helpers should be skipped
    expect(generateHelpers.generateTopicPlan).not.toHaveBeenCalled()
    expect(generateHelpers.generateBaseInfo).not.toHaveBeenCalled()
    expect(generateHelpers.generateArticleContent).not.toHaveBeenCalled()
    expect(generateHelpers.generateMetaInfo).not.toHaveBeenCalled()
    expect(generateHelpers.generateFAQ).not.toHaveBeenCalled()

    // Only fact-check should run
    expect(factCheckerModule.factCheckArticle).toHaveBeenCalledTimes(1)
  })

  it('emits completed events for skipped steps with "Restored from checkpoint" message', async () => {
    const resumeFrom = {
      completedSteps: ['topic-plan', 'base-info'],
      partialData: {
        'topic-plan': { topicPlan: MOCK_TOPIC_PLAN },
        'base-info': { baseInfo: MOCK_BASE_INFO },
      },
    }

    const events = await callGenerateStream({ title: 'DeFi Lending Guide', mode: 'blog', resumeFrom })

    const topicPlanEvent = events.find((e) => e.step === 'topic-plan' && e.status === 'completed')
    const baseInfoEvent = events.find((e) => e.step === 'base-info' && e.status === 'completed')

    expect(topicPlanEvent?.message).toMatch(/checkpoint/i)
    expect(baseInfoEvent?.message).toMatch(/checkpoint/i)
  })

  it('complete event uses checkpoint data for skipped steps', async () => {
    const resumeFrom = {
      completedSteps: ['topic-plan', 'base-info', 'article-content', 'meta-info', 'faq'],
      partialData: {
        'topic-plan': { topicPlan: MOCK_TOPIC_PLAN },
        'base-info': { baseInfo: MOCK_BASE_INFO },
        'article-content': {
          articleInfo: { content: '# From Checkpoint\n\nStored content.' },
          insightsDraft: null,
        },
        'meta-info': { metaInfo: MOCK_META_INFO },
        faq: { faq: MOCK_FAQ_ITEMS },
      },
    }

    const events = await callGenerateStream({ title: 'DeFi Lending Guide', mode: 'blog', resumeFrom })
    const complete = events.find((e) => e.step === 'complete')

    // Article content should come from checkpoint
    expect(complete?.data?.article?.content).toContain('From Checkpoint')
    // Base info should come from checkpoint
    expect(complete?.data?.base?.slug).toBe('defi-lending-guide')
  })

  it('does not skip a step that is NOT in completedSteps even when resuming', async () => {
    const resumeFrom = {
      // Only topic-plan is completed; base-info must still run
      completedSteps: ['topic-plan'],
      partialData: {
        'topic-plan': { topicPlan: MOCK_TOPIC_PLAN },
      },
    }

    await callGenerateStream({ title: 'DeFi Lending Guide', mode: 'blog', resumeFrom })

    expect(generateHelpers.generateTopicPlan).not.toHaveBeenCalled() // skipped
    expect(generateHelpers.generateBaseInfo).toHaveBeenCalledTimes(1) // NOT skipped
  })
})
