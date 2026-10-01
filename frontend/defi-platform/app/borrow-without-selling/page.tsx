import type { Metadata } from "next"
import { BorrowRatesPanel } from "@/components/landing/BorrowRatesPanel"
import { LandingCta } from "@/components/landing/LandingCta"

/**
 * Campaign landing page.
 *
 * Every link Peridot has ever posted pointed at `/`, and the homepage asks for
 * nothing in particular: in the week of 8 March 2026 a post sent 197 visitors,
 * 160 of them to the homepage, and not one of them connected a wallet in the
 * fortnight that followed. This page exists so campaign traffic lands somewhere
 * that makes a single claim and asks for a single thing.
 *
 * It is also the first page on the site aimed at borrowing as a product rather
 * than a feature — the one thing no competitor on Stellar offers consumers.
 */

export const metadata: Metadata = {
  title: "Borrow against your crypto without selling it | Peridot",
  description:
    "Put up the crypto you already hold and borrow against it — up to 90% of its value — while it keeps earning. No bank, no paperwork, and your assets stay in your custody.",
  alternates: { canonical: "/borrow-without-selling" },
  openGraph: {
    title: "Borrow against your crypto. Don't sell it.",
    description:
      "Up to 90% of your holdings, available to borrow, while they keep earning. Your assets never leave your custody.",
    url: "/borrow-without-selling",
  },
}

const STEPS = [
  {
    title: "Put up what you already hold",
    body: "Dollars, euros or Lumens go into your account as collateral. They stay yours — Peridot never takes custody, and you can withdraw whatever is not backing a loan.",
  },
  {
    title: "Borrow against it",
    body: "Take out up to 90% of its value. There is no application, no credit check and no repayment schedule: you repay when it suits you.",
  },
  {
    title: "Your collateral keeps working",
    body: "Unlike selling, the holding stays yours and keeps earning while it backs the loan. If the price rises, that gain is still yours.",
  },
]

export default function BorrowWithoutSellingPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 pb-24">
      <section className="pt-10 pb-14">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-sm font-medium tracking-wider text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
          Borrowing on Peridot
        </p>

        <h1 className="text-4xl font-bold tracking-tight md:text-5xl" style={{ textWrap: "balance" } as any}>
          Borrow against your crypto. Don&rsquo;t sell it.
        </h1>

        <p className="mt-5 max-w-xl text-lg text-text/75">
          Selling ends your position and, in most places, triggers a tax event. Borrowing
          against it does neither — you get the money you need, and you still hold the
          asset.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <LandingCta cta="borrow_lp_hero">See what you can borrow</LandingCta>
          <span className="text-sm text-text/50">
            Takes a minute. Nothing is committed until you confirm.
          </span>
        </div>
      </section>

      <section className="pb-14">
        <h2 className="mb-4 text-2xl font-semibold tracking-tight">The numbers</h2>
        <BorrowRatesPanel />
      </section>

      <section className="pb-14">
        <h2 className="mb-6 text-2xl font-semibold tracking-tight">How it works</h2>
        <ol className="flex flex-col gap-6">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/30 font-mono text-sm text-primary"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <div>
                <h3 className="font-medium">{step.title}</h3>
                <p className="mt-1 text-text/70">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/*
        A borrowing page that does not explain liquidation is selling half the
        product. It is also the question people actually arrive with, so burying
        it costs trust as well as being wrong.
      */}
      <section className="pb-14">
        <h2 className="mb-4 text-2xl font-semibold tracking-tight">What you are taking on</h2>
        <div className="flex flex-col gap-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-6 text-text/75">
          <p>
            <strong className="font-medium text-text">Your collateral can be sold to cover the loan.</strong>{" "}
            If its value falls far enough that the loan is no longer sufficiently backed,
            part of it is sold automatically to repay the debt. That is the trade you are
            making in exchange for not having to sell today.
          </p>
          <p>
            Borrow well below your limit and the price has to move a long way before that
            happens. Peridot shows you how much room you have left at all times, and warns
            you before the point of no return — by notification, whether or not the tab is
            open.
          </p>
          <p className="text-sm text-text/55">
            Interest accrues on what you borrow and is set by demand, not by us. Peridot is
            not a bank and does not give financial advice; you are responsible for your own
            position.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-primary/15 bg-primary/[0.03] p-8 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">
          See it against your own balance
        </h2>
        <p className="mx-auto mt-2 max-w-md text-text/65">
          Connect a wallet or sign in with an e-mail address and the numbers above become
          your numbers.
        </p>
        <LandingCta cta="borrow_lp_footer" className="mt-6">See what you can borrow</LandingCta>
      </section>
    </div>
  )
}
