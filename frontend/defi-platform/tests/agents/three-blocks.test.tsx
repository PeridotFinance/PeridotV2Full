import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

// Mock next/dynamic — renders the loading fallback since dynamic imports
// don't resolve in jsdom test environment
vi.mock('next/dynamic', () => ({
  default: (_loader: any, opts?: { loading?: () => React.ReactElement }) => {
    // Return a component that renders the loading state
    return function DynamicMock() {
      if (opts?.loading) return opts.loading()
      return React.createElement('div', null, 'Loading...')
    }
  },
}))

import { ThreeVisualization } from '@/components/agents/blocks/ThreeVisualization'

describe('ThreeVisualization', () => {
  it('renders portfolio sphere title', () => {
    render(
      <ThreeVisualization
        visualizationType="portfolio_sphere"
        data={{ sectors: [{ label: 'USDC', percentage: 60, color: '#00ff00' }] }}
      />,
    )
    expect(screen.getByText('Portfolio Overview')).toBeInTheDocument()
  })

  it('renders yield landscape title', () => {
    render(
      <ThreeVisualization
        visualizationType="yield_landscape"
        data={{ points: [], gridSize: 4 }}
      />,
    )
    expect(screen.getByText('Yield Landscape')).toBeInTheDocument()
  })

  it('renders risk heatmap title', () => {
    render(
      <ThreeVisualization
        visualizationType="risk_heatmap"
        data={{ cells: [], columns: 4 }}
      />,
    )
    expect(screen.getByText('Risk Heatmap')).toBeInTheDocument()
  })

  it('shows loading skeleton while Three.js loads', () => {
    const { container } = render(
      <ThreeVisualization
        visualizationType="portfolio_sphere"
        data={{ sectors: [] }}
      />,
    )
    // The dynamic import mock renders the loading fallback
    expect(container.textContent).toContain('Loading 3D view...')
  })
})
