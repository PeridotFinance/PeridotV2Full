/**
 * The visible half of the FAQ markup.
 *
 * Rendered from the same registry array that feeds the FAQPage JSON-LD, so the
 * two can never drift. Deliberately plain: a heading and a paragraph per
 * question, always expanded, no accordion. Collapsed text is harder for a reader
 * to scan and, in an answer engine's extraction pass, easier to lose entirely.
 */

import type { DocFaq as DocFaqItem } from "@/lib/docs/registry"

export function DocFaq({ items }: { items: DocFaqItem[] }) {
  if (!items.length) return null

  return (
    <section aria-labelledby="common-questions" className="mt-14">
      <h2
        id="common-questions"
        className="scroll-mt-32 text-xl md:text-2xl font-semibold mb-4"
      >
        Common questions
      </h2>
      <div className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card">
        {items.map((item) => (
          <div key={item.q} className="px-5 py-4">
            <h3 className="text-[15px] font-semibold text-foreground mb-1.5">{item.q}</h3>
            <p className="text-[15px] leading-7 text-muted-foreground">{item.a}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
