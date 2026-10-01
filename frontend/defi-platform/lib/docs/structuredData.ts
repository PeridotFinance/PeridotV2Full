/**
 * JSON-LD for the documentation.
 *
 * Three types per article page, each earning its keep:
 *
 *   TechArticle     tells a crawler what the page is, when it was last reviewed
 *                   and who stands behind it. `abstract` carries the registry's
 *                   answer paragraph, which is the shortest correct statement of
 *                   the page that exists anywhere.
 *   BreadcrumbList  places the page in the tree, so a result can be shown as
 *                   Docs › Section › Page instead of a bare URL.
 *   FAQPage         the question and answer pairs. Google retired FAQ rich
 *                   results in 2026, so this is not chasing a snippet; the markup
 *                   is still valid schema.org that retrieval systems parse, and
 *                   it costs a few hundred bytes.
 *
 * Every FAQ emitted here is also rendered on the page by DocFaq, from the same
 * array. Markup that promises answers a reader cannot see is the one thing in
 * this area that can actively hurt.
 */

import type { DocPageMeta, DocSection } from "./registry"
import { ALL_DOC_PAGES, DOC_SECTIONS } from "./registry"

export const SITE_URL = "https://peridot.finance"
const ORG_ID = `${SITE_URL}/#organization`

function docUrl(slug: string) {
  return `${SITE_URL}/docs/${slug}`
}

function faqPage(page: DocPageMeta) {
  return {
    "@type": "FAQPage",
    "@id": `${docUrl(page.slug)}#faq`,
    mainEntity: page.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  }
}

function breadcrumbs(page: DocPageMeta, section?: DocSection) {
  const trail: Array<{ name: string; item: string }> = [
    { name: "Home", item: SITE_URL },
    { name: "Documentation", item: `${SITE_URL}/docs` },
  ]
  // Sections have no page of their own, so the section step points at the index
  // it is listed on rather than inventing a URL that would 404.
  if (section) trail.push({ name: section.title, item: `${SITE_URL}/docs#${section.id}` })
  trail.push({ name: page.title, item: docUrl(page.slug) })

  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: step.name,
      item: step.item,
    })),
  }
}

/** The @graph for a single documentation article. */
export function docPageJsonLd(page: DocPageMeta, section?: DocSection) {
  const url = docUrl(page.slug)

  const article = {
    "@type": "TechArticle",
    "@id": `${url}#article`,
    headline: page.title,
    name: page.title,
    description: page.description,
    abstract: page.answer,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    inLanguage: "en",
    isAccessibleForFree: true,
    keywords: page.keywords.join(", "),
    dateModified: page.updated,
    datePublished: "2026-07-30",
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    isPartOf: { "@id": `${SITE_URL}/#website` },
    ...(section ? { articleSection: section.title } : {}),
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      article,
      breadcrumbs(page, section),
      ...(page.faqs.length ? [faqPage(page)] : []),
    ],
  }
}

/** The @graph for the documentation index: the table of contents, as data. */
export function docsIndexJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/docs#collection`,
        name: "Peridot Documentation",
        description:
          "The complete documentation for Peridot Finance: lending, borrowing, the interest-rate model, margin trading, fiat rails and the app itself.",
        url: `${SITE_URL}/docs`,
        inLanguage: "en",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        publisher: { "@id": ORG_ID },
        hasPart: ALL_DOC_PAGES.map((page) => ({
          "@type": "TechArticle",
          "@id": `${docUrl(page.slug)}#article`,
          headline: page.title,
          description: page.description,
          url: docUrl(page.slug),
        })),
      },
      {
        "@type": "ItemList",
        "@id": `${SITE_URL}/docs#toc`,
        name: "Documentation contents",
        itemListElement: DOC_SECTIONS.flatMap((section) => section.pages).map((page, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: page.title,
          url: docUrl(page.slug),
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Documentation", item: `${SITE_URL}/docs` },
        ],
      },
    ],
  }
}
