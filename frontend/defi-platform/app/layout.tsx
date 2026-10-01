import type React from "react"
import type { Metadata, Viewport } from "next"
import { Poppins, Inter } from "next/font/google"
import { JetBrains_Mono } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"
import { cookies as nextCookies, headers } from 'next/headers'
import { Toaster } from "@/components/ui/sonner"
import { Toaster as AppToaster } from "@/components/ui/toaster"
import { PostHogProvider } from './providers'
import { DevelopmentTools } from "@/components/development-tools"
import TxFeedbackGateway from '@/components/ui/TxFeedbackGateway'
// Must come from `@/lib/view-mode`, not the "use client" context module: a
// server component importing that constant gets a client reference instead of
// the string, and the cookie lookup below then silently matches nothing.
import { VIEW_MODE_COOKIE, parseViewMode, type ViewMode } from "@/lib/view-mode"
import { PERIDOT_ORGANIZATION } from "@/lib/seo/organization"

// New Wrapper Components
import { RootProviders } from "@/components/providers/root-providers"
import { SiteHeaderWrapper } from "@/components/site-header-wrapper"
import { SiteFooterWrapper } from "@/components/site-footer-wrapper"
import { SupportChat } from "@/components/support/SupportChat"

// Load Poppins font with multiple weights
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
})

// Load Inter for Cyber-Elegant design system
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-inter",
})

// Load JetBrains Mono for technical data
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://peridot.finance'),
  // The "first DeFi broker" claim leads, but the lending/borrowing keywords stay
  // in every title, and they are what actually ranks; "DeFi broker" has no search
  // volume yet and is here to build the category, not to win it today.
  title: "Peridot: The first DeFi broker | Lending & Borrowing",
  description: "Peridot is the first DeFi broker: earn interest on your crypto and borrow funds without selling, with fair rates across multiple blockchains, from one account, always in your custody.",
  keywords: ["DeFi broker", "DeFi", "lending", "borrowing", "crypto", "blockchain", "cross-chain", "finance"],
  authors: [{ name: "Peridot Team" }],
  creator: "Peridot Protocol",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://peridot.finance",
    title: "Peridot | The first DeFi broker for Lending & Borrowing",
    description:
      "Peridot is the first DeFi broker: earn interest on your crypto and borrow funds without selling, with fair rates across multiple blockchains, from one account, always in your custody.",
    siteName: "Peridot",
    images: [
      "/misc/thumbnail-preview.webp"
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Peridot | The first DeFi broker for Lending & Borrowing",
    description:
      "Peridot is the first DeFi broker: earn interest on your crypto and borrow funds without selling, with fair rates across multiple blockchains, from one account, always in your custody.",
    creator: "@peridotprotocol",
    images: [
      "/misc/thumbnail-preview.webp"
    ],
  },
  icons: {
    icon: "/peridot.ico",
    shortcut: "/peridot.ico",
    apple: "/peridot.ico",
  },
  generator: 'Asyncc'
}

export const generateViewport = (): Viewport => {
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  }
}


export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  const [headersObj, cookieStore] = await Promise.all([headers(), nextCookies()])
  const cookies = headersObj.get('cookie');
  const initialViewMode: ViewMode =
    parseViewMode(cookieStore.get(VIEW_MODE_COOKIE)?.value) ?? "easy"

  return (
    <html lang="en" suppressHydrationWarning className={`${poppins.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Viewport meta tag will be injected by Next.js via generateViewport */}
        <meta name="google-site-verification" content="npvP_GrFAyweIoO9gw-Xh2H3truwk1qw1ZsEM35NPXU" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            // Server-rendered on every page, and the authoritative statement of
            // identity: the richer homepage graph is injected by a client script,
            // which a crawler may or may not get to. Both now read from the same
            // constant so the site can never describe itself two ways at once.
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  // Given an @id so other pages (the docs graphs) can say
                  // isPartOf and have it resolve to this node instead of
                  // minting a second, contradictory website.
                  "@id": "https://peridot.finance/#website",
                  name: "Peridot Finance",
                  url: "https://peridot.finance",
                  description:
                    "Earn interest on dollars, euros and Lumens, or borrow against them without selling. Non-custodial, on Stellar.",
                  publisher: { "@id": "https://peridot.finance/#organization" },
                },
                { "@id": "https://peridot.finance/#organization", ...PERIDOT_ORGANIZATION },
              ],
            }),
          }}
        />
      </head>
      <body className="font-poppins">
        <div className="app-gradient-bg" />
        <PostHogProvider>
          {/* RootProviders conditionally loads Web3 providers only for the App */}
          <RootProviders cookies={cookies} initialViewMode={initialViewMode}>
            <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
                  <div className="flex flex-col min-h-screen relative z-[1]">
                  <SiteHeaderWrapper />
                      <main className="flex-1 pt-24 md:pt-28 lg:pt-32">{children}</main>
                  <SiteFooterWrapper />

                      <TxFeedbackGateway />
                      <SupportChat />
                    </div>
                    {/* Outside the `z-[1]` wrapper on purpose. That div is a
                        stacking context, and neither toaster portals, so a toast
                        rendered inside it is trapped below anything Radix portals
                        to <body> (dialogs/sheets sit at z-50). Every error toast
                        fired from an open dialog was invisible. Out here their own
                        z-index (sonner 999999999, Radix viewport z-100) applies
                        against the real root. */}
                    <Toaster />
                    <AppToaster />
                    <DevelopmentTools />
            </ThemeProvider>
          </RootProviders>
        </PostHogProvider>
      </body>
    </html>
  )
}
