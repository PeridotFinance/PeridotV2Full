import type { Address } from 'viem'
import type { ExecutionMode } from '../biconomy/constants'

export type CrossChainExecutionStatus = 'pending' | 'executed' | 'failed' | 'unknown'

export interface StartSupplyParams {
  userAddress: Address
  /** EOA that controls the smart account (used for signing when executionMode is 'smart-account') */
  signerAddress?: Address
  /** Wagmi WalletClient passed from the React layer for Privy connector signing */
  signingClient?: any
  smartAccountAddress?: Address
  sourceChainId: number
  sourceTokenAddress: Address
  destinationChainId: number
  pTokenAddress: Address
  amountWei: bigint
  enableAsCollateral?: boolean
  returnPTokensToUser?: boolean
  slippage?: number
  // Cross-chain only: after supply completes, run a gas-sponsored delegated enable-collateral
  postEnableAsCollateral?: boolean
  // Optional EIP-7702 authorization payload for delegated execution (if available)
  meeAuthorization?: any
  // Execution mode for Biconomy orchestration (EOA, smart account, or EIP-7702 delegated)
  executionMode?: ExecutionMode
}

export interface StartSupplyResult {
  superTxHash: string
  trackingUrl?: string
  fee?: any
  feeDetails?: {
    amount?: string
    token?: string
    chainId?: number
    paymentToken?: string
    paymentTokenWeiAmount?: string
    paymentTokenValue?: string
  }
  meeScanLink?: string
}

export interface StartWithdrawParams {
  userAddress: Address
  smartAccountAddress?: Address
  // BSC pToken (market) to redeem from
  withdrawMarket: Address
  // One of these must be provided
  withdrawAmount?: bigint // underlying amount to withdraw on BSC
  pTokenAmount?: bigint // pToken amount to redeem on BSC
  // Optional cross-chain bridging target
  targetChainId?: number
  targetTokenAddress?: Address
  slippage?: number
  // Optional EIP-7702 authorization payload for delegated execution (if available)
  meeAuthorization?: any
}

export interface StartWithdrawResult {
  superTxHash: string
  trackingUrl?: string
  fee?: any
  feeDetails?: {
    amount?: string
    token?: string
    chainId?: number
    paymentToken?: string
    paymentTokenWeiAmount?: string
    paymentTokenValue?: string
  }
  meeScanLink?: string
}

export interface StartBorrowParams {
  userAddress: Address
  smartAccountAddress?: Address
  destinationChainId: number
  pTokenAddress: Address
  amountWei: bigint
  // Optional set of collateral markets to ensure they are enabled before borrow
  collateralMarkets?: readonly Address[]
  // Optional cross-chain bridging target
  targetChainId?: number
  targetTokenAddress?: Address
  // Optional slippage for bridge leg (defaults handled by adapter)
  slippage?: number
  // Optional EIP-7702 authorization payload for delegated execution (if available)
  meeAuthorization?: any[]
  // Whether to request Biconomy sponsorship (gasless). Defaults to true.
  sponsorship?: boolean
  // Amount (in wei) of the underlying token to fund the orchestrator with up-front.
  // Defaults to 0 for borrow flows so that the borrowed amount supplies liquidity.
  initialFundingAmountWei?: bigint
  // Optional override for the fee token (defaults to the underlying on BSC)
  feeTokenOverride?: { address: Address; chainId: number }
  // Optional cap on how much the trigger is allowed to pull from the EOA wallet
  triggerMaxAmountWei?: bigint
  // Execution mode for Biconomy orchestration (EOA, smart account, or EIP-7702 delegated)
  executionMode?: ExecutionMode
}

export interface StartBorrowResult {
  superTxHash: string
  trackingUrl?: string
  fee?: any
  feeDetails?: {
    amount?: string
    token?: string
    chainId?: number
    paymentToken?: string
    paymentTokenWeiAmount?: string
    paymentTokenValue?: string
  }
  meeScanLink?: string
  // Amount actually borrowed on-chain (can differ if adapter needs fee buffer)
  executedBorrowWei?: bigint
  // Estimated amount deliverable after Biconomy fee (purely informative)
  expectedNetWei?: bigint
  fundingMode?: 'sponsored' | 'fallback'
  meeAuthorization?: any[]
}

export interface StartRepayParams {
  userAddress: Address
  smartAccountAddress?: Address
  destinationChainId: number
  pTokenAddress: Address
  amountWei: bigint
  // If true, keep repay amount fixed and require extra balance for fee (no netting)
  repayMax?: boolean
  // Optional cross-chain bridging target
  targetChainId?: number
  targetTokenAddress?: Address
  // Optional slippage for bridge leg (defaults handled by adapter)
  slippage?: number
  // Optional EIP-7702 authorization payload for delegated execution (if available)
  meeAuthorization?: any
  // Whether to request Biconomy sponsorship (gasless). Defaults to true.
  sponsorship?: boolean
  // Optional initial funding amount if needed by the route
  initialFundingAmountWei?: bigint
  // Optional override for the fee token (defaults to the underlying on BSC)
  feeTokenOverride?: { address: Address; chainId: number }
  // Optional cap on how much the trigger is allowed to pull from the EOA wallet
  triggerMaxAmountWei?: bigint
  // Execution mode for Biconomy orchestration (EOA, smart account, or EIP-7702 delegated)
  executionMode?: ExecutionMode
}

export interface StartRepayResult {
  superTxHash: string
  trackingUrl?: string
  fee?: any
  feeDetails?: {
    amount?: string
    token?: string
    chainId?: number
    paymentToken?: string
    paymentTokenWeiAmount?: string
    paymentTokenValue?: string
  }
  meeScanLink?: string
  executedRepayWei?: bigint
  fundingMode?: 'sponsored' | 'fallback'
}

export interface PreQuoteParams {
  userAddress: Address
  smartAccountAddress?: Address
  sourceChainId: number
  sourceTokenAddress: Address
  pTokenAddressOnBsc: Address
  amountWei: bigint
  slippage?: number
}

export interface PreQuoteResult {
  fee?: any
  feeDetails?: {
    amount?: string
    token?: string
    chainId?: number
    paymentToken?: string
    paymentTokenWeiAmount?: string
    paymentTokenValue?: string
  }
}

export interface GetStatusParams {
  superTxHash: string
}

export interface GetStatusResult {
  status: CrossChainExecutionStatus
  bscTxHash?: `0x${string}`
  explorerLinks?: string[]
}

export interface CrossChainAdapter {
  startSupply(params: StartSupplyParams): Promise<StartSupplyResult>
  startWithdraw?(params: StartWithdrawParams): Promise<StartWithdrawResult>
  startBorrow?(params: StartBorrowParams): Promise<StartBorrowResult>
  startRepay?(params: StartRepayParams): Promise<StartRepayResult>
  getStatus(params: GetStatusParams): Promise<GetStatusResult>
  preQuote?(params: PreQuoteParams): Promise<PreQuoteResult>
}
