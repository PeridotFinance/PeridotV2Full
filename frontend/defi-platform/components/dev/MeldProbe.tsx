'use client'

/**
 * THROWAWAY — Meld onramp capability probe.
 *
 * Purpose: confirm whether Privy's Meld aggregator actually *routes*
 * `eip155:56` (BSC) USDC/USDT in our target regions before we build the real
 * card onramp. The SDK type accepts any CAIP-2 chain, so this is a runtime /
 * provider-coverage check, not a compile check. See
 * docs/onramp-meld-integration-plan.md §3.
 *
 * How to use:
 *   1. Set FEATURE_FLAGS.FIAT_ONRAMP_MELD_PROBE = true and open /app/meldtest
 *      while logged in (so a Privy embedded EVM wallet exists).
 *   2. Pick chain = BSC, asset = USDC, fiat = EUR, env = sandbox → "Run probe".
 *   3. OBSERVE the Meld widget that opens:
 *        - Does it open with BSC + USDC pre-selected (not Base, not an error)?
 *        - Which underlying provider served it (MoonPay / Coinbase / Transak…)?
 *        - Min/max amounts and fees shown for our region?
 *      The SDK only returns { status }, so provider/fees must be read off the
 *      widget by eye. Jot findings into the log box and paste into the plan §3.
 *   4. Repeat: asset = USDT; chain = BSC; then a second region via VPN.
 *      Use chain = Base (known-supported) as the control.
 *
 * Delete this file, the /app/meldtest route, and the FIAT_ONRAMP_MELD_PROBE
 * flag once the probe is done.
 */

import { useMemo, useState } from 'react'
import { usePrivy, useWallets, useFiatOnramp } from '@privy-io/react-auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type ChainKey = 'bsc' | 'base'
// eth on BSC = Binance-Peg ETH (0x2170…) — Ramp-only across Meld's providers,
// so this probe decides whether the WETH market gets a direct card route.
// bnb = native BNB (all providers carry it; our market is WBNB though).
type AssetKey = 'usdc' | 'usdt' | 'eth' | 'bnb'
type FiatKey = 'eur' | 'usd'
type EnvKey = 'sandbox' | 'production'

// CAIP-2 chain ids. `chain` is typed in the SDK as `${string}:${string}`, so
// any of these compiles — the probe is about whether Meld *routes* it.
const CHAINS: Record<ChainKey, { caip2: string; label: string }> = {
  bsc: { caip2: 'eip155:56', label: 'BSC (eip155:56) — the unknown' },
  base: { caip2: 'eip155:8453', label: 'Base (eip155:8453) — known-good control' },
}

interface LogEntry {
  ts: string
  msg: string
  kind: 'info' | 'ok' | 'err'
}

export function MeldProbe() {
  const { authenticated, login, ready } = usePrivy()
  const { wallets } = useWallets()
  const { fund } = useFiatOnramp()

  const [chain, setChain] = useState<ChainKey>('bsc')
  const [asset, setAsset] = useState<AssetKey>('usdc')
  const [fiat, setFiat] = useState<FiatKey>('eur')
  const [env, setEnv] = useState<EnvKey>('sandbox')
  const [amount, setAmount] = useState('30')
  const [addressOverride, setAddressOverride] = useState('')
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])

  // Prefer the Privy embedded EVM wallet; fall back to the first 0x wallet.
  const embeddedEvmAddress = useMemo(() => {
    const evm = (wallets ?? []).filter((w) =>
      /^0x[a-fA-F0-9]{40}$/.test(w?.address ?? ''),
    )
    const embedded = evm.find((w) => (w as any)?.walletClientType === 'privy')
    return (embedded ?? evm[0])?.address ?? ''
  }, [wallets])

  const destAddress = (addressOverride.trim() || embeddedEvmAddress).trim()

  const push = (msg: string, kind: LogEntry['kind'] = 'info') =>
    setLog((prev) => [
      // monotonic-ish label without Date.now in deps; fine for a dev tool
      { ts: new Date().toLocaleTimeString(), msg, kind },
      ...prev,
    ])

  const runProbe = async () => {
    if (!destAddress) {
      push('No destination address. Log in (embedded EVM wallet) or paste one.', 'err')
      return
    }
    const opts = {
      source: { assets: [fiat] as ('eur' | 'usd')[], defaultAsset: fiat },
      destination: {
        asset,
        chain: CHAINS[chain].caip2 as `${string}:${string}`,
        address: destAddress,
      },
      environment: env,
      defaultAmount: amount,
    }
    setRunning(true)
    push(
      `fund() → ${asset.toUpperCase()} on ${CHAINS[chain].caip2} · ${fiat.toUpperCase()} · ${env} · ${amount} → ${destAddress.slice(0, 6)}…${destAddress.slice(-4)}`,
    )
    push('WATCH THE WIDGET: chain + asset pre-selected? which provider? fees?')
    try {
      const result = await fund(opts as Parameters<typeof fund>[0])
      if (result?.status === 'confirmed') {
        push('status: confirmed ✅ — Meld routed this chain/asset for your region.', 'ok')
      } else if (result?.status === 'submitted') {
        push('status: submitted — you exited before final confirm (still informative).', 'info')
      } else {
        push(`status: ${JSON.stringify(result)}`, 'info')
      }
    } catch (e: any) {
      // An error here (esp. on BSC) is the headline finding: Meld likely does
      // NOT support this chain/asset for the region.
      push(`THREW: ${e?.message ?? String(e)} — likely unsupported route.`, 'err')
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card className="max-w-xl mx-auto my-8">
      <CardHeader>
        <CardTitle className="text-base">
          Meld onramp probe <span className="text-xs text-muted-foreground">(throwaway · plan §3)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!ready ? (
          <p className="text-muted-foreground">Loading Privy…</p>
        ) : !authenticated ? (
          <Button onClick={() => login()}>Log in (need an embedded EVM wallet)</Button>
        ) : (
          <>
            <div className="text-xs text-muted-foreground break-all">
              Embedded EVM: {embeddedEvmAddress || '— none found —'}
            </div>

            <Row label="Chain">
              <Select value={chain} onChange={(v) => setChain(v as ChainKey)}
                options={Object.entries(CHAINS).map(([k, v]) => ({ value: k, label: v.label }))} />
            </Row>
            <Row label="Asset">
              <Select value={asset} onChange={(v) => setAsset(v as AssetKey)}
                options={[
                  { value: 'usdc', label: 'USDC' },
                  { value: 'usdt', label: 'USDT' },
                  { value: 'eth', label: 'ETH (BSC = pegged, Ramp-only — WETH probe)' },
                  { value: 'bnb', label: 'BNB (native)' },
                ]} />
            </Row>
            <Row label="Fiat">
              <Select value={fiat} onChange={(v) => setFiat(v as FiatKey)}
                options={[{ value: 'eur', label: 'EUR' }, { value: 'usd', label: 'USD' }]} />
            </Row>
            <Row label="Environment">
              <Select value={env} onChange={(v) => setEnv(v as EnvKey)}
                options={[{ value: 'sandbox', label: 'sandbox' }, { value: 'production', label: 'production' }]} />
            </Row>
            <Row label="Amount">
              <input
                className="w-full rounded-md border bg-background px-2 py-1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
            </Row>
            <Row label="Address override">
              <input
                className="w-full rounded-md border bg-background px-2 py-1 font-mono text-xs"
                placeholder="leave blank to use embedded EVM"
                value={addressOverride}
                onChange={(e) => setAddressOverride(e.target.value)}
              />
            </Row>

            <Button onClick={runProbe} disabled={running} className="w-full">
              {running ? 'Probing…' : 'Run probe'}
            </Button>

            <div className="rounded-md border bg-muted/30 p-2 max-h-64 overflow-auto font-mono text-[11px] leading-relaxed">
              {log.length === 0 ? (
                <span className="text-muted-foreground">log…</span>
              ) : (
                log.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.kind === 'err' ? 'text-red-500' : l.kind === 'ok' ? 'text-green-500' : ''
                    }
                  >
                    [{l.ts}] {l.msg}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[120px_1fr] items-center gap-3">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      className="w-full rounded-md border bg-background px-2 py-1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
