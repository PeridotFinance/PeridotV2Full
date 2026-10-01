'use client'

import dynamic from 'next/dynamic'
import type { ThreeVisualizationType } from '@/types/agents'

interface ThreeVisualizationProps {
  visualizationType: ThreeVisualizationType
  data: Record<string, unknown>
}

function ThreeSkeletonLoader() {
  return (
    <div className="rounded-xl border border-border/60 bg-background overflow-hidden">
      <div className="h-[220px] flex items-center justify-center bg-muted/20">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground font-mono">Loading 3D view...</span>
        </div>
      </div>
    </div>
  )
}

const PortfolioSphere = dynamic(
  () => import('@/components/agents/blocks/three/PortfolioSphere'),
  { ssr: false, loading: () => <ThreeSkeletonLoader /> },
)

const YieldLandscape = dynamic(
  () => import('@/components/agents/blocks/three/YieldLandscape'),
  { ssr: false, loading: () => <ThreeSkeletonLoader /> },
)

const RiskHeatmap = dynamic(
  () => import('@/components/agents/blocks/three/RiskHeatmap'),
  { ssr: false, loading: () => <ThreeSkeletonLoader /> },
)

export function ThreeVisualization({ visualizationType, data }: ThreeVisualizationProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-background overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30">
        <h4 className="text-xs font-semibold font-inter uppercase tracking-wider text-muted-foreground">
          {visualizationType === 'portfolio_sphere'
            ? 'Portfolio Overview'
            : visualizationType === 'yield_landscape'
              ? 'Yield Landscape'
              : 'Risk Heatmap'}
        </h4>
      </div>
      {visualizationType === 'portfolio_sphere' && <PortfolioSphere data={data as any} />}
      {visualizationType === 'yield_landscape' && <YieldLandscape data={data as any} />}
      {visualizationType === 'risk_heatmap' && <RiskHeatmap data={data as any} />}
    </div>
  )
}
