'use client'

import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { LandingFooter } from './landing-footer'
import { useViewMode } from '@/context/view-mode'

// Dynamic import for the heavy SiteFooter
const SiteFooter = dynamic(
    () => import('@/components/site-footer').then(mod => mod.SiteFooter),
    { ssr: false, loading: () => <LandingFooter /> }
)

export function SiteFooterWrapper() {
  const pathname = usePathname()
  const { mode } = useViewMode()

  // Full-screen app shells with their own layout — no footer
  if (pathname?.startsWith('/app/easy')) return null
  if (pathname?.startsWith('/app/steallar')) return null
  if (pathname?.startsWith('/chat')) return null

  // In-place Easy mode on `/app` is the Trade-Republic-style app shell. People
  // still want the marketing footer underneath it ("dann ist es komplett"), so
  // bring it back. On desktop it's a normal footer. On mobile the fixed DevNav
  // docks onto the footer's top edge as it scrolls into view (see DevNav), so
  // the footer reveals naturally without the bottom nav covering it.
  if (pathname === '/app' && mode === 'easy') {
    return <SiteFooter />
  }

  const isWeb3Route =
    pathname?.startsWith('/app') || 
    pathname?.startsWith('/redeem') || 
    pathname?.startsWith('/connect') ||
    pathname?.startsWith('/admin') || 
    pathname?.startsWith('/bridge')

  if (isWeb3Route) {
    return <SiteFooter />
  }

  return <LandingFooter />
}



