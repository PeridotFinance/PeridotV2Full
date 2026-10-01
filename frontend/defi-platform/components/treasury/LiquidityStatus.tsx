"use client"

export function LiquidityStatus() {
  // In production, this would check actual protocol state
  const isLiquid = true
  const withdrawalTime = "Instant"

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground mb-1">Withdrawals</p>
      <p className="text-2xl font-semibold">{withdrawalTime}</p>
      <p className="text-xs text-muted-foreground mt-1">No lockups</p>
    </div>
  )
}

