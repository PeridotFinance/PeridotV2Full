"use client"

import React, { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import { LoadingCubes } from './LoadingCubes'

export const NavigationLoader: React.FC = () => {
  const [isNavigating, setIsNavigating] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('Loading...')
  const pathname = usePathname()
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isInternalNavigation = useRef(false)

  // Set custom loading messages based on route
  const updateLoadingMessage = (path: string) => {
    if (path.includes('/blog')) {
      setLoadingMessage('Loading Blog...')
    } else if (path.includes('/app')) {
      setLoadingMessage('Loading DeFi Platform...')
    } else if (path.includes('/easy')) {
      setLoadingMessage('Switching to Easy Mode...')
    } else if (path.includes('/portfolio')) {
      setLoadingMessage('Loading Portfolio...')
    } else if (path.includes('/cross-chain')) {
      setLoadingMessage('Loading Cross-Chain...')
    } else {
      setLoadingMessage('Loading...')
    }
  }

  // Helper function to clear any existing timeout
  const clearLoadingTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  // Helper function to hide loading with appropriate delay
  const hideLoadingWithDelay = (delay: number) => {
    clearLoadingTimeout()
    timeoutRef.current = setTimeout(() => {
      setIsNavigating(false)
      isInternalNavigation.current = false
    }, delay)
  }

  // Trigger loading on route changes (actual page navigation)
  useEffect(() => {
    // Only show loading for actual pathname changes, not internal tab switches
    if (!isInternalNavigation.current) {
      setIsNavigating(true)
      updateLoadingMessage(pathname)
      hideLoadingWithDelay(1000) // Longer delay for actual page navigation
    }
  }, [pathname])

  // Listen for clicks to show loading immediately
  useEffect(() => {
    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement
      const link = target.closest('a')
      const button = target.closest('button')
      
      // Handle link clicks
      if (link && link.href && !link.href.startsWith('#') && !link.target) {
        try {
          const url = new URL(link.href)
          if (url.origin === window.location.origin && url.pathname !== pathname) {
            isInternalNavigation.current = false // This is actual navigation
            setIsNavigating(true)
            updateLoadingMessage(url.pathname)
            // Don't set timeout here, let the pathname change effect handle it
          }
        } catch (error) {
          // Invalid URL, ignore
        }
      }
      
      // Handle button clicks (for internal navigation like tabs)
      else if (button) {
        const buttonText = button.textContent?.toLowerCase() || ''
        const isTabButton = buttonText.includes('portfolio') || 
                           buttonText.includes('lending') || 
                           buttonText.includes('stake') ||
                           button.dataset.navigate ||
                           // Check if it's within a TabsList (common pattern)
                           button.closest('[role="tablist"]') ||
                           button.hasAttribute('data-state') // Tab components often have this

        if (isTabButton) {
          isInternalNavigation.current = true // This is internal tab navigation
          setIsNavigating(true)
          
          // Set appropriate loading message for tabs
          if (buttonText.includes('portfolio')) {
            setLoadingMessage('Loading Portfolio...')
          } else if (buttonText.includes('lending')) {
            setLoadingMessage('Loading Lending...')
          } else if (buttonText.includes('stake')) {
            setLoadingMessage('Loading Staking...')
          } else {
            setLoadingMessage('Loading...')
          }
          
          // Shorter delay for internal tab switches
          hideLoadingWithDelay(600)
        }
      }
    }

    document.addEventListener('click', handleClick, true)
    
    return () => {
      document.removeEventListener('click', handleClick, true)
      clearLoadingTimeout()
    }
  }, [pathname])

  // Cleanup on unmount
  useEffect(() => {
    return () => clearLoadingTimeout()
  }, [])

  return (
    <AnimatePresence mode="wait">
      {isNavigating && (
        <LoadingCubes 
          key="navigation-loader"
          loadingText={loadingMessage}
        />
      )}
    </AnimatePresence>
  )
} 