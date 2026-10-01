/**
 * Fact-checking utility using OpenAI function calling with responses API
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const FACT_CHECK_MODEL = 'gpt-4o-mini'

export interface FactCheckResult {
  claim: string
  verified: boolean
  confidence: number // 0-100
  sources?: string[]
  notes?: string
  needsReview: boolean
}

export interface FactCheckSummary {
  totalClaims: number
  verified: number
  unverified: number
  needsReview: number
  results: FactCheckResult[]
  overallStatus: 'pass' | 'warning' | 'fail'
}

/**
 * Extract factual claims from article content
 */
async function extractClaims(articleContent: string, articleTitle: string): Promise<string[]> {
  console.log('extractClaims called with title:', articleTitle)
  console.log('Content length:', articleContent.length)
  
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('OPENAI_API_KEY not configured!')
    throw new Error('OPENAI_API_KEY is not configured')
  }
  console.log('API key found, proceeding with extraction')

  const systemPrompt = `You are a fact-checking assistant. Extract all factual claims, statistics, and verifiable statements from the article. Be thorough and extract ALL verifiable facts, not just a few.`
  const userPrompt = `Extract ALL factual claims from this article that can be verified:

Title: ${articleTitle}

Content:
${articleContent.slice(0, 4000)}

Extract every verifiable factual statement. Each claim should be a specific, verifiable statement. Focus on:
- Statistics and numbers (e.g., "The protocol has $100M TVL")
- Historical facts (e.g., "Ethereum launched in 2015")
- Technical specifications (e.g., "The protocol uses Chainlink oracles")
- Protocol names and versions (e.g., "Aave v3 supports 10 chains")
- Market data and figures (e.g., "APY rates range from 5% to 15%")
- Dates and timelines (e.g., "The upgrade happened in Q2 2024")
- Process descriptions with specific details (e.g., "Users must deposit collateral worth 150% of loan value")

Return a comprehensive list of ALL claims found in the article.`

  console.log('Making API call to:', OPENAI_API_URL)
  console.log('Using model:', FACT_CHECK_MODEL)
  
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: FACT_CHECK_MODEL,
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
      text: {
        format: {
          type: 'json_schema',
          name: 'claims_extraction',
          schema: {
            type: 'object',
            properties: {
              claims: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'Array of factual claims extracted from the article',
              },
            },
            required: ['claims'],
            additionalProperties: false,
          },
          strict: true,
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('OpenAI API error response:', response.status, errorText)
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`)
  }

  console.log('API call successful, parsing response...')
  const data = await response.json()
  console.log('Response data structure:', Object.keys(data))
  console.log('Full response (first 500 chars):', JSON.stringify(data).slice(0, 500))
  
  // Parse structured output - responses API with json_schema returns parsed JSON
  try {
    let parsedData: { claims?: string[] } = {}
    
    // Try output_text first (most common for structured outputs)
    if (data.output_text) {
      console.log('Found output_text, parsing as JSON...')
      parsedData = JSON.parse(data.output_text)
    } 
    // Try output array
    else if (data.output && Array.isArray(data.output)) {
      console.log('Found output array, searching for text content...')
      for (const item of data.output) {
        if (item.type === 'message' && item.content && Array.isArray(item.content)) {
          for (const contentItem of item.content) {
            if (contentItem.type === 'output_text' && contentItem.text) {
              console.log('Found output_text in message content')
              parsedData = JSON.parse(contentItem.text)
              break
            }
          }
        }
        if (parsedData.claims) break
      }
    }
    
    console.log('Parsed data:', JSON.stringify(parsedData, null, 2))
    
    const claims = parsedData.claims || []
    const filteredClaims = Array.isArray(claims) ? claims.filter((c: any) => typeof c === 'string' && c.trim().length > 0) : []
    
    console.log(`✓ Extracted ${filteredClaims.length} claims from article`)
    if (filteredClaims.length > 0) {
      console.log('Sample claims:', filteredClaims.slice(0, 3))
    } else {
      console.warn('⚠ No claims extracted - this might indicate an issue')
    }
    
    return filteredClaims
  } catch (e) {
    console.error('❌ Failed to parse claims from structured output:', e)
    console.error('Raw response:', JSON.stringify(data, null, 2))
    return []
  }
}

/**
 * Fact-check a single claim using structured outputs (no function calling)
 */
async function factCheckClaim(claim: string): Promise<FactCheckResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const systemPrompt = `You are a fact-checker for DeFi and blockchain content. Assess claims based on your training data and knowledge.

For each claim, provide:
- verified: true if the claim is accurate, false if inaccurate or fabricated
- confidence: 0-100 score (90-100% for well-established facts, 70-89% for likely true, 50-69% for uncertain, 0-49% for likely false/fabricated)
- sources: note "general knowledge" or specific sources if known
- notes: brief explanation of your assessment
- needsReview: true if there's genuine uncertainty or the claim needs external verification

Be thorough and accurate.`
  
  const userPrompt = `Assess this claim and determine if it's a fact or fabricated: "${claim}"

Provide your assessment with a confidence score (0-100) indicating how likely this is to be a factual statement versus fabricated or inaccurate.`

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: FACT_CHECK_MODEL,
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
      text: {
        format: {
          type: 'json_schema',
          name: 'fact_check_result',
          schema: {
            type: 'object',
            properties: {
              verified: {
                type: 'boolean',
                description: 'Whether the claim is verified as accurate',
              },
              confidence: {
                type: 'number',
                description: 'Confidence level from 0-100 (0-49: likely false/fabricated, 50-69: uncertain, 70-89: likely true, 90-100: well-established fact)',
                minimum: 0,
                maximum: 100,
              },
              sources: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'List of sources or "general knowledge"',
              },
              notes: {
                type: 'string',
                description: 'Brief explanation of the verification result',
              },
              needsReview: {
                type: 'boolean',
                description: 'Whether this claim needs manual human review',
              },
            },
            required: ['verified', 'confidence', 'sources', 'notes', 'needsReview'],
            additionalProperties: false,
          },
          strict: true,
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  
  // Parse structured output
  try {
    let parsedData: {
      verified?: boolean
      confidence?: number
      sources?: string[]
      notes?: string
      needsReview?: boolean
    } = {}
    
    // Try output_text first (most common for structured outputs)
    if (data.output_text) {
      parsedData = JSON.parse(data.output_text)
    } 
    // Try output array with message content
    else if (data.output && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type === 'message' && item.content && Array.isArray(item.content)) {
          for (const contentItem of item.content) {
            if (contentItem.type === 'output_text' && contentItem.text) {
              parsedData = JSON.parse(contentItem.text)
              break
            }
          }
        }
        if (parsedData.verified !== undefined) break
      }
    }
    
    const result = {
      claim,
      verified: Boolean(parsedData.verified),
      confidence: Math.max(0, Math.min(100, Number(parsedData.confidence) || 50)),
      sources: Array.isArray(parsedData.sources) ? parsedData.sources : undefined,
      notes: parsedData.notes || '',
      needsReview: Boolean(parsedData.needsReview !== undefined ? parsedData.needsReview : (parsedData.confidence !== undefined && parsedData.confidence < 70) || !parsedData.verified),
    }
    
    return result
  } catch (e) {
    console.error('Failed to parse fact-check result:', e)
    throw new Error(`Failed to parse fact-check result: ${e instanceof Error ? e.message : 'Unknown error'}`)
  }
}

/**
 * Criticize a claim - provide detailed criticism
 */
export async function criticizeClaim(claim: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const systemPrompt = `You are a critical fact-checker for DeFi and blockchain content. Provide detailed, constructive criticism of claims.`
  
  const userPrompt = `Criticize this claim in detail: "${claim}"

Provide a thorough criticism pointing out:
- Any inaccuracies or potential issues
- Missing context or nuance
- Areas that need clarification
- Potential misunderstandings

Be constructive and specific.`

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: FACT_CHECK_MODEL,
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
      text: {
        format: {
          type: 'text',
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  return data.output_text || data.output?.[0]?.content?.[0]?.text || ''
}

/**
 * Enhance/correct a claim - provide improved version
 */
export async function enhanceClaim(claim: string, criticism?: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const systemPrompt = `You are a fact-checker and content editor for DeFi and blockchain content. Rewrite claims to be more accurate, clear, and factual.`
  
  const userPrompt = criticism
    ? `Original claim: "${claim}"
    
Criticism: "${criticism}"

Based on the criticism, rewrite this claim to be more accurate, clear, and factual. Keep it concise but ensure it's correct.`
    : `Rewrite this claim to be more accurate, clear, and factual: "${claim}"

Ensure the enhanced version is:
- Factually accurate
- Clear and concise
- Free from misleading statements
- Well-supported`

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: FACT_CHECK_MODEL,
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
      text: {
        format: {
          type: 'text',
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  return data.output_text || data.output?.[0]?.content?.[0]?.text || ''
}

/**
 * Parse the final assessment from OpenAI response
 */
function parseFactCheckAssessment(claim: string, assessment: string): FactCheckResult {
  // Try to parse as JSON first
  let parsed: any = null
  try {
    let cleaned = assessment.trim()
    if (cleaned.startsWith('```')) {
      const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
      if (fenceMatch) {
        cleaned = fenceMatch[1].trim()
      }
    }
    parsed = JSON.parse(cleaned)
  } catch (e) {
    // Fall back to regex parsing if JSON parsing fails
  }

  if (parsed && typeof parsed === 'object') {
    return {
      claim,
      verified: Boolean(parsed.verified),
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 50)),
      sources: Array.isArray(parsed.sources) ? parsed.sources : undefined,
      notes: parsed.notes || assessment.slice(0, 500),
      needsReview: Boolean(parsed.needsReview !== undefined ? parsed.needsReview : (parsed.confidence < 70 || !parsed.verified)),
    }
  }

  // Fallback: Try to extract structured information from the assessment
  const verifiedMatch = assessment.match(/verified[:\s]+(true|false|yes|no)/i)
  const confidenceMatch = assessment.match(/confidence[:\s]+(\d+)/i)
  const needsReviewMatch = assessment.match(/needs?\s+review[:\s]+(true|false|yes|no)/i)
  
  const verified = verifiedMatch ? /true|yes/i.test(verifiedMatch[1]) : false
  const confidence = confidenceMatch ? parseInt(confidenceMatch[1], 10) : 50
  const needsReview = needsReviewMatch ? /true|yes/i.test(needsReviewMatch[1]) : confidence < 70

  // Extract sources if mentioned
  const sourcesMatch = assessment.match(/sources?[:\s]+\[(.*?)\]/i)
  const sources = sourcesMatch ? sourcesMatch[1].split(',').map((s: string) => s.trim().replace(/['"]/g, '')) : undefined

  return {
    claim,
    verified,
    confidence: Math.max(0, Math.min(100, confidence)),
    sources,
    notes: assessment.length > 500 ? assessment.slice(0, 500) + '...' : assessment,
    needsReview: needsReview || !verified || confidence < 70,
  }
}

/**
 * Fact-check an entire article
 */
export async function factCheckArticle(
  articleContent: string,
  articleTitle: string
): Promise<FactCheckSummary> {
  console.log('=== FACT-CHECK ARTICLE START ===')
  console.log('Article title:', articleTitle)
  console.log('Article content length:', articleContent.length)
  
  try {
    console.log('Step 1: Extracting claims from article...')
    const claims = await extractClaims(articleContent, articleTitle)
    console.log('Claims extraction complete. Found:', claims.length)
    
    if (claims.length === 0) {
      return {
        totalClaims: 0,
        verified: 0,
        unverified: 0,
        needsReview: 0,
        results: [],
        overallStatus: 'pass',
      }
    }

    console.log(`Found ${claims.length} claims to verify...`)
    
    // Limit to 1 claim for testing purposes
    const claimsToCheck = claims.slice(0, 1)
    console.log(`Limiting to ${claimsToCheck.length} claim(s) for testing`)
    
    // Fact-check each claim (with rate limiting consideration)
    const results: FactCheckResult[] = []
    for (let i = 0; i < claimsToCheck.length; i++) {
      const claim = claimsToCheck[i]
      console.log(`Fact-checking claim ${i + 1}/${claimsToCheck.length}: ${claim.slice(0, 50)}...`)
      
      try {
        const result = await factCheckClaim(claim)
        results.push(result)
        
        // Small delay to avoid rate limits
        if (i < claimsToCheck.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      } catch (error) {
        console.error(`Error fact-checking claim "${claim}":`, error)
        results.push({
          claim,
          verified: false,
          confidence: 0,
          needsReview: true,
          notes: `Error during fact-checking: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }

    // Calculate summary
    const verified = results.filter((r) => r.verified && r.confidence >= 70).length
    const unverified = results.filter((r) => !r.verified || r.confidence < 50).length
    const needsReview = results.filter((r) => r.needsReview).length

    let overallStatus: 'pass' | 'warning' | 'fail' = 'pass'
    if (needsReview > results.length * 0.3) {
      overallStatus = 'fail'
    } else if (needsReview > 0 || unverified > 0) {
      overallStatus = 'warning'
    }

    return {
      totalClaims: claims.length, // Keep original count for reference
      verified,
      unverified,
      needsReview,
      results,
      overallStatus,
    }
  } catch (error) {
    console.error('Error in fact-checking:', error)
    return {
      totalClaims: 0,
      verified: 0,
      unverified: 0,
      needsReview: 0,
      results: [],
      overallStatus: 'warning',
    }
  }
}

