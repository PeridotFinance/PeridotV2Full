"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

interface DepositPanelCtx {
  open: boolean
  assetId: string | undefined
  openPanel: (assetId?: string) => void
  closePanel: () => void
}

const Ctx = createContext<DepositPanelCtx | null>(null)

export function DepositPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [assetId, setAssetId] = useState<string | undefined>()

  return (
    <Ctx.Provider
      value={{
        open,
        assetId,
        openPanel: (id?) => {
          setAssetId(id)
          setOpen(true)
        },
        closePanel: () => {
          setOpen(false)
          setAssetId(undefined)
        },
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useDepositPanel() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useDepositPanel must be used within DepositPanelProvider")
  return ctx
}
