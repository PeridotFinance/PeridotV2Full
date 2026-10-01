"use client"

import React, { createContext, useContext, useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { useNetworkContext } from '@/context'
import { getThemeByNetworkId, ChainTheme, defaultTheme } from '@/config/chain-themes'
import { isStellarNetwork } from '@/config/contracts'

interface ChainThemeContextType {
  currentChainTheme: ChainTheme
  chainThemeCopy: ChainTheme['copy']
  isChainThemeActive: boolean
}

const ChainThemeContext = createContext<ChainThemeContextType>({
  currentChainTheme: defaultTheme,
  chainThemeCopy: defaultTheme.copy,
  isChainThemeActive: false
})

export function useChainTheme() {
  return useContext(ChainThemeContext)
}

// This component provides the chain theme data contextually but does not apply styles.
export function ChainThemeContextProvider({ children }: { children: React.ReactNode }) {
  const { selectedNetworkId } = useNetworkContext()
  const [currentChainTheme, setCurrentChainTheme] = useState<ChainTheme>(defaultTheme)
  const [isChainThemeActive, setIsChainThemeActive] = useState(false)

  useEffect(() => {
    // Theme is driven exclusively by selectedNetworkId the same single source of truth
    // that drives currentChainId in the markets page.  This ensures the two are always
    // consistent: if selectedNetworkId is 'bnb' (because the wallet is on Somnia after
    // margin trading but the NetworkSwitcher hasn't auto-synced to it), the theme stays
    // BNB gold rather than flipping to Somnia purple.
    if (isStellarNetwork(selectedNetworkId)) {
      setCurrentChainTheme(defaultTheme)
      setIsChainThemeActive(false)
      return
    }
    const theme = selectedNetworkId
      ? getThemeByNetworkId(selectedNetworkId)
      : defaultTheme
    setCurrentChainTheme(theme)
    setIsChainThemeActive(theme.id !== 'default')
  }, [selectedNetworkId])

  const contextValue: ChainThemeContextType = {
    currentChainTheme,
    chainThemeCopy: currentChainTheme.copy,
    isChainThemeActive
  }

  return (
    <ChainThemeContext.Provider value={contextValue}>
      {children}
    </ChainThemeContext.Provider>
  )
}

// This component applies the theme styles globally and should only be used on pages that need the theme.
export function ChainThemeApplicator() {
  const { currentChainTheme, isChainThemeActive } = useChainTheme()
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const root = document.documentElement
    const isDark = resolvedTheme === 'dark'
    const colors = isDark ? currentChainTheme.darkColors : currentChainTheme.colors
    const alphaForKeys: Record<string, number> = {
      card: 0.55,
      popover: 0.55
    }

    if (isChainThemeActive) {
      Object.entries(colors).forEach(([key, value]) => {
        const shouldApplyAlpha = alphaForKeys[key] !== undefined && !value.includes('/')
        const valueWithOptionalAlpha = shouldApplyAlpha ? `${value} / ${alphaForKeys[key]}` : value
        root.style.setProperty(`--${key}`, valueWithOptionalAlpha)
      })
      root.setAttribute('data-chain-theme', currentChainTheme.id)
    }

    // Cleanup function to remove styles on component unmount
    return () => {
      if (isChainThemeActive) {
        Object.keys(colors).forEach((key) => {
          root.style.removeProperty(`--${key}`)
        })
        root.removeAttribute('data-chain-theme')
      }
    }
  }, [currentChainTheme, isChainThemeActive, resolvedTheme])

  return null // This component does not render anything
} 