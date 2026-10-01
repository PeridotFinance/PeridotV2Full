import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contact Peridot | Support, Community & Feedback",
  description: "Get in touch with the Peridot team — reach support, join the Discord community, or send us feedback about the cross-chain DeFi lending and borrowing platform.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact Peridot | Support & Community",
    description: "Reach the Peridot team, join our Discord, or get support for the DeFi platform.",
    url: "/contact",
  },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
