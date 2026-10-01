import type { Metadata } from "next"
import Link from "next/link"
import { DOC_SECTIONS } from "@/lib/docs/registry"
import { docsIndexJsonLd } from "@/lib/docs/structuredData"
import { JsonLd } from "@/components/docs/JsonLd"
import { Badge } from "@/components/ui/badge"

export const metadata: Metadata = {
  title: "Documentation | Peridot",
  description:
    "How Peridot works, from your first deposit to the exact interest-rate formulas the contracts run: lending, borrowing, collateral, liquidation, fiat rails and margin trading.",
  keywords: [
    "peridot documentation",
    "defi lending guide",
    "how to earn interest on crypto",
    "borrow against crypto",
    "jump rate model",
    "health factor",
    "stellar defi docs",
  ],
  alternates: { canonical: "/docs" },
  openGraph: {
    type: "website",
    title: "Peridot Documentation",
    description:
      "How Peridot works, from your first deposit to the exact interest-rate formulas the contracts run.",
    url: "/docs",
  },
}

export default function DocsHome() {
  return (
    <div className="min-w-0">
      <JsonLd id="docs-index-schema" data={docsIndexJsonLd()} />

      <div className="mb-12 max-w-2xl">
        <h1 className="text-3xl md:text-4xl font-bold mb-4">Peridot Documentation</h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Peridot is a non-custodial DeFi broker: one account through which you lend, borrow and
          keep custody of your own assets. These pages cover all of it, from your first deposit to
          the exact formulas the contracts run, with interactive charts and calculators along the
          way. New here? Start with{" "}
          <Link href="/docs/what-is-peridot" className="text-primary font-medium">
            What is Peridot?
          </Link>
        </p>
      </div>

      <div className="space-y-10">
        {DOC_SECTIONS.map((section) => (
          <section key={section.id} id={section.id} aria-label={section.title} className="scroll-mt-32">
            <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {section.pages.map((page) => (
                <Link
                  key={page.slug}
                  href={`/docs/${page.slug}`}
                  className="group rounded-xl border border-border/60 bg-card px-5 py-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <p className="mb-1 flex items-center gap-2 font-medium text-sm text-foreground group-hover:text-primary">
                    {page.title}
                    {page.badge ? (
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal text-muted-foreground">
                        {page.badge}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">{page.description}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
