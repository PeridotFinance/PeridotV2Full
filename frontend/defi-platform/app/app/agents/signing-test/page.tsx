'use client'

import * as React from 'react'
import { usePrivy, useWallets, useSendTransaction } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { useAccount, useChainId } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, XCircle, ExternalLink, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getChainConfig } from '@/config/contracts'
import type { Address, Hex } from 'viem'

/**
 * Phase 0 — empirical test surface to verify whether Privy embedded wallets
 * sign via `smartWalletClient.sendTransaction()` WITHOUT opening a UI popup.
 *
 * If yes → agent auto-execute is viable (no user interaction needed).
 * If no  → auto-execute needs a different signing primitive.
 *
 * The test:
 *   - sends a trivial self-tx (to: self, value: 0, data: 0x) on the active chain
 *   - measures elapsed time from send → hash
 *   - user reports whether they saw a popup (radio buttons)
 *   - also runs a batch test (2 calls) to verify Smart Account batching
 */

type RunStatus = 'idle' | 'sending' | 'success' | 'error'

interface RunResult {
  label: string
  status: RunStatus
  startedAt?: number
  elapsedMs?: number
  hash?: Hex
  error?: string
  logs: string[]
}

function blank(label: string): RunResult {
  return { label, status: 'idle', logs: [] }
}

/**
 * ERC-4337 "AAxx" error codes commonly surfaced by bundlers / paymasters.
 * Used to annotate logs with a human-readable hint.
 */
const AA_HINTS: Record<string, string> = {
  AA10: 'sender already constructed',
  AA13: 'initCode failed or OOG',
  AA14: 'initCode must return sender',
  AA15: 'initCode must create sender',
  AA20: 'account not deployed',
  AA21: "didn't pay prefund — paymaster is not sponsoring and the smart wallet has no native balance (THIS IS LIKELY YOUR ERROR)",
  AA22: 'expired or not due',
  AA23: 'reverted (or OOG) during account validation',
  AA24: 'signature error',
  AA25: 'invalid account nonce',
  AA31: "paymaster deposit too low — paymaster's own balance at the EntryPoint is empty",
  AA32: 'paymaster expired or not due',
  AA33: 'reverted (or OOG) during paymaster validation — policy rejected your tx',
  AA34: 'signature error (paymaster)',
  AA40: 'over verificationGasLimit',
  AA41: 'too little verificationGas',
  AA50: 'postOp reverted',
  AA51: 'prefund below actual gas cost',
  AA90: 'invalid beneficiary',
  AA91: 'failed send to beneficiary',
  AA92: 'paymaster balance error',
  AA93: 'invalid paymasterAndData',
  AA94: 'gas values overflow',
  AA95: 'out of gas',
  AA96: 'invalid aggregator',
}

function explorerTxUrl(chainId: number, hash: string): string | null {
  try {
    const cfg = getChainConfig(chainId)
    const base = (cfg as any)?.explorer
    if (typeof base === 'string' && base.length > 0) {
      return `${base.replace(/\/$/, '')}/tx/${hash}`
    }
  } catch {}
  return null
}

export default function SigningTestPage() {
  const { ready, authenticated, user, login } = usePrivy()
  const { wallets } = useWallets()
  const { address: eoaAddress } = useAccount()
  const activeChainId = useChainId()
  const { client: defaultSmartClient, getClientForChain } = useSmartWallets()
  const { sendTransaction: privySendTransaction } = useSendTransaction()

  const [singleRun, setSingleRun] = React.useState<RunResult>(() => blank('Smart wallet: Single test tx'))
  const [batchRun, setBatchRun] = React.useState<RunResult>(() => blank('Smart wallet: Batch test tx (2 calls)'))
  const [eoaRun, setEoaRun] = React.useState<RunResult>(() => blank('Embedded EOA: Single test tx (Privy managed gas)'))
  const [popupAnswer, setPopupAnswer] = React.useState<'yes' | 'no' | null>(null)
  const [silentMode, setSilentMode] = React.useState(true)
  const [sponsorMode, setSponsorMode] = React.useState(true)
  const [policyId, setPolicyId] = React.useState('')

  // Pull smart-wallet info from the Privy user
  const smartWalletAccount = React.useMemo(() => {
    const accounts = ((user as any)?.linkedAccounts || []) as Array<{ type?: string; address?: string }>
    return accounts.find((a) => (a?.type || '').toLowerCase() === 'smart_wallet') || null
  }, [user])

  const embeddedWallet = React.useMemo(() => {
    for (const w of wallets || []) {
      const ct = ((w as any)?.walletClientType || '').toString().toLowerCase()
      if (ct === 'privy' || ct.includes('embedded')) return w
    }
    return null
  }, [wallets])

  const smartWalletAddress = smartWalletAccount?.address as Address | undefined
  const selfAddress = smartWalletAddress ?? (eoaAddress as Address | undefined)
  const targetChainId = activeChainId ?? 56

  const hasSmartWallet = Boolean(smartWalletAccount)
  const hasEmbeddedWallet = Boolean(embeddedWallet)

  function appendLog(setter: React.Dispatch<React.SetStateAction<RunResult>>, msg: string) {
    setter((prev) => ({ ...prev, logs: [...prev.logs, `[${new Date().toISOString().split('T')[1].slice(0, -1)}] ${msg}`] }))
  }

  /**
   * Walk through a viem/permissionless error tree and extract the parts that
   * explain *why* sponsorship failed (AA codes, paymaster reverts, etc.).
   */
  function logErrorDetail(
    setter: React.Dispatch<React.SetStateAction<RunResult>>,
    err: unknown,
  ) {
    const anyErr = err as any
    const fields: Array<[string, unknown]> = [
      ['message', anyErr?.message],
      ['shortMessage', anyErr?.shortMessage],
      ['details', anyErr?.details],
      ['code', anyErr?.code],
      ['name', anyErr?.name],
      ['metaMessages', anyErr?.metaMessages],
    ]
    for (const [key, val] of fields) {
      if (val === undefined || val === null || val === '') continue
      if (Array.isArray(val)) {
        appendLog(setter, `${key}: ${val.join(' | ')}`)
      } else if (typeof val === 'object') {
        try { appendLog(setter, `${key}: ${JSON.stringify(val)}`) } catch { appendLog(setter, `${key}: [unserializable object]`) }
      } else {
        appendLog(setter, `${key}: ${String(val)}`)
      }
    }

    // AA-code hint (ERC-4337 UserOperation errors)
    const allText = `${anyErr?.message ?? ''}\n${anyErr?.shortMessage ?? ''}\n${anyErr?.details ?? ''}`
    const aaMatch = allText.match(/AA\d{2}/)
    if (aaMatch) {
      appendLog(setter, `→ AA code detected: ${aaMatch[0]} (${AA_HINTS[aaMatch[0]] ?? 'unknown — check EntryPoint spec'})`)
    }

    // Walk the cause chain up to 3 levels deep
    let cause: any = anyErr?.cause
    let depth = 0
    while (cause && depth < 3) {
      appendLog(setter, `── cause[${depth}] ──`)
      if (cause.message) appendLog(setter, `  message: ${cause.message}`)
      if (cause.shortMessage) appendLog(setter, `  shortMessage: ${cause.shortMessage}`)
      if (cause.details) appendLog(setter, `  details: ${cause.details}`)
      if (cause.code !== undefined) appendLog(setter, `  code: ${cause.code}`)
      if (cause.metaMessages) appendLog(setter, `  metaMessages: ${JSON.stringify(cause.metaMessages)}`)
      cause = cause.cause
      depth++
    }

    // Dump full error object to browser console for inspection
    try {
      console.group('[signing-test] full error dump')
      console.error(err)
      console.log('keys:', anyErr ? Object.keys(anyErr) : '(none)')
      console.groupEnd()
    } catch {}
  }

  /** Dump what we know about the resolved smart-wallet client */
  function logClientInfo(
    setter: React.Dispatch<React.SetStateAction<RunResult>>,
    client: any,
  ) {
    const chainIdFromClient = client?.chainId ?? client?.chain?.id
    const addr = client?.account?.address ?? client?.address
    const accountType = client?.account?.type ?? client?.account?.source ?? '?'
    const entryPoint = client?.account?.entryPoint?.address ?? client?.account?.entryPoint ?? '?'

    appendLog(setter, `client.chainId: ${chainIdFromClient ?? '(none)'}`)
    appendLog(setter, `client.address: ${addr ?? '(none)'}`)
    appendLog(setter, `client.account.type: ${typeof accountType === 'object' ? JSON.stringify(accountType) : accountType}`)
    appendLog(setter, `client.entryPoint: ${typeof entryPoint === 'object' ? JSON.stringify(entryPoint) : entryPoint}`)

    // Annotate EntryPoint version — Privy's hosted paymaster defaults depend on this.
    const epStr = typeof entryPoint === 'string' ? entryPoint.toLowerCase() : ''
    if (epStr === '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789') {
      appendLog(setter, '→ EntryPoint v0.6 detected. If Privy dashboard sponsorship is configured for v0.7, the paymaster will not attach.')
    } else if (epStr === '0x0000000071727de22e5e9d8baf0edac6f37da032') {
      appendLog(setter, '→ EntryPoint v0.7 detected.')
    }

    if (chainIdFromClient !== targetChainId) {
      appendLog(
        setter,
        `⚠ client.chainId (${chainIdFromClient}) ≠ active wagmi chain (${targetChainId}). Paymaster policies are per-chain — make sure the dashboard has sponsorship enabled for ${chainIdFromClient}.`,
      )
    }

    try {
      console.group('[signing-test] client introspection')
      console.log('client:', client)
      console.log('keys:', client ? Object.keys(client) : '(none)')
      if (client?.account) console.log('account keys:', Object.keys(client.account))
      console.groupEnd()
    } catch {}
  }

  async function resolveClient(
    setter: React.Dispatch<React.SetStateAction<RunResult>>,
  ): Promise<any> {
    if (!targetChainId) throw new Error('No active chain')
    appendLog(setter, `resolving smart-wallet client for chainId=${targetChainId}...`)

    if (getClientForChain) {
      try {
        const c = await (getClientForChain as any)({ id: targetChainId })
        if (c) {
          appendLog(setter, `getClientForChain(${targetChainId}) → ok`)
          return c
        }
        appendLog(setter, `getClientForChain(${targetChainId}) returned null, falling back to default client`)
      } catch (resolveErr) {
        appendLog(setter, `getClientForChain threw: ${(resolveErr as Error)?.message ?? resolveErr}`)
      }
    } else {
      appendLog(setter, 'getClientForChain is unavailable; using default client')
    }

    const fallback = defaultSmartClient as any
    if (fallback) {
      appendLog(setter, 'using default smart wallet client')
      return fallback
    }
    throw new Error('Smart wallet client not available for chain ' + targetChainId)
  }

  const runSingle = async () => {
    if (!selfAddress) return
    const to = selfAddress
    setSingleRun({ label: 'Single test tx', status: 'sending', startedAt: Date.now(), logs: [] })
    appendLog(setSingleRun, `target wagmi chain: ${targetChainId}`)
    appendLog(setSingleRun, `to: ${to} (self)`)

    try {
      const client = await resolveClient(setSingleRun)
      logClientInfo(setSingleRun, client)

      const txParams: any = { to, value: BigInt(0), data: '0x' as Hex }
      const txOptions: any = {}
      if (silentMode) txOptions.uiOptions = { showWalletUIs: false }
      if (sponsorMode) {
        // Pimlico expects a sponsorshipPolicyId when their paymaster is the one
        // attached to the smart-wallet client. Without a policy, `pm_sponsorUserOperation`
        // won't attach any data → `paymasterAndData: 0x` → AA21.
        txOptions.paymasterContext = policyId
          ? { sponsorshipPolicyId: policyId }
          : { mode: 'SPONSORED' }
      }
      appendLog(
        setSingleRun,
        `options: ${JSON.stringify({ silentMode, sponsorMode, ...txOptions })}`,
      )

      const started = Date.now()
      const hash = (await (client as any).sendTransaction(txParams, txOptions)) as Hex
      const elapsed = Date.now() - started

      appendLog(setSingleRun, `hash: ${hash}`)
      appendLog(setSingleRun, `elapsed: ${elapsed} ms`)
      setSingleRun((prev) => ({ ...prev, status: 'success', hash, elapsedMs: elapsed }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logErrorDetail(setSingleRun, err)
      setSingleRun((prev) => ({ ...prev, status: 'error', error: message }))
    }
  }

  const runBatch = async () => {
    if (!selfAddress) return
    const to = selfAddress
    setBatchRun({ label: 'Batch test tx (2 calls)', status: 'sending', startedAt: Date.now(), logs: [] })
    appendLog(setBatchRun, `target wagmi chain: ${targetChainId}`)
    appendLog(setBatchRun, `to: ${to} (self, x2)`)

    try {
      const client = await resolveClient(setBatchRun)
      logClientInfo(setBatchRun, client)

      const txParams: any = {
        calls: [
          { to, value: BigInt(0), data: '0x' as Hex },
          { to, value: BigInt(0), data: '0x' as Hex },
        ],
      }
      const txOptions: any = {}
      if (silentMode) txOptions.uiOptions = { showWalletUIs: false }
      if (sponsorMode) txOptions.paymasterContext = { mode: 'SPONSORED' }
      appendLog(
        setBatchRun,
        `options: ${JSON.stringify({ silentMode, sponsorMode, ...txOptions })}`,
      )

      const started = Date.now()
      const hash = (await (client as any).sendTransaction(txParams, txOptions)) as Hex
      const elapsed = Date.now() - started

      appendLog(setBatchRun, `hash: ${hash}`)
      appendLog(setBatchRun, `elapsed: ${elapsed} ms`)
      setBatchRun((prev) => ({ ...prev, status: 'success', hash, elapsedMs: elapsed }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logErrorDetail(setBatchRun, err)
      setBatchRun((prev) => ({ ...prev, status: 'error', error: message }))
    }
  }

  const runEoa = async () => {
    if (!eoaAddress) return
    const to = eoaAddress as Address
    setEoaRun({
      label: 'Embedded EOA: Single test tx (Privy managed gas)',
      status: 'sending',
      startedAt: Date.now(),
      logs: [],
    })
    appendLog(setEoaRun, `target wagmi chain: ${targetChainId}`)
    appendLog(setEoaRun, `to: ${to} (self)`)
    appendLog(setEoaRun, 'using Privy useSendTransaction (embedded EOA path)')

    const txParams: any = {
      to,
      value: BigInt(0),
      data: '0x',
      chainId: targetChainId,
    }
    const txOptions: any = { sponsor: sponsorMode }
    if (silentMode) txOptions.uiOptions = { showWalletUIs: false }
    appendLog(
      setEoaRun,
      `options: ${JSON.stringify({ silentMode, sponsorMode, ...txOptions })}`,
    )

    try {
      const started = Date.now()
      const result = await privySendTransaction(txParams, txOptions)
      const elapsed = Date.now() - started
      const hash = (result as any)?.hash ?? (result as any)
      appendLog(setEoaRun, `hash: ${hash}`)
      appendLog(setEoaRun, `elapsed: ${elapsed} ms`)
      appendLog(setEoaRun, 'If sponsor:true was accepted, this tx was paid from your Privy credit balance.')
      setEoaRun((prev) => ({ ...prev, status: 'success', hash, elapsedMs: elapsed }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logErrorDetail(setEoaRun, err)
      setEoaRun((prev) => ({ ...prev, status: 'error', error: message }))
    }
  }

  const reset = () => {
    setSingleRun(blank('Smart wallet: Single test tx'))
    setBatchRun(blank('Smart wallet: Batch test tx (2 calls)'))
    setEoaRun(blank('Embedded EOA: Single test tx (Privy managed gas)'))
    setPopupAnswer(null)
  }

  if (!ready) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-muted-foreground">
        Loading Privy…
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-bold mb-2">Privy Smart-Wallet Signing Test</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Log in with Privy to run the test.
        </p>
        <Button onClick={() => login()}>Log in with Privy</Button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-16 space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Privy Smart-Wallet Signing Test</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl">
          Verify whether <code className="text-xs bg-muted/60 px-1 py-0.5 rounded">smartWalletClient.sendTransaction()</code>
          {' '}signs a trivial self-tx <strong>without opening a Privy UI popup</strong>. If yes → agent auto-execute is viable.
        </p>
      </header>

      {/* Wallet summary */}
      <section className="rounded-xl border border-border/40 p-6 bg-background/40 space-y-3 text-sm">
        <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground/60">
          Wallet state
        </h2>
        <Field label="Authenticated" value={String(authenticated)} />
        <Field label="Active chain" value={`${targetChainId}`} />
        <Field label="EOA / embedded address" value={eoaAddress ?? '—'} mono copyable />
        <Field
          label="Embedded wallet present"
          value={hasEmbeddedWallet ? 'yes' : 'no'}
          tone={hasEmbeddedWallet ? 'good' : 'warn'}
        />
        <Field
          label="Smart wallet linked"
          value={hasSmartWallet ? 'yes' : 'no'}
          tone={hasSmartWallet ? 'good' : 'warn'}
        />
        <Field
          label="Smart wallet address"
          value={smartWalletAddress ?? '—'}
          mono
          copyable={!!smartWalletAddress}
        />
      </section>

      {!hasSmartWallet && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <strong>No smart wallet linked to this Privy user.</strong> The test requires a
          Privy smart wallet. Provision one on <code className="text-xs bg-muted/60 px-1 py-0.5 rounded">/app/crosstest</code>
          {' '}first, or sign in with a social login that auto-provisions an embedded + smart wallet.
        </div>
      )}

      {/* Run controls */}
      <section className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground/60">
          Tests
        </h2>

        {/* Mode toggles */}
        <div className="rounded-xl border border-border/40 p-4 bg-background/40 space-y-3 text-sm">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={silentMode}
              onChange={(e) => setSilentMode(e.target.checked)}
              className="mt-1"
            />
            <div>
              <div className="font-medium">
                Silent mode <span className="text-muted-foreground text-xs">(uiOptions.showWalletUIs: false)</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Asks Privy to skip the confirmation popup. Only works if the
                signing can happen without user input.
              </div>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sponsorMode}
              onChange={(e) => setSponsorMode(e.target.checked)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="font-medium">
                Request sponsorship <span className="text-muted-foreground text-xs">(paymasterContext)</span>
              </div>
              <div className="text-xs text-muted-foreground">
                If a Pimlico Sponsorship Policy ID is provided, it is sent as
                <code className="mx-1 px-1 bg-muted/60 rounded">sponsorshipPolicyId</code>;
                otherwise a generic <code className="mx-1 px-1 bg-muted/60 rounded">mode: 'SPONSORED'</code> hint is sent.
              </div>
              {sponsorMode && (
                <input
                  type="text"
                  value={policyId}
                  onChange={(e) => setPolicyId(e.target.value.trim())}
                  placeholder="sp_xxxxxxxxxxxx (from dashboard.pimlico.io → Sponsorship Policies)"
                  className="mt-2 w-full px-3 py-1.5 text-xs font-mono rounded border border-border/40 bg-background/60 focus:border-primary focus:outline-none"
                  spellCheck={false}
                />
              )}
            </div>
          </label>
        </div>

        {/* Setup hint */}
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-4 text-xs space-y-2">
          <p className="font-medium text-amber-500">
            Why is <code className="px-1 bg-muted/60 rounded">paymasterAndData: 0x</code>?
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Your Pimlico account needs a <strong>Sponsorship Policy</strong> covering
            this chain (<code className="px-1 bg-muted/60 rounded">BSC 56</code>) and EntryPoint
            (<code className="px-1 bg-muted/60 rounded">v0.6</code>). Create one at{' '}
            <a
              className="underline hover:text-amber-400"
              href="https://dashboard.pimlico.io/sponsorship-policies"
              target="_blank"
              rel="noreferrer"
            >
              dashboard.pimlico.io → Sponsorship Policies
            </a>
            , then paste the <code className="px-1 bg-muted/60 rounded">sp_...</code> ID above.
            Without a policy, <code className="px-1 bg-muted/60 rounded">pm_sponsorUserOperation</code>
            {' '}returns nothing → the UserOp goes to the bundler un-sponsored → AA21.
          </p>
        </div>

        <RunCard
          run={singleRun}
          onRun={runSingle}
          canRun={Boolean(selfAddress)}
          explorerUrl={
            singleRun.hash ? explorerTxUrl(targetChainId, singleRun.hash) : null
          }
        />

        <RunCard
          run={batchRun}
          onRun={runBatch}
          canRun={Boolean(selfAddress)}
          explorerUrl={
            batchRun.hash ? explorerTxUrl(targetChainId, batchRun.hash) : null
          }
        />

        {/* EOA separator */}
        <div className="flex items-center gap-3 py-2">
          <div className="flex-1 h-px bg-border/40" />
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground/60">
            Alternative path
          </span>
          <div className="flex-1 h-px bg-border/40" />
        </div>

        <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-4 text-xs space-y-2">
          <p className="font-medium text-primary">
            Why test the EOA path too?
          </p>
          <p className="text-muted-foreground leading-relaxed">
            This uses Privy's <strong>embedded EOA</strong> (not the smart wallet) via
            <code className="mx-1 px-1 bg-muted/60 rounded">useSendTransaction</code>
            with <code className="mx-1 px-1 bg-muted/60 rounded">{`{ sponsor: true }`}</code>.
            Privy's <strong>managed Gas Sponsorship</strong> pays directly from your
            Privy dashboard credits — no Pimlico policy needed. If this works silently,
            it's the simpler path for agent auto-execution.
          </p>
        </div>

        <RunCard
          run={eoaRun}
          onRun={runEoa}
          canRun={Boolean(eoaAddress)}
          explorerUrl={
            eoaRun.hash ? explorerTxUrl(targetChainId, eoaRun.hash) : null
          }
        />

        {/* User-reported popup answer */}
        {(singleRun.status === 'success' || batchRun.status === 'success') && (
          <div className="rounded-xl border border-border/40 p-5 bg-background/40 space-y-3">
            <p className="text-sm font-medium">
              Did a Privy confirmation popup appear during the test?
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={popupAnswer === 'no' ? 'default' : 'outline'}
                onClick={() => setPopupAnswer('no')}
              >
                No — signed silently
              </Button>
              <Button
                size="sm"
                variant={popupAnswer === 'yes' ? 'default' : 'outline'}
                onClick={() => setPopupAnswer('yes')}
              >
                Yes — a popup appeared
              </Button>
            </div>
            {popupAnswer === 'no' && (
              <p className="text-xs text-green-500">
                ✓ Auto-execute is viable — the smart wallet signs non-interactively.
              </p>
            )}
            {popupAnswer === 'yes' && (
              <p className="text-xs text-amber-500">
                Auto-execute needs a different primitive (server-side key or user setting in Privy dashboard).
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="ghost" onClick={reset}>
            Reset
          </Button>
        </div>
      </section>
    </div>
  )
}

// ─── helpers ────────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  mono,
  copyable,
  tone,
}: {
  label: string
  value: string
  mono?: boolean
  copyable?: boolean
  tone?: 'good' | 'warn'
}) {
  const [copied, setCopied] = React.useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span
          className={cn(
            mono && 'font-mono text-xs',
            tone === 'good' && 'text-green-500',
            tone === 'warn' && 'text-amber-500',
          )}
        >
          {value}
        </span>
        {copyable && value !== '—' && (
          <button
            type="button"
            onClick={onCopy}
            className="p-1 rounded hover:bg-muted/60 transition-colors"
            aria-label="Copy"
          >
            <Copy className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
        {copied && <span className="text-xs text-green-500">copied</span>}
      </span>
    </div>
  )
}

function RunCard({
  run,
  onRun,
  canRun,
  explorerUrl,
}: {
  run: RunResult
  onRun: () => void
  canRun: boolean
  explorerUrl: string | null
}) {
  return (
    <div className="rounded-xl border border-border/40 p-5 bg-background/40 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon status={run.status} />
          <span className="text-sm font-medium">{run.label}</span>
        </div>
        <Button
          size="sm"
          onClick={onRun}
          disabled={!canRun || run.status === 'sending'}
        >
          {run.status === 'sending' ? 'Sending…' : run.status === 'success' ? 'Run again' : 'Run'}
        </Button>
      </div>

      {run.status !== 'idle' && (
        <div className="text-xs space-y-1.5">
          {run.elapsedMs !== undefined && (
            <div className="text-muted-foreground">
              Elapsed: <span className="font-mono">{run.elapsedMs} ms</span>
            </div>
          )}
          {run.hash && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>Tx hash:</span>
              <span className="font-mono text-[11px] break-all">{run.hash}</span>
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
          {run.error && (
            <div className="text-destructive">
              {run.error}
            </div>
          )}
          {run.logs.length > 0 && (
            <details className="mt-2" open={run.status === 'error'}>
              <summary className="cursor-pointer text-muted-foreground/60 text-[11px] uppercase tracking-wider">
                Logs ({run.logs.length})
              </summary>
              <pre className="mt-2 p-2 bg-muted/40 rounded text-[11px] font-mono whitespace-pre-wrap break-words max-h-96 overflow-auto">
                {run.logs.join('\n')}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: RunStatus }) {
  if (status === 'sending') return <Loader2 className="w-4 h-4 animate-spin text-primary" />
  if (status === 'success') return <CheckCircle2 className="w-4 h-4 text-green-500" />
  if (status === 'error') return <XCircle className="w-4 h-4 text-destructive" />
  return <div className="w-4 h-4 rounded-full border border-border/60" />
}
