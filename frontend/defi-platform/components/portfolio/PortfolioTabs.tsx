import React from 'react'
import { Home, PieChart, BarChart, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PortfolioTabsProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const portfolioTabs = [
  { 
    id: 'overview', 
    label: 'Overview', 
    icon: Home,
    description: 'Quick snapshot of your portfolio'
  },
  { 
    id: 'assets', 
    label: 'Assets', 
    icon: PieChart,
    description: 'Portfolio composition and allocation'
  },
  { 
    id: 'analytics', 
    label: 'Analytics', 
    icon: BarChart,
    description: 'Advanced charts and historical data'
  },
  { 
    id: 'transactions', 
    label: 'Transactions', 
    icon: Receipt,
    description: 'Complete transaction history'
  }
]

export function PortfolioTabs({ activeTab, onTabChange }: PortfolioTabsProps) {
  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2 p-1 bg-muted/30 rounded-2xl border border-border/50">
        {portfolioTabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 rounded-xl transition-all duration-200",
                "hover:scale-105 active:scale-95",
                "text-sm font-medium whitespace-nowrap",
                isActive
                  ? "bg-background shadow-md border border-border/50 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
              title={tab.description}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
