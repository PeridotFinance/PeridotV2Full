import { useChainTheme } from "@/components/providers/ChainThemeProvider"

/**
 * Hook to get chain-specific copy with fallbacks
 */
export function useChainCopy() {
  const { chainThemeCopy, isChainThemeActive } = useChainTheme()

  /**
   * Get chain-specific text for a given key, with fallback
   */
  const getChainText = (key: string, fallback: string): string => {
    if (!isChainThemeActive || !chainThemeCopy.networkSpecificTerms) {
      return fallback
    }
    return chainThemeCopy.networkSpecificTerms[key] || fallback
  }

  /**
   * Get chain-specific welcome message
   */
  const getWelcomeMessage = (fallback: string = "Welcome to Peridot Finance"): string => {
    if (!isChainThemeActive || !chainThemeCopy.welcome) {
      return fallback
    }
    return chainThemeCopy.welcome
  }

  /**
   * Get chain-specific tagline
   */
  const getTagline = (fallback: string = "Cross-chain DeFi lending made simple"): string => {
    if (!isChainThemeActive || !chainThemeCopy.tagline) {
      return fallback
    }
    return chainThemeCopy.tagline
  }

  return {
    getChainText,
    getWelcomeMessage,
    getTagline,
    isChainThemeActive,
    chainThemeCopy
  }
} 