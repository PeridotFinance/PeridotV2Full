import type { Metadata } from "next"
import Script from "next/script"
import { notFound } from "next/navigation"
import { InsightsArticleClient } from "@/components/insights/InsightsArticleClient"
import { glossaryTerms, isInsightsPath } from "@/lib/insights-data"
import {
  getInsightsArticleBySlugFromDB,
  getChaptersByPathFromDB,
  getPrevLessonFromDB,
  getNextLessonFromDB,
} from "@/lib/insights-db"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ path: string; slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path, slug } = await params
  const article = await getInsightsArticleBySlugFromDB(slug)
  if (!article || article.path !== path) return {}
  const ogImage = article.coverImage && !article.coverImage.includes(".svg")
    ? article.coverImage
    : "/misc/thumbnail-preview.webp"

  return {
    title: `${article.title} | Peridot Insights`,
    description: article.excerpt,
    alternates: { canonical: `/insights/${path}/${slug}` },
    openGraph: {
      title: article.title,
      description: article.excerpt,
      type: "article",
      publishedTime: article.publishedAt,
      url: `/insights/${path}/${slug}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: article.title }],
      tags: article.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.excerpt,
      images: [ogImage],
    },
  }
}

export default async function InsightsArticlePage({ params }: Props) {
  const { path, slug } = await params
  if (!isInsightsPath(path)) notFound()
  const article = await getInsightsArticleBySlugFromDB(slug)
  if (!article || article.path !== path) notFound()

  const [chapters, prevLesson, nextLesson] = await Promise.all([
    getChaptersByPathFromDB(article.path),
    getPrevLessonFromDB(article),
    getNextLessonFromDB(article),
  ])
  const chapterMeta = chapters.find((c) => c.slug === article.chapter.slug) ?? null

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://peridot.finance"
  const canonicalUrl = `${baseUrl}/insights/${article.path}/${article.slug}`
  const ogImage = article.coverImage && !article.coverImage.includes(".svg")
    ? article.coverImage
    : `${baseUrl}/misc/thumbnail-preview.webp`

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: article.title,
    headline: article.title,
    description: article.excerpt,
    url: canonicalUrl,
    datePublished: article.publishedAt,
    image: ogImage,
    educationalLevel: article.difficulty,
    learningResourceType: "Article",
    teaches: article.tags,
    author: [{ "@type": "Organization", name: "Peridot", url: baseUrl }],
    publisher: { "@type": "Organization", name: "Peridot", url: baseUrl },
    mainEntityOfPage: canonicalUrl,
    isPartOf: {
      "@type": "Course",
      name: `Peridot Insights — ${article.chapter.title}`,
      url: `${baseUrl}/insights/${article.path}`,
    },
  }

  const pathLabel = article.path.charAt(0).toUpperCase() + article.path.slice(1)
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home",     item: baseUrl },
      { "@type": "ListItem", position: 2, name: "Insights", item: `${baseUrl}/insights` },
      { "@type": "ListItem", position: 3, name: pathLabel,  item: `${baseUrl}/insights/${article.path}` },
      { "@type": "ListItem", position: 4, name: article.chapter.title, item: `${baseUrl}/insights/${article.path}` },
      { "@type": "ListItem", position: 5, name: article.title, item: canonicalUrl },
    ],
  }

  return (
    <>
      <Script
        id={`insights-article-schema-${article.slug}`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <Script
        id={`insights-breadcrumb-schema-${article.slug}`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <InsightsArticleClient
        article={article}
        glossaryTerms={glossaryTerms}
        chapterMeta={chapterMeta}
        prevLesson={prevLesson}
        nextLesson={nextLesson}
      />
    </>
  )
}
