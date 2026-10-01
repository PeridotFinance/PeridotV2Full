"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useAccount, useChainId } from "wagmi"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useDualInvestmentAddresses, useDualCanEnter, useDualEnterPosition, useDualPositions, useDualSettlement, useTokenAllowance, useDualConstraints } from "@/hooks/use-dualinvest"
import { getMarketsForChain, getAssetContractAddresses } from "@/data/market-data"

export default function DualInvestDebugger() {
  const { address } = useAccount()
  const chainId = useChainId()
  const addrs = useDualInvestmentAddresses()
  const { canEnter } = useDualCanEnter()
  const { enterPosition, borrowAndEnterPosition } = useDualEnterPosition()
  const { findUserPositions, getPositionInfo } = useDualPositions()
  const { canSettlePosition, settlePosition } = useDualSettlement()
  const { getExpiryBounds, getPositionSizeBounds } = useDualConstraints()

  const markets = useMemo(() => getMarketsForChain(chainId), [chainId])
  const [assetInId, setAssetInId] = useState<string>("")
  const [assetOutId, setAssetOutId] = useState<string>("")
  const cTokenIn = useMemo(() => (assetInId ? getAssetContractAddresses(assetInId, chainId)?.pTokenAddress || "" : ""), [assetInId, chainId])
  const cTokenOut = useMemo(() => (assetOutId ? getAssetContractAddresses(assetOutId, chainId)?.pTokenAddress || "" : ""), [assetOutId, chainId])
  const [amount, setAmount] = useState<string>("0")
  const [direction, setDirection] = useState<number>(0)
  const [strike, setStrike] = useState<string>("0")
  const [expiry, setExpiry] = useState<string>("0")
  const [useCollateral, setUseCollateral] = useState<boolean>(true)
  const [logs, setLogs] = useState<string[]>([])
  const [positions, setPositions] = useState<Array<{ tokenId: bigint }>>([])

  const allowance = useTokenAllowance(cTokenIn as `0x${string}` | undefined, addrs?.vaultExecutor as `0x${string}` | undefined)

  function log(msg: string) {
    setLogs((l) => [msg, ...l].slice(0, 200))
  }

  useEffect(() => {
    (async () => {
      const exp = await getExpiryBounds()
      const size = await getPositionSizeBounds()
      if (exp) log(`expiryBounds min=${exp.minAllowed} max=${exp.maxAllowed}`)
      if (size) log(`sizeBounds min=${size.minPositionSize} max=${size.maxPositionSize}`)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId])

  async function onCheckAllowance() {
    try {
      const value = await allowance.read()
      log(`allowance=${value}`)
    } catch (e: any) {
      log(`allowance error: ${e?.message || String(e)}`)
    }
  }

  async function onApprove() {
    try {
      const tx = await allowance.approve(BigInt(amount))
      log(`approve tx=${tx}`)
    } catch (e: any) {
      log(`approve error: ${e?.shortMessage || e?.message || String(e)}`)
    }
  }

  async function onCanEnter() {
    try {
      const res = await canEnter({ cTokenIn: cTokenIn as `0x${string}`, amount: BigInt(amount), useCollateral })
      log(`canEnter=${res.canEnter} reason=${res.reason}`)
    } catch (e: any) {
      log(`canEnter error: ${e?.message || String(e)}`)
    }
  }

  async function onEnter() {
    try {
      const tx = await enterPosition({
        cTokenIn: cTokenIn as `0x${string}`,
        cTokenOut: cTokenOut as `0x${string}`,
        amount: BigInt(amount),
        direction,
        strike: BigInt(strike),
        expiry: BigInt(expiry),
        useCollateral,
      })
      log(`enter tx=${tx}`)
    } catch (e: any) {
      log(`enter error: ${e?.shortMessage || e?.message || String(e)}`)
    }
  }

  async function onBorrowEnter() {
    try {
      const tx = await borrowAndEnterPosition({
        cToken: cTokenIn as `0x${string}`,
        cTokenOut: cTokenOut as `0x${string}`,
        borrowUnderlyingAmount: BigInt(amount),
        direction,
        strike: BigInt(strike),
        expiry: BigInt(expiry),
      })
      log(`borrowEnter tx=${tx}`)
    } catch (e: any) {
      log(`borrowEnter error: ${e?.shortMessage || e?.message || String(e)}`)
    }
  }

  async function onScanPositions() {
    try {
      const list = await findUserPositions()
      setPositions(list)
      log(`found ${list.length} positions`)
    } catch (e: any) {
      log(`scan error: ${e?.message || String(e)}`)
    }
  }

  async function onGetInfo(tokenId: bigint) {
    const info = await getPositionInfo(tokenId)
    log(`tokenId ${tokenId} info=${JSON.stringify(info)}`)
  }

  async function onSettle(tokenId: bigint) {
    if (!address) return
    try {
      const pre = await canSettlePosition(tokenId)
      log(`canSettle=${pre.canSettle} reason=${pre.reason}`)
      if (!pre.canSettle) return
      const tx = await settlePosition(tokenId, address)
      log(`settle tx=${tx}`)
    } catch (e: any) {
      log(`settle error: ${e?.shortMessage || e?.message || String(e)}`)
    }
  }

  return (
    <Card className="bg-card/60 border border-border">
      <CardContent className="p-6 space-y-4">
        <div className="font-semibold">DualInvest Debugger</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <Label>Market In</Label>
            <select className="w-full h-9 rounded-md bg-background border border-input px-2" value={assetInId} onChange={(e) => setAssetInId(e.target.value)}>
              <option value="">Select market</option>
              {markets.filter(m => m.hasSmartContract).map(m => (
                <option key={m.id} value={m.id}>{m.symbol}</option>
              ))}
            </select>
            <div className="text-[10px] text-muted-foreground mt-1 break-all">{cTokenIn || "—"}</div>
          </div>
          <div>
            <Label>Market Out</Label>
            <select className="w-full h-9 rounded-md bg-background border border-input px-2" value={assetOutId} onChange={(e) => setAssetOutId(e.target.value)}>
              <option value="">Select market</option>
              {markets.filter(m => m.hasSmartContract).map(m => (
                <option key={m.id} value={m.id}>{m.symbol}</option>
              ))}
            </select>
            <div className="text-[10px] text-muted-foreground mt-1 break-all">{cTokenOut || "—"}</div>
          </div>
          <div>
            <Label>Amount</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Direction (0=CALL Sell High, 1=PUT Buy Low)</Label>
            <Input value={direction} onChange={(e) => setDirection(Number(e.target.value) || 0)} />
          </div>
          <div>
            <Label>Strike (USD scaled)</Label>
            <Input value={strike} onChange={(e) => setStrike(e.target.value)} />
          </div>
          <div>
            <Label>Expiry (unix seconds)</Label>
            <Input value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <input id="use-collateral" type="checkbox" checked={useCollateral} onChange={(e) => setUseCollateral(e.target.checked)} />
            <Label htmlFor="use-collateral">Use Collateral</Label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onCheckAllowance}>Check Allowance</Button>
          <Button variant="secondary" onClick={onApprove}>Approve</Button>
          <Button onClick={onCanEnter}>canEnterPosition</Button>
          <Button onClick={onEnter}>enterPosition</Button>
          <Button onClick={onBorrowEnter}>borrowAndEnter</Button>
          <Button variant="outline" onClick={onScanPositions}>Scan Positions</Button>
        </div>

        {positions.length > 0 && (
          <div className="space-y-2">
            <Separator />
            <div className="text-sm font-medium">Positions</div>
            <div className="grid md:grid-cols-2 gap-2">
              {positions.map((p) => (
                <div key={String(p.tokenId)} className="p-2 rounded border border-border">
                  <div className="text-xs">tokenId: {String(p.tokenId)}</div>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="secondary" onClick={() => onGetInfo(p.tokenId)}>info</Button>
                    <Button size="sm" onClick={() => onSettle(p.tokenId)}>settle</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator />
        <div className="text-xs text-muted-foreground whitespace-pre-wrap break-all">
          {logs.join("\n")}
        </div>
      </CardContent>
    </Card>
  )
}


