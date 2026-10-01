/**
 * Minimal inline ABIs for integration tests.
 * Using `as const` so viem infers argument and return types correctly.
 */

export const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const PTOKEN_ABI = [
  // Underlying ERC-20 token address for this pToken market.
  {
    inputs: [],
    name: 'underlying',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Mint (supply underlying → pTokens). Returns 0 on success.
  {
    inputs: [{ name: 'mintAmount', type: 'uint256' }],
    name: 'mint',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Borrow underlying from the pool. Returns 0 on success.
  {
    inputs: [{ name: 'borrowAmount', type: 'uint256' }],
    name: 'borrow',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Redeem pTokens → underlying. Returns 0 on success.
  {
    inputs: [{ name: 'redeemTokens', type: 'uint256' }],
    name: 'redeem',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Redeem a specific amount of underlying. Returns 0 on success.
  {
    inputs: [{ name: 'redeemAmount', type: 'uint256' }],
    name: 'redeemUnderlying',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Repay your own borrow. Returns 0 on success.
  {
    inputs: [{ name: 'repayAmount', type: 'uint256' }],
    name: 'repayBorrow',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // pToken balance of an account.
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Returns (error, pTokenBalance, borrowBalance, exchangeRateMantissa)
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'getAccountSnapshot',
    outputs: [
      { name: 'error', type: 'uint256' },
      { name: 'pTokenBalance', type: 'uint256' },
      { name: 'borrowBalance', type: 'uint256' },
      { name: 'exchangeRateMantissa', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // Stored borrow balance (no state mutation).
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'borrowBalanceStored',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const PERIDOTTROLLER_ABI = [
  // Enrol pTokens as collateral. Returns an array of error codes (0 = ok).
  {
    inputs: [{ name: 'pTokens', type: 'address[]' }],
    name: 'enterMarkets',
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Return the markets an account is currently entered in.
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'getAssetsIn',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Returns (error, liquidity, shortfall) for an account.
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'getAccountLiquidity',
    outputs: [
      { name: 'error', type: 'uint256' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'shortfall', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // Exit a market (remove pToken from collateral). Returns 0 on success.
  {
    inputs: [{ name: 'pTokenAddress', type: 'address' }],
    name: 'exitMarket',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

/**
 * Minimal ABI for WBNB (Wrapped BNB).
 * deposit() wraps native BNB → WBNB.
 */
export const WBNB_ABI = [
  {
    inputs: [],
    name: 'deposit',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
] as const

/**
 * Minimal ABI for the Peridot price oracle.
 * The oracle caches Chainlink prices; updateChainlinkPrices() is public and
 * refreshes the cache for the given underlying-asset addresses.
 */
export const ORACLE_ABI = [
  // Refresh Chainlink-cached prices for the given underlying asset addresses.
  {
    inputs: [{ name: 'assets', type: 'address[]' }],
    name: 'updateChainlinkPrices',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Returns true if the cached Chainlink price for the asset is past the stale threshold.
  {
    inputs: [{ name: 'asset', type: 'address' }],
    name: 'isPriceStale',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Returns the scaled price for a pToken's underlying (0 = not found / stale).
  {
    inputs: [{ name: 'pToken', type: 'address' }],
    name: 'getUnderlyingPrice',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const
