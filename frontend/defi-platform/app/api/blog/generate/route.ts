import { NextRequest, NextResponse } from 'next/server'
import { generateKieImage, generateConceptImage, downloadImage } from '@/lib/kie-image-generator'
import { uploadCoverImage, uploadConceptImage } from '@/lib/firebase-storage'
import { extractHeaders, insertImageAtLine, insertExplanationAtLine, type HeaderInfo } from '@/lib/markdown-utils'
import { factCheckArticle, type FactCheckSummary } from '@/lib/fact-checker'
import {
  generateTopicPlan,
  generateBaseInfo,
  generateArticleContent,
  generateMetaInfo,
  generateFAQ,
  generateExplanations,
  callOpenAI,
  parseModelJson,
  type TopicPlan,
  type BaseInfo,
  type ArticleInfo,
  type MetaInfo,
  type FAQInfo,
} from '../generate-helpers'

type ImagePlacement = {
  headerIndex: number
  headerText: string
  sectionContent: string
  imagePrompt: string
  shouldPlace: boolean
}

async function determineImagePlacement(
  articleContent: string,
  articleTitle: string,
  headers: HeaderInfo[]
): Promise<ImagePlacement | null> {
  if (headers.length === 0) {
    return null
  }

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
  "headerIndex": number, // Index in the headers array (0-based)
  "headerText": string, // The header text
  "sectionContent": string, // The content under this header (first 300 chars)
  "imagePrompt": string, // A detailed prompt for generating the image that visualizes this concept
  "shouldPlace": boolean // true if an image should be placed, false otherwise
}

If no good placement is found, set "shouldPlace": false.
`

  const output = await callOpenAI(systemPrompt, userPrompt)
  const placement = parseModelJson<ImagePlacement>(output)
  
  if (!placement.shouldPlace || placement.headerIndex < 0 || placement.headerIndex >= headers.length) {
    return null
  }

  // Get the actual header info
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
  try {
    const { title } = await request.json()
    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'A title or keyword is required.' }, { status: 400 })
    }

    const topicPlan = await generateTopicPlan(title)
    if (!topicPlan.proceedWithGeneration) {
      return NextResponse.json(
        {
          error: topicPlan.validation?.rejectionReason || 'Topic is not sufficiently aligned with Peridot/DeFi goals.',
          topicPlan,
        },
        { status: 422 }
      )
    }

    const baseInfo = await generateBaseInfo(title, topicPlan)
    const articleInfo = await generateArticleContent(baseInfo)
    const metaInfo = await generateMetaInfo(baseInfo, articleInfo)
    const faqInfo = await generateFAQ(baseInfo, articleInfo)

    // Generate and upload cover image using Kie API
    let coverImageUrl: string | null = null
    try {
      console.log('Generating cover image with Kie API...')
      const kieImageUrl = await generateKieImage(
        baseInfo.title,
        baseInfo.excerpt,
        baseInfo.category
      )
      console.log('Kie image generated, downloading...', kieImageUrl)
      
      const imageBuffer = await downloadImage(kieImageUrl)
      console.log('Image downloaded, uploading to R2...')
      
      coverImageUrl = await uploadCoverImage(imageBuffer, baseInfo.slug)
      console.log('Cover image uploaded:', coverImageUrl)
    } catch (error) {
      console.error('Error generating/uploading cover image with Kie API:', error)
      // Don't fail the entire request if image generation fails
      // The user can still use the article without the image
    }

    // Generate and insert concept image
    let updatedContent = articleInfo.content
    try {
      console.log('Analyzing article for concept image placement...')
      const headers = extractHeaders(articleInfo.content)
      const placement = await determineImagePlacement(
        articleInfo.content,
        baseInfo.title,
        headers
      )

      if (placement && placement.shouldPlace) {
        console.log(`Generating concept image for header: "${placement.headerText}"...`)
        const conceptImageUrl = await generateConceptImage(
          placement.headerText,
          placement.sectionContent,
          baseInfo.title
        )
        console.log('Concept image generated, downloading...', conceptImageUrl)
        
        const conceptImageBuffer = await downloadImage(conceptImageUrl)
        console.log('Concept image downloaded, uploading to R2...')
        
        const uploadedConceptImageUrl = await uploadConceptImage(
          conceptImageBuffer,
          baseInfo.slug,
          1
        )
        console.log('Concept image uploaded:', uploadedConceptImageUrl)
        
        // Insert image into markdown content
        updatedContent = insertImageAtLine(
          articleInfo.content,
          placement.headerIndex,
          uploadedConceptImageUrl,
          placement.headerText
        )
        console.log('Concept image inserted into article content')
      } else {
        console.log('No suitable placement found for concept image')
      }
    } catch (error) {
      console.error('Error generating/inserting concept image:', error)
      // Don't fail the entire request if concept image generation fails
      // The article will still be usable without the concept image
    }

    // Generate and insert explanations
    try {
      console.log('Generating explanations for complex concepts...')
      const explanations = await generateExplanations(updatedContent, baseInfo.title)
      
      if (explanations.placements.length > 0) {
        console.log(`Found ${explanations.placements.length} explanation placements`)
        // Insert explanations in reverse order to maintain line indices
        const sortedPlacements = [...explanations.placements].sort((a, b) => b.lineIndex - a.lineIndex)
        
        for (const placement of sortedPlacements) {
          if (placement.shouldPlace) {
            updatedContent = insertExplanationAtLine(
              updatedContent,
              placement.lineIndex,
              placement.explanation
            )
            console.log(`Inserted explanation at line ${placement.lineIndex}`)
          }
        }
      } else {
        console.log('No suitable explanation placements found')
      }
    } catch (error) {
      console.error('Error generating/inserting explanations:', error)
      // Don't fail the entire request if explanation generation fails
      // The article will still be usable without explanations
    }

    // Fact-check the article
    let factCheckSummary: FactCheckSummary | null = null
    try {
      console.log('Starting fact-checking process...')
      factCheckSummary = await factCheckArticle(updatedContent, baseInfo.title)
      console.log(`Fact-checking complete: ${factCheckSummary.verified}/${factCheckSummary.totalClaims} verified, status: ${factCheckSummary.overallStatus}`)
    } catch (error) {
      console.error('Error during fact-checking:', error)
      // Don't fail the entire request if fact-checking fails
      // The article will still be usable, but without fact-check results
    }

    return NextResponse.json({
      topicPlan,
      base: baseInfo,
      article: { ...articleInfo, content: updatedContent },
      meta: metaInfo,
      faq: faqInfo.faq,
      coverImageUrl: coverImageUrl,
      factCheck: factCheckSummary,
    })
  } catch (error) {
    console.error('Error generating article via OpenAI:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}


