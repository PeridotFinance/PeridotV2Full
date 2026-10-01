"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { usePrivy } from "@privy-io/react-auth"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"

interface DemoModeContextValue {
  isDemoMode: boolean
  setDemoMode: (v: boolean) => void
}

const DemoModeContext = createContext<DemoModeContextValue>({
  isDemoMode: false,
  setDemoMode: () => {},
})

const STORAGE_KEY = "peridot_demo_mode"

/**
 * `?e2e=1` (dev only) gives Playwright a way to skip the auth gate. It is
 * intentionally ephemeral — we do **not** persist it to sessionStorage,
 * otherwise a single Playwright run would leave a real user's browser stuck
 * in demo mode for the rest of the session.
 */
function useEphemeralE2E(): boolean {
  const sp = useSearchParams()
  if (process.env.NODE_ENV === "production") return false
  return sp?.get("e2e") === "1"
}

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const [storedDemo, setStoredDemo] = useState(false)
  const e2e = useEphemeralE2E()
  const { ready, authenticated } = usePrivy()
  const stellarWallet = useStellarWallet()

  // Restore the user-set demo flag from sessionStorage on mount. We keep
  // this separate from the e2e bypass so leaving `?e2e=1` does not leak
  // demo state into a normal browsing session.
  useEffect(() => {
    if (typeof window !== "undefined") {
      setStoredDemo(sessionStorage.getItem(STORAGE_KEY) === "1")
    }
  }, [])

  const setDemoMode = (v: boolean) => {
    if (typeof window !== "undefined") {
      v ? sessionStorage.setItem(STORAGE_KEY, "1") : sessionStorage.removeItem(STORAGE_KEY)
    }
    setStoredDemo(v)
  }

  // Auto-clear the stored demo flag the moment a real wallet connects.
  // Without this, a user who clicked "Continue Without Wallet" earlier — then
  // later logs in via Privy OR connects Freighter/xBull — stays trapped in
  // demo state for the rest of the session: every `useDemoMode()` consumer
  // (portfolio page, EasyHistory, StealllarDesktopApp) keeps painting the
  // ~$5.87K DEMO_TOTAL_SUPPLIED placeholder over their real positions.
  useEffect(() => {
    if (!storedDemo) return
    const hasRealWallet = (ready && authenticated) || stellarWallet.isConnected
    if (!hasRealWallet) return
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY)
    }
    setStoredDemo(false)
  }, [storedDemo, ready, authenticated, stellarWallet.isConnected])

  // Combined view: real opt-in OR ephemeral e2e bypass.
  const isDemoMode = storedDemo || e2e

  return (
    <DemoModeContext.Provider value={{ isDemoMode, setDemoMode }}>
      {children}
    </DemoModeContext.Provider>
  )
}

export function useDemoMode() {
  return useContext(DemoModeContext)
}
