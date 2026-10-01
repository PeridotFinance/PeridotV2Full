import type { Metadata } from "next"
import Link from "next/link"
import {
  ShieldCheck,
  FileText,
  ArrowUpRight,
  CheckCircle2,
  Lock,
  Eye,
  ArrowRight,
  BadgeCheck,
} from "lucide-react"

export const metadata: Metadata = {
  title: "Security Audits | Peridot Protocol — Smart Contract Assessments",
  description:
    "Peridot Protocol's smart contracts are reviewed by leading independent security firms. Read the full audit reports covering our cross-chain lending and borrowing infrastructure.",
  alternates: { canonical: "/audits" },
  openGraph: {
    title: "Security Audits | Peridot Protocol",
    description:
      "Peridot Protocol's smart contracts are reviewed by leading independent security firms. Read the full audit reports.",
    url: "/audits",
  },
}

const audits = [
  {
    firm: "Halborn",
    initials: "H",
    title: "Smart Contract Assessment",
    description:
      "A comprehensive security assessment of Peridot's core lending and borrowing contracts, conducted by Halborn — one of the industry's most trusted blockchain security firms.",
    scope: "Core Protocol",
    date: "2025",
    format: "Web Report",
    href: "https://www.halborn.com/audits/peridot-protocol/smart-contract-assessment-e9c4bc",
  },
  {
    firm: "Independent Review",
    initials: "P",
    title: "Smart Contract Audit Report",
    description:
      "A full smart contract audit report covering Peridot's protocol contracts, published in its entirety and available for public review.",
    scope: "Protocol Contracts",
    date: "2025",
    format: "PDF",
    href: "https://drive.google.com/file/d/1utbwdt3RW29ZhH8vTrEI-vwGN-wjPKTp/view",
  },
]

const stats = [
  { value: "2", label: "Independent audits" },
  { value: "100%", label: "Open-source contracts" },
  { value: "24/7", label: "Continuous monitoring" },
]

const principles = [
  {
    icon: ShieldCheck,
    title: "Independently Verified",
    description:
      "Every audit is performed by external, specialized security firms — never in-house — so findings are objective and held to industry standards.",
  },
  {
    icon: Eye,
    title: "Fully Transparent",
    description:
      "Reports are published in full and available to anyone. We believe trust is earned through openness, not marketing.",
  },
  {
    icon: Lock,
    title: "Security by Design",
    description:
      "Our contracts follow established best practices and are open source, so the community can review them at any time.",
  },
]

export default function Audits() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-liquid py-20 md:py-28">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="noise" />

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <div className="animate-fade-in-up-delay-0 inline-flex items-center gap-2 px-4 py-1.5 mb-7 rounded-full glass-tab text-sm font-medium text-text/80">
              <BadgeCheck className="w-4 h-4 text-primary" />
              Security, verified by third parties
            </div>

            <h1 className="animate-fade-in-up-delay-200 text-4xl md:text-6xl font-bold tracking-tight mb-6">
              Audited &amp; <span className="gradient-text">Verified</span>
            </h1>

            <p className="animate-fade-in-up-delay-400 text-lg md:text-xl text-text/70 max-w-2xl mx-auto leading-relaxed">
              Peridot's smart contracts are reviewed by leading independent security firms.
              We publish every report in full — nothing hidden, nothing abridged.
            </p>

            {/* Stat strip */}
            <div className="animate-fade-in-up-delay-600 mt-12 inline-flex flex-wrap items-center justify-center gap-x-10 gap-y-6 px-8 py-5 rounded-2xl glass soft-shadow">
              {stats.map((stat, i) => (
                <div key={stat.label} className="flex items-center gap-10">
                  <div className="text-center">
                    <div className="text-2xl md:text-3xl font-bold gradient-text leading-none">
                      {stat.value}
                    </div>
                    <div className="mt-1.5 text-xs uppercase tracking-wider text-text/50">
                      {stat.label}
                    </div>
                  </div>
                  {i < stats.length - 1 && (
                    <span className="hidden sm:block w-px h-8 bg-border/60" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Audit Reports */}
      <section className="py-16 md:py-20 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-end justify-between gap-4 mb-10 flex-wrap">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">
                  Reports
                </p>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Audit Reports</h2>
              </div>
              <span className="inline-flex items-center gap-2 text-sm text-text/60">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                {audits.length} completed · more to come
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {audits.map((audit) => (
                <Link
                  key={`${audit.firm}-${audit.title}`}
                  href={audit.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative flex flex-col rounded-2xl border border-border/60 bg-card p-7 soft-shadow tilt-hover glow-ring overflow-hidden"
                >
                  {/* subtle top sheen */}
                  <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-accent/10 border border-border/50 text-primary text-xl font-bold">
                      {audit.initials}
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Completed
                    </span>
                  </div>

                  <h3 className="text-xl font-bold mb-1">{audit.firm}</h3>
                  <p className="text-primary text-sm font-medium mb-4">{audit.title}</p>
                  <p className="text-text/70 text-sm leading-relaxed mb-6 flex-1">
                    {audit.description}
                  </p>

                  {/* meta chips */}
                  <div className="flex flex-wrap gap-2 mb-6">
                    {[
                      { label: "Scope", value: audit.scope },
                      { label: "Year", value: audit.date },
                      { label: "Format", value: audit.format },
                    ].map((chip) => (
                      <span
                        key={chip.label}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/40 px-3 py-1 text-xs text-text/70"
                      >
                        <span className="text-text/45">{chip.label}</span>
                        <span className="font-medium text-text/90">{chip.value}</span>
                      </span>
                    ))}
                  </div>

                  {/* CTA button */}
                  <span className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-background transition-all group-hover:gap-3">
                    <FileText className="w-4 h-4" />
                    View report
                    <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Our Approach to Security */}
      <section className="py-16 md:py-20 bg-muted">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">
                Our commitment
              </p>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
                Security as a practice, not a checkbox
              </h2>
              <p className="text-text/70 max-w-2xl mx-auto">
                It's a continuous commitment built into how we design, ship, and maintain the
                protocol.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {principles.map((principle) => (
                <div
                  key={principle.title}
                  className="group rounded-2xl border border-border/60 bg-card p-7 card-hover"
                >
                  <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-accent/10 border border-border/50 text-primary transition-transform group-hover:scale-105">
                    <principle.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{principle.title}</h3>
                  <p className="text-text/70 text-sm leading-relaxed">{principle.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="relative overflow-hidden py-20 bg-background">
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-border/60 bg-liquid px-6 py-14 text-center soft-shadow">
            <div className="noise" />
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                Built to be trusted
              </h2>
              <p className="text-text/70 mb-9 max-w-xl mx-auto">
                Explore our open-source contracts and documentation, or start using Peridot today.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/app"
                  className="glow-ring inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-background transition-colors hover:bg-primary/90"
                >
                  Launch App
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <a
                  href="https://peridot-finance.gitbook.io/peridot-protocol"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-7 py-3 text-sm font-semibold text-text transition-colors hover:border-primary/50 hover:text-primary"
                >
                  Read the Docs
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
