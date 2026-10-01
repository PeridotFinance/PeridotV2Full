import type { Metadata } from 'next'
import { HeroSection }        from './_components/HeroSection'
import { WhatsNewSection }    from './_components/WhatsNewSection'
import { InstallSection }     from './_components/InstallSection'
import { CapabilitiesSection } from './_components/CapabilitiesSection'
import { FutureSection }      from './_components/FutureSection'

export const metadata: Metadata = {
  title: 'AI-Native DeFi | Peridot Finance',
  description:
    'Peridot Finance is the first DeFi protocol with a native MCP Server, Claude Skills, and an open-source agent toolkit. AI agents can now interact with Peridot markets in real time.',
  alternates: { canonical: '/agents' },
  openGraph: {
    title: 'Peridot Finance — AI-Native DeFi',
    description:
      'MCP Server · Claude Skills · Open Source. The agentic layer for DeFi.',
    url: 'https://peridot.finance/agents',
  },
}

export default function AgentsPage() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <HeroSection />
      <WhatsNewSection />
      <InstallSection />
      <CapabilitiesSection />
      <FutureSection />
    </main>
  )
}
