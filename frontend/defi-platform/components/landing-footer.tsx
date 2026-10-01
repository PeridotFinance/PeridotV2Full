"use client"

import Link from "next/link"
import Image from "next/image"
import { Twitter, Send as Telegram, Linkedin } from "lucide-react"
import { useTheme } from "next-themes"
import { defaultTheme } from "@/config/chain-themes"
import { EmailSubscription } from "./EmailSubscription"

export function LandingFooter() {
  const { theme, resolvedTheme } = useTheme()
  const isDarkMode = (resolvedTheme || theme) === "dark"
  const peridotPrimary = isDarkMode ? defaultTheme.darkColors.primary : defaultTheme.colors.primary;

  return (
    <footer data-site-footer className="bg-muted/20 backdrop-blur-sm pt-16 pb-8">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 mb-12">
          <div className="lg:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
            <Link href="/" className="flex items-end space-x-2">
              <div className="relative w-8 h-8 md:w-10 md:h-10">
                <Image src="/Peridot-Icon-Only-Mint-Green.svg" alt="Peridot Logo" width={40} height={40} className="object-contain" />
              </div>
              <div className="flex flex-col translate-y-[10px] md:translate-y-[10px] translate-x-[-5px]">
                <span className="font-bold text-xl leading-tight" >
                  Peri<span className="relative inline-block">
                  </span>dot
                </span>
                <span className="text-xs font-normal text-text/60 dark:text-text/50 uppercase tracking-wide leading-tight mt-0.5">
                  FINANCE
                </span>
              </div>
            </Link>
            </div>
            <p className="text-text/70 mb-6 max-w-md">
              The first DeFi broker: one account for every chain, where you earn interest on your
              crypto assets and borrow against your collateral. Non-custodial: your funds stay yours.
            </p>
            <div className="flex space-x-4">
              <a href="https://x.com/peridotprotocol" target="_blank" rel="noopener noreferrer" className="text-text/60 hover:text-primary transition-colors" aria-label="Twitter">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="https://t.me/peridotlabs" target="_blank" rel="noopener noreferrer" className="text-text/60 hover:text-primary transition-colors" aria-label="Telegram">
                <Telegram className="h-5 w-5" />
              </a>
               <a href="https://www.linkedin.com/company/peridotlabs" target="_blank" rel="noopener noreferrer" className="text-text/60 hover:text-primary transition-colors" aria-label="LinkedIn">
                 <Linkedin className="h-5 w-5" />
               </a>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-4">Platform</h3>
            <ul className="space-y-3">
              <li><Link href="/app" className="text-text/70 hover:text-primary transition-colors">App</Link></li>
              <li><Link href="/insights" className="text-text/70 hover:text-primary transition-colors">Insights Hub</Link></li>
              <li><Link href="/how-it-works" className="text-text/70 hover:text-primary transition-colors">How It Works</Link></li>
              <li><Link href="/agents" className="text-text/70 hover:text-primary transition-colors">AI Agents / MCP</Link></li>
              {/* Umbrella over every outside-in integration, see /connections. */}
              <li><Link href="/connections" className="text-text/70 hover:text-primary transition-colors">Connections</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-4">Resources</h3>
            <ul className="space-y-3 mb-6">
              <li><Link href="/blog" className="text-text/70 hover:text-primary transition-colors">Blog</Link></li>
              <li>
                <a href="https://roadmap.peridot.finance/" className="text-text/70 hover:text-primary transition-colors" target="_blank" rel="noopener noreferrer">
                  Roadmap
                </a>
              </li>
              <li><Link href="/glossary" className="text-text/70 hover:text-primary transition-colors">Glossary</Link></li>
              <li>
                <Link href="/partner" className="text-text/70 hover:text-primary transition-colors">
                  Partner
                </Link>
              </li>
              <li>
                <Link href="/audits" className="text-text/70 hover:text-primary transition-colors">
                  Audits &amp; Security
                </Link>
              </li>
              <li>
              <Link href="/docs" className="text-text/80 hover:text-primary transition-colors">
                Docs
              </Link>
              </li>
            </ul>
            <div className="hidden lg:block"><EmailSubscription variant="footer" /></div>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-4">Company</h3>
            <ul className="space-y-3">
              <li><Link href="/about" className="text-text/70 hover:text-primary transition-colors">About</Link></li>
              <li><Link href="/contact" className="text-text/70 hover:text-primary transition-colors">Contact</Link></li>
              <li>
                <Link href="/privacy" className="text-text/70 hover:text-primary transition-colors">
                  Privacy & Cookies
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-text/70 hover:text-primary transition-colors">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link href="/brandkit" className="text-text/70 hover:text-primary transition-colors">
                  Brand Kit
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="lg:hidden mb-8"><EmailSubscription variant="footer" /></div>

        <div className="border-t border-border/30 pt-8 mt-8">

        </div>
      </div>
    </footer>
  )
}


