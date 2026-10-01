/**
 * Stellar Testnet Leveraged-Margin Configuration — Perps V3
 *
 * Source of truth: defi-platform/frontend-v2-to-v3-migration.md (V3) on top of
 * defi-platform/stellar-leveraged-margin.md (V2 base — collateral setup is
 * unchanged).
 *
 * This deployment is INTENTIONALLY ISOLATED from the mainnet Stellar lending
 * stack (`stellarSorobanMainnetContracts` in config/contracts.ts). The margin UI
 * runs against Stellar **testnet** with its own RPC, passphrase, and addresses —
 * do not route margin calls through the mainnet lending helpers.
 *
 * Architecture:
 *   marginController     — collateral custody + V3 perps open/close (3-step split)
 *   swapAdapter          — Aquarius-routed swaps + quotes (estimate_pool_swap)
 *   receiptVault (×2)    — XLM / mock-USDT vaults: deposit/withdraw, pTokens, rates
 *   simplePeridottroller — prices, market support, collateral factors, borrow-pause
 *   aquarius             — pool the V3 controller swaps against (direct pool args)
 *
 * MarginController asset args use UNDERLYING token addresses; ReceiptVault calls
 * use VAULT addresses (spec §2).
 */

export const STELLAR_MARGIN_NETWORK = {
  name: "testnet",
  /**
   * Alchemy, NOT the public `soroban-testnet.stellar.org` — same key and same
   * pattern as the mainnet endpoint in config/contracts.ts.
   *
   * The public endpoint is a load balancer over nodes at different ledger
   * heights: twelve `getLatestLedger` calls in three seconds came back
   * 4073378, 4073380, 4073381, 4073378, … — a non-monotonic spread of 3 ledgers
   * (~15s), and 8 in a worse sample. The split close cannot tolerate that. Every
   * leg starts with `prepareTransaction` — a simulation — so a node that has not
   * applied the previous leg simulates against the world before it and traps:
   *
   *   ["VM call trapped: UnreachableCodeReached", swap_close_position_v3]
   *
   * The client throws, submits nothing, and the close stalls. Observed live:
   * three of four close attempts on 2026-08-10 ended after `begin_close` with no
   * second transaction on Horizon at all. (That particular hand-off — begin →
   * withdraw, unbuffered because the pending expired after ~2 ledgers — is gone:
   * the contract folded both into `prepare_close_position_v3` on 2026-08-31. The
   * requirement on the RPC is unchanged, because the lag was never about that
   * one pair.)
   *
   * The same twelve calls against Alchemy are monotonic (4073379 ×7 → 4073380
   * ×5) at comparable latency — one view of the chain, which is the whole
   * requirement here.
   */
  rpcUrl:
    process.env.NEXT_PUBLIC_STELLAR_TESTNET_RPC_URL ||
    `https://stellar-testnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
  horizonUrl:
    process.env.NEXT_PUBLIC_STELLAR_TESTNET_HORIZON_URL ||
    "https://horizon-testnet.stellar.org",
  networkPassphrase:
    process.env.NEXT_PUBLIC_STELLAR_TESTNET_NETWORK_PASSPHRASE ||
    "Test SDF Network ; September 2015",
  explorerBase: "https://stellar.expert/explorer/testnet",
} as const

/**
 * Asset entry. `token` is the underlying Soroban token (used for MarginController
 * asset args + SwapAdapter token_in); `vault` is the ReceiptVault (deposit/withdraw,
 * pToken balance, exchange rate). All current assets use 7 decimals.
 */
export interface StellarMarginAssetConfig {
  symbol: string
  /** Human label for the consumer UI (hides "mock-" mechanics). */
  label: string
  decimals: number
  /** Underlying Soroban token contract (C…). */
  token: string
  /** ReceiptVault contract (C…). */
  vault: string
  /** Empirically observed exchange rate (underlying per pToken, scaled 1e6). */
  exchangeRateHint: number
}

export const STELLAR_MARGIN_CONFIG = {
  network: STELLAR_MARGIN_NETWORK,

  contracts: {
    /** SimplePeridottroller — prices, market support, collateral factors. */
    simplePeridottroller: "CDMXPWG55776NECXQMWNBXMEQXZUAWA2AJBCQS7SU7SA64XHMO3KB3O6",
    /** MarginController V3 — collateral custody + perps open/close.
     *  Redeployed 2026-07 (Perps V3): open is the 3-step split flow
     *  (begin_open_position_v3 → swap_open_position_v3 → activate_open_position_v3;
     *  borrow + swap happen ON-CHAIN, never in the user's wallet). Close is
     *  close_position_v3 (on-chain swap back — no debt asset needed in the wallet).
     *  Both receipt vaults are wired to THIS controller; the old V2 controller
     *  (CAP4ULN6…) must not receive live margin actions anymore. */
    marginController: "CAKKHUGHP67UA4F42QOYPKNGRSBJEOE62MGDXA2UURTEYFOQGSMIRUFO",
    /** SwapAdapter V3 — Aquarius-routed swaps + quotes. */
    swapAdapter: "CBSTR53W52JHCRXW4I4QAL7FJJIT2D7MVFTNC3VJRNOPTIKCCZKDTKDL",
    /** Reflector (SEP-40) price oracle now backing the MarginController's
     *  open/close pricing. The frontend prices via the Binance proxy; this is
     *  recorded for parity with the on-chain deployment. */
    reflectorOracle: "CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63",
  },

  assets: {
    XLM: {
      symbol: "XLM",
      label: "XLM",
      decimals: 7,
      token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      vault: "CB32OVY4AADCHQT3DLKJYW5QVTWY5MOX7BBNZFT3SDHZ5HPSDDEA2THJ",
      exchangeRateHint: 1_000_000,
    },
    MOCK_USDT: {
      symbol: "mock-USDT",
      label: "USDT",
      decimals: 7,
      token: "CDPXNHHVSLX3HFAHV7XOISM23MZH36WSXTO45RNDOBIDFZBGTSOVD4OY",
      vault: "CCEW6NSPCV7XUEQV75ZMII5HK5DGXK5JP2QOTGLV4UFLDBPEKRGO4Y4B",
      exchangeRateHint: 1_000_019,
    },
  },

  aquarius: {
    router: "CBCFTQSPDBAIZ6R6PJQKSQWKNKWH2QIV3I4J72SHWBIK3ADRRAM5A6GD",
    /** 32-byte pool id as hex (BytesN<32>). */
    poolId: "9ac7a9cde23ac2ada11105eeaa42e43c2ea8332ca0aa8f41f58d7160274d718e",
    pool: "CCMNSENXDBNJSY72BDIPH5CCXLLHBKZ4LXTRKDLKZN4UI2NJFQLWTLD6",
    /** Fixed pool token order. Direction is controlled by `token_in`, never by
     *  reversing this list (spec §5). */
    tokenOrder: ["XLM", "MOCK_USDT"] as const,
  },

  /**
   * Protocol constants. There are no public getters for these on the current
   * deployment (verified: get_params / get_max_leverage don't exist on the V3
   * controller) — keep them in sync with the contract config.
   */
  constants: {
    /** Health-factor scale: 1_000_000 == 1.0. */
    HF_SCALE: BigInt(1_000_000),
    /** Minimum opening health factor enforced by the open flow: 1.1. */
    MIN_OPEN_HF: BigInt(1_100_000),
    /** V3 global max leverage. Deployed as 5; the admin can raise it later via
     *  `set_params` WITHOUT redeploying — bump this constant when that happens
     *  (there is no on-chain getter to read it from). */
    MAX_LEVERAGE: 5,
    /** Max slippage: 50_000 / 1_000_000 = 5%. */
    MAX_SLIPPAGE_SCALED: BigInt(50_000),
    SLIPPAGE_SCALE: BigInt(1_000_000),
    /** V3 perps risk config: maintenance margin 5% (liquidation when position
     *  value × (1 − MM) no longer covers debt) and 1% liquidation incentive.
     *  Drives the liquidation-price DISPLAY; `get_health_factor` stays the
     *  on-chain source of truth. */
    MAINTENANCE_MARGIN: 0.05,
    LIQUIDATION_INCENTIVE: 0.01,
    /** Testnet defaults; may change post-launch. */
    OPEN_FEE_BPS: BigInt(0),
    CLOSE_FEE_BPS: BigInt(0),
    /** Exchange-rate scale used by pToken ↔ underlying conversion. */
    EXCHANGE_SCALE: BigInt(1_000_000),
    /** Max simultaneously-open positions before the contract panics. */
    MAX_POSITIONS: 64,
    /** Pending opens expire 30 minutes after begin_open_position_v3. */
    PENDING_TTL_SECONDS: 30 * 60,
    /**
     * The testnet starting stack, in whole mock-USDT. ONE grant per account for
     * the lifetime of the account — enforced server-side in
     * `lib/margin/faucet-claim.ts`, not by the zero-balance check that used to
     * hand out a fresh 250 to anyone who had traded their stack away.
     *
     * Lives here because both sides need the same number: the client mints it,
     * the server records it.
     */
    FAUCET_GRANT_USDT: 250,
  },
} as const

export type StellarMarginConfig = typeof STELLAR_MARGIN_CONFIG
export type StellarMarginAssetKey = keyof StellarMarginConfig["assets"]

/**
 * V3 pool args for `begin_open_position_v3`: the two Aquarius pool tokens in the
 * pool's own order — currently `[XLM_TOKEN, USDT_TOKEN]`. The contract infers the
 * swap in/out index from `side`, so the frontend never passes indexes and NEVER
 * reverses this list for the reverse trade.
 */
export const POOL_TOKENS: readonly string[] = [
  STELLAR_MARGIN_CONFIG.assets.XLM.token,
  STELLAR_MARGIN_CONFIG.assets.MOCK_USDT.token,
]

/**
 * Side mapping for the XLM/mock-USDT pair (V3 doc "Amounts and Sides").
 *   margin_asset = MOCK_USDT.token, base_asset = XLM.token
 *
 * Short → debt XLM, swap XLM→USDT, position vault = USDT vault, final asset USDT.
 * Long  → debt USDT, swap USDT→XLM, position vault = XLM vault,  final asset XLM.
 *
 * The V3 contract infers the pool in/out index from `side`; the swapInIdx /
 * swapOutIdx here are only for the frontend's own `estimate_pool_swap` quotes.
 */
export type PositionSide = "Long" | "Short"

export const SIDE_MAPPING: Record<
  PositionSide,
  {
    debtAsset: StellarMarginAssetKey
    positionAsset: StellarMarginAssetKey
    /** SwapAdapter in/out pool indices for estimate_pool_swap. */
    swapInIdx: number
    swapOutIdx: number
  }
> = {
  Short: { debtAsset: "XLM", positionAsset: "MOCK_USDT", swapInIdx: 0, swapOutIdx: 1 },
  Long: { debtAsset: "MOCK_USDT", positionAsset: "XLM", swapInIdx: 1, swapOutIdx: 0 },
}

/** Underlying token → vault lookup (and the inverse), for mapping pending/position assets. */
export function assetByToken(token: string): StellarMarginAssetConfig | null {
  const a = STELLAR_MARGIN_CONFIG.assets
  if (token === a.XLM.token) return a.XLM
  if (token === a.MOCK_USDT.token) return a.MOCK_USDT
  return null
}

export function assetByVault(vault: string): StellarMarginAssetConfig | null {
  const a = STELLAR_MARGIN_CONFIG.assets
  if (vault === a.XLM.vault) return a.XLM
  if (vault === a.MOCK_USDT.vault) return a.MOCK_USDT
  return null
}
