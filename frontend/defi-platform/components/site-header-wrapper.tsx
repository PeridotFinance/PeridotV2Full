'use client'

import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { LandingHeader } from './landing-header'

// Skeleton that exactly matches app header structure to prevent layout shift
function AppHeaderSkeleton() {
  return (
    <header
      // `site-header-anchor` gives the skeleton the same view-transition-name
      // as the real SiteHeader. On route nav, the browser sees a continuous
      // "header" snapshot pair across the transition — no flicker if the
      // skeleton briefly renders before SiteHeader hydrates.
      className="fixed top-0 z-[100] transition-all duration-300 max-w-[96%] w-[96%] mx-auto left-[2%] right-[2%] mt-2 md:mt-3 lg:mt-4 rounded-xl md:rounded-2xl bg-background/70 backdrop-blur-md site-header-anchor"
      suppressHydrationWarning={true}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo skeleton - matches exact dimensions */}
          <div className="flex items-center">
            <div className="flex items-end space-x-2">
              <div className="relative w-8 h-8 md:w-10 md:h-10">
                <div className="w-full h-full bg-foreground/10 rounded animate-pulse" />
              </div>
              <div className="translate-y-[18px] md:translate-y-[18px] translate-x-[-5px]">
                <div className="h-5 w-16 bg-foreground/10 rounded animate-pulse" />
              </div>
            </div>
          </div>

          {/* Desktop Navigation Skeleton - matches exact structure */}
          <nav className="hidden md:flex items-center flex-1 text-sm">
            {/* Primary navigation group - matches mx-auto positioning */}
            <div className="flex items-center space-x-6 mx-auto">
              <div className="h-4 w-20 bg-foreground/10 rounded animate-pulse" />
              <div className="h-4 w-16 bg-foreground/10 rounded animate-pulse" />
            </div>
            {/* Secondary navigation group - matches ml-auto positioning */}
            <div className="flex items-center space-x-6 ml-auto">
              {/* Visual separator - matches exact dimensions */}
              <div className="h-6 w-px bg-border/40 mx-4" />
              <div className="h-4 w-14 bg-foreground/10 rounded animate-pulse" />
              <div className="h-4 w-20 bg-foreground/10 rounded animate-pulse" />
              <div className="h-4 w-24 bg-foreground/10 rounded animate-pulse" />
              {/* Second separator */}
              <div className="h-6 w-px bg-border/40 mx-4" />
            </div>
          </nav>

          {/* Desktop Controls Skeleton - matches exact gap-2 spacing */}
          <div className="hidden md:flex items-center gap-2">
            {/* LevelPill placeholder (if feature flag enabled) */}
            <div className="h-8 w-32 rounded-full bg-foreground/10 animate-pulse" />
            {/* Connect wallet button */}
            <div className="h-9 w-28 rounded-md bg-foreground/10 animate-pulse" />
            {/* Sound toggle */}
            <div className="h-9 w-9 rounded-md bg-foreground/10 animate-pulse" />
            {/* Theme toggle */}
            <div className="h-9 w-9 rounded-md bg-foreground/10 animate-pulse" />
          </div>

          {/* Mobile Menu Skeleton - matches exact structure */}
          <div className="md:hidden flex items-center">
            <div className="h-9 w-28 rounded-md bg-foreground/10 animate-pulse mr-2" />
            <div className="h-10 w-10 rounded-md bg-foreground/10 animate-pulse ml-2" />
          </div>
        </div>
      </div>
    </header>
  )
}

// Dynamic import for the heavy SiteHeader to avoid importing it (and its deps) on Landing
const SiteHeader = dynamic(
    () => import('@/components/site-header').then(mod => mod.SiteHeader),
    { 
      ssr: false, 
      loading: () => <AppHeaderSkeleton />
    }
)

export function SiteHeaderWrapper() {
  const pathname = usePathname()
  
  // Full-screen app shells with their own headers — no site header
  if (pathname?.startsWith('/app/easy')) return null
  if (pathname?.startsWith('/app/steallar')) return null

  const isWeb3Route =
    pathname?.startsWith('/app') ||
    pathname?.startsWith('/chat') ||
    pathname?.startsWith('/app3') ||
    pathname?.startsWith('/redeem') ||
    pathname?.startsWith('/connect') ||
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/bridge') ||
    pathname?.startsWith('/memes')

  if (isWeb3Route) {
    return <SiteHeader initialPathname={pathname} />
  }

  return <LandingHeader />
}



