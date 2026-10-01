/**
 * llms.txt and llms-full.txt, generated from the docs registry.
 *
 * The proposal (llmstxt.org) asks for a markdown file at the site root: an H1,
 * a blockquote summary, then H2 sections of annotated links, so a model can read
 * a few kilobytes of curated context instead of crawling a JavaScript app.
 *
 * That is exactly our problem. The documentation is React components, and the
 * pages that matter most are behind interactive widgets. The registry already
 * holds a plain-text answer and a set of question and answer pairs for every
 * page, written for a reader but shaped for extraction, so the honest full-text
 * version of these docs is a render of that data rather than a scrape of the
 * HTML. Nothing here is generated or paraphrased: it is the same strings the
 * pages and their JSON-LD serve.
 */

import { ALL_DOC_PAGES, DOC_SECTIONS } from "./registry"

const SITE = "https://peridot.finance"

const SUMMARY =
  "Peridot Finance is a non-custodial DeFi broker: one account through which you lend, borrow and keep custody of your own crypto. Depositors earn a variable rate paid by borrowers, borrowers take overcollateralized loans against their own deposits, and an algorithm prices both sides from pool utilization. The primary markets run on Stellar (USDC, EURC, XLM), funded by SEPA bank transfer or card."

/** The short index: what exists, and where. */
export function buildLlmsTxt(): string {
  const lines: string[] = [
    "# Peridot Finance",
    "",
    `> ${SUMMARY}`,
    "",
    "Peridot is non-custodial: the protocol never holds user funds, never trades on a user's behalf, and cannot reverse a transaction. Interest rates are variable and there is no deposit insurance. Nothing in the documentation is financial advice.",
    "",
    `Full documentation text, in one file: ${SITE}/llms-full.txt`,
    "",
  ]

  for (const section of DOC_SECTIONS) {
    lines.push(`## Documentation: ${section.title}`, "")
    for (const page of section.pages) {
      lines.push(`- [${page.title}](${SITE}/docs/${page.slug}): ${page.description}`)
    }
    lines.push("")
  }

  lines.push(
    "## Product",
    "",
    `- [Peridot app](${SITE}/app): the product itself, with an Easy mode for saving and an Expert mode for full market access.`,
    `- [How it works](${SITE}/how-it-works): the lending model in brief.`,
    `- [Borrow without selling](${SITE}/borrow-without-selling): the borrowing case, explained for newcomers.`,
    `- [Security and audits](${SITE}/audits): audit reports and security posture.`,
    `- [Agent toolkit](${SITE}/agents): MCP server and tooling for programmatic access.`,
    "",
    "## Optional",
    "",
    `- [DeFi glossary](${SITE}/glossary): definitions of the terms used throughout the docs.`,
    `- [FAQ](${SITE}/faq): general questions about the product.`,
    `- [App handbook](${SITE}/guide): a screenshot catalogue of every screen in the app.`,
    `- [Blog](${SITE}/blog): announcements and background articles.`,
    "",
  )

  return lines.join("\n")
}

/** The long version: every page's answer and questions, in full. */
export function buildLlmsFullTxt(): string {
  const lines: string[] = [
    "# Peridot Finance: full documentation text",
    "",
    `> ${SUMMARY}`,
    "",
    `Source: ${SITE}/docs. Each section below states a documentation page's core answer, followed by the questions that page answers in full. Last reviewed ${ALL_DOC_PAGES[0]?.updated ?? ""}.`,
    "",
  ]

  for (const section of DOC_SECTIONS) {
    lines.push(`## ${section.title}`, "")
    for (const page of section.pages) {
      lines.push(`### ${page.title}`, "")
      lines.push(`URL: ${SITE}/docs/${page.slug}`)
      if (page.badge) lines.push(`Status: ${page.badge}`)
      lines.push(`Last reviewed: ${page.updated}`, "")
      lines.push(page.answer, "")
      for (const faq of page.faqs) {
        lines.push(`**${faq.q}**`, "", faq.a, "")
      }
    }
  }

  return lines.join("\n")
}

export const PLAIN_TEXT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  // Long enough that crawlers are not re-fetching it constantly, short enough
  // that a docs edit reaches them the same day.
  "Cache-Control": "public, max-age=3600, s-maxage=3600",
}
