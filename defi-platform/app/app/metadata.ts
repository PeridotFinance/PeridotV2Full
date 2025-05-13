import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Peridot DeFi - Cross-chain lending & borrowing",
  description: "Peridot DeFi: Cross-chain lending & borrowing platform.",
  openGraph: {
    title: "Peridot DeFi",
    description: "Cross-chain lending & borrowing platform.",
    images: [
      {
        url: "/app/og-image",
        width: 1200,
        height: 630,
        alt: "Peridot DeFi",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Peridot DeFi",
    description: "Cross-chain lending & borrowing platform.",
    images: ["/app/og-image"],
  },
}; 