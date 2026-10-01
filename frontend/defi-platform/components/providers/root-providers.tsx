'use client'

import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/react-query'
import { useVisitorTracking } from '@/hooks/use-visitor-tracking'
import { DailyLoginGateway } from '@/components/ui/DailyLoginGateway'
import { ViewModeProvider, type ViewMode } from '@/context/view-mode'
import { FEATURE_FLAGS } from '@/config/featureFlags'

// Dynamically import heavy providers so they don't bundle with the landing page
const ContextProvider = dynamic(
  () => import('@/context').then((mod) => mod.ContextProvider),
  { ssr: false }
)

// Wallet-dependent, so it loads with the web3 providers rather than with the
// landing page. It needs the PrivyProvider, hence the flag at the mount site.
const LoginViewModeDefault = dynamic(
  () => import('@/components/app/LoginViewModeDefault').then((mod) => mod.LoginViewModeDefault),
  { ssr: false }
)

const ChainThemeContextProvider = dynamic(
  () => import('@/components/providers/ChainThemeProvider').then((mod) => mod.ChainThemeContextProvider),
  { ssr: false }
)

const SmartAccountUpgradeProvider = dynamic(
  () => import('@/components/providers/SmartAccountUpgradeProvider').then((mod) => mod.SmartAccountUpgradeProvider),
  { ssr: false }
)

const AgentCrossChainListener = dynamic(
  () => import('@/components/agents/AgentCrossChainListener').then((mod) => mod.AgentCrossChainListener),
  { ssr: false }
)

// The one "Add money" sheet, opened from anywhere via `openAddMoney()`.
const AddMoneyHost = dynamic(
  () => import('@/components/onramp/AddMoneyHost').then((mod) => mod.AddMoneyHost),
  { ssr: false }
)

const AgentActivityStream = dynamic(
  () => import('@/components/agents/AgentActivityStream').then((mod) => mod.AgentActivityStream),
  { ssr: false }
)

interface RootProvidersProps {
  children: ReactNode
  cookies: string | null
  /**
   * Server-resolved view mode (Easy vs. Expert). Hoisted to this provider
   * so the SiteHeader (rendered as a sibling of app routes, *above* the
   * `/app/*` layout in the tree) can read & write the same state as the
   * page body via `useViewMode()`.
   */
  initialViewMode: ViewMode
}

export function RootProviders({ children, cookies, initialViewMode }: RootProvidersProps) {
  const pathname = usePathname()

  // Track visitor status
  useVisitorTracking()

  // Explicitly whitelist routes that require Web3 providers
  const isWeb3Route =
    pathname?.startsWith('/app') ||
    pathname?.startsWith('/chat') ||
    pathname?.startsWith('/redeem') ||
    pathname?.startsWith('/connect') ||
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/bridge') ||
    pathname?.startsWith('/claim') ||
    pathname?.startsWith('/memes') ||
    pathname?.startsWith('/insights')

  if (isWeb3Route) {
    return (
      <QueryClientProvider client={queryClient}>
      <ContextProvider cookies={cookies}>
        <ChainThemeContextProvider>
          <SmartAccountUpgradeProvider>
            <ViewModeProvider initialMode={initialViewMode}>
              {FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT && <LoginViewModeDefault />}
              {children}
              <DailyLoginGateway />
              <AgentCrossChainListener />
              <AgentActivityStream />
              <AddMoneyHost />
            </ViewModeProvider>
          </SmartAccountUpgradeProvider>
        </ChainThemeContextProvider>
      </ContextProvider>
      </QueryClientProvider>
    )
  }

  // On landing page, just render children without heavy web3 providers
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}



