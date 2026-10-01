import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, ...props }: any, ref: any) =>
      React.createElement('div', { ...props, ref }, children),
    ),
  },
  AnimatePresence: ({ children }: any) => children,
}))

import { TextBlock } from '@/components/agents/blocks/TextBlock'
import { PoolTableBlock } from '@/components/agents/blocks/PoolTableBlock'
import { AllocationBlock } from '@/components/agents/blocks/AllocationBlock'

describe('TextBlock', () => {
  it('renders plain text', () => {
    render(<TextBlock content="Hello world" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders bold text as strong elements', () => {
    const { container } = render(<TextBlock content="This is **bold** text" />)
    const strong = container.querySelector('strong')
    expect(strong).toBeTruthy()
    expect(strong?.textContent).toBe('bold')
  })
})

describe('PoolTableBlock', () => {
  const mockPools = [
    {
      id: '1',
      protocol: 'peridot',
      poolName: 'USDC Pool',
      assetSymbol: 'USDC',
      chainId: 56,
      riskTier: 'low' as const,
      isPeridot: true,
      isActive: true,
      liveApy: 8.5,
    },
    {
      id: '2',
      protocol: 'aave_v3',
      poolName: 'ETH Pool',
      assetSymbol: 'ETH',
      chainId: 56,
      riskTier: 'medium' as const,
      isPeridot: false,
      isActive: true,
      liveApy: 4.2,
    },
  ]

  it('renders pool rows', () => {
    render(<PoolTableBlock pools={mockPools} title="Test Pools" />)
    expect(screen.getByText('USDC')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
    expect(screen.getByText('8.50%')).toBeInTheDocument()
    expect(screen.getByText('4.20%')).toBeInTheDocument()
  })

  it('renders title', () => {
    render(<PoolTableBlock pools={mockPools} title="Peridot Markets" />)
    expect(screen.getByText('Peridot Markets')).toBeInTheDocument()
  })

  it('shows Peridot badge for Peridot pools', () => {
    render(<PoolTableBlock pools={mockPools} />)
    expect(screen.getByText('PERIDOT')).toBeInTheDocument()
  })

  it('shows empty state when no pools', () => {
    render(<PoolTableBlock pools={[]} />)
    expect(screen.getByText('No pools found matching your criteria.')).toBeInTheDocument()
  })

  it('sorts by APY descending by default, toggles to ascending on click', () => {
    const { container } = render(<PoolTableBlock pools={mockPools} />)
    const cells = () => container.querySelectorAll('td')
    // Default: APY desc → USDC (8.5%) first
    expect(cells()[0]?.textContent).toContain('USDC')

    // Click APY → toggles to ascending → ETH (4.2%) first
    const sortButtons = container.querySelectorAll('button')
    const apyButton = Array.from(sortButtons).find(b => b.textContent?.includes('APY'))
    if (apyButton) fireEvent.click(apyButton)
    expect(cells()[0]?.textContent).toContain('ETH')
  })
})

describe('AllocationBlock', () => {
  const mockAllocations = [
    {
      protocol: 'peridot',
      asset: 'USDC',
      chainId: 56,
      percentage: 65,
      apy: 8.5,
      isPeridot: true,
      poolId: '1',
    },
    {
      protocol: 'aave_v3',
      asset: 'ETH',
      chainId: 56,
      percentage: 35,
      apy: 4.2,
      isPeridot: false,
    },
  ]

  it('renders blended APY', () => {
    render(
      <AllocationBlock
        allocations={mockAllocations}
        blendedApy={6.99}
        riskLevel="medium"
        reasoning="Medium risk strategy"
      />,
    )
    expect(screen.getByText('6.99% APY')).toBeInTheDocument()
  })

  it('renders risk level', () => {
    render(
      <AllocationBlock
        allocations={mockAllocations}
        blendedApy={6.99}
        riskLevel="low"
        reasoning="Low risk strategy"
      />,
    )
    expect(screen.getByText('low risk')).toBeInTheDocument()
  })

  it('renders allocation entries', () => {
    render(
      <AllocationBlock
        allocations={mockAllocations}
        blendedApy={6.99}
        riskLevel="medium"
        reasoning="Test reasoning"
      />,
    )
    expect(screen.getByText('USDC')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
    expect(screen.getByText('65.0%')).toBeInTheDocument()
    expect(screen.getByText('35.0%')).toBeInTheDocument()
  })

  it('renders reasoning text', () => {
    render(
      <AllocationBlock
        allocations={mockAllocations}
        blendedApy={6.99}
        riskLevel="medium"
        reasoning="This is the strategy reasoning"
      />,
    )
    expect(screen.getByText('This is the strategy reasoning')).toBeInTheDocument()
  })
})
