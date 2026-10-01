import { Landmark, LineChart, Wrench } from "lucide-react"
import Link from "next/link"
import { Callout, H2, Lead, LinkCard, LinkCardGrid, P, UL } from "../primitives"

const ROLES = [
  {
    icon: Landmark,
    title: "I want my savings to work",
    body: "Deposit euros or dollars, earn a variable yield, withdraw any time. No crypto knowledge needed.",
    href: "/docs/quickstart",
    link: "Start with the Quickstart",
  },
  {
    icon: LineChart,
    title: "I know my way around DeFi",
    body: "Full market tables, rate curves, collateral management, margin. Every dial exposed.",
    href: "/docs/interest-rates",
    link: "Jump into the rate model",
  },
  {
    icon: Wrench,
    title: "I'm building on Peridot",
    body: "AI-agent tooling, an MCP server, and Claude skills for programmatic access to the protocol.",
    href: "/agents",
    link: "Explore the agent toolkit",
  },
]

export default function WhatIsPeridot() {
  return (
    <>
      <Lead>
        Peridot is the first DeFi broker: one account that reaches the lending markets of every
        supported chain. People who deposit assets earn interest, people who need liquidity borrow
        against their own deposits, and an algorithm sets the interest rate between the two. No bank
        in the middle, no lock-ups, withdrawable at any time.
      </Lead>

      <P>
        &ldquo;Broker&rdquo; here means the access layer, not a firm acting for you: Peridot is
        non-custodial and never takes your assets or executes orders on your behalf. You sign every
        transaction yourself, and it settles directly on-chain.
      </P>

      <div className="grid gap-3 sm:grid-cols-3 my-8">
        {ROLES.map((role) => (
          <Link
            key={role.title}
            href={role.href}
            className="group rounded-2xl border border-border/60 bg-card p-5 no-underline transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <role.icon className="h-5 w-5 text-primary mb-3" aria-hidden />
            <p className="font-semibold text-sm mb-1.5 text-foreground">{role.title}</p>
            <p className="text-sm text-muted-foreground leading-6 mb-3">{role.body}</p>
            <p className="text-sm font-medium text-primary group-hover:underline">{role.link} →</p>
          </Link>
        ))}
      </div>

      <H2>How the money market works</H2>
      <P>
        Every supported asset has its own lending pool. Deposits flow into the pool and immediately
        start earning; borrowers draw from the same pool and pay interest into it. The interest
        borrowers pay is the interest depositors earn; Peridot's rate model just balances the two
        sides so the pool never runs dry.
      </P>
      <UL>
        <li>
          <strong>Depositors</strong> receive pTokens, a receipt that grows in value as interest
          accrues. Withdrawing means handing the receipt back for your assets plus everything earned.
        </li>
        <li>
          <strong>Borrowers</strong> must first deposit collateral worth more than their loan. If the
          collateral's value falls too far, part of it is sold to repay the debt. That's a
          liquidation, and the whole risk model is built to make it avoidable.
        </li>
        <li>
          <strong>Rates</strong> are set per pool, per block, from a single number: utilization, or how
          much of the pool is currently lent out.
        </li>
      </UL>

      <H2>Where it runs</H2>
      <P>
        Peridot's primary home is the <strong>Stellar network</strong>, chosen for its low fees and
        fast settlement: deposits, withdrawals and borrows confirm in seconds and cost fractions of a
        cent. Markets currently cover XLM, USDC, and EURC. A multi-chain deployment (BSC and other EVM
        networks) exists alongside it for advanced users.
      </P>

      <Callout variant="info" title="You don't need a wallet to start">
        Sign up with an email address and Peridot creates a self-custodial wallet for you in the
        background. You can add money by bank transfer or card; the crypto plumbing stays invisible
        unless you go looking for it.
      </Callout>

      <H2>Read next</H2>
      <LinkCardGrid>
        <LinkCard
          href="/docs/quickstart"
          title="Quickstart"
          description="From sign-up to your first earning deposit in a few minutes."
        />
        <LinkCard
          href="/docs/supplying-and-ptokens"
          title="Supplying & pTokens"
          description="What actually happens to your deposit, mechanically."
        />
      </LinkCardGrid>
    </>
  )
}
