/**
 * Wallet-awareness layer for MCP tool calls.
 *
 * Different MCP tools name the "current user wallet" field differently:
 *   - Peridot:           `address`            (string)
 *   - Alchemy single:    `address`/`owner`/`fromAddress`  (string)
 *   - Alchemy multichain `addresses`          (array of `{ address, networks[] }` objects)
 *
 * Rather than rely on the LLM to remember the correct shape per tool, we inject
 * the connected wallet server-side whenever:
 *   - the tool name matches a known wallet-consuming tool, AND
 *   - the call didn't already include a valid value in that field, AND
 *   - a wallet is currently connected for this user.
 *
 * Belt-and-suspenders: the system prompt still tells the LLM to pass the
 * address; if it hallucinates or omits, we recover transparently.
 *
 * Tools that take an address as a *filter* rather than the user's identity
 * (e.g. `getTokenAllowance` owner, `getNFTSales` buyerAddress, traceFilter)
 * are intentionally NOT in the list — auto-injecting there would silently
 * narrow the result set in unexpected ways.
 *
 * Write tools (`sendTransaction`, `swap`, `reportSpam`) and Solana tools are
 * also excluded — write ops must be explicit, and Solana addresses aren't EVM.
 */

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

/**
 * Alchemy multichain tools require `networks: string[]` per address object,
 * but different tools support different chain sets:
 *
 *   - `fetchAddressTransactionHistory` is Alchemy's Portfolio API "Transactions
 *     By Wallet". As of Apr 2026 it was Beta and limited to ETH + Base. Alchemy
 *     is rolling out more chains per-API-key — use the env var override below
 *     after enabling additional chains in the Alchemy dashboard.
 *
 *   - `fetchTokensOwnedByMultichainAddresses` / `fetchNftsOwnedByMultichainAddresses`
 *     cover the full Portfolio API surface — 30+ EVM chains. We pick the
 *     Peridot-relevant subset so results aren't diluted by noise chains.
 *
 * Env var overrides (comma-separated, restart Next.js to pick up):
 *   ALCHEMY_TX_HISTORY_NETWORKS="eth-mainnet,base-mainnet,arb-mainnet"
 *   ALCHEMY_PORTFOLIO_NETWORKS="eth-mainnet,arb-mainnet,base-mainnet,..."
 *
 * Use `scripts/probe-tx-history-networks.ts` to discover which chains the
 * current API key actually has enabled — the tool returns "Unsupported network"
 * for anything not yet live.
 */
function parseNetworkList(raw: string | undefined, fallback: readonly string[]): readonly string[] {
  if (!raw) return fallback
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts : fallback
}

const TX_HISTORY_NETWORKS: readonly string[] = parseNetworkList(
  process.env.ALCHEMY_TX_HISTORY_NETWORKS,
  ['eth-mainnet', 'base-mainnet'],
)

const PORTFOLIO_NETWORKS: readonly string[] = parseNetworkList(
  process.env.ALCHEMY_PORTFOLIO_NETWORKS,
  [
    'eth-mainnet',
    'arb-mainnet',
    'base-mainnet',
    'bnb-mainnet',
    'polygon-mainnet',
    'avax-mainnet',
    'opt-mainnet',
  ],
)

type FieldType =
  /** Single EVM address string. */
  | 'string'
  /** Array of EVM address strings. */
  | 'string[]'
  /** Array of objects `{ address: string, networks: string[] }` — Alchemy multichain shape. */
  | 'multichain-address-object[]'

interface WalletField {
  /** Field name in the tool's input schema. */
  field: string
  type: FieldType
  /**
   * For `multichain-address-object[]` only — the default `networks` array we
   * inject when the LLM omits one. Some tools support different chain sets
   * (see comments above the constants).
   */
  defaultNetworks?: readonly string[]
}

/**
 * Map of `mcp__<server>__<tool>` → wallet field(s).
 *
 * When multiple fields are listed (e.g. Alchemy `fetchTransfers` accepts both
 * fromAddress and toAddress), we inject ONLY the first one and only if NEITHER
 * is already set — the LLM stays in control of the direction it queries.
 */
const WALLET_AWARE_TOOLS: Record<string, WalletField[]> = {
  // ── Peridot MCP ─────────────────────────────────────────────────
  // NOTE: `get_user_portfolio` is not exposed by the Peridot MCP server —
  // `get_peridot_wallet_summary` below replaces it with the same underlying
  // upstream call (/api/user/portfolio-data) plus a richer roll-up.
  'mcp__peridot__get_peridot_wallet_history': [{ field: 'address', type: 'string' }],
  'mcp__peridot__get_peridot_wallet_summary': [{ field: 'address', type: 'string' }],

  // ── Alchemy MCP — multichain (array of { address, networks } objects) ───
  // Transaction history is Portfolio API Beta — ETH + Base only.
  'mcp__alchemy__fetchAddressTransactionHistory': [
    { field: 'addresses', type: 'multichain-address-object[]', defaultNetworks: TX_HISTORY_NETWORKS },
  ],
  // Token/NFT Portfolio endpoints cover the full multichain set.
  'mcp__alchemy__fetchTokensOwnedByMultichainAddresses': [
    { field: 'addresses', type: 'multichain-address-object[]', defaultNetworks: PORTFOLIO_NETWORKS },
  ],
  'mcp__alchemy__fetchNftsOwnedByMultichainAddresses': [
    { field: 'addresses', type: 'multichain-address-object[]', defaultNetworks: PORTFOLIO_NETWORKS },
  ],
  'mcp__alchemy__fetchNftContractDataByMultichainAddress': [
    { field: 'addresses', type: 'multichain-address-object[]', defaultNetworks: PORTFOLIO_NETWORKS },
  ],

  // ── Alchemy MCP — single chain ──────────────────────────────────
  'mcp__alchemy__fetchTransfers': [
    // Inject as outgoing (fromAddress) by default; LLM can override by passing toAddress explicitly.
    { field: 'fromAddress', type: 'string' },
    { field: 'toAddress', type: 'string' },
  ],
  'mcp__alchemy__getTokenBalances': [{ field: 'address', type: 'string' }],
  'mcp__alchemy__getNFTsForOwner': [{ field: 'owner', type: 'string' }],
  'mcp__alchemy__getContractsForOwner': [{ field: 'owner', type: 'string' }],
  'mcp__alchemy__getCollectionsForOwner': [{ field: 'owner', type: 'string' }],
}

/** Names of all tools that may receive auto-injection. Exported for the system prompt + tests. */
export const WALLET_AWARE_TOOL_NAMES = Object.keys(WALLET_AWARE_TOOLS)

/**
 * Return a new input object with the connected wallet address injected when
 * appropriate. Leaves the input untouched if:
 *   - no wallet is connected
 *   - the tool isn't wallet-aware
 *   - the LLM already supplied a valid value in any of the candidate fields
 *
 * Pure function; takes plain values so tests don't need a request context.
 */
export function injectWalletAddress(
  toolName: string,
  input: Record<string, unknown>,
  connectedAddress: string | undefined | null,
): Record<string, unknown> {
  if (!connectedAddress) return input
  if (!EVM_ADDRESS_RE.test(connectedAddress)) return input

  const fields = WALLET_AWARE_TOOLS[toolName]
  if (!fields || fields.length === 0) return input

  // If the LLM already put a valid value in ANY of the candidate fields,
  // respect its choice and don't inject.
  for (const f of fields) {
    if (hasValidValue(input[f.field], f.type)) return input
  }

  const target = fields[0]
  if (!target) return input

  let value: unknown
  switch (target.type) {
    case 'string':
      value = connectedAddress
      break
    case 'string[]':
      value = [connectedAddress]
      break
    case 'multichain-address-object[]': {
      const nets = target.defaultNetworks ?? PORTFOLIO_NETWORKS
      value = [{ address: connectedAddress, networks: [...nets] }]
      break
    }
  }

  return { ...input, [target.field]: value }
}

function hasValidValue(value: unknown, type: FieldType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string' && EVM_ADDRESS_RE.test(value)
    case 'string[]':
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((v) => typeof v === 'string' && EVM_ADDRESS_RE.test(v))
      )
    case 'multichain-address-object[]':
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every(
          (v) =>
            v != null &&
            typeof v === 'object' &&
            !Array.isArray(v) &&
            typeof (v as { address?: unknown }).address === 'string' &&
            EVM_ADDRESS_RE.test((v as { address: string }).address),
        )
      )
  }
}
