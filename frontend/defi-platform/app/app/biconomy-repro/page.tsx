'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import type { Address } from 'viem'
import { arbitrum, base, mainnet, optimism, polygon, bsc } from 'viem/chains'
import { TOKENS, PERIDOT_MARKETS, getUnderlyingToken } from '@/biconomy/constants'
import type { ExecutionMode } from '@/biconomy/constants'

type ChainKey = keyof typeof TOKENS

const CHAIN_IDS: Record<ChainKey, number> = {
  mainnet: mainnet.id,
  ethereum: mainnet.id,
  arbitrum: arbitrum.id,
  optimism: optimism.id,
  polygon: polygon.id,
  base: base.id,
} as const

const CHAIN_LABELS: Record<ChainKey, string> = {
  mainnet: 'Ethereum Mainnet',
  ethereum: 'Ethereum Mainnet (alias)',
  arbitrum: 'Arbitrum One',
  optimism: 'Optimism',
  polygon: 'Polygon PoS',
  base: 'Base',
} as const

const MAX_UINT256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

const AVAILABLE_CHAIN_KEYS = (Object.keys(TOKENS) as ChainKey[]).filter(
  (key) => CHAIN_IDS[key] !== undefined,
)

const EXECUTION_MODES: ExecutionMode[] = ['eoa', 'smart-account', 'eoa-7702']

export default function BiconomyReproPage() {
  const { address } = useAccount()
  const [flow, setFlow] = useState<'supply' | 'repay'>('supply')
  const [sourceChainKey, setSourceChainKey] = useState<ChainKey>('arbitrum')
  const [token, setToken] = useState<'USDC' | 'USDT'>('USDC')
  const [amount, setAmount] = useState('1000000')
  const [slippageInput, setSlippageInput] = useState('0.01')
  const [owner, setOwner] = useState<string>('')
  const [sourceChainIdOverride, setSourceChainIdOverride] = useState('')
  const [destinationChainIdInput, setDestinationChainIdInput] = useState<string>(String(bsc.id))
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('eoa')
  const [sponsorship, setSponsorship] = useState(true)
  const [preferOnChainFunding, setPreferOnChainFunding] = useState(false)
  const [fundingTokenOverride, setFundingTokenOverride] = useState('')
  const [fundingTokenChainIdOverride, setFundingTokenChainIdOverride] = useState('')
  const [feeTokenOverride, setFeeTokenOverride] = useState('')
  const [feeTokenChainIdOverride, setFeeTokenChainIdOverride] = useState('')
  const [repayMode, setRepayMode] = useState<'exact' | 'max'>('exact')
  const [extraQuoteFields, setExtraQuoteFields] = useState('')
  const [logs, setLogs] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  const append = (line: any) =>
    setLogs((prev) => prev + (typeof line === 'string' ? line : JSON.stringify(line)) + '\n')

  const run = async () => {
    setLogs('')
    setIsLoading(true)
    try {
      const ownerAddress = (owner || address || '').toString() as Address
      if (!ownerAddress) {
        append('Please connect wallet or paste an owner address (EOA or smart account).')
        return
      }

      const baseSourceChainId = CHAIN_IDS[sourceChainKey]
      if (!baseSourceChainId) {
        append(`[error] Source chain "${sourceChainKey}" is missing a chain id mapping`)
        return
      }

      const parseChainId = (raw: string, fallback: number, label: string): number => {
        const trimmed = (raw || '').trim()
        if (!trimmed) return fallback
        const parsed = Number(trimmed)
        if (!Number.isFinite(parsed) || parsed <= 0) {
          append(`[warn] Invalid ${label} "${raw}" → defaulting to ${fallback}`)
          return fallback
        }
        return parsed
      }

      const resolvedSourceChainId = parseChainId(
        sourceChainIdOverride,
        baseSourceChainId,
        'source chain override',
      )
      const resolvedDestinationChainId = parseChainId(
        destinationChainIdInput,
        bsc.id,
        'destination chain id',
      )

      const tokensForChain = (TOKENS as any)[sourceChainKey] as Record<string, Address> | undefined
      if (!tokensForChain) {
        append(`[error] Token map missing for chain ${sourceChainKey}`)
        return
      }

      const srcToken = tokensForChain?.[token] as Address | undefined
      if (!srcToken) {
        append(`[error] Token ${token} not configured for ${sourceChainKey}`)
        return
      }

      const pTokenOnBsc = token === 'USDC' ? PERIDOT_MARKETS.USDC : PERIDOT_MARKETS.USDT
      const underlyingOnBsc = getUnderlyingToken(pTokenOnBsc)

      const resolvedSlippage = (() => {
        const parsed = Number.parseFloat(slippageInput || '')
        if (Number.isFinite(parsed) && parsed >= 0) return parsed
        if (slippageInput.trim()) {
          append(`[warn] Invalid slippage "${slippageInput}" → defaulting to 0.01`)
        }
        return 0.01
      })()

      append(
        `[config] flow=${flow} | source=${sourceChainKey} (${resolvedSourceChainId}) → dest=${resolvedDestinationChainId}`,
      )
      append(`[config] amount=${amount} | slippage=${resolvedSlippage}`)
      append(
        `[config] executionMode=${executionMode} | sponsorship=${sponsorship} | preferOnChainFunding=${preferOnChainFunding}`,
      )

      const composeFlows: any[] = [
        {
          type: '/instructions/intent-simple',
          data: {
            srcToken,
            dstToken: underlyingOnBsc,
            srcChainId: resolvedSourceChainId,
            dstChainId: resolvedDestinationChainId,
            amount,
            slippage: resolvedSlippage,
          },
        },
        {
          type: '/instructions/build',
          data: {
            functionSignature: 'function approve(address,uint256)',
            args: [pTokenOnBsc, { type: 'runtimeErc20Balance', tokenAddress: underlyingOnBsc }],
            to: underlyingOnBsc,
            chainId: resolvedDestinationChainId,
            value: '0',
          },
        },
      ]

      if (flow === 'supply') {
        composeFlows.push(
          {
            type: '/instructions/build',
            data: {
              functionSignature: 'function mint(uint256)',
              args: [{ type: 'runtimeErc20Balance', tokenAddress: underlyingOnBsc }],
              to: pTokenOnBsc,
              chainId: resolvedDestinationChainId,
              value: '0',
            },
          },
          {
            type: '/instructions/build',
            data: {
              functionSignature: 'function transfer(address,uint256)',
              args: [ownerAddress, { type: 'runtimeErc20Balance', tokenAddress: pTokenOnBsc, constraints: { gte: '1' } }],
              to: pTokenOnBsc,
              chainId: resolvedDestinationChainId,
              value: '0',
            },
          },
        )
      } else {
        const repayArg =
          repayMode === 'max'
            ? MAX_UINT256
            : { type: 'runtimeErc20Balance', tokenAddress: underlyingOnBsc }
        composeFlows.push({
          type: '/instructions/build',
          data: {
            functionSignature: 'function repayBorrow(uint256)',
            args: [repayArg],
            to: pTokenOnBsc,
            chainId: resolvedDestinationChainId,
            value: '0',
          },
        })
      }

      const composeBody = {
        ownerAddress,
        mode: executionMode,
        composeFlows,
      }

      append('[compose] request:')
      append(composeBody)
      const composeRes = await fetch('/api/biconomy/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(composeBody),
      })
      const composeText = await composeRes.text()
      append(`[compose] status: ${composeRes.status}`)
      append(composeText)
      if (!composeRes.ok) {
        return
      }
      const { instructions } = JSON.parse(composeText)
      append(`[compose] instructions count: ${Array.isArray(instructions) ? instructions.length : 0}`)

      const resolvedFundingTokenAddress = (fundingTokenOverride.trim() || srcToken) as Address | undefined
      const resolvedFundingChainId = parseChainId(
        fundingTokenChainIdOverride,
        resolvedSourceChainId,
        'funding token chain id',
      )
      const resolvedFeeTokenAddress = (feeTokenOverride.trim() || resolvedFundingTokenAddress) as Address | undefined
      const resolvedFeeTokenChainId = parseChainId(
        feeTokenChainIdOverride,
        resolvedFundingChainId,
        'fee token chain id',
      )

      append('[config] funding token override:')
      append({ token: resolvedFundingTokenAddress, chainId: resolvedFundingChainId })
      append('[config] fee token override:')
      append({ token: resolvedFeeTokenAddress, chainId: resolvedFeeTokenChainId })

      const quoteBody: any = {
        ownerAddress,
        mode: executionMode,
        instructions,
        sponsorship,
      }

      if (resolvedFundingTokenAddress) {
        quoteBody.fundingTokens = [
          { tokenAddress: resolvedFundingTokenAddress, chainId: resolvedFundingChainId, amount },
        ]
      } else {
        append('[warn] No funding token resolved – quote payload will omit fundingTokens')
      }

      if (resolvedFeeTokenAddress) {
        quoteBody.feeToken = { address: resolvedFeeTokenAddress, chainId: resolvedFeeTokenChainId }
      } else {
        append('[warn] No fee token resolved – Biconomy will infer from funding token (if any)')
      }

      if (preferOnChainFunding) {
        quoteBody.preferOnChainFunding = true
      }

      if (extraQuoteFields.trim()) {
        try {
          const parsed = JSON.parse(extraQuoteFields)
          Object.assign(quoteBody, parsed)
          append('[quote] merged extra fields override')
        } catch (err: any) {
          append(`[quote] extra fields parse error: ${err?.message || String(err)}`)
        }
      }

      append('[quote] request:')
      append(quoteBody)
      const quoteRes = await fetch('/api/biconomy/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quoteBody),
      })
      const quoteText = await quoteRes.text()
      append(`[quote] status: ${quoteRes.status}`)
      append(quoteText)

      try {
        const q: any = JSON.parse(quoteText || '{}')
        const rootKeys = Object.keys(q || {})
        append('[diagnostics] quote.root.keys:')
        append(rootKeys)

        const reportField = (label: string, v: any) =>
          append(`${label}: ${v === undefined ? 'undefined' : typeof v === 'object' ? JSON.stringify(v) : String(v)}`)

        reportField('[diagnostics] quoteType', q?.quoteType || q?.type)
        reportField('[diagnostics] fee.set', q?.fee ? 'yes' : 'no')

        const innerQuote = q?.quote || q?.result?.quote || undefined
        append('[diagnostics] innerQuote.keys:')
        append(Object.keys(innerQuote || {}))
        reportField('[diagnostics] innerQuote.hash', innerQuote?.hash)
        reportField('[diagnostics] innerQuote.node', innerQuote?.node)
        reportField('[diagnostics] innerQuote.commitment', innerQuote?.commitment)
        reportField('[diagnostics] innerQuote.paymentInfo.set', innerQuote?.paymentInfo ? 'yes' : 'no')
        reportField(
          '[diagnostics] innerQuote.userOps.set',
          Array.isArray(innerQuote?.userOps) ? `yes(${innerQuote?.userOps?.length})` : 'no',
        )

        const payloads: any[] =
          (Array.isArray(q?.payloadToSign) && q.payloadToSign) ||
          (Array.isArray(q?.payloads?.toSign) && q.payloads.toSign) ||
          (Array.isArray(q?.result?.payloadToSign) && q.result.payloadToSign) ||
          []
        reportField('[diagnostics] payloads.count', payloads.length)
        if (payloads.length > 0) {
          const p0 = payloads[0]
          append('[diagnostics] payload[0].keys:')
          append(Object.keys(p0 || {}))
          const shape = {
            hasDomain: Boolean(p0?.domain),
            hasTypes: Boolean(p0?.types),
            hasMessage: Boolean(p0?.message),
            hasTxFields: Boolean(p0?.to && p0?.data !== undefined && p0?.chainId !== undefined),
            hasWrapperType: Boolean(p0?.type && p0?.data),
            chainId: p0?.chainId || p0?.domain?.chainId || p0?.data?.chainId,
          }
          append('[diagnostics] payload[0].shape:')
          append(shape)
        }
      } catch (e: any) {
        append(`[diagnostics] parse error: ${e?.message || String(e)}`)
      }
    } catch (e: any) {
      append(`[error] ${e?.message || String(e)}`)
    } finally {
      setIsLoading(false)
    }
  }

  const chainLabel = CHAIN_LABELS[sourceChainKey] || sourceChainKey

  return (
    <div style={{ padding: 24 }}>
      <h1>Biconomy Fusion Debug Console</h1>
      <p style={{ color: '#999', maxWidth: 720 }}>
        Use this panel to reproduce and debug Fusion compose/quote payloads for Peridot cross-chain flows. Supply and repay flows
        share the same base compose step (bridge → approve) and expose knobs to test different funding and fee token setups.
      </p>
      <div style={{ display: 'grid', gap: 12, maxWidth: 820 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Flow:
          <select value={flow} onChange={(e) => setFlow(e.target.value as 'supply' | 'repay')}>
            <option value="supply">Cross-chain supply (bridge → mint)</option>
            <option value="repay">Cross-chain repay (bridge → repayBorrow)</option>
          </select>
        </label>
        {flow === 'repay' && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label>
              <input
                type="radio"
                name="repay-mode"
                value="exact"
                checked={repayMode === 'exact'}
                onChange={() => setRepayMode('exact')}
              />{' '}
              Repay exact bridged amount
            </label>
            <label>
              <input
                type="radio"
                name="repay-mode"
                value="max"
                checked={repayMode === 'max'}
                onChange={() => setRepayMode('max')}
              />{' '}
              Repay max (uint256)
            </label>
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Source chain:
          <select value={sourceChainKey} onChange={(e) => setSourceChainKey(e.target.value as ChainKey)}>
            {AVAILABLE_CHAIN_KEYS.map((key) => (
              <option key={key} value={key}>
                {CHAIN_LABELS[key] || key}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source chain ID override (optional):
          <input
            value={sourceChainIdOverride}
            onChange={(e) => setSourceChainIdOverride(e.target.value)}
            placeholder="defaults to selected chain"
            style={{ marginLeft: 8, width: 220 }}
          />
        </label>
        <label>
          Destination chain ID:
          <input
            value={destinationChainIdInput}
            onChange={(e) => setDestinationChainIdInput(e.target.value)}
            style={{ marginLeft: 8, width: 220 }}
          />
          <span style={{ marginLeft: 8, color: '#888' }}>BSC = {bsc.id}</span>
        </label>
        <label>
          Token ({chainLabel}):
          <select value={token} onChange={(e) => setToken(e.target.value as 'USDC' | 'USDT')} style={{ marginLeft: 8 }}>
            <option value="USDC">USDC</option>
            <option value="USDT">USDT</option>
          </select>
        </label>
        <label>
          Amount (token units, e.g. 1 USDC = 1000000):
          <input value={amount} onChange={(e) => setAmount(e.target.value)} style={{ marginLeft: 8, width: 300 }} />
        </label>
        <label>
          Slippage (0 - 1):
          <input value={slippageInput} onChange={(e) => setSlippageInput(e.target.value)} style={{ marginLeft: 8, width: 120 }} />
        </label>
        <label>
          Owner (defaults to connected wallet):
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder={address || '0x...'}
            style={{ marginLeft: 8, width: 420 }}
          />
        </label>
        <div style={{ border: '1px solid #2a2a2a', borderRadius: 8, padding: 12, background: '#101010', display: 'grid', gap: 8 }}>
          <strong>Quote overrides</strong>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Execution mode:
            <select value={executionMode} onChange={(e) => setExecutionMode(e.target.value as ExecutionMode)}>
              {EXECUTION_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={sponsorship}
              onChange={(e) => setSponsorship(e.target.checked)}
            />{' '}
            Request sponsorship (gasless)
          </label>
          <label>
            <input
              type="checkbox"
              checked={preferOnChainFunding}
              onChange={(e) => setPreferOnChainFunding(e.target.checked)}
            />{' '}
            preferOnChainFunding
          </label>
          <label>
            Funding token override:
            <input
              value={fundingTokenOverride}
              onChange={(e) => setFundingTokenOverride(e.target.value)}
              placeholder="defaults to source token"
              style={{ marginLeft: 8, width: 360 }}
            />
          </label>
          <label>
            Funding token chain ID override:
            <input
              value={fundingTokenChainIdOverride}
              onChange={(e) => setFundingTokenChainIdOverride(e.target.value)}
              placeholder="defaults to source chain"
              style={{ marginLeft: 8, width: 220 }}
            />
          </label>
          <label>
            Fee token override:
            <input
              value={feeTokenOverride}
              onChange={(e) => setFeeTokenOverride(e.target.value)}
              placeholder="defaults to funding token"
              style={{ marginLeft: 8, width: 360 }}
            />
          </label>
          <label>
            Fee token chain ID override:
            <input
              value={feeTokenChainIdOverride}
              onChange={(e) => setFeeTokenChainIdOverride(e.target.value)}
              placeholder="defaults to funding chain"
              style={{ marginLeft: 8, width: 220 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Extra quote fields (JSON merge):
            <textarea
              value={extraQuoteFields}
              onChange={(e) => setExtraQuoteFields(e.target.value)}
              placeholder='e.g. {"delegate":true}'
              style={{ width: '100%', minHeight: 80, fontFamily: 'monospace', fontSize: 13, padding: 8 }}
            />
          </label>
          <span style={{ color: '#666', fontSize: 13 }}>
            Tip: set <code>preferOnChainFunding</code>, custom fee tokens, or delegation flags to mirror the adapter payloads and
            inspect how Biconomy responds.
          </span>
        </div>
        <button disabled={isLoading} onClick={run} style={{ width: 200, padding: '8px 12px' }}>
          {isLoading ? 'Running…' : 'Run compose + quote'}
        </button>
        <pre
          style={{
            background: '#0b0b0b',
            color: '#d4d4d4',
            padding: 12,
            borderRadius: 8,
            overflowX: 'auto',
            minHeight: 280,
            maxHeight: 520,
          }}
        >
          {logs}
        </pre>
        <p style={{ color: '#888' }}>
          Supply flow is pre-configured with the working parameters from production. Adjust the overrides above to identify which
          fields break cross-chain borrow/repay attempts—especially funding token selection, fee token address, and sponsorship
          flags.
        </p>
      </div>
    </div>
  )
}
