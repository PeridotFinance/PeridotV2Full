import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Github, Twitter, DiscIcon as Discord } from "lucide-react"

export default function Footer() {
  return (
    <footer className="border-t border-border/40 bg-background">
      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          <div className="space-y-4">
            <Link href="/" className="flex items-center">
              <span className="text-2xl font-bold gradient-text">Peridot</span>
            </Link>
            <p className="text-sm text-text/70 max-w-xs">
              A decentralized cross-chain lending and borrowing platform that enables users to earn interest on deposits
              and borrow assets.
            </p>
            <div className="flex space-x-4">
              <a href="https://x.com/peridotprotocol" target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                  <Twitter className="h-4 w-4" />
                  <span className="sr-only">Twitter</span>
                </Button>
              </a>
              <a href="https://discord.gg/yourserver" target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                  <Discord className="h-4 w-4" />
                  <span className="sr-only">Discord</span>
                </Button>
              </a>
              <a href="https://peridot-finance.gitbook.io/peridot-protocol" target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                  <Github className="h-4 w-4" />
                  <span className="sr-only">GitHub</span>
                </Button>
              </a>
            </div>
            </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Platform</h3>
            <ul className="mt-4 space-y-2">
              <li>
                <Link href="/app" className="text-sm text-text/70 hover:text-primary">
                  App
                </Link>
              </li>
              <li>
                <Link href="/markets" className="text-sm text-text/70 hover:text-primary">
                  Markets
                </Link>
              </li>
              <li>
                <Link href="/governance" className="text-sm text-text/70 hover:text-primary">
                  Governance
                </Link>
              </li>
              <li>
                <Link href="/analytics" className="text-sm text-text/70 hover:text-primary">
                  Analytics
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Resources</h3>
            <ul className="mt-4 space-y-2">
              <li>
                <Link href="/docs" className="text-sm text-text/70 hover:text-primary">
                  Documentation
                </Link>
              </li>
              <li>
                <Link href="/whitepaper" className="text-sm text-text/70 hover:text-primary">
                  Whitepaper
                </Link>
              </li>
              <li>
                <Link href="/developers" className="text-sm text-text/70 hover:text-primary">
                  Developers
                </Link>
              </li>
              <li>
                <Link href="/security" className="text-sm text-text/70 hover:text-primary">
                  Security
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">Company</h3>
            <ul className="mt-4 space-y-2">
              <li>
                <Link href="/about" className="text-sm text-text/70 hover:text-primary">
                  About
                </Link>
              </li>
              <li>
                <Link href="/blog" className="text-sm text-text/70 hover:text-primary">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/careers" className="text-sm text-text/70 hover:text-primary">
                  Careers
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-sm text-text/70 hover:text-primary">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border/40 pt-8">
          <p className="text-center text-xs text-text/60">
            &copy; {new Date().getFullYear()} CrossLend. All rights reserved.
          </p>

        </div>
      </div>
    </footer>
  )
}
