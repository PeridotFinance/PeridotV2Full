import { MetadataRoute } from 'next'

// AI crawlers that read pages for retrieval and citation. They are welcome: the
// documentation exists to be quoted, and a model that answers from our own text
// beats one that guesses. They are listed in their own groups rather than left
// to the wildcard because several of them only honour the group naming them,
// and a group that names them is also a statement of intent that can be read.
const AI_CRAWLERS = [
  'GPTBot', // OpenAI, training and retrieval
  'OAI-SearchBot', // ChatGPT search
  'ChatGPT-User', // a user asking ChatGPT to open a page
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended', // Gemini grounding, separate from Googlebot
  'Applebot-Extended',
  'meta-externalagent',
  'Bytespider',
  'CCBot', // Common Crawl, the corpus behind many others
  'cohere-ai',
  'Amazonbot',
  'DuckAssistBot',
  'MistralAI-User',
  'YouBot',
]

const DISALLOW = ['/admin/', '/api/', '/dev/', '/dataroom']

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://peridot.finance'

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: '/', disallow: DISALLOW })),
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
