import { NextRequest } from 'next/server'
import { generateKieImage, generateConceptImage, generateSectionImage, downloadImage } from '@/lib/kie-image-generator'
import { uploadCoverImage, uploadConceptImage } from '@/lib/firebase-storage'
import { extractHeaders, insertImageAtLine, insertExplanationAtLine, type HeaderInfo } from '@/lib/markdown-utils'
import { factCheckArticle, type FactCheckSummary } from '@/lib/fact-checker'
import { assertProtectedBlogWrite } from '../_lib/security'
import { sql } from '@/lib/database'
import {
  generateTopicPlan,
  generateBaseInfo,
  generateInsightsOutline,
  generateArticleContent,
  generateInsightsArticleContent,
  generateMetaInfo,
  generateFAQ,
  generateExplanations,
  generateInteractiveBlockPlacements,
  callOpenAI,
  parseModelJson,
  type TopicPlan,
  type BaseInfo,
  type ArticleInfo,
  type InsightsPath,
  type InsightsOutline,
  type MetaInfo,
  type InteractiveBlockPlacement,
} from '../generate-helpers'

type ImagePlacement = {
  headerIndex: number
  headerText: string
  sectionContent: string
  imagePrompt: string
  shouldPlace: boolean
}

function sanitizeMessage(message: string | undefined): string {
  if (!message) return ''
  let sanitized = message.slice(0, 500)
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '')
  sanitized = sanitized.replace(/\n/g, ' ').replace(/\r/g, '')
  return sanitized
}

function createProgressEvent(step: string, status: string, message?: string, data?: any) {
  try {
    const sanitizedMessage = sanitizeMessage(message)
    const jsonString = JSON.stringify({ step, status, message: sanitizedMessage, data }, null, 0)
    return `data: ${jsonString}\n\n`
  } catch (error) {
    console.error('Error serializing progress event:', error)
    const safeData = data ? { error: 'Data too large or contains circular references' } : undefined
    const safeMessage = sanitizeMessage(message || 'Progress update')
    try {
      return `data: ${JSON.stringify({ step, status, message: safeMessage, data: safeData })}\n\n`
    } catch {
      return `data: ${JSON.stringify({ step, status, message: 'Progress update' })}\n\n`
    }
  }
}

async function determineImagePlacement(
  articleContent: string,
  articleTitle: string,
  headers: HeaderInfo[]
): Promise<ImagePlacement | null> {
  if (headers.length === 0) return null

  const systemPrompt = `You are a content strategist optimizing blog articles for visual appeal and reader engagement. Analyze article sections and determine the best place for a concept visualization image. Always respond with valid JSON.`

  const headersSummary = headers.map((h, idx) => ({
    index: idx,
    level: h.level,
    text: h.text,
    contentPreview: h.contentAfter.slice(0, 200),
  }))

  const userPrompt = `
Analyze this article and determine the best place to insert a concept visualization image.

Article Title: "${articleTitle}"

Available Headers:
${JSON.stringify(headersSummary, null, 2)}

Requirements:
- Select ONE header section that would benefit most from a visual concept diagram
- The section should discuss a concept that can be visualized (processes, comparisons, structures, flows)
- Prioritize sections that are educational or explain complex concepts
- Avoid sections that are too short (< 100 chars) or purely narrative
- The image should enhance understanding, not just decorate

Return JSON with:
{
  "headerIndex": number,
  "headerText": string,
  "sectionContent": string,
  "imagePrompt": string,
  "shouldPlace": boolean
}

If no good placement is found, set "shouldPlace": false.
`

  const output = await callOpenAI(systemPrompt, userPrompt)
  const placement = parseModelJson<ImagePlacement>(output)

  if (!placement.shouldPlace || placement.headerIndex < 0 || placement.headerIndex >= headers.length) {
    return null
  }

  const selectedHeader = headers[placement.headerIndex]
  return {
    headerIndex: selectedHeader.lineIndex,
    headerText: selectedHeader.text,
    sectionContent: selectedHeader.contentAfter,
    imagePrompt: placement.imagePrompt,
    shouldPlace: true,
  }
}

export async function POST(request: NextRequest) {
  const denied = assertProtectedBlogWrite(request)
  if (denied) return denied

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const sendProgress = (step: string, status: string, message?: string, data?: any) => {
        const event = createProgressEvent(step, status, message, data)
        controller.enqueue(encoder.encode(event))
      }

      try {
        const body = await request.json()
        const title = body?.title
        const generationMode: 'blog' | 'insights' = body?.mode === 'insights' ? 'insights' : 'blog'
        const requestedPath = body?.insightsPath as InsightsPath | undefined
        const allowedPaths: InsightsPath[] = ['starter', 'yield', 'risk', 'market', 'action']
        const insightsPath: InsightsPath =
          requestedPath && allowedPaths.includes(requestedPath) ? requestedPath : 'starter'
        const chapterContext = generationMode === 'insights' ? {
          title: typeof body?.chapterTitle === 'string' ? body.chapterTitle : undefined,
          chapterOrder: typeof body?.chapterOrder === 'number' ? body.chapterOrder : undefined,
          lessonOrder: typeof body?.lessonOrder === 'number' ? body.lessonOrder : undefined,
        } : undefined

        // ── Regenerate support ────────────────────────────────────────────────
        const regenerate = body?.regenerate === true
        const existingSlug = typeof body?.existingSlug === 'string' ? body.existingSlug : undefined
        const existingContent = typeof body?.existingContent === 'string' ? body.existingContent : undefined
        const existingSections = Array.isArray(body?.existingSections) ? body.existingSections as Array<{ heading: string; sentences: string[]; callout: string }> : undefined
        // ─────────────────────────────────────────────────────────────────────

        // ── Resume support ────────────────────────────────────────────────────
        // The client can pass `resumeFrom` to skip already-completed steps and
        // use their stored output instead of re-running the expensive AI calls.
        const resumeFrom = body?.resumeFrom as {
          completedSteps: string[]
          partialData: Record<string, any>
        } | undefined

        /** Returns true if this step was already completed in a prior run. */
        const isCompleted = (step: string): boolean =>
          Array.isArray(resumeFrom?.completedSteps) &&
          resumeFrom!.completedSteps.includes(step)

        /** Retrieves checkpoint data for a given step. */
        const fromCheckpoint = (step: string): any =>
          resumeFrom?.partialData?.[step]

        // ─────────────────────────────────────────────────────────────────────

        if (!title || typeof title !== 'string') {
          sendProgress('error', 'error', 'A title or keyword is required.')
          controller.close()
          return
        }

        // ── Step 1: Topic Plan ────────────────────────────────────────────────
        let topicPlan: TopicPlan
        if (isCompleted('topic-plan') && fromCheckpoint('topic-plan')?.topicPlan) {
          topicPlan = fromCheckpoint('topic-plan').topicPlan as TopicPlan
          sendProgress('topic-plan', 'completed', 'Restored from checkpoint', {
            relevanceScore: topicPlan.validation?.relevanceScore,
            proceedWithGeneration: topicPlan.proceedWithGeneration,
            topicPlan,
          })
        } else {
          sendProgress('topic-plan', 'in-progress', 'Validating topic relevance and alignment...')
          const topicTitle =
            generationMode === 'insights' ? `${title} (${insightsPath} insights path)` : title
          topicPlan = await generateTopicPlan(topicTitle)
          sendProgress('topic-plan', 'completed', 'Topic validated successfully', {
            relevanceScore: topicPlan.validation?.relevanceScore,
            proceedWithGeneration: topicPlan.proceedWithGeneration,
            topicPlan,
          })
        }

        if (!topicPlan.proceedWithGeneration) {
          sendProgress(
            'error',
            'error',
            topicPlan.validation?.rejectionReason ||
              'Topic is not sufficiently aligned with Peridot/DeFi goals.',
            { relevanceScore: topicPlan.validation?.relevanceScore }
          )
          controller.close()
          return
        }

        // ── Step 2: Base Info ─────────────────────────────────────────────────
        let baseInfo: BaseInfo
        if (isCompleted('base-info') && fromCheckpoint('base-info')?.baseInfo) {
          baseInfo = fromCheckpoint('base-info').baseInfo as BaseInfo
          sendProgress('base-info', 'completed', 'Restored from checkpoint', {
            title: baseInfo.title,
            category: baseInfo.category,
            slug: (baseInfo as any).slug,
            baseInfo,
          })
        } else {
          sendProgress('base-info', 'in-progress', 'Generating title, slug, and metadata...')
          const baseTitle =
            generationMode === 'insights' ? `${title} - ${insightsPath} insights` : title
          baseInfo = await generateBaseInfo(baseTitle, topicPlan)
          sendProgress('base-info', 'completed', 'Metadata generated', {
            title: baseInfo.title,
            category: baseInfo.category,
            slug: (baseInfo as any).slug,
            baseInfo,
          })
        }

        // Strip path-name suffixes from AI-generated slugs (e.g. "-risk-insights", "-starter-insights")
        if (generationMode === 'insights' && (baseInfo as any).slug) {
          ;(baseInfo as any).slug = (baseInfo as any).slug
            .replace(/-(?:starter|yield|risk|market|action)-insights$/, '')
            .replace(/-insights$/, '')
        }

        // When regenerating, preserve the original slug so the DB record is updated, not duplicated
        if (regenerate && existingSlug) {
          ;(baseInfo as any).slug = existingSlug
        }

        // ── Step 2b: Insights Outline (insights only) ────────────────────────
        let outline: InsightsOutline | undefined
        if (generationMode === 'insights') {
          if (isCompleted('generate-outline') && fromCheckpoint('generate-outline')?.outline) {
            outline = fromCheckpoint('generate-outline').outline as InsightsOutline
            sendProgress('generate-outline', 'completed', `Restored from checkpoint (${outline.sectionPlans.length} sections)`, { outline })
          } else {
            sendProgress('generate-outline', 'in-progress', 'Building narrative outline and section plan...')
            outline = await generateInsightsOutline(baseInfo, insightsPath, chapterContext)
            sendProgress('generate-outline', 'completed',
              `Outline ready: ${outline.sectionPlans.length} sections planned`,
              { outline }
            )
          }
        }

        // ── Fetch existing articles for internal linking (blog only) ─────────
        let relatedArticles: Array<{ title: string; slug: string }> = []
        if (generationMode === 'blog') {
          try {
            const rows = await sql<Array<{ slug: string; title: string }>>`
              SELECT slug, title FROM blog_posts
              WHERE status = 'published' AND insights_data IS NULL
              ORDER BY published_at DESC
              LIMIT 60
            `
            relatedArticles = rows
          } catch {
            // non-fatal — generation continues without real links
          }
        }

        // ── Step 3: Article Content ───────────────────────────────────────────
        let articleInfo: ArticleInfo
        let insightsDraft: {
          path: InsightsPath
          sections: Array<{ heading: string; sentences: string[]; callout: string; imageUrl?: string; imageAlt?: string }>
          interactiveBlocks?: InteractiveBlockPlacement[]
        } | null = null

        if (isCompleted('article-content') && fromCheckpoint('article-content')?.articleInfo) {
          const stored = fromCheckpoint('article-content')
          articleInfo = stored.articleInfo as ArticleInfo
          insightsDraft = stored.insightsDraft ?? null
          sendProgress('article-content', 'completed', 'Restored from checkpoint', {
            contentLength: articleInfo.content.length,
            articleInfo,
            insightsDraft,
          })
        } else if (generationMode === 'insights') {
          sendProgress(
            'article-content',
            'in-progress',
            `Writing structured insights article (${insightsPath})...`
          )
          const insightsInfo = await generateInsightsArticleContent(baseInfo, insightsPath, chapterContext, outline, existingSections)
          articleInfo = { content: insightsInfo.content }
          insightsDraft = { path: insightsInfo.path, sections: insightsInfo.sections }
          sendProgress('article-content', 'completed', 'Insights article generated', {
            contentLength: articleInfo.content.length,
            sections: insightsInfo.sections.length,
            path: insightsInfo.path,
            articleInfo,
            insightsDraft,
          })
        } else {
          sendProgress('article-content', 'in-progress', 'Writing comprehensive article content...')
          articleInfo = await generateArticleContent(baseInfo, topicPlan, relatedArticles, existingContent)
          sendProgress('article-content', 'completed', 'Article content written', {
            contentLength: articleInfo.content.length,
            articleInfo,
            insightsDraft: null,
          })
        }

        // ── Step 3b: Interactive Block Placement (insights only) ──────────────
        if (generationMode === 'insights' && insightsDraft) {
          if (isCompleted('interactive-blocks') && fromCheckpoint('interactive-blocks')?.interactiveBlocks) {
            insightsDraft.interactiveBlocks = fromCheckpoint('interactive-blocks').interactiveBlocks as InteractiveBlockPlacement[]
            sendProgress('interactive-blocks', 'completed', 'Restored from checkpoint', {
              count: insightsDraft.interactiveBlocks?.length ?? 0,
              interactiveBlocks: insightsDraft.interactiveBlocks,
            })
          } else {
            try {
              sendProgress('interactive-blocks', 'in-progress', 'Selecting interactive learning components...')
              const placements = await generateInteractiveBlockPlacements(baseInfo, insightsPath, insightsDraft.sections)
              insightsDraft.interactiveBlocks = placements
              sendProgress('interactive-blocks', 'completed',
                placements.length > 0
                  ? `Placed ${placements.length} interactive component${placements.length > 1 ? 's' : ''}`
                  : 'No interactive components needed for this article',
                { count: placements.length, interactiveBlocks: placements }
              )
            } catch (error) {
              console.error('Error generating interactive block placements:', error)
              sendProgress('interactive-blocks', 'error', 'Interactive block placement failed, continuing without them')
            }
          }
        } else if (generationMode !== 'insights') {
          sendProgress('interactive-blocks', 'completed', 'Skipped for blog mode')
        }

        // ── Step 3c: Section Images (insights only) ───────────────────────────
        if (generationMode === 'insights' && insightsDraft && outline?.sectionPlans.length) {
          if (isCompleted('section-images') && fromCheckpoint('section-images')?.sections) {
            insightsDraft.sections = fromCheckpoint('section-images').sections
            const imgCount = insightsDraft.sections.filter((s) => (s as any).imageUrl).length
            sendProgress('section-images', 'completed', `Restored from checkpoint (${imgCount} images)`, {
              sections: insightsDraft.sections,
            })
          } else {
            const sectionPlans = outline.sectionPlans
            const visualCount = sectionPlans.filter((p) => p.visualType !== 'none').length
            sendProgress('section-images', 'in-progress',
              `Generating ${visualCount} section illustration${visualCount !== 1 ? 's' : ''} in parallel...`
            )

            const sectionsWithImages = insightsDraft.sections.map((s) => ({ ...s }))
            let completedImages = 0

            await Promise.allSettled(
              insightsDraft.sections.map(async (section, idx) => {
                const plan = sectionPlans[idx]
                if (!plan || plan.visualType === 'none') return
                try {
                  const kieUrl = await generateSectionImage(
                    section.heading,
                    plan.visualConcept,
                    plan.visualType,
                    baseInfo.title
                  )
                  const imageBuffer = await downloadImage(kieUrl)
                  const uploadedUrl = await uploadConceptImage(imageBuffer, (baseInfo as any).slug, idx + 1)
                  sectionsWithImages[idx] = {
                    ...sectionsWithImages[idx],
                    imageUrl: uploadedUrl,
                    imageAlt: `${section.heading} — ${plan.visualConcept}`,
                  }
                  completedImages++
                  sendProgress('section-images', 'in-progress',
                    `${completedImages} / ${visualCount} illustrations generated`
                  )
                } catch (err) {
                  console.error(`Section image failed for section ${idx} ("${section.heading}"):`, err)
                }
              })
            )

            insightsDraft.sections = sectionsWithImages
            sendProgress('section-images', 'completed',
              `${completedImages} illustration${completedImages !== 1 ? 's' : ''} added`,
              { sections: insightsDraft.sections, count: completedImages }
            )
          }
        } else if (generationMode === 'insights') {
          sendProgress('section-images', 'completed', 'Skipped — no outline available')
        } else {
          sendProgress('section-images', 'completed', 'Skipped for blog mode')
        }

        // ── Step 4: Meta Info ─────────────────────────────────────────────────
        let metaInfo: MetaInfo
        if (isCompleted('meta-info') && fromCheckpoint('meta-info')?.metaInfo) {
          metaInfo = fromCheckpoint('meta-info').metaInfo as MetaInfo
          sendProgress('meta-info', 'completed', 'Restored from checkpoint', { metaInfo })
        } else {
          sendProgress('meta-info', 'in-progress', 'Crafting SEO-optimized meta tags...')
          metaInfo = await generateMetaInfo(baseInfo, articleInfo)
          sendProgress('meta-info', 'completed', 'SEO metadata created', { metaInfo })
        }

        // ── Step 5: FAQ ───────────────────────────────────────────────────────
        // We avoid an explicit element-type annotation here because the helper
        // type `FAQInfo` refers to the container, not the array item.
        let faqItems: Awaited<ReturnType<typeof generateFAQ>>['faq']
        if (isCompleted('faq') && fromCheckpoint('faq')?.faq) {
          faqItems = fromCheckpoint('faq').faq
          sendProgress('faq', 'completed', `Restored from checkpoint (${faqItems.length} questions)`, {
            faq: faqItems,
          })
        } else {
          sendProgress('faq', 'in-progress', 'Generating frequently asked questions...')
          const faqResult = await generateFAQ(baseInfo, articleInfo)
          faqItems = faqResult.faq
          sendProgress('faq', 'completed', `FAQ generated (${faqItems.length} questions)`, {
            faq: faqItems,
          })
        }

        // ── Step 6: Cover Image ───────────────────────────────────────────────
        let coverImageUrl: string | null = null
        if (isCompleted('cover-image') && fromCheckpoint('cover-image')?.coverImageUrl) {
          coverImageUrl = fromCheckpoint('cover-image').coverImageUrl as string
          sendProgress('cover-image', 'completed', 'Restored from checkpoint', { coverImageUrl })
        } else {
          try {
            sendProgress('cover-image', 'in-progress', 'Generating cover image with AI...')
            const kieImageUrl = await generateKieImage(
              baseInfo.title,
              baseInfo.excerpt,
              baseInfo.category
            )
            sendProgress('cover-image', 'in-progress', 'Downloading generated image...')
            const imageBuffer = await downloadImage(kieImageUrl)
            sendProgress('cover-image', 'in-progress', 'Uploading to storage...')
            coverImageUrl = await uploadCoverImage(imageBuffer, (baseInfo as any).slug)
            sendProgress('cover-image', 'completed', 'Cover image uploaded', { coverImageUrl })
          } catch (error) {
            console.error('Error generating/uploading cover image:', error)
            sendProgress('cover-image', 'error', 'Cover image generation failed, continuing without it')
          }
        }

        // ── Step 7: Concept Image ─────────────────────────────────────────────
        // updatedContent starts as the raw article content and may be enriched
        // by steps 7 (concept image) and 8 (explanations).
        let updatedContent = articleInfo.content

        if (isCompleted('concept-image') && fromCheckpoint('concept-image')?.updatedContent) {
          updatedContent = fromCheckpoint('concept-image').updatedContent as string
          sendProgress('concept-image', 'completed', 'Restored from checkpoint', { updatedContent })
        } else if (generationMode === 'insights') {
          sendProgress('concept-image', 'completed', 'Skipped — section-images step handles Insights visuals')
        } else {
          try {
            sendProgress(
              'concept-image',
              'in-progress',
              'Analyzing article for concept image placement...'
            )
            const headers = extractHeaders(articleInfo.content)
            const placement = await determineImagePlacement(
              articleInfo.content,
              baseInfo.title,
              headers
            )

            if (placement && placement.shouldPlace) {
              sendProgress(
                'concept-image',
                'in-progress',
                `Generating concept image for: "${placement.headerText}"...`
              )
              const conceptImageUrl = await generateConceptImage(
                placement.headerText,
                placement.sectionContent,
                baseInfo.title
              )
              sendProgress('concept-image', 'in-progress', 'Downloading concept image...')
              const conceptImageBuffer = await downloadImage(conceptImageUrl)
              sendProgress('concept-image', 'in-progress', 'Uploading concept image...')
              const uploadedConceptImageUrl = await uploadConceptImage(
                conceptImageBuffer,
                (baseInfo as any).slug,
                1
              )
              updatedContent = insertImageAtLine(
                articleInfo.content,
                placement.headerIndex,
                uploadedConceptImageUrl,
                placement.headerText
              )
              sendProgress('concept-image', 'completed', 'Concept image inserted', {
                conceptImageUrl: uploadedConceptImageUrl,
                updatedContent,
              })
            } else {
              sendProgress('concept-image', 'completed', 'No suitable placement found for concept image', {
                updatedContent,
              })
            }
          } catch (error) {
            console.error('Error generating/inserting concept image:', error)
            sendProgress(
              'concept-image',
              'error',
              'Concept image generation failed, continuing without it'
            )
          }
        }

        // ── Step 8: Explanations ──────────────────────────────────────────────
        if (isCompleted('explanations') && fromCheckpoint('explanations')?.updatedContent) {
          updatedContent = fromCheckpoint('explanations').updatedContent as string
          sendProgress('explanations', 'completed', 'Restored from checkpoint', { updatedContent })
        } else if (generationMode === 'insights') {
          sendProgress('explanations', 'completed', 'Skipped for Insights Builder mode')
        } else {
          try {
            sendProgress(
              'explanations',
              'in-progress',
              'Identifying complex concepts for deeper explanations...'
            )
            const explanations = await generateExplanations(updatedContent, baseInfo.title)

            if (explanations.placements.length > 0) {
              sendProgress(
                'explanations',
                'in-progress',
                `Found ${explanations.placements.length} concepts to explain...`
              )
              const sortedPlacements = [...explanations.placements].sort(
                (a, b) => b.lineIndex - a.lineIndex
              )
              for (const placement of sortedPlacements) {
                if (placement.shouldPlace) {
                  updatedContent = insertExplanationAtLine(
                    updatedContent,
                    placement.lineIndex,
                    placement.explanation
                  )
                }
              }
              sendProgress(
                'explanations',
                'completed',
                `Added ${explanations.placements.length} explanation${explanations.placements.length > 1 ? 's' : ''}`,
                { updatedContent }
              )
            } else {
              sendProgress(
                'explanations',
                'completed',
                'No complex concepts requiring explanations found',
                { updatedContent }
              )
            }
          } catch (error) {
            console.error('Error generating/inserting explanations:', error)
            sendProgress(
              'explanations',
              'error',
              'Explanation generation failed, continuing without explanations'
            )
          }
        }

        // ── Step 9: Fact Check ────────────────────────────────────────────────
        let factCheckSummary: FactCheckSummary | null = null
        if (isCompleted('fact-check') && fromCheckpoint('fact-check')?.factCheckSummary) {
          factCheckSummary = fromCheckpoint('fact-check').factCheckSummary as FactCheckSummary
          sendProgress('fact-check', 'completed', 'Restored from checkpoint', {
            verified: factCheckSummary?.verified,
            totalClaims: factCheckSummary?.totalClaims,
            overallStatus: factCheckSummary?.overallStatus,
            factCheckSummary,
          })
        } else {
          try {
            sendProgress('fact-check', 'in-progress', 'Extracting factual claims from article...')
            factCheckSummary = await factCheckArticle(updatedContent, baseInfo.title)
            sendProgress(
              'fact-check',
              'completed',
              `Fact-check complete: ${factCheckSummary.verified}/${factCheckSummary.totalClaims} verified`,
              {
                verified: factCheckSummary.verified,
                totalClaims: factCheckSummary.totalClaims,
                overallStatus: factCheckSummary.overallStatus,
                factCheckSummary,
              }
            )
          } catch (error) {
            console.error('Error during fact-checking:', error)
            sendProgress('fact-check', 'error', 'Fact-checking failed, continuing without results')
          }
        }

        // ── Final result ──────────────────────────────────────────────────────
        sendProgress('complete', 'completed', 'Article generation complete!', {
          generationMode,
          topicPlan,
          base: baseInfo,
          article: { ...articleInfo, content: updatedContent },
          insightsDraft,
          meta: metaInfo,
          faq: faqItems,
          coverImageUrl,
          factCheck: factCheckSummary,
        })

        controller.close()
      } catch (error) {
        console.error('Error generating article:', error)
        let errorMessage = 'An error occurred during article generation'
        if (error instanceof Error) {
          errorMessage = error.message || errorMessage
        } else if (typeof error === 'string') {
          errorMessage = error
        }
        errorMessage = sanitizeMessage(errorMessage) || errorMessage
        sendProgress('error', 'error', errorMessage)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
