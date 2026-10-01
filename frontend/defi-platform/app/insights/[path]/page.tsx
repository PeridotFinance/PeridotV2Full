import type { Metadata } from "next"
import Script from "next/script"
import { notFound } from "next/navigation"
import { InsightsPathExperienceClient } from "@/components/insights/InsightsPathExperienceClient"
import { InsightsMarketClient } from "@/components/insights/InsightsMarketClient"
import { insightsPathConfig, isInsightsPath } from "@/lib/insights-data"
import { getChaptersByPathFromDB } from "@/lib/insights-db"

type Props = { params: Promise<{ path: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params
  if (!isInsightsPath(path)) return {}
  return {
    title: `${insightsPathConfig[path].label} | Peridot Insights`,
    description: insightsPathConfig[path].description,
    alternates: { canonical: `/insights/${path}` },
    openGraph: {
      title: `${insightsPathConfig[path].label} | Peridot Insights`,
      description: insightsPathConfig[path].description,
      url: `/insights/${path}`,
    },
  }
}

export default async function InsightsPathPage({ params }: Props) {
  const { path } = await params
  if (!isInsightsPath(path)) notFound()
  const chapters = await getChaptersByPathFromDB(path)

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://peridot.finance"
  const config  = insightsPathConfig[path as keyof typeof insightsPathConfig]

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home",     item: baseUrl },
      { "@type": "ListItem", position: 2, name: "Insights", item: `${baseUrl}/insights` },
      { "@type": "ListItem", position: 3, name: config.label, item: `${baseUrl}/insights/${path}` },
    ],
  }

  const courseSchema = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: `Peridot Insights — ${config.label}`,
    description: config.description,
    url: `${baseUrl}/insights/${path}`,
    provider: { "@type": "Organization", name: "Peridot", url: baseUrl },
    hasCourseInstance: chapters.map((ch) => ({
      "@type": "CourseInstance",
      name: ch.title,
    })),
  }

  return (
    <>
      <Script id={`insights-path-breadcrumb-${path}`} type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Script id={`insights-path-course-${path}`} type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(courseSchema) }} />
      {path === "market" ? (
        <InsightsMarketClient chapters={chapters} />
      ) : (
        <InsightsPathExperienceClient path={path} chapters={chapters} />
      )}
    </>
  )
}
