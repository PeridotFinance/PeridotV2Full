"use client"

/**
 * Dev page for the cross-chain engine at /app/sodax (stage X2).
 *
 * Runs a deposit (EVM → Stellar) or a withdrawal (Stellar → EVM) through the
 * engine exactly as the Expert flows will: `useCrossChainTransfer` for the
 * steps, `/api/crosschain/*` for SODAX, a row in `cctp_transfers` for the
 * state. The transfers list at the bottom comes from the server, so a reload at
 * any step shows the transfer again, and "Resume" picks it up.
 *
 * Real amounts on mainnet. Not linked from any navigation; gated by
 * FEATURE_FLAGS.SODAX_SPIKE on the page.
 */
import { useEffect, useMemo, useState } from "react"
import { useAccount, useConfig } from "wagmi"
import { formatUnits, parseUnits } from "viem"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { useCrossChainTransfer, useCrossChainTransfers } from "@/hooks/use-crosschain-transfer"
import { useFundingSources } from "@/hooks/use-funding-sources"
import { stellarDeposit } from "@/lib/stellar-soroban-lending"
import { stellarClassicAssetForId, stellarHasTrustline } from "@/lib/stellar-trustline"
import { xcApi, XcClientError, type XcQuote, type XcTokenInfo } from "@/lib/crosschain/client"
import { preflight } from "@/lib/crosschain/preflight"
import { isNativeToken, XC_EVM_CHAIN_IDS, XC_STELLAR_MARKET_SYMBOL, type XcChain } from "@/lib/crosschain/route"
import { isInFlight, type XcTransfer } from "@/lib/crosschain/view"
import { SODAX_SCAN_URL } from "@/lib/crosschain/sodax"

type Direction = "in" | "out"

const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "none")
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`
const fmt = (raw: string | bigint | null | undefined, decimals: number) =>
  raw == null ? "n/a" : Number(formatUnits(BigInt(raw), decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })

function explorerTx(chain: XcChain, hash: string, explorers: Record<number, string | undefined>): string | null {
  if (chain === "stellar") return `https://stellar.expert/explorer/public/tx/${hash}`
  const base = explorers[chain]
  return base ? `${base.replace(/\/$/, "")}/tx/${hash}` : null
}

export function CrossChainEngineDev() {
  const config = useConfig()
  const { address: evmAddress } = useAccount()
  const stellar = useStellarWallet()
  const xc = useCrossChainTransfer()
  const [listKey, setListKey] = useState(0)
  const list = useCrossChainTransfers(stellar.address, listKey)
  const funding = useFundingSources({ evmAddress, stellarAddress: stellar.address })

  const evmChains = useMemo(
    () => config.chains.filter((c) => (XC_EVM_CHAIN_IDS as readonly number[]).includes(c.id)),
    [config.chains],
  )
  const explorers = useMemo(
    () => Object.fromEntries(config.chains.map((c) => [c.id, c.blockExplorers?.default.url])) as Record<number, string | undefined>,
    [config.chains],
  )

  const [direction, setDirection] = useState<Direction>("in")
  const [evmChainId, setEvmChainId] = useState<number>(8453)
  const [evmTokens, setEvmTokens] = useState<XcTokenInfo[]>([])
  const [stellarTokens, setStellarTokens] = useState<XcTokenInfo[]>([])
  const [evmSymbol, setEvmSymbol] = useState("USDC")
  const [stellarSymbol, setStellarSymbol] = useState("USDC")
  const [amount, setAmount] = useState("5")
  const [slippageBps, setSlippageBps] = useState(100)
  const [quote, setQuote] = useState<XcQuote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [trustline, setTrustline] = useState<boolean | null>(null)
  const [supplyNote, setSupplyNote] = useState<string | null>(null)

  useEffect(() => {
    if (evmChains.length && !evmChains.some((c) => c.id === evmChainId)) setEvmChainId(evmChains[0].id)
  }, [evmChains, evmChainId])

  useEffect(() => {
    let alive = true
    xcApi
      .tokens(evmChainId)
      .then((r) => {
        if (!alive) return
        setEvmTokens(r.tokens)
        if (!r.tokens.some((t) => t.symbol === evmSymbol) && r.tokens[0]) setEvmSymbol(r.tokens[0].symbol)
      })
      .catch(() => alive && setEvmTokens([]))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evmChainId])

  useEffect(() => {
    xcApi.tokens("stellar").then((r) => setStellarTokens(r.tokens)).catch(() => setStellarTokens([]))
  }, [])

  useEffect(() => {
    const asset = stellarClassicAssetForId("usdc-stellar")
    if (!stellar.address || !asset) return setTrustline(null)
    stellarHasTrustline(stellar.address, asset.code, asset.issuer).then(setTrustline).catch(() => setTrustline(null))
  }, [stellar.address])

  const evmToken = evmTokens.find((t) => t.symbol === evmSymbol)
  const stellarToken = stellarTokens.find((t) => t.symbol === stellarSymbol)
  const src: XcChain = direction === "in" ? evmChainId : "stellar"
  const dst: XcChain = direction === "in" ? "stellar" : evmChainId
  const srcToken = direction === "in" ? evmToken : stellarToken
  const dstToken = direction === "in" ? stellarToken : evmToken

  const rawAmount = useMemo(() => {
    if (!srcToken) return null
    try {
      const v = parseUnits(amount || "0", srcToken.decimals)
      return v > BigInt(0) ? v : null
    } catch {
      return null
    }
  }, [amount, srcToken])

  // Quote while typing, debounced.
  useEffect(() => {
    setQuote(null)
    setQuoteError(null)
    if (!srcToken || !dstToken || !rawAmount) return
    const id = setTimeout(() => {
      xcApi
        .quote({ src, dst, srcToken: srcToken.address, dstToken: dstToken.address, amount: rawAmount.toString(), slippageBps })
        .then(setQuote)
        .catch((e) => setQuoteError(e instanceof XcClientError ? e.message : String(e)))
    }, 400)
    return () => clearTimeout(id)
  }, [src, dst, srcToken, dstToken, rawAmount, slippageBps])

  const srcSource = funding.sources.find(
    (s) => s.chain === src && srcToken && s.token.address.toLowerCase() === srcToken.address.toLowerCase(),
  )
  const problems = srcToken && dstToken && rawAmount
    ? preflight({
        direction,
        src,
        srcSymbol: srcToken.symbol,
        dstSymbol: dstToken.symbol,
        srcIsNative: isNativeToken(src, srcToken),
        amount: Number(amount),
        // Zero only once the source wallet's balances were actually read.
        srcBalance: srcSource
          ? srcSource.amount
          : (src === "stellar" ? stellar.address : evmAddress) && funding.isFetched
            ? 0
            : null,
        usd: quote?.usd ?? null,
        stellarHasUsdcTrustline: trustline,
      })
    : []

  const ready =
    !xc.isWorking && Boolean(rawAmount && srcToken && dstToken && evmAddress && stellar.address && quote && !quote.limit) &&
    problems.length === 0

  const run = () => {
    if (!rawAmount || !srcToken || !dstToken || !evmAddress || !stellar.address) return
    setSupplyNote(null)
    xc.start({ src, dst, srcToken, dstToken, amount: rawAmount, slippageBps, stellarAddress: stellar.address, evmAddress })
      .finally(() => setListKey((n) => n + 1))
  }

  // The measured delivery is reported after the run ends, so the refresh above
  // can list the row before it carries the amount.
  const deliveredOut = xc.transfer?.deliveredOut ?? null
  useEffect(() => {
    if (deliveredOut) setListKey((n) => n + 1)
  }, [deliveredOut])

  // Supply what arrived: the measured delivery, else the guaranteed minimum.
  const arrivedIn = xc.step === "arrived" && xc.transfer?.direction === "in" && xc.transfer.status === "solved" ? xc.transfer : null
  const supply = async (t: XcTransfer) => {
    if (!stellar.address) return
    const marketId = Object.entries(XC_STELLAR_MARKET_SYMBOL).find(([, sym]) => sym === t.dst.symbol)?.[0]
    if (!marketId) return setSupplyNote(`No Peridot market for ${t.dst.symbol}.`)
    const raw = xc.delivered ?? (t.deliveredOut ? BigInt(t.deliveredOut) : BigInt(t.minOut))
    const human = formatUnits(raw, t.dst.decimals)
    try {
      setSupplyNote(`Supplying ${human} ${t.dst.symbol}…`)
      const hash = await stellarDeposit(stellar.address, marketId, human, (m) => setSupplyNote(m))
      await xcApi.update({ id: t.id, stellarAddress: stellar.address, action: "supplied", supplyTxHash: hash }, xc.getToken)
      setSupplyNote(`Supplied ${human} ${t.dst.symbol}.`)
      setListKey((n) => n + 1)
    } catch (e) {
      setSupplyNote(`Supply failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const dismiss = async (t: XcTransfer) => {
    if (!stellar.address) return
    await xcApi.update({ id: t.id, stellarAddress: stellar.address, action: "dismissed" }, xc.getToken).catch(() => null)
    setListKey((n) => n + 1)
  }

  const field = "rounded-md border border-border bg-background px-2 py-1.5 text-sm"
  const cur = xc.transfer

  return (
    <div className="mx-auto max-w-3xl space-y-4 text-sm">
      <div>
        <h1 className="text-xl font-semibold">Cross-chain engine (dev)</h1>
        <p className="text-muted-foreground">
          Deposits and withdrawals through the engine, with real amounts on mainnet. Every transfer is stored on the
          server; reload at any point and resume it from the list below.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wallets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div>
            EVM: <span className="font-mono">{short(evmAddress)}</span>
            {!evmAddress && <span className="text-muted-foreground"> (connect via the header)</span>}
          </div>
          <div className="flex items-center gap-2">
            Stellar: <span className="font-mono">{short(stellar.address)}</span>
            {!stellar.address && (
              <Button size="sm" variant="outline" onClick={() => stellar.connect()}>
                Connect Stellar
              </Button>
            )}
          </div>
          {trustline === false && <div className="text-red-500">No USDC trustline: USDC deliveries to this wallet would fail.</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funding sources ({funding.sources.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {funding.isLoading ? (
            <div className="text-muted-foreground">Reading balances…</div>
          ) : funding.sources.length === 0 ? (
            <div className="text-muted-foreground">Nothing found on any supported network.</div>
          ) : (
            <ul className="space-y-0.5">
              {funding.sources.map((s) => (
                <li key={`${s.chain}:${s.token.address}`}>
                  <button
                    className="underline-offset-2 hover:underline"
                    onClick={() => {
                      if (s.chain === "stellar") {
                        setDirection("out")
                        setStellarSymbol(s.token.symbol)
                      } else {
                        setDirection("in")
                        setEvmChainId(s.chain)
                        setEvmSymbol(s.token.symbol)
                      }
                    }}
                  >
                    {s.chainName} · {s.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} {s.token.symbol}
                    {s.usd != null && <span className="text-muted-foreground"> (${s.usd.toFixed(2)})</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transfer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            {(["in", "out"] as const).map((d) => (
              <Button key={d} size="sm" variant={direction === d ? "default" : "outline"} onClick={() => setDirection(d)}>
                {d === "in" ? "Deposit: network → Stellar" : "Withdraw: Stellar → network"}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="space-y-1">
              <div className="text-xs text-muted-foreground">Network</div>
              <select className={field} value={evmChainId} onChange={(e) => setEvmChainId(Number(e.target.value))}>
                {evmChains.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <div className="text-xs text-muted-foreground">Token there</div>
              <select className={field} value={evmSymbol} onChange={(e) => setEvmSymbol(e.target.value)}>
                {evmTokens.map((t) => (
                  <option key={t.address} value={t.symbol}>
                    {t.symbol}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <div className="text-xs text-muted-foreground">Stellar asset</div>
              <select className={field} value={stellarSymbol} onChange={(e) => setStellarSymbol(e.target.value)}>
                {stellarTokens.map((t) => (
                  <option key={t.address} value={t.symbol}>
                    {t.symbol}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <div className="text-xs text-muted-foreground">Slippage (bps)</div>
              <input
                className={`${field} w-full`}
                type="number"
                min={10}
                max={500}
                value={slippageBps}
                onChange={(e) => setSlippageBps(Math.max(10, Math.min(500, Number(e.target.value) || 100)))}
              />
            </label>
          </div>

          <label className="block space-y-1">
            <div className="text-xs text-muted-foreground">
              Amount ({srcToken?.symbol ?? "?"}){srcSource && ` · balance ${srcSource.amount} `}
              {srcSource && (
                <button className="underline" onClick={() => setAmount(String(srcSource.amount))}>
                  max
                </button>
              )}
            </div>
            <input className={`${field} w-40`} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </label>

          <div className="rounded-md border border-border p-3">
            {quote && dstToken ? (
              <div className="space-y-0.5">
                <div>
                  You get about <b>{fmt(quote.quotedOut, quote.dstDecimals)} {dstToken.symbol}</b>, at least{" "}
                  {fmt(quote.minOut, quote.dstDecimals)} ({quote.ms} ms)
                </div>
                {quote.usd != null && <div className="text-muted-foreground">Value ${quote.usd.toFixed(2)}</div>}
                {quote.limit && <div className="text-red-500">{quote.limit.message}</div>}
              </div>
            ) : (
              <div className="text-muted-foreground">{quoteError ?? (rawAmount ? "Quoting…" : "Enter an amount.")}</div>
            )}
            {problems.map((p) => (
              <div key={p.code} className="text-red-500">
                {p.message}
              </div>
            ))}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={!ready} onClick={run}>
                {xc.isWorking ? `${xc.step}…` : direction === "in" ? "Deposit to Stellar" : "Withdraw from Stellar"}
              </Button>
              {xc.step !== "idle" && !xc.isWorking && (
                <Button size="sm" variant="ghost" onClick={xc.reset}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {xc.step !== "idle" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Current run: {xc.step}
              {xc.stalled && " (continues without this page)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <ol className="space-y-1 font-mono text-xs">
              {xc.events.map((e, i) => (
                <li key={i} className={e.step === "failed" ? "text-red-500" : e.step === "arrived" ? "text-green-500" : ""}>
                  <span className="text-muted-foreground">+{secs(e.at)}</span> {e.step}
                  {e.detail && <span className="text-muted-foreground"> · {e.detail.length > 24 ? short(e.detail) : e.detail}</span>}
                </li>
              ))}
            </ol>
            {xc.error && <div className="text-red-500">{xc.error.message}</div>}
            {cur && (
              <div className="text-xs text-muted-foreground">
                Transfer #{cur.id} · {cur.status}
                {cur.sodaxStatus && ` · SODAX ${cur.sodaxStatus}`}
                {xc.txHash && (
                  <>
                    {" · "}
                    <a className="underline" href={explorerTx(cur.src.chain, xc.txHash, explorers) ?? "#"} target="_blank" rel="noreferrer">
                      source tx
                    </a>
                  </>
                )}
                {" · "}
                <a className="underline" href={SODAX_SCAN_URL} target="_blank" rel="noreferrer">
                  SODAX Scan
                </a>
              </div>
            )}
            {xc.step === "arrived" && cur && (
              <div className="text-green-500">
                Arrived: {xc.delivered != null ? fmt(xc.delivered, cur.dst.decimals) : `at least ${fmt(cur.minOut, cur.dst.decimals)}`}{" "}
                {cur.dst.symbol}
              </div>
            )}
            {arrivedIn && (
              <Button size="sm" variant="outline" onClick={() => supply(arrivedIn)}>
                Supply into Peridot
              </Button>
            )}
            {supplyNote && <div className="text-xs">{supplyNote}</div>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Transfers ({list.transfers.length})</CardTitle>
          <Button size="sm" variant="ghost" onClick={list.refresh}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {list.error && <div className="text-red-500">{list.error.message}</div>}
          {list.transfers.length === 0 ? (
            <div className="text-muted-foreground">{list.loading ? "Loading…" : "No transfers yet."}</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="pr-2">#</th>
                  <th className="pr-2">When</th>
                  <th className="pr-2">Route</th>
                  <th className="pr-2">Sent</th>
                  <th className="pr-2">Got</th>
                  <th className="pr-2">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.transfers.map((t) => (
                  <tr key={t.id} className="border-t border-border align-top">
                    <td className="pr-2">{t.id}</td>
                    <td className="pr-2">{new Date(t.createdAt).toLocaleString()}</td>
                    <td className="pr-2">
                      {t.src.symbol} {t.src.chain === "stellar" ? "Stellar" : t.src.chain} → {t.dst.symbol}{" "}
                      {t.dst.chain === "stellar" ? "Stellar" : t.dst.chain}
                    </td>
                    <td className="pr-2">{fmt(t.src.amount, t.src.decimals)}</td>
                    <td className="pr-2">{t.deliveredOut ? fmt(t.deliveredOut, t.dst.decimals) : `≥ ${fmt(t.minOut, t.dst.decimals)}`}</td>
                    <td className="pr-2" title={t.failReason ?? undefined}>
                      {t.status}
                      {t.sodaxStatus && t.status === "relaying" && ` (${t.sodaxStatus})`}
                      {t.failReason && <div className="max-w-[16rem] truncate text-muted-foreground">{t.failReason}</div>}
                    </td>
                    <td className="space-x-1 whitespace-nowrap">
                      {(isInFlight(t) || t.status === "created" || (t.status === "solved" && t.direction === "in")) && (
                        <Button size="sm" variant="outline" disabled={xc.isWorking} onClick={() => xc.resume(t)}>
                          Resume
                        </Button>
                      )}
                      {["solved", "failed", "expired"].includes(t.status) && (
                        <Button size="sm" variant="ghost" onClick={() => dismiss(t)}>
                          Dismiss
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
