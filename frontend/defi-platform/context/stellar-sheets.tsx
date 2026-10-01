"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"

// ─── Slot payloads ────────────────────────────────────────────────────────────
// Each sheet has its own state slot, keyed by intent. Only one slot of each
// kind can be open at a time — opening a new one replaces the previous.

export interface DepositSlot {
  /** Underlying asset id (e.g. "usdc", "usdt", "xlm"). The virtual "usd" /
   *  "eur" rows in AssetTable resolve to the best stable before opening. */
  assetId: string
  /** Optional amount to prefill (string for free-form input compatibility). */
  defaultAmount?: string
}

export interface WithdrawSlot {
  assetId: string
  defaultAmount?: string
}

export interface BorrowSlot {
  /** Optional asset preselect; otherwise the sheet picks USD as default. */
  assetId?: string
}

export interface RepaySlot {
  assetId: string
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface StellarSheetsContextValue {
  deposit: DepositSlot | null
  withdraw: WithdrawSlot | null
  borrow: BorrowSlot | null
  repay: RepaySlot | null
  openDeposit: (slot: DepositSlot) => void
  closeDeposit: () => void
  openWithdraw: (slot: WithdrawSlot) => void
  closeWithdraw: () => void
  openBorrow: (slot?: BorrowSlot) => void
  closeBorrow: () => void
  openRepay: (slot: RepaySlot) => void
  closeRepay: () => void
}

const Ctx = createContext<StellarSheetsContextValue | null>(null)

export function StellarSheetsProvider({ children }: { children: ReactNode }) {
  const [deposit, setDeposit] = useState<DepositSlot | null>(null)
  const [withdraw, setWithdraw] = useState<WithdrawSlot | null>(null)
  const [borrow, setBorrow] = useState<BorrowSlot | null>(null)
  const [repay, setRepay] = useState<RepaySlot | null>(null)

  const openDeposit = useCallback((slot: DepositSlot) => setDeposit(slot), [])
  const closeDeposit = useCallback(() => setDeposit(null), [])
  const openWithdraw = useCallback((slot: WithdrawSlot) => setWithdraw(slot), [])
  const closeWithdraw = useCallback(() => setWithdraw(null), [])
  const openBorrow = useCallback((slot?: BorrowSlot) => setBorrow(slot ?? {}), [])
  const closeBorrow = useCallback(() => setBorrow(null), [])
  const openRepay = useCallback((slot: RepaySlot) => setRepay(slot), [])
  const closeRepay = useCallback(() => setRepay(null), [])

  return (
    <Ctx.Provider
      value={{
        deposit,
        withdraw,
        borrow,
        repay,
        openDeposit,
        closeDeposit,
        openWithdraw,
        closeWithdraw,
        openBorrow,
        closeBorrow,
        openRepay,
        closeRepay,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useStellarSheets(): StellarSheetsContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) {
    throw new Error(
      "useStellarSheets must be used within a <StellarSheetsProvider>. " +
        "Wrap your tree in the Stellar shell or call from inside /app/easy."
    )
  }
  return ctx
}
