"use client"

/**
 * Global user preferences for the Peridot DeFi platform.
 * Stored in localStorage as a single JSON object.
 */

const STORAGE_KEY = 'peridot-user-preferences'

export interface UserPreferences {
  dismissedBanners: string[]
  theme?: 'light' | 'dark' | 'system'
  onboardingCompleted?: boolean
  // Add other preferences here as needed
}

const DEFAULT_PREFERENCES: UserPreferences = {
  dismissedBanners: [],
}

/**
 * Get the current user preferences from localStorage.
 */
export function getUserPreferences(): UserPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAULT_PREFERENCES
    
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) }
  } catch (error) {
    console.error('Error reading user preferences:', error)
    return DEFAULT_PREFERENCES
  }
}

/**
 * Update user preferences.
 */
export function updateUserPreferences(updates: Partial<UserPreferences>): void {
  if (typeof window === 'undefined') return
  
  try {
    const current = getUserPreferences()
    const updated = { ...current, ...updates }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    
    // Dispatch a custom event to notify other components
    window.dispatchEvent(new CustomEvent('peridot-preferences-updated', { detail: updated }))
  } catch (error) {
    console.error('Error updating user preferences:', error)
  }
}

/**
 * Check if a specific banner has been dismissed.
 */
export function isBannerDismissed(bannerId: string): boolean {
  const prefs = getUserPreferences()
  return prefs.dismissedBanners.includes(bannerId)
}

/**
 * Dismiss a specific banner.
 */
export function dismissBanner(bannerId: string): void {
  const prefs = getUserPreferences()
  if (!prefs.dismissedBanners.includes(bannerId)) {
    updateUserPreferences({
      dismissedBanners: [...prefs.dismissedBanners, bannerId]
    })
  }
}

