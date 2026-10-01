/**
 * Stellar Soroban lending transactions, signed via the Stellar signer registry
 * (`signStellarXdr`). External wallets (Freighter / Albedo / xBull / Lobstr /
 * Hot / Ledger / WalletConnect) go through Stellar Wallets Kit; Privy embedded
 * Stellar wallets go through `signRawHash` — selection is by address, handled
 * inside the registry. Targets the audited Stellar Soroban mainnet deployment.
 */
import { signStellarXdr } from "@/lib/stellar-signer"
import { stellarSorobanMainnetContracts } from "@/config/contracts"
import { getStellarRpcServer } from "@/lib/stellar-rpc"
import { stellarFetchPriceForSymbol } from "@/lib/stellar-pricing"
import { toBaseUnits } from "@/lib/token-units"

function activeContracts() {
  return stellarSorobanMainnetContracts
}

function getRpcUrl(): string {
  return stellarSorobanMainnetContracts.rpcUrl
}

function getNetworkPassphrase(): string {
  return stellarSorobanMainnetContracts.networkPassphrase
}

function isLikelyStellarAddress(value: string | null | undefined): value is string {
  if (typeof value !== "string") return false
  const v = value.trim()
  if (!v) return false
  return /^(G|C)[A-Z2-7]{55}$/.test(v)
}

/** Map assetId (from getStellarSorobanMarkets) to mainnet vault config. */
export function getStellarVaultConfig(assetId: string): {
  vaultId: string
  underlying: string
  decimals: number
  rateModel?: string
  /**
   * DeFindex vault the ReceiptVault forwards idle underlying into (strategy:
   * Blend autocompound). Present on boosted markets only — used to show how
   * much of the pool is deployed there rather than sitting in Peridot.
   */
  boostedVault?: string
} | null {
  const m = stellarSorobanMainnetContracts.markets
  if (assetId === "xlm-stellar") {
    return { vaultId: m.XLM.vaultId, underlying: m.XLM.underlying, decimals: m.XLM.decimals, rateModel: m.XLM.rateModel, boostedVault: (m.XLM as any).boostedVault }
  }
  if (assetId === "usdc-stellar") {
    return { vaultId: m.USDC.vaultId, underlying: m.USDC.underlying, decimals: m.USDC.decimals, rateModel: m.USDC.rateModel, boostedVault: (m.USDC as any).boostedVault }
  }
  if (assetId === "eurc-stellar") {
    return { vaultId: m.EURC.vaultId, underlying: m.EURC.underlying, decimals: m.EURC.decimals, rateModel: m.EURC.rateModel, boostedVault: (m.EURC as any).boostedVault }
  }
  return null
}

/**
 * Decimal string → contract base units, exactly (bigint, no float scaling).
 * Exported so the acceptance cases (10000 USDC → 100000000000 at 7 decimals)
 * are covered by tests.
 */
export function parseAmountToContractUnits(amount: string, decimals: number): string {
  const units = toBaseUnits(amount, decimals)
  return (units > BigInt(0) ? units : BigInt(0)).toString()
}

function formatContractUnitsToDecimal(raw: bigint, decimals: number): string {
  if (decimals <= 0) return raw.toString()
  const s = raw.toString()
  const padded = s.padStart(decimals + 1, "0")
  const integer = padded.slice(0, -decimals)
  const fraction = padded.slice(-decimals).replace(/0+$/, "")
  return fraction ? `${integer}.${fraction}` : integer
}

function normalizeStellarAddress(value: any): string | null {
  if (!value) return null
  if (typeof value === "string") return value
  if (typeof value === "object") {
    if ("address" in value && typeof value.address === "string") return value.address
    if ("value" in value && typeof value.value === "string") return value.value
    if (typeof value.toString === "function") {
      const s = value.toString()
      if (typeof s === "string" && s.length > 0 && s !== "[object Object]") return s
    }
  }
  return null
}

function hasUserEnteredVault(markets: readonly string[], vaultId: string): boolean {
  const target = vaultId.toLowerCase()
  return markets.some((m) => m.toLowerCase() === target)
}

function toBigIntString(value: any): string {
  if (typeof value === "bigint") return value.toString()
  if (typeof value === "number") return BigInt(Math.max(0, Math.floor(value))).toString()
  if (typeof value === "string") {
    try {
      return BigInt(value).toString()
    } catch {
      return "0"
    }
  }
  if (value && typeof value === "object") {
    if ("value" in value) return toBigIntString((value as any).value)
    if ("amount" in value) return toBigIntString((value as any).amount)
  }
  return "0"
}

function toSafeBigInt(value: string | number | bigint | null | undefined): bigint {
  try {
    if (typeof value === "bigint") return value
    if (typeof value === "number") return BigInt(Math.max(0, Math.floor(value)))
    if (typeof value === "string") return BigInt(value)
  } catch {}
  return BigInt(0)
}

function extractSubmitError(result: any, fallback = "Transaction failed"): string {
  try {
    const er = result?.errorResult
    if (er) {
      if (typeof er.toString === "function") {
        const s = er.toString()
        if (s && s !== "[object Object]") return `${fallback}: ${s}`
      }
      try {
        const s = JSON.stringify(er)
        if (s && s !== "{}") return `${fallback}: ${s}`
      } catch {}
    }
    if (result?.diagnosticEvents) {
      try {
        const s = JSON.stringify(result.diagnosticEvents)
        if (s && s !== "{}" && s !== "[]") return `${fallback}: ${s}`
      } catch {}
    }
  } catch {}
  return fallback
}

function extractLedgerError(result: any, fallback = "Transaction reverted on ledger"): string {
  try {
    const meta = result?.resultMetaXdr
    if (meta && typeof meta.toString === "function") {
      const s = meta.toString()
      if (s && s.length < 800 && s !== "[object Object]") return `${fallback}: ${s}`
    }
    const res = result?.resultXdr
    if (res && typeof res.toString === "function") {
      const s = res.toString()
      if (s && s !== "[object Object]") return `${fallback}: ${s}`
    }
  } catch {}
  return fallback
}

/**
 * Poll rpc.getTransaction(hash) until SUCCESS or FAILED (or timeout).
 * NOT_FOUND just means "not yet on-ledger" — keep polling.
 */
async function waitForTxSuccess(
  rpc: any,
  hash: string,
  { timeoutMs = 60_000, pollIntervalMs = 1500, label = "Transaction" }: {
    timeoutMs?: number
    pollIntervalMs?: number
    label?: string
  } = {}
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    let result: any
    try {
      result = await rpc.getTransaction(hash)
    } catch {
      await new Promise((r) => setTimeout(r, pollIntervalMs))
      continue
    }
    if (result?.status === "SUCCESS") return
    if (result?.status === "FAILED") {
      throw new Error(extractLedgerError(result, `${label} reverted on ledger`))
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs))
  }
  throw new Error(`${label} not confirmed within ${Math.round(timeoutMs / 1000)}s (hash: ${hash})`)
}

/**
 * Progress sink for the multi-step write paths.
 *
 * A first-time deposit is three separate signatures (enter market → approve →
 * deposit), each with its own wallet pop-up and on-ledger confirmation, so the
 * whole thing can run 30s+. Without a heartbeat the UI just sits on one frozen
 * "Supplying…" the entire time.
 *
 * The strings are matched by `busyPhaseLabel` (lib/tx/txCopy) to pick the
 * user-facing label, so they must keep the keywords it greps for — "confirm"
 * for the wallet pop-up, "submit" for the broadcast, "approv" for setup. The
 * raw text here is never shown as-is in consumer surfaces.
 */
export type StellarTxProgress = (message: string) => void

const PROGRESS = {
  confirm: "Waiting for you to confirm in your wallet",
  submit: "Submitting to the network",
} as const

async function submitAndConfirm(
  rpc: any,
  StellarSdk: typeof import("@stellar/stellar-sdk"),
  signedXdr: string,
  passphrase: string,
  label: string,
  onProgress?: StellarTxProgress
): Promise<string> {
  onProgress?.(PROGRESS.submit)
  const signed = StellarSdk.TransactionBuilder.fromXDR(signedXdr, passphrase)
  const result = await rpc.sendTransaction(signed)
  if (result.status === "ERROR") {
    throw new Error(extractSubmitError(result, `${label} rejected`))
  }
  if (result.status === "TRY_AGAIN_LATER") {
    throw new Error(`${label}: network is busy, please try again in a moment.`)
  }
  // PENDING or DUPLICATE — both are submitted; poll until on-ledger.
  await waitForTxSuccess(rpc, result.hash, { label })
  return result.hash
}

/**
 * Wait until the RPC has advanced past the ledger it is on right now.
 *
 * `getTransaction` reports SUCCESS as soon as a transaction is in a ledger, but the
 * RPC's SIMULATION snapshot can still be a ledger behind. Any follow-up transaction
 * built in that gap is simulated against the pre-transaction world, derives a
 * footprint for state that no longer exists, and traps when it applies — even though
 * nothing is wrong with the request. Call this between dependent Soroban writes.
 *
 * Unlike the margin path's `waitForLedgerBeyond`, the lending helpers only return a
 * hash, so this anchors on "now" instead of the transaction's own ledger. That is
 * slightly more conservative (it may wait one ledger longer) and never less.
 *
 * Best-effort and time-boxed: on timeout it returns rather than throwing, so the
 * caller still attempts the next step.
 */
export async function stellarWaitForLedgerAdvance(timeoutMs = 12_000): Promise<void> {
  const StellarSdk = await import("@stellar/stellar-sdk")
  const rpc = getStellarRpcServer(StellarSdk)
  let start: number
  try {
    start = Number((await rpc.getLatestLedger())?.sequence ?? 0)
  } catch {
    return
  }
  if (!start) return
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000))
    try {
      if (Number((await rpc.getLatestLedger())?.sequence ?? 0) > start) return
    } catch {
      /* transient — keep trying until the deadline */
    }
  }
}

async function buildSignAndSubmit(
  userAddress: string,
  buildTx: (StellarSdk: typeof import("@stellar/stellar-sdk"), account: any) => any,
  label = "Transaction",
  onProgress?: StellarTxProgress
): Promise<string> {
  const StellarSdk = await import("@stellar/stellar-sdk")
  const passphrase = getNetworkPassphrase()
  const rpc = getStellarRpcServer(StellarSdk)

  const rpcAccount = await rpc.getAccount(userAddress)
  const seq =
    typeof rpcAccount.sequenceNumber === "function"
      ? rpcAccount.sequenceNumber().toString()
      : String((rpcAccount as any).sequenceNumber ?? (rpcAccount as any).sequence ?? "0")
  const account = new StellarSdk.Account(userAddress, seq)

  const transaction = buildTx(StellarSdk, account)
  const prepared = await rpc.prepareTransaction(transaction)
  const xdr = prepared.toXDR()

  // Signer throws on cancel/failure — no `{error}` field to inspect.
  onProgress?.(PROGRESS.confirm)
  const { signedTxXdr } = await signStellarXdr(xdr, {
    networkPassphrase: passphrase,
    address: userAddress,
  })

  return submitAndConfirm(rpc, StellarSdk, signedTxXdr, passphrase, label, onProgress)
}

/** Deposit (supply) underlying tokens into vault. Requires approve + deposit. */
export async function stellarDeposit(
  userAddress: string,
  assetId: string,
  amount: string,
  onProgress?: StellarTxProgress
): Promise<string> {
  const config = getStellarVaultConfig(assetId)
  if (!config) throw new Error(`Unknown Stellar asset: ${assetId}`)

  const amountUnits = parseAmountToContractUnits(amount, config.decimals)
  if (amountUnits === "0") throw new Error("Amount must be greater than 0")
  // Deposits move the user's own funds in — verify the scale against the token
  // before three signatures go out.
  await assertConfiguredDecimals(config.underlying, config.decimals)

  const StellarSdk = await import("@stellar/stellar-sdk")
  const passphrase = getNetworkPassphrase()
  const rpc = getStellarRpcServer(StellarSdk)
  // 1. Enter market if needed
  try {
    const userMarkets = await stellarGetUserMarkets(userAddress)
    if (!hasUserEnteredVault(userMarkets, config.vaultId)) {
      onProgress?.("Approving market access")
      await stellarEnterMarket(userAddress, config.vaultId, onProgress)
    }
  } catch {
    onProgress?.("Approving market access")
    await stellarEnterMarket(userAddress, config.vaultId, onProgress)
  }

  // 2. Approve vault to spend underlying
  onProgress?.("Approving the vault to move your funds")
  const ledgerInfo = await rpc.getLatestLedger()
  const expiration = ledgerInfo.sequence + 1000
  const rpcAccount = await rpc.getAccount(userAddress)
  const seq =
    typeof rpcAccount.sequenceNumber === "function"
      ? rpcAccount.sequenceNumber().toString()
      : String(rpcAccount.sequenceNumber ?? "0")
  const account = new StellarSdk.Account(userAddress, seq)

  const tokenContract = new StellarSdk.Contract(config.underlying)
  const approveOp = tokenContract.call(
    "approve",
    StellarSdk.Address.fromString(userAddress).toScVal(),
    StellarSdk.Address.fromString(config.vaultId).toScVal(),
    StellarSdk.nativeToScVal(amountUnits, { type: "i128" }),
    StellarSdk.nativeToScVal(expiration, { type: "u32" })
  )
  const approveTx = new StellarSdk.TransactionBuilder(account, {
    fee: "10000",
    networkPassphrase: passphrase,
  })
    .addOperation(approveOp)
    .setTimeout(120)
    .build()
  const preparedApprove = await rpc.prepareTransaction(approveTx)
  onProgress?.(PROGRESS.confirm)
  const { signedTxXdr: approveSigned } = await signStellarXdr(
    preparedApprove.toXDR(),
    { networkPassphrase: passphrase, address: userAddress },
  )
  // Wait for approve to fully land on-ledger before building the deposit:
  // (1) sequence number must advance so the deposit doesn't collide;
  // (2) deposit's auth-tree simulation needs to see the new allowance.
  await submitAndConfirm(rpc, StellarSdk, approveSigned, passphrase, "Approve", onProgress)

  // 3. Deposit
  onProgress?.("Depositing into the market")
  return buildSignAndSubmit(userAddress, (Sdk, acc) => {
    const v = new Sdk.Contract(config.vaultId)
    const op = v.call(
      "deposit",
      Sdk.Address.fromString(userAddress).toScVal(),
      Sdk.nativeToScVal(amountUnits, { type: "u128" })
    )
    return new Sdk.TransactionBuilder(acc, { fee: "10000", networkPassphrase: getNetworkPassphrase() })
      .addOperation(op)
      .setTimeout(120)
      .build()
  }, "Deposit", onProgress)
}

/** Enter market (enable collateral) */
export async function stellarEnterMarket(
  userAddress: string,
  vaultId: string,
  onProgress?: StellarTxProgress
): Promise<string> {
  const controllerId = activeContracts().controller
  return buildSignAndSubmit(userAddress, (Sdk, acc) => {
    const c = new Sdk.Contract(controllerId)
    const marketSc = Sdk.Address.fromString(vaultId).toScAddress()
    const marketScVal = Sdk.xdr.ScVal.scvAddress(marketSc)
    const op = c.call("enter_market", Sdk.Address.fromString(userAddress).toScVal(), marketScVal)
    return new Sdk.TransactionBuilder(acc, { fee: "10000", networkPassphrase: getNetworkPassphrase() })
      .addOperation(op)
      .setTimeout(120)
      .build()
  }, "Enter market", onProgress)
}

/** Exit market (disable collateral) */
export async function stellarExitMarket(userAddress: string, vaultId: string): Promise<string> {
  const controllerId = activeContracts().controller
  return buildSignAndSubmit(userAddress, (Sdk, acc) => {
    const c = new Sdk.Contract(controllerId)
    const marketSc = Sdk.Address.fromString(vaultId).toScAddress()
    const marketScVal = Sdk.xdr.ScVal.scvAddress(marketSc)
    const op = c.call("exit_market", Sdk.Address.fromString(userAddress).toScVal(), marketScVal)
    return new Sdk.TransactionBuilder(acc, { fee: "10000", networkPassphrase: getNetworkPassphrase() })
      .addOperation(op)
      .setTimeout(120)
      .build()
  }, "Exit market")
}

/**
 * Withdraw (redeem) pTokens for underlying. `ptokenAmount` is expected to be
 * the symmetric counterpart of stellarConvertUnderlyingToPtokenAmount's output
 * (string formatted at 1e6 scale) — its raw value is what the vault stores,
 * not a "user-facing" pToken count.
 */
export async function stellarWithdraw(
  userAddress: string,
  assetId: string,
  ptokenAmount: string,
  onProgress?: StellarTxProgress
): Promise<string> {
  const config = getStellarVaultConfig(assetId)
  if (!config) throw new Error(`Unknown Stellar asset: ${assetId}`)
  const decimals = 6
  const amountUnits = parseAmountToContractUnits(ptokenAmount, decimals)
  if (amountUnits === "0") throw new Error("Amount must be greater than 0")

  return buildSignAndSubmit(userAddress, (Sdk, acc) => {
    const v = new Sdk.Contract(config.vaultId)
    const op = v.call(
      "withdraw",
      Sdk.Address.fromString(userAddress).toScVal(),
      Sdk.nativeToScVal(amountUnits, { type: "u128" })
    )
    return new Sdk.TransactionBuilder(acc, { fee: "10000", networkPassphrase: getNetworkPassphrase() })
      .addOperation(op)
      .setTimeout(120)
      .build()
  }, "Withdraw", onProgress)
}

/**
 * Withdraw the user's ENTIRE pToken position in a market, leaving a zero balance.
 *
 * The normal withdraw path converts a UI underlying amount → pToken via integer
 * division (stellarConvertUnderlyingToPtokenAmount), which rounds down and — together
 * with interest accruing between quote and execution — always leaves a few pToken
 * units of "dust" behind. Dust keeps the market funded (pbal > 0), which (a) blocks
 * exit_market ("Cannot exit with collateral in market") and (b) keeps the market in
 * the controller's liquidity loop, inflating the borrow-path compute cost.
 *
 * This helper instead reads the exact raw pToken balance and redeems precisely that,
 * so the on-chain withdraw burns the full position and pbal lands at exactly 0.
 */
export async function stellarWithdrawAll(
  userAddress: string,
  assetId: string,
  onProgress?: StellarTxProgress
): Promise<string> {
  const config = getStellarVaultConfig(assetId)
  if (!config) throw new Error(`Unknown Stellar asset: ${assetId}`)

  const rawStr = await stellarGetPtokenBalance(config.vaultId, userAddress)
  let raw: bigint
  try {
    raw = BigInt(rawStr)
  } catch {
    raw = BigInt(0)
  }
  if (raw <= BigInt(0)) throw new Error("Nothing to withdraw")

  // stellarWithdraw re-parses the pToken amount at PTOKEN_FORMAT_DECIMALS (6), so format
  // the exact raw balance back to that scale — the round-trip yields the same raw units,
  // i.e. the full position, with no underlying→pToken rounding dust.
  const ptokenAmount = formatContractUnitsToDecimal(raw, 6)
  return stellarWithdraw(userAddress, assetId, ptokenAmount, onProgress)
}

/** Get exchange rate (underlying per pToken), scaled by 1e6 */
export async function stellarGetExchangeRate(vaultId: string): Promise<string> {
  const StellarSdk = await import("@stellar/stellar-sdk")
  const rpc = getStellarRpcServer(StellarSdk)
  const raw = await queryContract(rpc, vaultId, "get_exchange_rate")
  if (raw == null) return "1000000"
  const n = typeof raw === "bigint" ? raw : BigInt(String(raw ?? "1000000"))
  return n.toString()
}

/**
 * Convert a UI underlying amount into the pToken raw amount that should be
 * passed to withdraw(user, ptoken_amount).
 *
 * Vault convention (verified empirically against all three mainnet vaults):
 *   underlying_raw = ptoken_raw × rate / 1e6   (raw-to-raw, decimal-agnostic)
 *
 * The vault's decimals() metadata reports 6, but that value does not enter
 * the conversion — the contract's accounting uses raw units directly. The
 * symmetric format/parse pair (PTOKEN_FORMAT_DECIMALS) is purely a string
 * round-trip with stellarWithdraw, which re-parses with the same scale.
 */
export async function stellarConvertUnderlyingToPtokenAmount(
  assetId: string,
  underlyingAmount: string
): Promise<string> {
  const config = getStellarVaultConfig(assetId)
  if (!config) throw new Error(`Unknown Stellar asset: ${assetId}`)

  const PTOKEN_FORMAT_DECIMALS = 6
  const EXCHANGE_SCALE = BigInt(1000000)
  const underlyingUnits = BigInt(parseAmountToContractUnits(underlyingAmount, config.decimals))
  if (underlyingUnits <= BigInt(0)) throw new Error("Amount must be greater than 0")

  const rateRaw = BigInt(await stellarGetExchangeRate(config.vaultId))
  if (rateRaw <= BigInt(0)) throw new Error("Invalid exchange rate")

  // ptoken_raw = underlying_raw × 1e6 / rate_raw
  const ptokenRaw = (underlyingUnits * EXCHANGE_SCALE) / rateRaw
  if (ptokenRaw <= BigInt(0)) throw new Error("Amount too small after conversion")
  return formatContractUnitsToDecimal(ptokenRaw, PTOKEN_FORMAT_DECIMALS)
}

/** Borrow underlying from vault */
export async function stellarBorrow(
  userAddress: string,
  assetId: string,
  amount: string,
  onProgress?: StellarTxProgress
): Promise<string> {
  const config = getStellarVaultConfig(assetId)
  if (!config) throw new Error(`Unknown Stellar asset: ${assetId}`)
  const amountUnits = parseAmountToContractUnits(amount, config.decimals)
  if (amountUnits === "0") throw new Error("Amount must be greater than 0")
  const requestedUnits = toSafeBigInt(amountUnits)

  try {
    const userMarkets = await stellarGetUserMarkets(userAddress)
    if (!hasUserEnteredVault(userMarkets, config.vaultId)) {
      onProgress?.("Approving market access")
      await stellarEnterMarket(userAddress, config.vaultId, onProgress)
    }
  } catch {
    onProgress?.("Approving market access")
    await stellarEnterMarket(userAddress, config.vaultId, onProgress)
  }

  // Budget guard: the controller's liquidity check iterates every funded market, and the
  // on-chain borrow traps (Soroban compute-budget exceeded) once too many markets carry a
  // balance simultaneously. Borrowing only fits when at most ONE *other* funded market
  // remains besides the one being borrowed. Detect this with cheap balance reads and fail
  // with a clear, actionable message instead of letting the user sign a doomed transaction
  // that reverts opaquely. (preview_borrow_max below would itself trap in this state.)
  let otherFundedCount: number | null = null
  try {
    const funded = await stellarGetFundedMarketVaultIds(userAddress)
    otherFundedCount = funded.filter((v) => v !== config.vaultId).length
  } catch {
    otherFundedCount = null // unknown — don't block; fall through to the checks below
  }
  if (otherFundedCount !== null && otherFundedCount > 1) {
    throw new Error(
      "Too many active markets to borrow. Withdraw your full balance from the markets you're not borrowing against, then try again."
    )
  }

  // Pre-validate borrow constraints so we fail with clear UX errors instead of opaque VM traps.
  const [previewMaxRaw, availableLiquidityRaw] = await Promise.all([
    stellarPreviewBorrowMax(userAddress, config.vaultId),
    stellarGetAvailableLiquidity(config.vaultId),
  ])
  const availableLiquidityUnits = toSafeBigInt(availableLiquidityRaw)

  // An unreadable limit is not a limit of zero. The controller's liquidity loop
  // traps on the compute budget once too many markets are entered, and telling
  // that user to "add collateral" sends them in exactly the wrong direction.
  if (previewMaxRaw === null) {
    throw new Error(await describeUnreadableBorrowLimit(userAddress))
  }
  const previewMaxUnits = toSafeBigInt(previewMaxRaw)

  if (previewMaxUnits <= 0n) {
    throw new Error("Borrow limit reached. Add collateral or repay debt before borrowing again.")
  }
  if (requestedUnits > previewMaxUnits) {
    const maxReadable = formatContractUnitsToDecimal(previewMaxUnits, config.decimals)
    throw new Error(`Borrow amount exceeds your available borrow power. Max borrowable now: ${maxReadable}.`)
  }
  if (requestedUnits > availableLiquidityUnits) {
    const liqReadable = formatContractUnitsToDecimal(availableLiquidityUnits, config.decimals)
    throw new Error(`Market has insufficient available liquidity. Available now: ${liqReadable}.`)
  }

  onProgress?.("Sending your money")
  return buildSignAndSubmit(userAddress, (Sdk, acc) => {
    const v = new Sdk.Contract(config.vaultId)
    const op = v.call(
      "borrow",
      Sdk.Address.fromString(userAddress).toScVal(),
      Sdk.nativeToScVal(amountUnits, { type: "u128" })
    )
    return new Sdk.TransactionBuilder(acc, { fee: "10000", networkPassphrase: getNetworkPassphrase() })
      .addOperation(op)
      .setTimeout(120)
      .build()
  }, "Borrow", onProgress)
}

/** Repay borrowed underlying */
export async function stellarRepay(
  userAddress: string,
  assetId: string,
  amount: string,
  onProgress?: StellarTxProgress
): Promise<string> {
  const config = getStellarVaultConfig(assetId)
  if (!config) throw new Error(`Unknown Stellar asset: ${assetId}`)
  const amountUnits = parseAmountToContractUnits(amount, config.decimals)
  if (amountUnits === "0") throw new Error("Amount must be greater than 0")

  return buildSignAndSubmit(userAddress, (Sdk, acc) => {
    const v = new Sdk.Contract(config.vaultId)
    const op = v.call(
      "repay",
      Sdk.Address.fromString(userAddress).toScVal(),
      Sdk.nativeToScVal(amountUnits, { type: "u128" })
    )
    return new Sdk.TransactionBuilder(acc, { fee: "10000", networkPassphrase: getNetworkPassphrase() })
      .addOperation(op)
      .setTimeout(120)
      .build()
  }, "Repay", onProgress)
}

/**
 * Transfer a Stellar asset to another account.
 *
 * Uses the Stellar Asset Contract `transfer(from, to, amount)` Soroban call, so the
 * exact same path works for native XLM and issued tokens (USDC, EURC). The recipient
 * must be a regular Stellar account address (`G…`); contract addresses (`C…`) are
 * rejected. Signed via Freighter.
 *
 * @param userAddress     Sender's Stellar account (`G…`).
 * @param tokenContractId The asset's Stellar Asset Contract id (`C…`).
 * @param decimals        Asset decimals (7 for XLM/USDC/EURC on Stellar).
 * @param amount          Human-readable amount, e.g. "12.5".
 * @param recipient       Destination account (`G…`).
 * @returns The confirmed transaction hash.
 */
export async function stellarSendToken(
  userAddress: string,
  tokenContractId: string,
  decimals: number,
  amount: string,
  recipient: string
): Promise<string> {
  if (!isLikelyStellarAddress(userAddress)) throw new Error("Invalid sender address")
  if (!isLikelyStellarAddress(tokenContractId)) throw new Error("Invalid token contract")
  const to = (recipient || "").trim()
  if (!/^G[A-Z2-7]{55}$/.test(to)) {
    throw new Error("Recipient must be a valid Stellar account address (G…)")
  }
  if (to === userAddress.trim()) {
    throw new Error("Sender and recipient are the same account")
  }

  const amountUnits = parseAmountToContractUnits(amount, decimals)
  if (amountUnits === "0") throw new Error("Amount must be greater than 0")

  return buildSignAndSubmit(
    userAddress,
    (Sdk, acc) => {
      const token = new Sdk.Contract(tokenContractId)
      const op = token.call(
        "transfer",
        Sdk.Address.fromString(userAddress).toScVal(),
        Sdk.Address.fromString(to).toScVal(),
        Sdk.nativeToScVal(amountUnits, { type: "i128" })
      )
      return new Sdk.TransactionBuilder(acc, { fee: "10000", networkPassphrase: getNetworkPassphrase() })
        .addOperation(op)
        .setTimeout(120)
        .build()
    },
    "Send"
  )
}

/** Query contract (read-only) - for balances, etc. */
/**
 * Reads in flight, so the same question asked twice at the same moment costs
 * one request. The market and portfolio hooks each fan out across all three
 * markets and several of them want the same exchange rate or price, which used
 * to mean the same simulation ran two or three times over.
 *
 * Coalescing only, never a cache: an entry is dropped the moment it settles,
 * so a caller that starts after the previous one finished still reads the
 * chain. Nothing here can serve a stale balance.
 */
const readsInFlight = new Map<string, Promise<any>>()

async function queryContract(
  rpc: { simulateTransaction: (tx: any) => Promise<any> },
  contractId: string,
  method: string,
  ...args: (string | number)[]
): Promise<any> {
  const key = `${contractId}|${method}|${args.join(",")}`
  const pending = readsInFlight.get(key)
  if (pending) return pending

  const run = simulateRead(rpc, contractId, method, ...args)
  readsInFlight.set(key, run)
  try {
    return await run
  } finally {
    readsInFlight.delete(key)
  }
}

async function simulateRead(
  rpc: { simulateTransaction: (tx: any) => Promise<any> },
  contractId: string,
  method: string,
  ...args: (string | number)[]
): Promise<any> {
  const StellarSdk = await import("@stellar/stellar-sdk")
  const dummy = new StellarSdk.Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0")
  const contract = new StellarSdk.Contract(contractId)
  const scArgs = args.map((a) =>
    typeof a === "string" && (a.startsWith("G") || a.startsWith("C"))
      ? StellarSdk.Address.fromString(a).toScVal()
      : StellarSdk.nativeToScVal(a, { type: "u128" })
  )
  const op = contract.call(method, ...scArgs)
  const tx = new StellarSdk.TransactionBuilder(dummy, { fee: "10000", networkPassphrase: getNetworkPassphrase() })
    .addOperation(op)
    .setTimeout(120)
    .build()
  // One simulation, not two. `prepareTransaction` IS a simulation: it runs
  // one and assembles the result into a transaction we then threw away by
  // simulating it again. Every read in the app cost two round-trips against a
  // shared public endpoint for a return value the first one already carried.
  const sim = await rpc.simulateTransaction(tx)
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    // Same signal `prepareTransaction` gave: the contract refused, and callers
    // (borrow-limit reads especially) distinguish that from "answered null".
    throw new Error(sim.error)
  }
  if (!StellarSdk.rpc.Api.isSimulationSuccess(sim)) return null
  const retval = sim.result?.retval
  if (!retval) return null
  return StellarSdk.scValToNative(retval)
}

/**
 * Read a token contract's own `decimals()`. Returns null when the call fails —
 * callers treat that as "no contradiction", never as a value.
 */
export async function stellarGetTokenDecimals(tokenId: string): Promise<number | null> {
  if (!isLikelyStellarAddress(tokenId)) return null
  try {
    const StellarSdk = await import("@stellar/stellar-sdk")
    const rpc = getStellarRpcServer(StellarSdk)
    const raw = await queryContract(rpc, tokenId, "decimals")
    if (raw == null) return null
    const n = Number(typeof raw === "bigint" ? raw.toString() : raw)
    return Number.isFinite(n) && n >= 0 && n <= 38 ? n : null
  } catch {
    return null
  }
}

/**
 * Guard the amount scaling against the token itself. A wrong `decimals` in
 * config silently sends a 1000×-off amount, so refuse rather than sign.
 */
async function assertConfiguredDecimals(tokenId: string, configured: number): Promise<void> {
  const onChain = await stellarGetTokenDecimals(tokenId)
  if (onChain != null && onChain !== configured) {
    throw new Error(
      `Token decimals mismatch: contract reports ${onChain}, app is configured for ${configured}. ` +
        `Refusing to submit a mis-scaled amount.`
    )
  }
}

/** Get user-entered markets (enabled collateral vault IDs) from controller. */
export async function stellarGetUserMarkets(userAddress: string): Promise<string[]> {
  if (!isLikelyStellarAddress(userAddress)) return []
  try {
    const StellarSdk = await import("@stellar/stellar-sdk")
    const rpc = getStellarRpcServer(StellarSdk)
    const controllerId = activeContracts().controller
    const raw = await queryContract(rpc, controllerId, "get_user_markets", userAddress)
    const values: any[] =
      Array.isArray(raw) ? raw : Array.isArray(raw?.value) ? raw.value : Array.isArray(raw?.values) ? raw.values : []
    return values
      .map((v) => normalizeStellarAddress(v))
      .filter((v): v is string => Boolean(v))
  } catch {
    return []
  }
}

/**
 * Vault IDs in which the user currently holds a non-zero position (pToken collateral
 * or an outstanding borrow). The controller's liquidity computation iterates exactly
 * these markets, and its compute cost grows with their count — the on-chain borrow
 * transaction exceeds Soroban's per-transaction budget once too many markets are
 * funded at once. Cheap to read (per-market balance lookups, no liquidity loop).
 */
export async function stellarGetFundedMarketVaultIds(userAddress: string): Promise<string[]> {
  if (!isLikelyStellarAddress(userAddress)) return []
  const vaultIds = Object.values(activeContracts().markets).map((m) => m.vaultId)
  const funded: string[] = []
  await Promise.all(
    vaultIds.map(async (vaultId) => {
      try {
        const [pbal, debt] = await Promise.all([
          stellarGetPtokenBalance(vaultId, userAddress),
          stellarGetBorrowBalance(vaultId, userAddress),
        ])
        if (toSafeBigInt(pbal) > 0n || toSafeBigInt(debt) > 0n) funded.push(vaultId)
      } catch {
        /* skip unreadable market */
      }
    })
  )
  return funded
}

/** Preview max additional borrow (underlying units) for a user in a market. */
/**
 * Entered markets a user can hold before the controller's liquidity loop no
 * longer fits in a Soroban transaction.
 *
 * Measured against the mainnet controller (2026-09-04, `preview_borrow_max`):
 *   1 entered market  ~62M instructions
 *   2 entered markets ~84M
 *   3 entered markets ~107M  → Error(Budget, ExceededLimit)
 * against a 100M per-transaction cap. The driver is the number of markets the
 * user has ENTERED (`get_user_markets`), not the number they hold a balance in:
 * a market entered once and emptied later still costs its full pass.
 */
export const STELLAR_MAX_ENTERED_MARKETS_FOR_BORROW = 2

/**
 * Why the borrow limit could not be read, in words a user can act on.
 *
 * Cheap follow-up read (`get_user_markets` is a plain storage lookup, not the
 * liquidity loop), and only ever runs on the failure path.
 */
export async function describeUnreadableBorrowLimit(userAddress: string): Promise<string> {
  const entered = await stellarGetUserMarkets(userAddress)
  if (entered.length > STELLAR_MAX_ENTERED_MARKETS_FOR_BORROW) {
    return (
      `Your account is active in ${entered.length} markets, which is more than ` +
      "the network can price in one go. Leave the markets you no longer hold " +
      "anything in, then borrow again."
    )
  }
  return "We could not read your borrow limit just now. Please try again in a moment."
}

/**
 * Controller's max borrowable amount, or **null when it could not be read**.
 *
 * The null matters: this call traps with Error(Budget, ExceededLimit) once the
 * user has entered three markets, and it used to answer that with "0". The
 * whole borrow UI then told a user with $540 of collateral that they could
 * borrow $0 — a computation that failed, rendered as a fact. Callers must treat
 * null as "unknown" and say so, never as "none". Zero is only ever returned
 * when the contract itself said zero.
 */
export async function stellarPreviewBorrowMax(
  userAddress: string,
  vaultId: string,
): Promise<string | null> {
  if (!isLikelyStellarAddress(userAddress) || !isLikelyStellarAddress(vaultId)) return null
  try {
    const StellarSdk = await import("@stellar/stellar-sdk")
    const rpc = getStellarRpcServer(StellarSdk)
    const controllerId = activeContracts().controller
    const raw = await queryContract(rpc, controllerId, "preview_borrow_max", userAddress, vaultId)
    if (raw == null) return null
    return toBigIntString(raw)
  } catch {
    return null
  }
}

/** Get market available liquidity from vault (underlying units). */
export async function stellarGetAvailableLiquidity(vaultId: string): Promise<string> {
  if (!isLikelyStellarAddress(vaultId)) return "0"
  try {
    const StellarSdk = await import("@stellar/stellar-sdk")
    const rpc = getStellarRpcServer(StellarSdk)
    const raw = await queryContract(rpc, vaultId, "get_available_liquidity")
    return toBigIntString(raw)
  } catch {
    return "0"
  }
}

/**
 * Get the live borrow APR (in percent, e.g. 1.25) from a market's jump-rate
 * model at the given pool state. The model returns a yearly rate scaled by
 * 1e6, so 10_000 → 1%. Returns null when the model can't be read — callers
 * should fall back to indexer data rather than showing 0.
 */
export async function stellarGetBorrowAprPct(
  rateModelId: string,
  cashRaw: bigint,
  borrowsRaw: bigint
): Promise<number | null> {
  if (!isLikelyStellarAddress(rateModelId)) return null
  try {
    const StellarSdk = await import("@stellar/stellar-sdk")
    const rpc = getStellarRpcServer(StellarSdk)
    const raw = await queryContract(
      rpc,
      rateModelId,
      "get_borrow_rate",
      cashRaw.toString(),
      borrowsRaw.toString(),
      "0"
    )
    if (raw == null) return null
    return Number(BigInt(raw)) / 10_000
  } catch {
    return null
  }
}

/** Get total borrowed amount for a vault (underlying units). */
export async function stellarGetTotalBorrowed(vaultId: string): Promise<string> {
  if (!isLikelyStellarAddress(vaultId)) return "0"
  try {
    const StellarSdk = await import("@stellar/stellar-sdk")
    const rpc = getStellarRpcServer(StellarSdk)
    const raw = await queryContract(rpc, vaultId, "get_total_borrowed")
    return toBigIntString(raw)
  } catch {
    return "0"
  }
}

/**
 * Get portfolio totals from controller.
 * Returns discounted collateral USD and borrow USD as raw integers (contract scale).
 */
export async function stellarGetPortfolioTotals(userAddress: string): Promise<{
  collateralUsdRaw: string
  borrowUsdRaw: string
}> {
  if (!isLikelyStellarAddress(userAddress)) {
    return { collateralUsdRaw: "0", borrowUsdRaw: "0" }
  }
  try {
    const StellarSdk = await import("@stellar/stellar-sdk")
    const rpc = getStellarRpcServer(StellarSdk)
    const controllerId = activeContracts().controller
    const raw = await queryContract(rpc, controllerId, "portfolio", userAddress)
    // Expected shape: [rows, [collateral_usd, borrow_usd]]
    const totalsCandidate = Array.isArray(raw) ? raw[1] : (raw as any)?.totals
    const collateralRaw = Array.isArray(totalsCandidate)
      ? totalsCandidate[0]
      : (totalsCandidate as any)?.collateral_usd ?? (totalsCandidate as any)?.collateral ?? 0
    const borrowRaw = Array.isArray(totalsCandidate)
      ? totalsCandidate[1]
      : (totalsCandidate as any)?.borrow_usd ?? (totalsCandidate as any)?.borrow ?? 0
    return {
      collateralUsdRaw: toBigIntString(collateralRaw),
      borrowUsdRaw: toBigIntString(borrowRaw),
    }
  } catch {
    return { collateralUsdRaw: "0", borrowUsdRaw: "0" }
  }
}

/** Get raw pToken balance (vault token units, 6 decimals) */
export async function stellarGetPtokenBalance(
  vaultId: string,
  userAddress: string
): Promise<string> {
  if (!isLikelyStellarAddress(vaultId) || !isLikelyStellarAddress(userAddress)) return "0"
  const StellarSdk = await import("@stellar/stellar-sdk")
  const rpc = getStellarRpcServer(StellarSdk)
  const raw = await queryContract(rpc, vaultId, "get_ptoken_balance", userAddress)
  if (raw == null) return "0"
  const n = typeof raw === "bigint" ? raw : BigInt(String(raw ?? "0"))
  return n.toString()
}

/** Get user borrow balance */
export async function stellarGetBorrowBalance(
  vaultId: string,
  userAddress: string
): Promise<string> {
  if (!isLikelyStellarAddress(vaultId) || !isLikelyStellarAddress(userAddress)) return "0"
  const StellarSdk = await import("@stellar/stellar-sdk")
  const rpc = getStellarRpcServer(StellarSdk)
  const raw = await queryContract(rpc, vaultId, "get_user_borrow_balance", userAddress)
  if (raw == null) return "0"
  const n = typeof raw === "bigint" ? raw : BigInt(String(raw ?? "0"))
  return n.toString()
}

/** Get native XLM balance from Horizon (for xlm-stellar supply UX) */
export async function stellarGetNativeXlmBalance(address: string): Promise<string> {
  if (!isLikelyStellarAddress(address)) return "0"
  try {
    const horizonUrl = "https://horizon.stellar.org"
    const res = await fetch(`${horizonUrl}/accounts/${address}`)
    if (!res.ok) return "0"
    const data = await res.json()
    const native = data.balances?.find((b: any) => b.asset_type === "native")
    if (!native) return "0"
    const xlm = parseFloat(native.balance)
    return String(Math.floor(xlm * 1e7))
  } catch {
    return "0"
  }
}

/**
 * Native XLM account balance from Horizon, split into the total balance and the
 * conservatively *spendable* amount.
 *
 * Every Stellar account must keep a minimum XLM reserve on-ledger:
 *   reserve = (2 + subentry_count + num_sponsoring − num_sponsored) × 0.5 XLM
 * Sending into that reserve fails, so `spendableRaw` deducts the reserve plus a
 * small fee buffer. Both values are 7-decimal raw units (1 XLM = 1e7).
 */
export async function stellarGetXlmAccount(
  address: string
): Promise<{ totalRaw: string; spendableRaw: string }> {
  const empty = { totalRaw: "0", spendableRaw: "0" }
  if (!isLikelyStellarAddress(address)) return empty
  try {
    const res = await fetch(`https://horizon.stellar.org/accounts/${address}`)
    if (!res.ok) return empty
    const data = await res.json()
    const native = data.balances?.find((b: any) => b.asset_type === "native")
    if (!native) return empty

    const totalRaw = BigInt(Math.floor(parseFloat(native.balance) * 1e7))
    const reserveEntries =
      2 +
      Number(data.subentry_count ?? 0) +
      Number(data.num_sponsoring ?? 0) -
      Number(data.num_sponsored ?? 0)
    const reserveRaw = BigInt(Math.max(0, reserveEntries)) * BigInt(5_000_000) // 0.5 XLM
    const feeBufferRaw = BigInt(1_000_000) // 0.1 XLM headroom for transaction fees

    let spendable = totalRaw - reserveRaw - feeBufferRaw
    if (spendable < BigInt(0)) spendable = BigInt(0)
    return { totalRaw: totalRaw.toString(), spendableRaw: spendable.toString() }
  } catch {
    return empty
  }
}

/** Map assetId to Reflector oracle symbol. */
function assetIdToOracleSymbol(assetId: string): string | null {
  if (assetId === "xlm-stellar") return "XLM"
  if (assetId === "usdc-stellar") return "USDC"
  if (assetId === "eurc-stellar") return "EURC"
  return null
}

/**
 * Live oracle price for one of our Stellar assets.
 *
 * Delegates to `lib/stellar-pricing.ts`, which is the same read against the
 * same mainnet oracle. This file used to carry a second copy of it, so the two
 * callers never shared the coalescing or the cached oracle `decimals()` and
 * every price cost four simulations instead of one.
 */
export async function stellarFetchPrice(assetId: string): Promise<number | null> {
  const symbol = assetIdToOracleSymbol(assetId)
  if (!symbol) return null
  return stellarFetchPriceForSymbol(symbol)
}

/** Get underlying token balance for an address (wallet balance) */
export async function stellarGetTokenBalance(
  tokenAddress: string,
  ownerAddress: string
): Promise<string> {
  if (!isLikelyStellarAddress(tokenAddress) || !isLikelyStellarAddress(ownerAddress)) return "0"
  try {
    const StellarSdk = await import("@stellar/stellar-sdk")
    const rpc = getStellarRpcServer(StellarSdk)
    const dummy = new StellarSdk.Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0")
    const contract = new StellarSdk.Contract(tokenAddress)
    const op = contract.call("balance", StellarSdk.Address.fromString(ownerAddress).toScVal())
    const tx = new StellarSdk.TransactionBuilder(dummy, { fee: "10000", networkPassphrase: getNetworkPassphrase() })
      .addOperation(op)
      .setTimeout(120)
      .build()
    // One simulation: `prepareTransaction` runs one and the response already
    // carries the return value we want.
    const sim = await rpc.simulateTransaction(tx)
    if (!StellarSdk.rpc.Api.isSimulationSuccess(sim)) return "0"
    const retval = sim.result?.retval
    if (!retval) return "0"
    const native = StellarSdk.scValToNative(retval)
    const n = typeof native === "bigint" ? native : BigInt(String(native ?? "0"))
    return n.toString()
  } catch {
    return "0"
  }
}
