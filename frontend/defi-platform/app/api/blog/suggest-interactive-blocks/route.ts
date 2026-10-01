import { NextRequest, NextResponse } from 'next/server'
import { generateInteractiveBlockPlacements, type InsightsPath } from '../generate-helpers'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, excerpt, summary, primaryKeyword, path, sections } = body

    if (!title || !path || !Array.isArray(sections) || sections.length === 0) {
      return NextResponse.json(
        { error: 'title, path, and sections are required' },
        { status: 400 }
      )
    }

    const allowedPaths: InsightsPath[] = ['starter', 'yield', 'risk', 'market', 'action']
    const safePath: InsightsPath = allowedPaths.includes(path) ? path : 'starter'

    // Build a minimal BaseInfo-compatible object with the fields the function uses
    const baseInfo = {
      title: String(title),
      excerpt: String(excerpt ?? ''),
      summary: String(summary ?? excerpt ?? title),
      primaryKeyword: String(primaryKeyword ?? title),
      slug: '',
      category: '',
      tags: [],
      keywords: [],
      funnelStage: 'awareness' as const,
      peridotCta: '',
      peridotRelevance: 'none' as const,
      actionArticleSuggestion: null,
      tone: '',
    }

    const placements = await generateInteractiveBlockPlacements(baseInfo, safePath, sections)
    return NextResponse.json({ placements })
  } catch (error) {
    console.error('Error suggesting interactive blocks:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Suggestion failed' },
      { status: 500 }
    )
  }
}
