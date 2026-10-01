import { MetadataRoute } from 'next'
import { fetchAllPostsFromDB } from '@/lib/blog-utils'
import { ALL_DOC_PAGES } from '@/lib/docs/registry'
import { sql } from '@/lib/database'

// The sitemap reads the blog/insights tables, so it must not be frozen into the
// build output: production is built locally and rsynced, where the database is
// unreachable, and the `.catch(() => [])` below then shipped a permanent
// 15-URL sitemap with none of the articles in it. Rendering per request keeps
// it in step with what is actually published.
export const dynamic = 'force-dynamic'

type Entry = MetadataRoute.Sitemap[number]

const page = (
  path: string,
  changeFrequency: Entry['changeFrequency'],
  priority: number,
): Entry => ({
  url: path,
  lastModified: new Date(),
  changeFrequency,
  priority,
})

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://peridot.finance'

  const staticPaths: Array<[string, Entry['changeFrequency'], number]> = [
    ['', 'daily', 1.0],
    ['/blog', 'daily', 0.9],
    ['/insights', 'daily', 0.85],
    ['/app', 'daily', 0.9],
    ['/borrow-without-selling', 'weekly', 0.85],
    ['/how-it-works', 'monthly', 0.8],
    ['/docs', 'weekly', 0.8],
    ['/app/leaderboard', 'daily', 0.8],
    ['/about', 'monthly', 0.7],
    ['/faq', 'monthly', 0.7],
    ['/whitepaper', 'monthly', 0.7],
    ['/agents', 'monthly', 0.7],
    ['/audits', 'monthly', 0.7],
    ['/guide', 'monthly', 0.7],
    ['/app/guide', 'monthly', 0.7],
    ['/app/bridge', 'monthly', 0.7],
    ['/app/stats', 'daily', 0.7],
    ['/contact', 'monthly', 0.6],
    ['/glossary', 'monthly', 0.6],
    ['/partner', 'monthly', 0.6],
    ['/brandkit', 'monthly', 0.5],
    ['/terms', 'yearly', 0.3],
    ['/privacy', 'yearly', 0.3],
    ['/cookies', 'yearly', 0.3],
  ]

  const staticPages: MetadataRoute.Sitemap = staticPaths.map(([path, freq, prio]) =>
    page(`${baseUrl}${path}`, freq, prio),
  )

  // Docs carry their own review date from the registry rather than "now": a
  // lastModified that moves on every request tells a crawler nothing.
  const docPages: MetadataRoute.Sitemap = ALL_DOC_PAGES.map((doc) => ({
    url: `${baseUrl}/docs/${doc.slug}`,
    lastModified: new Date(`${doc.updated}T00:00:00Z`),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  // A failing database must not silently empty the sitemap — log loudly and keep
  // the static half rather than telling Google the articles are gone.
  const [blogPosts, insightsRows] = await Promise.all([
    fetchAllPostsFromDB().catch((err) => {
      console.error('[sitemap] blog posts unavailable:', err)
      return []
    }),
    sql`
      SELECT slug, insights_data->>'path' AS path, COALESCE(published_at, updated_at, created_at) AS last_modified
      FROM blog_posts
      WHERE status = 'published' AND insights_data IS NOT NULL AND insights_data->>'path' IS NOT NULL
      ORDER BY last_modified DESC NULLS LAST
    `.catch((err) => {
      console.error('[sitemap] insights articles unavailable:', err)
      return [] as any[]
    }),
  ])

  const blogPages: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: post.date ? new Date(post.date) : new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.75,
  }))

  const insightsPages: MetadataRoute.Sitemap = (insightsRows as any[]).map((row) => ({
    url: `${baseUrl}/insights/${row.path}/${row.slug}`,
    lastModified: row.last_modified ? new Date(row.last_modified) : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.75,
  }))

  return [...staticPages, ...docPages, ...blogPages, ...insightsPages]
}
