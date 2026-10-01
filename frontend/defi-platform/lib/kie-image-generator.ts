const KIE_API_KEY = process.env.KIE_API_KEY || 'd258adac719e71fd2be3fcf6226f4cad'
const KIE_API_BASE = 'https://api.kie.ai/api/v1'

interface KieTaskResponse {
  code: number
  message: string
  data: {
    taskId: string
  }
}

interface KieTaskStatus {
  code: number
  message: string
  data: {
    taskId: string
    state: 'pending' | 'processing' | 'success' | 'failed'
    resultJson?: string
    failMsg?: string
  }
}

/**
 * Generate an image using Kie API with Peridot branding guidelines
 */
export async function generateKieImage(
  title: string,
  excerpt: string,
  category: string
): Promise<string> {
  // Create a prompt that follows Peridot style guidelines
  const prompt = `Create a professional, modern fintech blog cover image for an article titled "${title}". 

Style guidelines:
- Clean, minimalist design with a modern tech aesthetic
- Use Peridot's brand colors: green gradient (#10b981 to #059669) as primary, with white and subtle grays
- Professional and trustworthy appearance suitable for DeFi/fintech content
- Abstract geometric patterns or subtle blockchain/network visual elements
- High contrast for readability
- IMPORTANT: The text "Peridot" must appear clearly in the lower right corner in white, elegant sans-serif font, with good contrast against the background
- Category: ${category}
- Article theme: ${excerpt}

The image should be visually appealing, professional, and clearly branded as Peridot content. Avoid cluttered designs, use plenty of white space, and maintain a sophisticated fintech aesthetic. The "Peridot" branding text in the lower right corner is essential and must be clearly visible.`

  // Create the task
  const createResponse = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KIE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'google/nano-banana',
      input: {
        prompt: prompt,
        output_format: 'jpeg',
        image_size: '16:9', // Standard blog cover image ratio
      },
    }),
  })

  if (!createResponse.ok) {
    const errorText = await createResponse.text()
    throw new Error(`Kie API create task error: ${createResponse.status} ${errorText}`)
  }

  const createData: KieTaskResponse = await createResponse.json()
  if (createData.code !== 200) {
    throw new Error(`Kie API error: ${createData.message}`)
  }

  const taskId = createData.data.taskId

  // Poll for completion (max 2 minutes, check every 3 seconds)
  const maxAttempts = 40
  const pollInterval = 3000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval))

    const statusResponse = await fetch(
      `${KIE_API_BASE}/jobs/recordInfo?taskId=${taskId}`,
      {
        headers: {
          Authorization: `Bearer ${KIE_API_KEY}`,
        },
      }
    )

    if (!statusResponse.ok) {
      continue // Retry on error
    }

    const statusData: KieTaskStatus = await statusResponse.json()
    if (statusData.code !== 200) {
      continue // Retry on error
    }

    const { state, resultJson, failMsg } = statusData.data

    if (state === 'success' && resultJson) {
      try {
        const result = JSON.parse(resultJson)
        const imageUrl = result.resultUrls?.[0]
        if (imageUrl) {
          return imageUrl
        }
      } catch (e) {
        throw new Error('Failed to parse Kie API result')
      }
    }

    if (state === 'failed') {
      throw new Error(`Kie API generation failed: ${failMsg || 'Unknown error'}`)
    }

    // Continue polling if pending or processing
  }

  throw new Error('Kie API image generation timed out')
}

/**
 * Generate a concept visualization image using Kie API
 * This is for in-article images that visualize concepts under headers
 */
export async function generateConceptImage(
  headerText: string,
  sectionContent: string,
  articleTitle: string
): Promise<string> {
  // Create a prompt focused on visualizing the concept
  const prompt = `Create a professional, educational diagram or illustration that visualizes the concept: "${headerText}".

Context:
- This is part of an article titled: "${articleTitle}"
- The section discusses: ${sectionContent.slice(0, 300)}

Style guidelines:
- Clean, minimalist educational diagram style
- Use Peridot's brand colors: green gradient (#10b981 to #059669) as accent, with white background and subtle grays
- Professional and informative appearance suitable for DeFi/fintech educational content
- Focus on clarity and visual explanation of the concept
- Can include abstract geometric patterns, flow diagrams, or conceptual illustrations
- High contrast for readability
- NO text overlay or branding - this is a pure concept visualization
- The image should help readers understand the concept better

The image should be visually clear, educational, and help explain the concept "${headerText}" in a way that enhances reader understanding.`

  // Create the task
  const createResponse = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KIE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'google/nano-banana',
      input: {
        prompt: prompt,
        output_format: 'jpeg',
        image_size: '16:9', // Standard blog image ratio
      },
    }),
  })

  if (!createResponse.ok) {
    const errorText = await createResponse.text()
    throw new Error(`Kie API create task error: ${createResponse.status} ${errorText}`)
  }

  const createData: KieTaskResponse = await createResponse.json()
  if (createData.code !== 200) {
    throw new Error(`Kie API error: ${createData.message}`)
  }

  const taskId = createData.data.taskId

  // Poll for completion (max 2 minutes, check every 3 seconds)
  const maxAttempts = 40
  const pollInterval = 3000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval))

    const statusResponse = await fetch(
      `${KIE_API_BASE}/jobs/recordInfo?taskId=${taskId}`,
      {
        headers: {
          Authorization: `Bearer ${KIE_API_KEY}`,
        },
      }
    )

    if (!statusResponse.ok) {
      continue // Retry on error
    }

    const statusData: KieTaskStatus = await statusResponse.json()
    if (statusData.code !== 200) {
      continue // Retry on error
    }

    const { state, resultJson, failMsg } = statusData.data

    if (state === 'success' && resultJson) {
      try {
        const result = JSON.parse(resultJson)
        const imageUrl = result.resultUrls?.[0]
        if (imageUrl) {
          return imageUrl
        }
      } catch (e) {
        throw new Error('Failed to parse Kie API result')
      }
    }

    if (state === 'failed') {
      throw new Error(`Kie API generation failed: ${failMsg || 'Unknown error'}`)
    }

    // Continue polling if pending or processing
  }

  throw new Error('Kie API image generation timed out')
}

const VISUAL_TYPE_GUIDANCE: Record<string, string> = {
  'flow-diagram':      'a clean flow diagram with arrows, process steps, and decision points',
  'comparison-chart':  'a side-by-side comparison chart with clear labels and contrasting columns',
  'anatomy':           'an anatomy/breakdown diagram with labelled components and connecting lines',
  'scale-balance':     'a balance-scale or spectrum visualization showing tradeoffs and ratios',
  'before-after':      'a split before/after visualization showing transformation or contrast',
  'timeline':          'a clean horizontal or vertical timeline with milestone markers',
}

/**
 * Generate a visual illustration for a specific section of an Insights learning article.
 * Uses visual-type-aware prompting so each image matches the concept being explained.
 */
export async function generateSectionImage(
  sectionHeading: string,
  visualConcept: string,
  visualType: string,
  articleTitle: string
): Promise<string> {
  const visualGuidance = VISUAL_TYPE_GUIDANCE[visualType] ?? 'a professional abstract concept illustration'

  const prompt = `Create a professional educational illustration for a DeFi learning article.

Article: "${articleTitle}"
Section: "${sectionHeading}"
Concept to visualize: "${visualConcept}"
Illustration style: ${visualGuidance}

Design guidelines:
- Clean, minimalist educational illustration style
- Peridot brand colors: green gradient (#10b981 to #059669) as accent, white background, subtle grays
- Professional fintech / DeFi educational aesthetic
- High contrast — easy to read at any size
- Focus on clarity: the illustration must make the concept immediately understandable at a glance
- NO text labels that spell out the concept name — use visual metaphors only
- Wide format (16:9), suitable for embedding mid-article
- Avoid clutter; use generous white space`

  const createResponse = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KIE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'google/nano-banana',
      input: {
        prompt,
        output_format: 'jpeg',
        image_size: '16:9',
      },
    }),
  })

  if (!createResponse.ok) {
    const errorText = await createResponse.text()
    throw new Error(`Kie API create task error: ${createResponse.status} ${errorText}`)
  }

  const createData: KieTaskResponse = await createResponse.json()
  if (createData.code !== 200) {
    throw new Error(`Kie API error: ${createData.message}`)
  }

  const taskId = createData.data.taskId
  const maxAttempts = 40
  const pollInterval = 3000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval))
    const statusResponse = await fetch(`${KIE_API_BASE}/jobs/recordInfo?taskId=${taskId}`, {
      headers: { Authorization: `Bearer ${KIE_API_KEY}` },
    })
    if (!statusResponse.ok) continue
    const statusData: KieTaskStatus = await statusResponse.json()
    if (statusData.code !== 200) continue
    const { state, resultJson, failMsg } = statusData.data
    if (state === 'success' && resultJson) {
      try {
        const result = JSON.parse(resultJson)
        const imageUrl = result.resultUrls?.[0]
        if (imageUrl) return imageUrl
      } catch {
        throw new Error('Failed to parse Kie API result')
      }
    }
    if (state === 'failed') {
      throw new Error(`Kie API generation failed: ${failMsg || 'Unknown error'}`)
    }
  }

  throw new Error('Kie API image generation timed out')
}

/**
 * Download an image from a URL and return it as a Buffer
 */
export async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

