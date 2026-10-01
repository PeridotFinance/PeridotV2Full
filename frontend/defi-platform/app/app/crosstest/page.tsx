"use client"

import * as React from "react"
import { useLogin, usePrivy, useCreateWallet, useWallets, useSign7702Authorization } from "@privy-io/react-auth"
import { useAccount, useChainId } from "wagmi"
import { formatEther, formatUnits } from "viem"
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { Button } from "@/components/ui/button"
import { getChainConfig, resolveHubReadChainId, getConfiguredUnderlyingDecimals } from "@/config/contracts"
import { useBorrowTransaction } from "@/hooks/use-borrow-transaction"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { isSmartAccountEnabled, setSmartAccountEnabled } from "@/lib/smartAccountPreference"

function SmartUpgradeBlock({ preferredWallet, smartPrefEnabled, onPrefChange }: { preferredWallet: any; smartPrefEnabled: boolean; onPrefChange: (next: boolean) => void }) {
  const { wallets, ready: walletsReady } = useWallets()
  const { createWallet } = useCreateWallet()
  const { user, linkWallet, login, authenticated } = usePrivy()

  const [provisioning, setProvisioning] = React.useState<{ busy: boolean; message?: string; error?: string } | null>(null)

  const detectEmbedded = React.useCallback((ws?: any[]) => {
    try {
      for (const w of ws || []) {
        const t = (w?.type || '').toString().toLowerCase()
        const ct = (w?.custodyType || w?.walletClientType || w?.clientType || '').toString().toLowerCase()
        const src = (w?.source || '').toString().toLowerCase()
        if (t.includes('embedded') || ct.includes('embedded') || src.includes('embedded')) return w
        if ((w as any)?.isEmbedded === true || (w as any)?.custodyType === 'custodial') return w
      }
    } catch {}
    return null
  }, [])

  const waitForEmbeddedReady = React.useCallback(async () => {
    const started = Date.now()
    const timeoutMs = 20_000
    while (Date.now() - started < timeoutMs) {
      // yield
      await new Promise((r) => setTimeout(r, 400))
      const embedded = detectEmbedded(wallets as any)
      if (walletsReady && embedded) return embedded
    }
    return null
  }, [wallets, walletsReady, detectEmbedded])

  const handleProvision = React.useCallback(async () => {
    try {
      if (!authenticated) {
        setProvisioning({ busy: false, error: 'Login required to create an embedded wallet. Use the Login button first.' })
        return
      }

      const existingEmbedded = detectEmbedded(wallets as any)
      if (existingEmbedded) {
        setProvisioning({ busy: false, message: 'Embedded wallet present.' })
        setTimeout(() => setProvisioning(null), 1200)
        return
      }

      setProvisioning({ busy: true, message: 'Creating embedded wallet…' })
      try {
        await createWallet({})
      } catch (e: any) {
        const msg = (e?.message || '').toString().toLowerCase()
        if (msg.includes('already') || msg.includes('exist')) {
          setProvisioning({ busy: true, message: 'Embedded exists. Opening wallet manager…' })
          try { await linkWallet() } catch {}
        } else if (msg.includes('not enabled') || msg.includes('disabled') || msg.includes('policy')) {
          setProvisioning({ busy: false, error: 'Embedded wallets disabled by policy. Open manager to review settings.' })
          return
        } else {
          setProvisioning({ busy: false, error: e?.message || 'Failed to create embedded wallet' })
          return
        }
      }

      setProvisioning({ busy: true, message: 'Setting up embedded wallet…' })
      const embedded = await waitForEmbeddedReady()
      if (!embedded) {
        setProvisioning({ busy: false, error: 'Timeout waiting for embedded wallet. Open Privy manager to confirm.' })
        return
      }
      setProvisioning({ busy: false, message: 'Embedded wallet ready.' })
      setTimeout(() => setProvisioning(null), 1200)
    } catch (err: any) {
      setProvisioning({ busy: false, error: err?.message || String(err) })
    }
  }, [authenticated, login,  wallets, createWallet, linkWallet, waitForEmbeddedReady, detectEmbedded])



  return (
    <div className="rounded-md border p-3">
      <div className="font-medium mb-2">Smart account</div>

      <div className="mt-2 flex flex-wrap items-center gap-2">

        <Button size="sm" variant={smartPrefEnabled ? 'secondary' : 'outline'} onClick={() => onPrefChange(!smartPrefEnabled)}>
          {smartPrefEnabled ? 'Disable smart account' : 'Enable smart account'}
        </Button>

      </div>

      <div className="mt-3 grid gap-2 text-xs">
        <div className="font-medium">Wallets</div>
        <div className="text-muted-foreground">Linked (Privy user): {(Array.isArray((user as any)?.wallets) ? (user as any).wallets.length : 0)}</div>
        <div className="text-muted-foreground">Connected (SDK ready): {Array.isArray(wallets) ? wallets.length : 0} {walletsReady ? '' : '(loading…)'}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border p-2">
            <div className="mb-1 font-medium">Linked</div>
            <ul className="space-y-1">
              {(((user as any)?.wallets) || []).map((w: any, i: number) => (
                <li key={`linked-${i}`} className="flex justify-between">
                  <span>{(w?.type || w?.chainType || 'wallet')}</span>
                  <span className="font-mono">{shorten(w?.address)}</span>
                </li>
              ))}
              {(!((user as any)?.wallets) || (user as any)?.wallets?.length === 0) ? (<li className="text-muted-foreground">—</li>) : null}
            </ul>
          </div>
          <div className="rounded border p-2">
            <div className="mb-1 font-medium">Connected</div>
            <ul className="space-y-1">
              {(wallets || []).map((w: any, i: number) => (
                <li key={`connected-${i}`} className="flex justify-between">
                  <span>{(w?.type || w?.chainType || 'wallet')}</span>
                  <span className="font-mono">{shorten(w?.address)}</span>
                </li>
              ))}
              {(!(wallets || []).length) ? (<li className="text-muted-foreground">—</li>) : null}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

function shorten(addr?: string | null) {
  if (!addr) return "—"
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function Copy({ value, label }: { value?: string | null; label?: string }) {
  const [copied, setCopied] = React.useState(false)
  const onCopy = async () => {
    try {
      if (!value) return
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }
  return (
    <Button variant="outline" size="sm" onClick={onCopy} disabled={!value}>
      {copied ? "Copied" : label || "Copy"}
    </Button>
  )
}

export default function CrossChainTestPage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { login } = useLogin()
  const { ready, authenticated, user, linkWallet, logout } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const { createWallet } = useCreateWallet()
  const { signAuthorization } = useSign7702Authorization()
  const [uiNote, setUiNote] = React.useState<string | null>(null)
  const [actionResult, setActionResult] = React.useState<any>(null)
  // Use env-provided 7702 contract for BSC mainnet (avoid manual inputs)
  const EIP7702_CONTRACT = (process.env.NEXT_PUBLIC_BSC_7702_CONTRACT || "").trim()
  const EIP7702_CHAIN_ID = 56
  const [capabilities, setCapabilities] = React.useState<Record<string, { isEOA: boolean; eip7702Eligible: boolean }>>({})
  // Borrow test state (Biconomy)
  const [borrowAssetId, setBorrowAssetId] = React.useState<string>('USDT')
  const [borrowAmount, setBorrowAmount] = React.useState<string>('10')
  const [destChainInput, setDestChainInput] = React.useState<string>('')
  const [biconomySponsorship, setBiconomySponsorship] = React.useState<boolean>(true)
  // Smart account upgrade
  // Preferred wallet override for testing interactions
  const [preferredOverride, setPreferredOverride] = React.useState<any | null>(null)
  // Smart account modal state
  const [smartModalOpen, setSmartModalOpen] = React.useState(false)
  const [smartPrefEnabled, setSmartPrefEnabled] = React.useState<boolean>(() => isSmartAccountEnabled(address as any))
  const { client: smartClient, getClientForChain } = useSmartWallets()

  const smartWalletAccount = React.useMemo(() => {
    try {
      const accounts = (user as any)?.linkedAccounts || (user as any)?.linked_accounts || []
      return accounts.find((a: any) => (a?.type || '').toLowerCase() === 'smart_wallet') || null
    } catch { return null }
  }, [user])

  // Smart wallet balance/status
  const [smartBalanceWei, setSmartBalanceWei] = React.useState<string | null>(null)
  const [smartBalanceFormatted, setSmartBalanceFormatted] = React.useState<string | null>(null)
  const [smartClientReady, setSmartClientReady] = React.useState<boolean>(false)
  const [smartClientIssue, setSmartClientIssue] = React.useState<string | null>(null)
  const [prefundEstimateWei, setPrefundEstimateWei] = React.useState<string | null>(null)
  const nativeSymbol = React.useMemo(() => {
    try {
      if (chainId === 56 || chainId === 97) return 'BNB'
      // Simple defaults for common chains
      return 'ETH'
    } catch { return 'ETH' }
  }, [chainId])

  const refreshSmartClientReady = React.useCallback(async () => {
    try {
      const cId = typeof chainId === 'number' ? chainId : undefined
      const cfg = (() => { try { return typeof chainId === 'number' ? getChainConfig(chainId) : null } catch { return null } })()
      let client: any = null
      try {
        client = cId ? await (getClientForChain as any)({ id: cId }) : (smartClient as any)
      } catch {}
      if (!client) {
        try { client = smartClient as any } catch {}
      }
      const ready = !!client
      setSmartClientReady(ready)
      if (!ready) {
        const reasons: string[] = []
        try { if (!authenticated) reasons.push('not authenticated') } catch {}
        try {
          // Detect presence of an embedded wallet without referencing embeddedWallet (avoid TDZ)
          const hasEmbedded = (() => {
            try {
              for (const w of (wallets || []) as any[]) {
                const t = (w?.type || '').toString().toLowerCase()
                const ct = (w?.custodyType || w?.walletClientType || w?.clientType || '').toString().toLowerCase()
                const src = (w?.source || '').toString().toLowerCase()
                if (t.includes('embedded') || ct.includes('embedded') || src.includes('embedded')) return true
                if ((w as any)?.isEmbedded === true || (w as any)?.embedded === true) return true
                if ((w as any)?.custodyType === 'custodial') return true
              }
            } catch {}
            return false
          })()
          if (!hasEmbedded) reasons.push('no embedded wallet')
        } catch {}
        try { if (!(cfg as any)?.rpcUrl) reasons.push('unsupported chain') } catch {}
        setSmartClientIssue(reasons.length ? reasons.join(', ') : 'not provisioned for this chain')
      } else {
        setSmartClientIssue(null)
      }
    } catch {
      setSmartClientReady(false)
      setSmartClientIssue('initialization error')
    }
  }, [chainId, authenticated, wallets])

  const refreshSmartBalance = React.useCallback(async () => {
    try {
      const addr = (smartWalletAccount?.address || '').toString()
      const cfg = (() => { try { return typeof chainId === 'number' ? getChainConfig(chainId) : null } catch { return null } })()
      const rpcUrl = (cfg as any)?.rpcUrl
      if (!addr || !rpcUrl) {
        setSmartBalanceWei(null)
        setSmartBalanceFormatted(null)
        return
      }
      const body = { jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [addr, 'latest'] }
      const res = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      const hex = (json?.result || '0x0') as string
      setSmartBalanceWei(hex)
      try { setSmartBalanceFormatted(formatEther(BigInt(hex))) } catch { setSmartBalanceFormatted(null) }
    } catch {
      setSmartBalanceWei(null)
      setSmartBalanceFormatted(null)
    }
  }, [smartWalletAccount, chainId])

  React.useEffect(() => {
    refreshSmartClientReady()
  }, [refreshSmartClientReady])

  React.useEffect(() => {
    refreshSmartBalance()
  }, [refreshSmartBalance])

  // Rough prefund estimator for self-funded 4337 userOps (no paymaster)
  const estimateSelfFundedPrefundWei = React.useCallback(async (): Promise<bigint | null> => {
    try {
      const cfg = (() => { try { return typeof chainId === 'number' ? getChainConfig(chainId) : null } catch { return null } })()
      const rpcUrl = (cfg as any)?.rpcUrl
      if (!rpcUrl) return null
      // 1) Get current gas price
      const gpRes = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] }) })
      const gpJson = await gpRes.json()
      const gasPriceHex = (gpJson?.result || '0x0') as string
      const gasPrice = BigInt(gasPriceHex)
      if (gasPrice <= BigInt(0)) return null
      // 2) Conservative gas usage for a basic 4337 send via smart-account on BSC
      //    Includes verification, preVerification and call gas with a safety buffer
      const baseGasLimit = BigInt(250000)
      const bufferedGasLimit = (baseGasLimit * BigInt(12)) / BigInt(10) // +20%
      const required = gasPrice * bufferedGasLimit
      return required
    } catch {
      return null
    }
  }, [chainId])

  const refreshPrefundEstimate = React.useCallback(async () => {
    try {
      const est = await estimateSelfFundedPrefundWei()
      setPrefundEstimateWei(est != null ? est.toString() : null)
    } catch {
      setPrefundEstimateWei(null)
    }
  }, [estimateSelfFundedPrefundWei])

  // Simple ERC20 transfer state (smart wallet)
  const [erc20To, setErc20To] = React.useState<string>('')
  const [erc20Token, setErc20Token] = React.useState<string>('')
  const [erc20Amount, setErc20Amount] = React.useState<string>('')
  const erc20Options = React.useMemo(() => {
    const list: Array<{ address: string; symbol: string; decimals?: number }> = []
    try {
      const cfg = (() => { try { return typeof chainId === 'number' ? getChainConfig(chainId) : null } catch { return null } })() as any
      if (cfg?.tokens) {
        try {
          Object.entries(cfg.tokens as Record<string, string>).forEach(([sym, addr]) => {
            if (!addr) return
            list.push({ address: String(addr), symbol: String(sym).toUpperCase() })
          })
        } catch {}
      }
      if (cfg?.markets) {
        try {
          Object.entries(cfg.markets as Record<string, any>).forEach(([key, m]) => {
            const addr = (m as any)?.underlying
            if (!addr) return
            const sym = (m as any)?.symbol || key
            const dec = typeof (m as any)?.decimals === 'number' ? (m as any).decimals : undefined
            list.push({ address: String(addr), symbol: String(sym).toUpperCase(), decimals: dec })
          })
        } catch {}
      }
    } catch {}
    // Dedupe by address (case-insensitive), prefer first occurrence
    const seen = new Set<string>()
    const deduped: Array<{ address: string; symbol: string; decimals?: number }> = []
    for (const t of list) {
      const key = t.address.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(t)
    }
    return deduped
  }, [chainId])

  React.useEffect(() => {
    // Auto-select first token when chain changes and none selected
    try {
      if (!erc20Token && erc20Options.length > 0) setErc20Token(erc20Options[0].address)
    } catch {}
  }, [erc20Options, erc20Token])

  // Link external wallets using Privy's native flow for correctness
  const linkExternalWithPrivy = React.useCallback(async () => {
    try {
      setUiNote('Opening Privy linking…')
      await linkWallet()
      setUiNote('Link flow opened')
      setTimeout(() => setUiNote(null), 1200)
    } catch (e) {
      setUiNote((e as any)?.message || 'Unable to open link flow')
      setTimeout(() => setUiNote(null), 2000)
    }
  }, [linkWallet])

  async function getSmartClientOrPrompt(): Promise<any> {
    const cId = typeof chainId === 'number' ? chainId : undefined
    let client: any = null
    try {
      client = cId ? await (getClientForChain as any)({ id: cId }) : (smartClient as any)
    } catch {}
    if (!client) {
      try { client = smartClient as any } catch {}
    }
    if (!client) {
      setSmartModalOpen(true)
      setUiNote('Smart wallet not ready. Opened setup.')
      setTimeout(() => setUiNote(null), 1500)
      throw new Error('Smart wallet client unavailable')
    }
    return client
  }

  async function smartSignMessage(message: string) {
    try {
      setUiNote('Signing via smart wallet…')
      const client: any = await getSmartClientOrPrompt()
      const signature = await (client as any).signMessage({ message })
      try { console.log('Smart sign result', { signature }) } catch {}
      setActionResult({ type: 'smart_sign_message', message, signature })
      setUiNote('Smart sign complete')
      setTimeout(() => setUiNote(null), 1200)
    } catch (e) {
      setUiNote((e as any)?.message || 'Smart sign failed')
      setTimeout(() => setUiNote(null), 2000)
    }
  }

  // Unified smart wallet transaction sender with configurable gas mode
  async function sendSmartWalletTx(mode: 'default' | 'paymaster' | 'self-funded' | 'eoa-fallback' | 'paymaster-pimlico' | 'self-funded-pimlico') {
    const BSC_CHAIN_ID = 56
    const baseMode = ((): 'default' | 'paymaster' | 'self-funded' | 'eoa-fallback' => {
      if (mode === 'paymaster-pimlico') return 'paymaster'
      if (mode === 'self-funded-pimlico') return 'self-funded'
      return mode as any
    })()
    const isPimlicoTest = mode === 'paymaster-pimlico' || mode === 'self-funded-pimlico'
    const modeLabels = {
      'default': 'Default (Privy config)',
      'paymaster': 'Paymaster-sponsored',
      'self-funded': 'Self-funded',
      'eoa-fallback': 'EOA fallback'
    }
    const modeLabel = modeLabels[baseMode] + (isPimlicoTest ? ' [Pimlico test]' : '')
    
    try {
      setUiNote(`[${modeLabel}] Preparing transaction…`)
      
      // Mode: EOA fallback - use embedded wallet provider directly
      if (baseMode === 'eoa-fallback') {
        if (!preferredWallet) throw new Error('No wallet available')
        const provider = await (preferredWallet as any).getEthereumProvider?.()
        if (!provider) throw new Error('Embedded wallet provider unavailable')
        const from = (preferredWallet as any).address
        const to = address || from
        
        setUiNote(`[${modeLabel}] Sending via EOA on BSC…`)
        const txHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from,
            to,
            value: '0x0',
            chainId: `0x${BSC_CHAIN_ID.toString(16)}`
          }]
        })
        try { console.log(`[${mode}] EOA tx hash (BSC)`, txHash) } catch {}
        setActionResult({ type: 'eoa_send_tx', mode, to, value: '0', txHash, chain: 'BSC (56)' })
        setUiNote(`[${modeLabel}] ✓ EOA tx submitted on BSC`)
        setTimeout(() => setUiNote(null), 2000)
        return
      }

      // For smart account modes: get client
      let client: any = null
      try {
        client = await (getClientForChain as any)({ id: BSC_CHAIN_ID })
      } catch (e) {
        try { console.warn(`[${mode}] getClientForChain failed:`, e) } catch {}
      }
      if (!client) {
        try { client = smartClient as any } catch {}
      }
      if (!client) {
        setSmartModalOpen(true)
        setUiNote(`[${modeLabel}] ✗ Smart wallet not ready on BSC. Opened setup.`)
        setTimeout(() => setUiNote(null), 2000)
        throw new Error('Smart wallet client unavailable for BSC')
      }

      const to = (preferredWallet as any)?.address || address
      if (!to) throw new Error('No destination address')

      setUiNote(`[${modeLabel}] Sending 0-value BNB tx via smart wallet on BSC…`)
      
      // Build transaction params based on mode
      const txParams: any = { 
        to, 
        value: BigInt(0), 
        chain: { id: BSC_CHAIN_ID }
      }

      // Mode-specific overrides via paymasterContext
      if (baseMode === 'paymaster') {
        // Explicitly request SPONSORED mode for gasless transactions
        txParams.paymasterContext = {
          mode: 'SPONSORED'
        }
      } else if (baseMode === 'self-funded') {
        // Explicitly set DEFAULT mode - wallet pays gas normally
        txParams.paymasterContext = {
          mode: 'DEFAULT'
        }
      }
      // 'default' mode: use whatever SmartWalletsProvider config specifies (no override)

      // Preflight: for self-funded paths, warn and short-circuit if prefund appears insufficient
      if (baseMode === 'self-funded' || baseMode === 'default') {
        try {
          const est = await estimateSelfFundedPrefundWei()
          if (est != null) {
            const balWei = (() => { try { return smartBalanceWei ? BigInt(smartBalanceWei) : BigInt(0) } catch { return BigInt(0) } })()
            if (balWei < est) {
              const need = (() => { try { return formatEther(est) } catch { return String(est) } })()
              const have = (() => { try { return formatEther(balWei) } catch { return String(balWei) } })()
              setUiNote(`[${modeLabel}] ✗ Insufficient prefund (est.). Need ~${need} ${nativeSymbol}, have ${have}. Fund smart wallet or use paymaster.`)
              setTimeout(() => setUiNote(null), 3500)
              setActionResult({ type: 'insufficient_prefund_estimate', mode, estimatedWei: est.toString(), balanceWei: balWei.toString() })
              return
            }
          }
        } catch {}
      }

      // Attempt to prepare and log the full UserOperation (if client supports it)
      try {
        if (typeof (client as any).prepareUserOperation === 'function') {
          const userOp = await (client as any).prepareUserOperation(txParams)
          try { console.log(`[${mode}] Prepared UserOperation`, userOp) } catch {}
          setActionResult({ type: 'prepared_userop', mode, userOp })
          // Guard: Sponsored mode must include paymasterAndData
          if (baseMode === 'paymaster') {
            const pmd = (userOp as any)?.paymasterAndData
            if (!pmd || pmd === '0x' || pmd === '0x00') {
              setUiNote(`[${modeLabel}] ✗ Paymaster not attached for this chain. Check Privy Dashboard gas sponsorship (BSC).`)
              setTimeout(() => setUiNote(null), 3500)
              return
            }
          }
          // Optional: Direct submit to Pimlico BSC if requested (diagnostic path)
          if (isPimlicoTest) {
            try {
              const pimlicoUrl = (process.env.NEXT_PUBLIC_PIMLICO_BSC_RPC || '').trim()
              if (!pimlicoUrl) throw new Error('Set NEXT_PUBLIC_PIMLICO_BSC_RPC')
              setUiNote(`[${modeLabel}] Submitting prepared userOp to Pimlico…`)
              const resp = await fetch(pimlicoUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'eth_sendUserOperation',
                  params: [userOp, '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'] // ERC-4337 entrypoint v0.6
                })
              })
              const json = await resp.json()
              if (json?.error) throw new Error(json.error?.message || 'Pimlico error')
              const opHash = json?.result
              try { console.log(`[${mode}] Pimlico sendUserOperation result`, json) } catch {}
              setActionResult({ type: 'pimlico_send_userop', mode, result: json })
              setUiNote(`[${modeLabel}] ✓ UserOp submitted to Pimlico`)
              setTimeout(() => setUiNote(null), 2000)
              return
            } catch (pErr: any) {
              try { console.warn(`[${mode}] Pimlico sendUserOperation failed:`, pErr) } catch {}
              setUiNote(`[${modeLabel}] ✗ Pimlico submit failed: ${pErr?.message || String(pErr)}`)
              setTimeout(() => setUiNote(null), 3500)
              // fall through to normal send via client
            }
          }
        } else if (typeof (client as any).estimateUserOperation === 'function') {
          const userOpEst = await (client as any).estimateUserOperation(txParams)
          try { console.log(`[${mode}] Estimated UserOperation`, userOpEst) } catch {}
          setActionResult({ type: 'estimated_userop', mode, userOp: userOpEst })
          if (baseMode === 'paymaster') {
            const pmd = (userOpEst as any)?.paymasterAndData
            if (!pmd || pmd === '0x' || pmd === '0x00') {
              setUiNote(`[${modeLabel}] ✗ Paymaster not attached for this chain. Check Privy Dashboard gas sponsorship (BSC).`)
              setTimeout(() => setUiNote(null), 3500)
              return
            }
          }
          if (isPimlicoTest) {
            try {
              const pimlicoUrl = (process.env.NEXT_PUBLIC_PIMLICO_BSC_RPC || '').trim()
              if (!pimlicoUrl) throw new Error('Set NEXT_PUBLIC_PIMLICO_BSC_RPC')
              setUiNote(`[${modeLabel}] Submitting estimated userOp to Pimlico…`)
              const resp = await fetch(pimlicoUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'eth_sendUserOperation',
                  params: [userOpEst, '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789']
                })
              })
              const json = await resp.json()
              if (json?.error) throw new Error(json.error?.message || 'Pimlico error')
              try { console.log(`[${mode}] Pimlico sendUserOperation result`, json) } catch {}
              setActionResult({ type: 'pimlico_send_userop', mode, result: json })
              setUiNote(`[${modeLabel}] ✓ UserOp submitted to Pimlico`)
              setTimeout(() => setUiNote(null), 2000)
              return
            } catch (pErr: any) {
              try { console.warn(`[${mode}] Pimlico sendUserOperation failed:`, pErr) } catch {}
              setUiNote(`[${modeLabel}] ✗ Pimlico submit failed: ${pErr?.message || String(pErr)}`)
              setTimeout(() => setUiNote(null), 3500)
            }
          }
        } else {
          try { console.log(`[${mode}] Client does not expose prepare/estimate UserOperation; logging txParams`, txParams) } catch {}
        }
      } catch (logErr) {
        try { console.warn(`[${mode}] Could not prepare/estimate UserOperation for logging:`, logErr) } catch {}
      }

      const txHash = await (client as any).sendTransaction(txParams)
      try { console.log(`[${mode}] Smart tx hash (BSC)`, txHash, txParams) } catch {}
      setActionResult({ type: 'smart_send_tx', mode, to, value: '0', txHash, chain: 'BSC (56)', params: txParams })
      setUiNote(`[${modeLabel}] ✓ Smart tx submitted on BSC`)
      setTimeout(() => setUiNote(null), 2000)
    } catch (e: any) {
      const errMsg = e?.message || String(e)
      try {
        console.error(`[${mode}] Transaction failed:`, e)
        // Enhanced error parsing
        let userMsg = errMsg
        if (/AA21/.test(errMsg)) {
          userMsg = `[${modeLabel}] ✗ Insufficient funds: Smart account cannot pay prefund. ${baseMode === 'paymaster' ? 'Paymaster may not be configured in Privy Dashboard.' : 'Fund the smart wallet or enable paymaster.'}`
        } else if (/paymaster/i.test(errMsg)) {
          userMsg = `[${modeLabel}] ✗ Paymaster error: ${errMsg.slice(0, 100)}. Check Privy Dashboard Smart Wallets config.`
        } else if (/funds/i.test(errMsg)) {
          userMsg = `[${modeLabel}] ✗ Insufficient funds: ${errMsg.slice(0, 100)}`
        } else {
          userMsg = `[${modeLabel}] ✗ ${errMsg.slice(0, 150)}`
        }
        // Bundler diagnostics extraction (if present in error string)
        try {
          const rpcMatch = /URL:\s*(https?:[^\n\r\s]+)/i.exec(errMsg)
          const entryPointMatch = /0x[0-9a-fA-F]{40}/.exec(errMsg)
          const diag = {
            bundlerUrl: rpcMatch ? rpcMatch[1] : null,
            entryPoint: entryPointMatch ? entryPointMatch[0] : null,
            expectedChain: 'BSC (56)',
            mode,
            pimlicoTest: isPimlicoTest,
          }
          console.warn(`[${mode}] Bundler diagnostics`, diag)
          setActionResult({ type: 'error', mode, error: errMsg, diagnostics: diag })
        } catch {
          setActionResult({ type: 'error', mode, error: errMsg })
        }

        setUiNote(userMsg)
      } catch {
        setUiNote(`[${modeLabel}] ✗ Transaction failed`)
      }
      setTimeout(() => setUiNote(null), 4000)
    }
  }

  // Legacy wrapper for backward compatibility
  async function smartSendSelfZero() {
    return sendSmartWalletTx('default')
  }

  React.useEffect(() => {
    setSmartPrefEnabled(isSmartAccountEnabled(address as any))
  }, [address])

  // Global opener for reuse by other components (e.g., connect-wallet-button)
  React.useEffect(() => {
    const handler = () => setSmartModalOpen(true)
    try { window.addEventListener('peridot:open-smart-account-modal', handler as any) } catch {}
    return () => { try { window.removeEventListener('peridot:open-smart-account-modal', handler as any) } catch {} }
  }, [])

  const hasAnyWallet = React.useMemo(() => Array.isArray(wallets) && wallets.length > 0, [wallets])

  const currentChainConfig = React.useMemo(() => {
    try { return typeof chainId === 'number' ? getChainConfig(chainId) : null } catch { return null }
  }, [chainId]) as any

  const hubChainId = React.useMemo(() => resolveHubReadChainId(chainId) || null, [chainId])
  const hubChainConfig = React.useMemo(() => {
    try { return typeof hubChainId === 'number' ? getChainConfig(hubChainId) : null } catch { return null }
  }, [hubChainId]) as any

  const crossChainTokens = React.useMemo(() => {
    const tokens: Array<{ scope: string; symbol: string; address?: string; decimals?: number }> = []
    const pushMarkets = (scope: string, cfg: any) => {
      try {
        const markets = cfg?.markets || {}
        Object.keys(markets).forEach((k) => {
          const m = markets[k]
          tokens.push({ scope, symbol: m?.symbol || k, address: m?.underlying, decimals: m?.decimals })
        })
      } catch {}
    }
    if (currentChainConfig) pushMarkets(`Current (${currentChainConfig.chainNameReadable || chainId})`, currentChainConfig)
    if (hubChainConfig) pushMarkets(`Hub (${hubChainConfig.chainNameReadable || hubChainId})`, hubChainConfig)
    return tokens
  }, [currentChainConfig, hubChainConfig, chainId, hubChainId])

  // Consolidated status for easy copy from console
  const status = React.useMemo(() => {
    const walletSummaries = (wallets || []).map((w: any) => ({
      type: w?.type || w?.chainType || null,
      address: w?.address || null,
      chainType: w?.chainType || null,
      id: w?.id || null,
    }))
    return {
      privyReady: !!ready,
      authenticated: !!authenticated,
      wagmiConnected: !!isConnected,
      wagmiAddress: address || null,
      chainId: typeof chainId === 'number' ? chainId : null,
      chainName: (currentChainConfig as any)?.chainNameReadable || null,
      hubChainId: hubChainId ?? null,
      hubChainName: (hubChainConfig as any)?.chainNameReadable || null,
      wallets: walletSummaries,
      featureFlags: FEATURE_FLAGS,
      tokens: crossChainTokens,
    }
  }, [ready, authenticated, isConnected, address, chainId, currentChainConfig, hubChainId, hubChainConfig, wallets, crossChainTokens])

  React.useEffect(() => {
    try {
      // Single structured log for copy-paste
      // eslint-disable-next-line no-console
      console.log("Peridot CrossTest Status", status)
      // eslint-disable-next-line no-console
      console.log("Peridot CrossTest Status (JSON)", JSON.stringify(status, null, 2))
    } catch {}
  }, [status])

  const statusJson = React.useMemo(() => {
    try { return JSON.stringify(status, null, 2) } catch { return "{}" }
  }, [status])

  // Pick the first embedded wallet (controls smart account)
  const embeddedWallet = React.useMemo(() => {
    const isEmbedded = (w: any): boolean => {
      try {
        const t = (w?.type || '').toString().toLowerCase()
        const ct = (w?.custodyType || w?.walletClientType || w?.clientType || '').toString().toLowerCase()
        const src = (w?.source || '').toString().toLowerCase()
        if (t.includes('embedded') || ct.includes('embedded') || src.includes('embedded')) return true
        if ((w as any)?.isEmbedded === true || (w as any)?.embedded === true) return true
        if ((w as any)?.custodyType === 'custodial') return true
      } catch {}
      return false
    }
    try {
      for (const w of wallets || []) {
        if (isEmbedded(w)) return w
      }
      return null
    } catch { return null }
  }, [wallets])

  // Preferred wallet for actions: embedded → wagmi address match → first
  const preferredWallet = React.useMemo(() => {
    if (preferredOverride) return preferredOverride
    if (embeddedWallet) return embeddedWallet
    try {
      const byAddr = (wallets || []).find((w: any) => (w?.address || '').toLowerCase() === (address || '').toLowerCase())
      return byAddr || (wallets && wallets[0]) || null
    } catch { return wallets && (wallets as any)[0] || null }
  }, [preferredOverride, embeddedWallet, wallets, address])

  async function checkEoaAnd7702(addr: string) {
    try {
      const cfg = (() => { try { return typeof chainId === 'number' ? getChainConfig(chainId) : null } catch { return null } })()
      const rpcUrl = (cfg as any)?.rpcUrl
      if (!rpcUrl) throw new Error('No RPC URL for current chain')
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [addr, 'latest'] })
      })
      const json = await res.json()
      const code: string = json?.result || '0x'
      const isEOA = (code === '0x' || code === '0x0')
      setCapabilities((prev) => ({ ...prev, [addr]: { isEOA, eip7702Eligible: isEOA } }))
    } catch (e) {
      setCapabilities((prev) => ({ ...prev, [addr]: { isEOA: true, eip7702Eligible: true } }))
    }
  }

  async function checkAll7702() {
    setUiNote('Checking 7702 eligibility…')
    try {
      await Promise.all((wallets || []).map((w: any) => w?.address ? checkEoaAnd7702(w.address) : Promise.resolve()))
      setUiNote('7702 eligibility updated')
    } catch {
      setUiNote('Failed to check some wallets')
    } finally {
      setTimeout(() => setUiNote(null), 1500)
    }
  }

  async function signWithPreferred(message: string) {
    if (!preferredWallet) throw new Error('No wallet available')
    setUiNote('Signing message with active wallet…')
    const provider = await (preferredWallet as any).getEthereumProvider?.()
    if (!provider) throw new Error('Embedded wallet provider unavailable')
    const from = (preferredWallet as any).address
    const params = [message, from]
    const sig = await provider.request({ method: 'personal_sign', params })
    setActionResult({ type: 'personal_sign', message, signature: sig })
    setUiNote('Signed message')
    setTimeout(() => setUiNote(null), 1200)
  }

  async function signTypedDataWithPreferred() {
    if (!preferredWallet) throw new Error('No wallet available')
    setUiNote('Signing typed data with active wallet…')
    const provider = await (preferredWallet as any).getEthereumProvider?.()
    if (!provider) throw new Error('Embedded wallet provider unavailable')
    const from = (preferredWallet as any).address
    const typed = {
      domain: { name: 'Peridot', version: '1', chainId: chainId || 56 },
      message: { purpose: 'test', timestamp: Date.now() },
      primaryType: 'PeridotMsg',
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
        ],
        PeridotMsg: [
          { name: 'purpose', type: 'string' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    }
    const sig = await provider.request({ method: 'eth_signTypedData_v4', params: [from, JSON.stringify(typed)] })
    setActionResult({ type: 'eth_signTypedData_v4', typed, signature: sig })
    setUiNote('Signed typed data')
    setTimeout(() => setUiNote(null), 1200)
  }

  async function signEip7702() {
    if (!preferredWallet) throw new Error('No wallet available')
    const contractAddress = EIP7702_CONTRACT
    if (!contractAddress) throw new Error('Configure NEXT_PUBLIC_BSC_7702_CONTRACT')
    setUiNote('Signing EIP-7702 authorization…')
    const nonceNum = undefined
    const auth = await signAuthorization({
      contractAddress: contractAddress as `0x${string}`,
      chainId: EIP7702_CHAIN_ID,
      nonce: typeof nonceNum === 'number' && !Number.isNaN(nonceNum) ? nonceNum : undefined,
    }, { address: (preferredWallet as any).address })
    setActionResult({ type: 'eip-7702', authorization: auth })
    setUiNote('EIP-7702 signed')
    setTimeout(() => setUiNote(null), 1200)
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8">
      {/* Smart Account Setup Modal */}
      <Dialog open={smartModalOpen} onOpenChange={setSmartModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smart account setup</DialogTitle>
            <DialogDescription>
              Create/select an embedded wallet, upgrade to a smart account, and set it active for Biconomy.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border p-3">
                <div className="font-medium mb-1">Authentication</div>
                <div>Status: {authenticated ? 'Authenticated' : 'Logged out'}</div>
                <div className="mt-2 flex gap-2">
                  {!authenticated ? (
                    <Button size="sm" onClick={() => login()}>Login with Privy</Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => logout()}>Logout</Button>
                  )}
                </div>
              </div>

              <div className="rounded-md border p-3">
                <div className="font-medium mb-1">Embedded wallet</div>
                <div>Present: {(embeddedWallet ? 'yes' : 'no')}</div>
                <div>Wallets ready: {walletsReady ? 'yes' : 'no'}</div>
                <div className="mt-2 flex gap-2">
                  {!embeddedWallet ? (
                    <Button size="sm" onClick={async () => {
                      try {
                        await createWallet({})
                        setUiNote('Embedded wallet created')
                        setTimeout(() => setUiNote(null), 1200)
                      } catch (e: any) {
                        const msg = (e?.message || '').toString().toLowerCase()
                        if (msg.includes('already') || msg.includes('exist')) {
                          // Embedded already exists — let Privy finish loading it; do not open selector
                          setUiNote('Embedded exists. Finalizing setup…')
                          setTimeout(() => setUiNote(null), 1500)
                          return
                        }
                        if (msg.includes('not enabled') || msg.includes('disabled') || msg.includes('policy')) {
                          setUiNote('Embedded wallets may be disabled for this app. Check Privy settings.')
                          setTimeout(() => setUiNote(null), 2500)
                          return
                        }
                        // Surface actual error instead of always opening selector
                        try { setUiNote(e?.message || 'Failed to create embedded wallet') } catch { setUiNote('Failed to create embedded wallet') }
                        setTimeout(() => setUiNote(null), 2000)
                      }
                    }}>Create embedded</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={async () => { try { await linkWallet() } catch {} }}>Manage in Privy</Button>
                  )}
                </div>
              </div>
            </div>

            <SmartUpgradeBlock preferredWallet={preferredWallet} smartPrefEnabled={smartPrefEnabled} onPrefChange={(next) => { setSmartPrefEnabled(next); if (address) setSmartAccountEnabled(address as any, next) }} />
          </div>

          <DialogFooter>
            <div className="flex w-full items-center justify-between">
              <div className="text-xs text-muted-foreground">Active wallet: {shorten(address || undefined)}</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { try { linkWallet() } catch {} }}>Pick wallet</Button>
                <Button size="sm" onClick={() => setSmartModalOpen(false)}>Done</Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Cross-Chain Test Dashboard</h1>
        <p className="text-sm text-muted-foreground">Wallet, smart account readiness, feature flags, and token info for Biconomy cross-chain flows.</p>
      </div>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-lg font-semibold">Authentication & Wallet</h2>
        <div className="grid gap-2 text-sm">
          <div>Privy ready: <b>{ready ? 'yes' : 'no'}</b></div>
          <div>Authenticated: <b>{authenticated ? 'yes' : 'no'}</b></div>
          <div>Has any wallet: <b>{hasAnyWallet ? 'yes' : 'no'}</b></div>
          <div>Wagmi connected: <b>{isConnected ? 'yes' : 'no'}</b> {address ? `(${shorten(address)})` : ''}</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {!authenticated ? (
            <Button size="sm" onClick={() => login()}>Login with Privy</Button>
          ) : null}
          {authenticated && !embeddedWallet ? (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                  try {
                    setUiNote('Creating embedded wallet…')
                    try {
                      await createWallet({})
                    } catch (e: any) {
                      const msg = (e?.message || '').toString().toLowerCase()
                      if (msg.includes('already') || msg.includes('exist')) {
                        // Embedded already exists — avoid opening link flow; allow modal provisioning to continue
                        setUiNote('Embedded exists. Finalizing setup…')
                        setTimeout(() => setUiNote(null), 1500)
                        return
                      }
                      throw e
                    }
                    setUiNote('Embedded wallet created')
                    setTimeout(() => setUiNote(null), 1500)
                  } catch (e) {
                    try {
                      const msg = (e as any)?.message || (e as any)?.toString?.() || 'Failed to create embedded wallet'
                      setUiNote(String(msg))
                    } catch {
                      setUiNote('Failed to create embedded wallet')
                    }
                    setTimeout(() => setUiNote(null), 1500)
                  }
              }}
            >
              Create Embedded Wallet
            </Button>
          ) : null}
          {authenticated ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => { try { window.dispatchEvent(new CustomEvent('peridot:open-smart-account-modal')) } catch {} }}>Manage wallet</Button>
              <Button size="sm" variant="outline" onClick={async () => { try { setUiNote('Opening Privy wallet link…'); await linkWallet(); setUiNote('Privy wallet link opened.'); setTimeout(() => setUiNote(null), 1500) } catch { setUiNote('Unable to open link'); setTimeout(() => setUiNote(null), 1500) } }}>Link wallet</Button>
            </>
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => { try { console.log("Peridot CrossTest Status", status); console.log("Peridot CrossTest Status (JSON)", JSON.stringify(status, null, 2)); setUiNote('Status logged to console'); setTimeout(() => setUiNote(null), 1200) } catch {} }}>Log status to console</Button>
          {authenticated ? (
            <Button size="sm" variant="destructive" onClick={() => logout()}>Logout</Button>
          ) : null}
        </div>
        {uiNote ? (
          <div className="mt-2 text-xs text-muted-foreground">{uiNote}</div>
        ) : null}
        {wallets.length > 0 ? (
          <div className="mt-4 space-y-1">
            <div className="text-sm font-medium">Privy wallets</div>
            <div className="text-xs text-muted-foreground">Note: EVM chains (incl. BSC) appear as chainType "ethereum".</div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => { try { console.log('Privy wallets (raw)', wallets) } catch {} }}>Log full wallets</Button>
              <Button size="sm" variant="outline" onClick={() => checkAll7702()}>Check EOA / 7702</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="py-1 pr-4">Type</th>
                    <th className="py-1 pr-4">Address</th>
                    <th className="py-1 pr-4">Role</th>
                    <th className="py-1 pr-4">Active</th>
                    <th className="py-1 pr-4">Source</th>
                    <th className="py-1 pr-4">EOA</th>
                    <th className="py-1 pr-4">7702-eligible</th>
                    <th className="py-1 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets.map((w: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="py-2 pr-4">{w?.type || w?.chainType || 'wallet'}</td>
                      <td className="py-2 pr-4 font-mono">{w?.address || '—'}</td>
                      <td className="py-2 pr-4">
                        {(() => {
                          const t = (w?.type || '').toString().toLowerCase()
                          const ct = (w?.custodyType || w?.walletClientType || (w?.clientType || '')).toString().toLowerCase()
                          const src = (w?.source || '').toString().toLowerCase()
                          const isEmbedded = t.includes('embedded') || ct.includes('embedded') || src.includes('embedded') || (w as any)?.isEmbedded === true || (w as any)?.custodyType === 'custodial'
                          if (isEmbedded) return 'Embedded (Privy)' 
                          // Heuristics for external providers
                          if (src.includes('metamask') || ct.includes('metamask')) return 'External (MetaMask)'
                          if (src.includes('coinbase') || ct.includes('coinbase')) return 'External (Coinbase)'
                          if (src.includes('walletconnect') || ct.includes('walletconnect')) return 'External (WalletConnect)'
                          return 'External'
                        })()}
                      </td>
                      <td className="py-2 pr-4">{(w?.address || '').toLowerCase() === (address || '').toLowerCase() ? 'yes' : 'no'}</td>
                      <td className="py-2 pr-4 text-xs">{w?.walletClientType || w?.custodyType || w?.clientType || w?.source || '—'}</td>
                      <td className="py-2 pr-4">{capabilities[w?.address || '']?.isEOA ? 'yes' : (capabilities[w?.address || ''] ? 'no' : '—')}</td>
                      <td className="py-2 pr-4">{capabilities[w?.address || '']?.eip7702Eligible ? 'yes' : (capabilities[w?.address || ''] ? 'no' : '—')}</td>
                      <td className="py-2 pr-4 flex items-center gap-2">
                        <Copy value={w?.address} />
                        <Button size="sm" variant="outline" onClick={() => { try { setPreferredOverride(w); setUiNote(`Preferred set: ${shorten(w?.address)}`); setActionResult({ type: 'preferred_set', preferred: { address: w?.address, type: w?.type || w?.walletClientType || w?.custodyType || 'wallet' } }); setTimeout(() => setUiNote(null), 1200) } catch {} }}>Set preferred</Button>
                        <Button size="sm" variant="ghost" onClick={async () => { try { await linkWallet() } catch {} }}>Manage</Button>
                        {(() => {
                          try {
                            const linked = (((user as any)?.linkedAccounts) || ((user as any)?.linked_accounts) || [])
                              .some((acc: any) => (acc?.address || '').toLowerCase() === (w?.address || '').toLowerCase())
                            if (linked) {
                              return <span className="text-xs text-muted-foreground">Linked</span>
                            }
                          } catch {}
                          return <Button size="sm" variant="secondary" onClick={async () => linkExternalWithPrivy()}>Link via Privy</Button>
                        })()}
                      </td>
                    </tr>
                  ))}
                  {/* Synthetic smart wallet row if available and not listed */}
                  {(() => {
                    try {
                      const sw = smartWalletAccount
                      const swAddr = (sw?.address || '').toString()
                      if (!swAddr) return null
                      const present = (wallets || []).some((w: any) => (w?.address || '').toLowerCase() === swAddr.toLowerCase())
                      if (present) return null
                      return (
                        <tr className="border-t bg-muted/50">
                          <td className="py-2 pr-4">smart_wallet</td>
                          <td className="py-2 pr-4 font-mono">{swAddr}</td>
                          <td className="py-2 pr-4">Smart wallet (Privy)</td>
                          <td className="py-2 pr-4">—</td>
                          <td className="py-2 pr-4 text-xs">—</td>
                          <td className="py-2 pr-4">—</td>
                          <td className="py-2 pr-4">—</td>
                          <td className="py-2 pr-4">
                            <span className="text-xs text-muted-foreground">Use "Smart wallet" actions below</span>
                          </td>
                        </tr>
                      )
                    } catch { return null }
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-lg font-semibold">Status JSON</h2>
        <div className="mb-2 text-sm text-muted-foreground">Copy the JSON below for debugging.</div>
        <div className="flex items-center gap-2 mb-2">
          <Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(statusJson); setUiNote('JSON copied'); setTimeout(() => setUiNote(null), 1200) } catch {} }}>Copy JSON</Button>
          <Button size="sm" variant="outline" onClick={() => { try { console.log('Peridot CrossTest Status (JSON)', statusJson) } catch {} }}>Log JSON</Button>
        </div>
        <textarea readOnly value={statusJson} className="w-full h-56 rounded-md border bg-muted p-2 font-mono text-xs" />
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-lg font-semibold">Smart Account Status</h2>
        <div className="text-sm space-y-2">
          <div>Smart wallets are auto-provisioned when <code>SmartWalletsProvider</code> is mounted and you have an embedded wallet.</div>
          <div>If you don't see a smart wallet, ensure the provider is wrapped inside <code>PrivyProvider</code> for this app.</div>
          <div className="text-muted-foreground">Tip: Use Manage / Link Wallet to prompt selection/linking if connection state is stale.</div>
          <div className="text-muted-foreground">A usable smart account is the Privy-created account controlled by your Embedded signer. In the table above, look for Role = "Embedded signer (controls smart account)".</div>
          <div className="mt-1 text-xs">
            Smart wallet address: <span className="font-mono">{smartWalletAccount?.address || '—'}</span>
            <span className="ml-2">
              <Copy value={smartWalletAccount?.address} label="Copy" />
            </span>
            <span className="ml-3">Client ready: <b>{smartClientReady ? 'yes' : 'no'}</b></span>
            {!smartClientReady ? (
              <>
                <span className="ml-2 text-xs text-muted-foreground">{smartClientIssue || 'provision a smart wallet for this chain'}</span>
                <span className="ml-2"><Button size="sm" variant="outline" onClick={() => setSmartModalOpen(true)}>Open setup</Button></span>
              </>
            ) : null}
          </div>
          <div className="mt-1 text-xs">
            Balance: <span className="font-mono">{smartBalanceFormatted != null ? `${smartBalanceFormatted} ${nativeSymbol}` : (smartBalanceWei ? smartBalanceWei : '—')}</span>
            <span className="ml-2"><Button size="sm" variant="outline" onClick={() => refreshSmartBalance()}>Refresh</Button></span>
            <span className="ml-2"><Button size="sm" variant="outline" onClick={() => refreshPrefundEstimate()}>Estimate prefund</Button></span>
            <span className="ml-2 text-muted-foreground">Prefund est.: <span className="font-mono">{(() => { try { return prefundEstimateWei != null ? `${formatEther(BigInt(prefundEstimateWei))} ${nativeSymbol}` : '—' } catch { return '—' } })()}</span></span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => signWithPreferred('Hello from Peridot')}>Sign message</Button>
            <Button size="sm" variant="outline" onClick={() => signTypedDataWithPreferred()}>Sign typed data</Button>
            <Button size="sm" variant="outline" onClick={() => signEip7702()}>Sign EIP-7702 authorization</Button>
            <Button size="sm" variant="secondary" onClick={async () => {
              const diag = {
                hasEmbedded: !!embeddedWallet,
                preferredWallet: preferredWallet ? { address: (preferredWallet as any).address, type: (preferredWallet as any).type || (preferredWallet as any).walletClientType || (preferredWallet as any).custodyType || 'unknown' } : null,
                eip7702: {
                  contract: process.env.NEXT_PUBLIC_BSC_7702_CONTRACT || 'unset',
                  chainId: 56,
                },
                featureFlags: FEATURE_FLAGS,
                network: { chainId, chainName: (currentChainConfig as any)?.chainNameReadable || null },
              }
              try { console.log('Smart account diagnostics', diag) } catch {}
              setActionResult({ type: 'diagnostics', diag })
            }}>Smart account diagnostics</Button>
            <Button size="sm" variant="outline" onClick={() => smartSignMessage('Hello from Smart Wallet')}>Smart wallet: Sign message</Button>
            <Button size="sm" onClick={() => smartSendSelfZero()}>Smart wallet: Send 0-value tx</Button>
          </div>

          {/* Gas Mode Testing Buttons */}
          <div className="mt-3 rounded-md border p-3">
            <div className="text-sm font-medium mb-2">Gas Mode Testing (BSC)</div>
            <div className="text-xs text-muted-foreground mb-3">
              Test different gas payment modes. All send 0-value BNB on BSC mainnet.
              <ul className="mt-1 ml-4 list-disc space-y-1">
                <li><b>Paymaster-sponsored:</b> <code>mode: "SPONSORED"</code> - Gasless tx (requires paymaster configured in Privy Dashboard)</li>
                <li><b>Self-funded:</b> <code>mode: "DEFAULT"</code> - Smart wallet pays gas normally (requires BNB in smart wallet)</li>
                <li><b>EOA fallback:</b> Bypass smart account entirely, use embedded wallet as regular EOA</li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button 
                size="sm" 
                variant="default"
                onClick={() => sendSmartWalletTx('paymaster')}
              >
                Paymaster-sponsored
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => sendSmartWalletTx('self-funded')}
              >
                Self-funded
              </Button>
              <Button 
                size="sm" 
                variant="secondary"
                onClick={() => sendSmartWalletTx('default')}
              >
                Self-funded (omit paymaster)
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => sendSmartWalletTx('paymaster-pimlico')}
              >
                Paymaster (Pimlico test)
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => sendSmartWalletTx('self-funded-pimlico')}
              >
                Self-funded (Pimlico test)
              </Button>
            </div>
          </div>

          {/* ERC20 transfer using smart wallet */}
          <div className="mt-3 rounded-md border p-3">
            <div className="text-sm font-medium mb-2">Smart wallet: ERC20 transfer</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
              <label className="flex flex-col gap-1">
                <span>Token</span>
                <select
                  className="h-9 rounded-md border px-2"
                  value={erc20Token}
                  onChange={(e) => setErc20Token(e.target.value)}
                >
                  {erc20Options.map((opt) => (
                    <option key={opt.address} value={opt.address}>
                      {opt.symbol} ({opt.address.slice(0, 6)}…{opt.address.slice(-4)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span>Recipient</span>
                <input className="h-9 rounded-md border px-2" placeholder="0xRecipient…" value={erc20To} onChange={(e) => setErc20To(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span>Amount</span>
                <input className="h-9 rounded-md border px-2" placeholder="e.g. 0.1" value={erc20Amount} onChange={(e) => setErc20Amount(e.target.value)} />
              </label>
            </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={async () => {
                try {
                  if (!erc20Token || !erc20To || !erc20Amount) throw new Error('Fill token, recipient, amount')
                  const client: any = await getSmartClientOrPrompt()
                  // Minimal ERC20 transfer call data: transfer(address,uint256)
                  const sig = '0xa9059cbb'
                  const toParam = (erc20To || '').replace(/^0x/, '').padStart(64, '0')
                  const dec = (() => {
                    try { return typeof chainId === 'number' ? getConfiguredUnderlyingDecimals(chainId, { underlyingAddress: erc20Token }) : undefined } catch { return undefined }
                  })()
                  const amtWei = (() => {
                    try {
                      if (dec == null) return BigInt(erc20Amount)
                      // parse decimal string to wei using viem's formatUnits inverse logic (simple split)
                      const [int, frac = ''] = String(erc20Amount).split('.')
                      const fracPadded = (frac + ''.padEnd(dec, '0')).slice(0, dec)
                      // compute 10^dec without ** to satisfy TS target
                      let pow = BigInt(1)
                      for (let i = 0; i < (dec as number); i++) pow = pow * BigInt(10)
                      return BigInt(int || '0') * pow + BigInt(fracPadded || '0')
                    } catch { return BigInt(erc20Amount) }
                  })()
                  const amtParam = (amtWei).toString(16).padStart(64, '0')
                  const data = sig + toParam + amtParam
                  setUiNote('Submitting ERC20 transfer via smart wallet…')
                  const txHash = await (client as any).sendTransaction({ to: erc20Token, data })
                  try { console.log('Smart ERC20 tx', txHash) } catch {}
                  setActionResult({ type: 'smart_erc20_transfer', token: erc20Token, to: erc20To, amount: erc20Amount, txHash })
                  setUiNote('ERC20 transfer submitted')
                  setTimeout(() => setUiNote(null), 1500)
                } catch (e) {
                  setUiNote((e as any)?.message || 'ERC20 transfer failed')
                  setTimeout(() => setUiNote(null), 2000)
                }
              }}>Send ERC20</Button>
              <Button size="sm" variant="outline" onClick={() => { setErc20Token(''); setErc20To(''); setErc20Amount('') }}>Clear</Button>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Amount is raw wei for simplicity. For decimals-aware UI, add token metadata fetch.</div>
          </div>

          {/* 7702 auth UI hidden intentionally; embedded + smart account flow requires no env */}
          {actionResult ? (
            <div className="mt-3">
              <div className="text-xs text-muted-foreground mb-1">Last action result</div>
              <textarea readOnly className="w-full h-40 rounded-md border bg-muted p-2 font-mono text-xs" value={(() => { try { return JSON.stringify(actionResult, null, 2) } catch { return '' } })()} />
            </div>
          ) : null}

          {/* Linking hint */}
          <div className="mt-3 text-xs text-muted-foreground">Use "Link via Privy" on a wallet above to connect external accounts via SIWE with Privy’s native flow.</div>
        </div>
      </section>

      {FEATURE_FLAGS.CROSS_CHAIN_BORROW_BICONOMY ? (
        <section className="rounded-lg border p-4">
          <h2 className="mb-3 text-lg font-semibold">Borrow test (Biconomy)</h2>
          <div className="grid gap-2 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span>Asset symbol (e.g. USDT, USDC)</span>
                <input value={borrowAssetId} onChange={(e) => setBorrowAssetId(e.target.value)} className="h-9 rounded-md border px-2" placeholder="USDT" />
              </label>
              <label className="flex flex-col gap-1">
                <span>Amount</span>
                <input value={borrowAmount} onChange={(e) => setBorrowAmount(e.target.value)} className="h-9 rounded-md border px-2" placeholder="10" />
              </label>
              <label className="flex flex-col gap-1">
                <span>Destination chainId (optional)</span>
                <div className="flex gap-2">
                  <input value={destChainInput} onChange={(e) => setDestChainInput(e.target.value)} className="h-9 flex-1 rounded-md border px-2" placeholder="e.g. 42161 (Arbitrum)" />
                  <Button size="sm" variant="outline" onClick={() => setDestChainInput('56')}>BSC</Button>
                  <Button size="sm" variant="outline" onClick={() => setDestChainInput('42161')}>Arb</Button>
                  <Button size="sm" variant="outline" onClick={() => setDestChainInput('1')}>Eth</Button>
                </div>
              </label>
            </div>
            <label className="mt-1 inline-flex items-center gap-2">
              <input type="checkbox" checked={biconomySponsorship} onChange={(e) => setBiconomySponsorship(e.target.checked)} />
              <span>Request gas sponsorship (recommended)</span>
            </label>
          </div>

          {(() => {
            const dest = (() => { try { const n = parseInt(destChainInput || ''); return Number.isFinite(n) ? n : undefined } catch { return undefined } })()
            const borrow = useBorrowTransaction({
              assetId: (borrowAssetId || '').trim().toUpperCase(),
              amount: borrowAmount,
              destinationChainId: dest,
              feeMode: 'biconomy',
              biconomySponsorship,
              onSuccess: () => { try { setUiNote('Borrow submitted'); setTimeout(() => setUiNote(null), 1500) } catch {} },
              onError: (e) => { try {
                const msg = (e?.message || '').toString()
                if (/BICONOMY_7702_AUTHORIZATION_REQUIRED/.test(msg)) {
                  try { window.dispatchEvent(new CustomEvent('peridot:open-smart-account-modal')) } catch {}
                }
                setUiNote(msg || 'Borrow failed'); setTimeout(() => setUiNote(null), 2000) } catch {} },
            })
            return (
              <div className="mt-3 space-y-3">
                {borrow.isBiconomyCrossChain ? (
                  <div className="rounded-md border p-3">
                    <div className="text-sm font-medium mb-2">Fee token on BSC (EOA)</div>
                    <div className="flex items-center gap-2">
                      <select
                        className="h-9 rounded-md border px-2"
                        disabled={borrow.isFeeTokenBalanceLoading || (borrow.feeTokenOptions || []).length === 0}
                        value={borrow.selectedFeeToken?.address || ''}
                        onChange={(e) => borrow.selectFeeToken(e.target.value as any)}
                      >
                        <option value="">Auto</option>
                        {(borrow.feeTokenOptions || []).map((opt) => (
                          <option key={opt.address} value={opt.address}>
                            {opt.symbol} {opt.formattedBalance ? `(bal ${opt.formattedBalance})` : ''}
                          </option>
                        ))}
                      </select>
                      <Button size="sm" variant="outline" onClick={() => { try { (borrow as any).selectFeeToken(null) } catch {} }}>Clear</Button>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => borrow.executeBorrow()} disabled={borrow.isLoading}>
                    {borrow.isLoading ? 'Processing…' : 'Execute borrow'}
                  </Button>
                  {borrow.biconomyTrackingUrl ? (
                    <a className="text-xs underline" href={borrow.biconomyTrackingUrl} target="_blank" rel="noreferrer">Open tracking</a>
                  ) : null}
                  {borrow.biconomyMeeLink ? (
                    <a className="text-xs underline" href={borrow.biconomyMeeLink} target="_blank" rel="noreferrer">Mee scan</a>
                  ) : null}
                </div>

                <div className="text-xs text-muted-foreground">{borrow.statusMessage}</div>
                {borrow.error ? (
                  <div className="text-xs text-red-600">{borrow.error}</div>
                ) : null}
              </div>
            )
          })()}
        </section>
      ) : null}

      {/* Biconomy Supertransaction (MEE) minimal test */}
      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-lg font-semibold">Biconomy Supertransaction (MEE) – Minimal Test</h2>
        <div className="text-sm text-muted-foreground mb-2">Runs a no-op style submission when possible; requires correctly configured chains and EIP-7702 if MEE is used from EOA.</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={async () => {
            try {
              setUiNote('Preparing MEE client (demo)…')
              // Placeholder: We keep the UI hook here; actual implementation should live in a dedicated hook/module
              const info = {
                note: 'Use a dedicated hook to create MEE client with toMultichainNexusAccount()',
                chainId,
                preferredWallet: preferredWallet ? { address: (preferredWallet as any).address } : null,
              }
              try { console.log('MEE demo init', info) } catch {}
              setActionResult({ type: 'mee-demo-init', info })
              setUiNote('MEE demo prepared — implement full flow as needed')
              setTimeout(() => setUiNote(null), 1500)
            } catch (e) {
              setUiNote((e as any)?.message || 'MEE demo failed')
              setTimeout(() => setUiNote(null), 2000)
            }
          }}>Prepare MEE client (demo)</Button>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">For a real MEE flow, wire <code>toMultichainNexusAccount</code>, <code>createMeeClient</code>, and runtime instructions. When 7702 is required, sign via the button above first.</div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-lg font-semibold">Network</h2>
        <div className="grid gap-1 text-sm">
          <div>Current chainId: <b>{typeof chainId === 'number' ? chainId : '—'}</b> {currentChainConfig?.chainNameReadable ? `(${currentChainConfig.chainNameReadable})` : ''}</div>
          <div>Resolved Biconomy hub chainId: <b>{hubChainId ?? '—'}</b> {hubChainConfig?.chainNameReadable ? `(${hubChainConfig.chainNameReadable})` : ''}</div>
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-lg font-semibold">Tokens for Cross-Chain Flows</h2>
        <div className="text-sm text-muted-foreground mb-3">Addresses shown from config for the current chain and its hub. Use faucets or funding flows to acquire test tokens.</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-1 pr-4">Scope</th>
                <th className="py-1 pr-4">Symbol</th>
                <th className="py-1 pr-4">Address</th>
                <th className="py-1 pr-4">Decimals</th>
                <th className="py-1 pr-4">Copy</th>
              </tr>
            </thead>
            <tbody>
              {crossChainTokens.map((t, idx) => (
                <tr key={`${t.scope}-${t.symbol}-${idx}`} className="border-t">
                  <td className="py-2 pr-4">{t.scope}</td>
                  <td className="py-2 pr-4">{t.symbol}</td>
                  <td className="py-2 pr-4 font-mono">{t.address || '—'}</td>
                  <td className="py-2 pr-4">{typeof t.decimals === 'number' ? t.decimals : '—'}</td>
                  <td className="py-2 pr-4"><Copy value={t.address} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-lg font-semibold">Feature Flags</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-1 pr-4">Flag</th>
                <th className="py-1 pr-4">Value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(FEATURE_FLAGS).map(([k, v]) => (
                <tr key={k} className="border-t">
                  <td className="py-2 pr-4">{k}</td>
                  <td className="py-2 pr-4"><b>{v ? 'true' : 'false'}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">Flags are compile-time config; change in `config/featureFlags.ts` and redeploy.</div>
      </section>
    </div>
  )
}


