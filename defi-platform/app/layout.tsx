import type React from "react"
import type { Metadata, Viewport } from "next"
import { Poppins } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import "./globals.css"
import { headers } from 'next/headers'
import ContextProvider from '@/context'
import { Toaster } from "@/components/ui/toaster"
import { PostHogProvider } from './providers'
import { StagewiseToolbar } from '@stagewise/toolbar-next'
import { ReactPlugin } from '@stagewise-plugins/react'

// Load Poppins font with multiple weights
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
})

export const metadata: Metadata = {
  title: "Peridot Finance - DeFi Lending & Borrowing",
  description: "Simplified DeFi lending and borrowing platform powered by Reown AppKit.",
  keywords: ["DeFi", "lending", "borrowing", "crypto", "blockchain", "cross-chain", "finance"],
  authors: [{ name: "Peridot Team" }],
  creator: "Peridot Protocol",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://peridot.finance",
    title: "Peridot | Cross-Chain Lending & Borrowing Platform",
    description:
      "Earn interest on your crypto and borrow funds without selling, all with smart, fair rates across multiple blockchains.",
    siteName: "Peridot",
  },
  twitter: {
    card: "summary_large_image",
    title: "Peridot | Cross-Chain Lending & Borrowing Platform",
    description:
      "Earn interest on your crypto and borrow funds without selling, all with smart, fair rates across multiple blockchains.",
    creator: "@peridotprotocol",
  },
  icons: {
    icon: "/peridot.ico",
    shortcut: "/peridot.ico",
    apple: "/peridot.ico",
  },
  generator: 'v0.dev'
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
  const headersObj = await headers();
  const cookies = headersObj.get('cookie');

  return (
    <html lang="en" suppressHydrationWarning className={poppins.variable}>
      <head>
        {/* Viewport meta tag will be injected by Next.js via generateViewport */}
      </head>
      <body className="font-poppins">
        <PostHogProvider>
          <ContextProvider cookies={cookies}>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
              <div className="flex flex-col min-h-screen">
                <SiteHeader />
                <main className="flex-1 pt-24 md:pt-28 lg:pt-32">{children}</main>
                <SiteFooter />
                <Toaster />
              </div>
              <StagewiseToolbar 
                config={{
                  plugins: [ReactPlugin]
                }}
              />
            </ThemeProvider>
          </ContextProvider>
        </PostHogProvider>
      </body>
    </html>
  )
}
