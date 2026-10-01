/**
 * Compound Protocol Error Codes
 * These are common error codes returned by Compound V2 contracts
 */

export const COMPOUND_ERROR_CODES: Record<string, string> = {
  // Success
  '0x00000000': 'NO_ERROR - Transaction successful',
  
  // Math errors
  '0x91240a1b': 'MATH_ERROR - Mathematical calculation failed (likely insufficient balance or precision error)',
  '0x4e487b71': 'PANIC - Arithmetic overflow/underflow or division by zero',
  
  // Market errors  
  '0xa396f2c0': 'MARKET_NOT_LISTED - Market not listed in comptroller',
  '0xc4b8b428': 'MARKET_NOT_COLLATERAL - Asset not enabled as collateral',
  
  // Balance/liquidity errors
  '0x5c778fbc': 'INSUFFICIENT_BALANCE - Not enough balance to complete operation',
  '0x94fb5780': 'INSUFFICIENT_LIQUIDITY - Not enough liquidity to borrow',
  '0xc1426c21': 'INSUFFICIENT_SHORTFALL - Cannot liquidate healthy position',
  
  // Authorization errors
  '0x4e4dc4c0': 'UNAUTHORIZED - Not authorized to perform this action',
  '0xa11ce6b2': 'COMPTROLLER_REJECTION - Comptroller rejected the transaction',
  
  // Token errors
  '0xd92e233d': 'TOKEN_INSUFFICIENT_ALLOWANCE - Need to approve more tokens',
  '0xa9ba40c5': 'TOKEN_TRANSFER_FAILED - Token transfer failed',
  
  // Oracle errors  
  '0x8b6c4b73': 'PRICE_ERROR - Oracle price error or unavailable',
  
  // General errors
  '0x08c379a0': 'REVERT_WITH_MESSAGE - Transaction reverted with custom message',
}

/**
 * Decode a Compound error code to human readable message
 */
export function decodeCompoundError(errorCode: string): string {
  // Normalize the error code
  const normalizedCode = errorCode.toLowerCase().startsWith('0x') 
    ? errorCode.toLowerCase() 
    : `0x${errorCode.toLowerCase()}`
  
  return COMPOUND_ERROR_CODES[normalizedCode] || `Unknown error code: ${errorCode}`
}

/**
 * Extract error code from error message and decode it
 */
export function parseAndDecodeError(errorMessage: string): string {
  // Look for hex patterns in the error message
  const hexPattern = /0x[a-fA-F0-9]{8}/g
  const matches = errorMessage.match(hexPattern)
  
  if (matches && matches.length > 0) {
    const errorCode = matches[0]
    const decodedError = decodeCompoundError(errorCode)
    return `${decodedError}\n\nOriginal error: ${errorMessage}`
  }
  
  return errorMessage
} 