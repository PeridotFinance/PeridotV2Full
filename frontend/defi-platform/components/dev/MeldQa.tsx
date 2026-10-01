'use client'

/**
 * THROWAWAY — Meld onramp QA harness.
 *
 * Verifies the real onramp pipeline end to end on one screen:
 *   1. Address alignment — does Meld fund the SAME wallet the deposit spends
 *      from? (the fund-destination vs deposit-source mismatch risk)
 *   2. Token match — which exact BSC ERC-20 do we read balanceOf on, and does
 *      its balance actually move after a Meld purchase? (if Meld delivers a
 *      different USDC contract, nothing ever settles)
 *   3. Live events — the meld_onramp_events rows (initiated → settled), plus a
 *      manual reconcile trigger.
 *
 * Gated behind FIAT_ONRAMP_MELD_PROBE → 404 in prod builds with the flag off.
 * Delete with the rest of the probe scaffolding once QA is signed off.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useMeldOnramp } from '@/hooks/use-meld-onramp'
import {
  pickEmbeddedEvmAddress,
  resolveMeldEvmAddress,
  isEvmAddress,
  type MeldAsset,
} from '@/lib/onramp/meld'
import { readBscStableBalance, bscTokenAddressFor } from '@/lib/onramp/evm-balance'

interface EventRow {
  idempotency_key: string
  asset: string
  chain: string
  address: string
  status: string
  baseline_amount: string
  settled_amount: string | null
  settled_via: string | null
  initiated_at: string
  occurred_at: string | null
}

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—')

export function MeldQa() {
  const { authenticated, login, ready, getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  const { address: activeAddress } = useActiveWallet()
  const meld = useMeldOnramp()

  const [asset, setAsset] = useState<MeldAsset>('usdc')
  const [amount, setAmount] = useState('30')
  const [balance, setBalance] = useState<number | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const embedded = useMemo(
    () => pickEmbeddedEvmAddress(wallets as Array<{ address?: string; walletClientType?: string }>),
    [wallets],
  )
  const resolved = useMemo(
    () => resolveMeldEvmAddress(activeAddress as string | undefined, wallets as any),
    [activeAddress, wallets],
  )
  const destination = meld.destinationFor(asset)
  const tokenAddr = bscTokenAddressFor(asset)

  // ── Alignment check: Meld funds `resolved`; the deposit spends from the
  // active wallet (when EVM). They MUST be equal.
  const depositSource = isEvmAddress(activeAddress as string) ? (activeAddress as string) : undefined
  const aligned =
    !!resolved && !!depositSource && resolved.toLowerCase() === depositSource.toLowerCase()

  const authedFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getAccessToken().catch(() => null)
      return fetch(url, {
        ...init,
        headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
    },
    [getAccessToken],
  )

  const refreshBalance = useCallback(async () => {
    if (!destination) return setBalance(null)
    const v = await readBscStableBalance(destination.chain, asset, destination.address)
    setBalance(v)
  }, [destination, asset])

  const refreshEvents = useCallback(async () => {
    const res = await authedFetch('/api/onramp/meld/events').catch(() => null)
    if (!res?.ok) return
    const data = await res.json().catch(() => null)
    setEvents(data?.events ?? [])
  }, [authedFetch])

  useEffect(() => {
    if (!authenticated) return
    void refreshBalance()
    void refreshEvents()
    const id = setInterval(() => {
      void refreshBalance()
      void refreshEvents()
    }, 5000)
    return () => clearInterval(id)
  }, [authenticated, refreshBalance, refreshEvents])

  const launch = async () => {
    setBusy('meld')
    try {
      const o = await meld.fundWithMeld({ assetId: asset, amount })
      // The hook records `initiated` + starts the watch internally on confirm.
      await refreshEvents()
      alert(`fund() → ${o.status}`)
    } finally {
      setBusy(null)
    }
  }

  const reconcile = async () => {
    setBusy('reconcile')
    try {
      const res = await authedFetch('/api/onramp/meld/reconcile', { method: 'POST' })
      const data = await res.json().catch(() => null)
      await refreshEvents()
      alert(`reconcile → ${JSON.stringify(data)}`)
    } finally {
      setBusy(null)
    }
  }

  if (!ready) return <p className="p-8 text-muted-foreground">Loading Privy…</p>
  if (!authenticated)
    return (
      <div className="p-8">
        <Button onClick={() => login()}>Log in to run QA</Button>
      </div>
    )

  return (
    <div className="max-w-2xl mx-auto my-8 space-y-4">
      {/* 1 — Address alignment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Address alignment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm font-mono">
          <Line k="Active wallet (deposit spends from)" v={`${short(activeAddress as string)} ${isEvmAddress(activeAddress as string) ? '(EVM)' : '(non-EVM)'}`} />
          <Line k="Embedded Privy EVM" v={short(embedded)} />
          <Line k="Meld will fund (resolved)" v={short(resolved)} />
          <div className={`mt-2 rounded-md px-3 py-2 text-xs ${aligned ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
            {aligned
              ? '✅ ALIGNED — Meld funds the wallet the deposit reads.'
              : depositSource
                ? '❌ MISMATCH — Meld funds a different wallet than the deposit reads.'
                : 'ℹ️ Active wallet is non-EVM (Stellar). Meld would fund the embedded EVM wallet; card is hidden for Stellar pools.'}
          </div>
        </CardContent>
      </Card>

      {/* 2 — Token + balance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2 · Token match & live balance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex gap-2">
            <Select value={asset} onChange={(v) => setAsset(v as MeldAsset)} options={[{ value: 'usdc', label: 'USDC' }, { value: 'usdt', label: 'USDT' }]} />
            <input className="w-28 rounded-md border bg-background px-2 py-1" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="amount €" />
          </div>
          <div className="space-y-1.5 font-mono text-xs">
            <Line k="Destination chain" v={destination?.chain ?? '— (no route)'} />
            <Line k="balanceOf read at token" v={tokenAddr ?? '—'} />
            <Line k="Funding address" v={short(destination?.address)} />
            <Line k="Live balance" v={balance == null ? '—' : `${balance} ${asset.toUpperCase()}`} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Note the balance, run the buy, and watch this number move. If it never moves after funds land, Meld delivered a different {asset.toUpperCase()} contract than the one above.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={launch} disabled={!destination || busy === 'meld'}>
              {busy === 'meld' ? 'Opening…' : `Buy ${amount} via Meld`}
            </Button>
            <Button size="sm" variant="outline" onClick={refreshBalance}>Refresh balance</Button>
          </div>
        </CardContent>
      </Card>

      {/* 3 — Events + reconcile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            3 · meld_onramp_events
            <Button size="sm" variant="outline" onClick={reconcile} disabled={busy === 'reconcile'}>
              {busy === 'reconcile' ? 'Reconciling…' : 'Reconcile now'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground">No events yet. Run a buy above.</p>
          ) : (
            <div className="space-y-1.5 font-mono text-[11px]">
              {events.map((e) => (
                <div key={e.idempotency_key} className="rounded-md border bg-muted/30 px-2 py-1.5">
                  <span className={e.status === 'settled' ? 'text-green-600' : e.status === 'expired' ? 'text-muted-foreground' : 'text-amber-600'}>
                    [{e.status}]
                  </span>{' '}
                  {e.asset.toUpperCase()} · baseline {Number(e.baseline_amount)} → settled {e.settled_amount ? Number(e.settled_amount) : '—'}
                  {e.settled_via ? ` (${e.settled_via})` : ''} · {short(e.address)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-foreground break-all">{v}</span>
    </div>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select className="rounded-md border bg-background px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
