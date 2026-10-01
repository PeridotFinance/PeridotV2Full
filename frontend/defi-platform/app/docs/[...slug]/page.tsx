import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import {
  ALL_DOC_PAGES,
  getAdjacentDocPages,
  getDocPage,
  getDocSectionForPage,
} from "@/lib/docs/registry"
import { docPageJsonLd } from "@/lib/docs/structuredData"
import { DOC_CONTENT } from "@/components/docs/content"
import { DocFaq } from "@/components/docs/DocFaq"
import { DocsToc } from "@/components/docs/DocsToc"
import { JsonLd } from "@/components/docs/JsonLd"
import { Badge } from "@/components/ui/badge"

interface Props {
  params: Promise<{ slug: string[] }>
}

export function generateStaticParams() {
  return ALL_DOC_PAGES.map((page) => ({ slug: [page.slug] }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const page = getDocPage(slug.join("/"))
  if (!page) return {}
  const url = `/docs/${page.slug}`
  return {
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: `${page.title} | Peridot Docs`,
      description: page.description,
      url,
      modifiedTime: page.updated,
    },
    twitter: {
      card: "summary_large_image",
      title: `${page.title} | Peridot Docs`,
      description: page.description,
    },
  }
}

const REVIEW_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

export default async function DocPage({ params }: Props) {
  const { slug } = await params
  const slugStr = slug.join("/")
  const page = getDocPage(slugStr)
  const Content = DOC_CONTENT[slugStr]
  if (!page || !Content) notFound()

  const section = getDocSectionForPage(slugStr)
  const { prev, next } = getAdjacentDocPages(slugStr)

  return (
    <>
      <JsonLd id={`docs-schema-${page.slug}`} data={docPageJsonLd(page, section)} />

      <article data-docs-article className="min-w-0 max-w-3xl">
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/docs" className="hover:text-foreground">
            Docs
          </Link>
          {section ? (
            <>
              <span aria-hidden>/</span>
              <span>{section.title}</span>
            </>
          ) : null}
        </nav>

        <div className="mb-2 flex items-center gap-3">
          <h1 className="text-3xl md:text-4xl font-bold">{page.title}</h1>
          {page.badge ? (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {page.badge}
            </Badge>
          ) : null}
        </div>
        <div className="mb-8 h-1 w-12 rounded-full bg-primary/60" aria-hidden />

        <Content />

        <DocFaq items={page.faqs} />

        {/* Machine-readable review date, and a human-readable one for the reader
            deciding whether a docs page still describes the product they see. */}
        <p className="mt-10 text-xs text-muted-foreground">
          Last reviewed on{" "}
          <time dateTime={page.updated}>
            {REVIEW_DATE_FORMAT.format(new Date(`${page.updated}T00:00:00Z`))}
          </time>
          .
        </p>

        <nav aria-label="Adjacent pages" className="mt-10 grid gap-3 border-t border-border/60 pt-6 sm:grid-cols-2">
          {prev ? (
            <Link
              href={`/docs/${prev.slug}`}
              className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3.5 transition-colors hover:border-primary/40"
            >
              <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0">
                <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">Previous</span>
                <span className="block truncate text-sm font-medium group-hover:text-primary">{prev.title}</span>
              </span>
            </Link>
          ) : (
            <span aria-hidden />
          )}
          {next ? (
            <Link
              href={`/docs/${next.slug}`}
              className="group flex items-center justify-end gap-3 rounded-xl border border-border/60 bg-card px-4 py-3.5 text-right transition-colors hover:border-primary/40 sm:col-start-2"
            >
              <span className="min-w-0">
                <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">Next</span>
                <span className="block truncate text-sm font-medium group-hover:text-primary">{next.title}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          ) : null}
        </nav>
      </article>

      <DocsToc />
    </>
  )
}
