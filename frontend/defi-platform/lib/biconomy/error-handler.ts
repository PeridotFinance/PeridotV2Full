/**
 * Error handling utilities for Biconomy operations
 * Provides user-friendly error messages and error categorization
 */

export interface BiconomyError {
  code?: number | string;
  message: string;
  originalError?: unknown;
  category: ErrorCategory;
  recoverable: boolean;
  userMessage: string;
  suggestions?: string[];
}

export type ErrorCategory =
  | 'validation'
  | 'api'
  | 'network'
  | 'user_rejection'
  | 'insufficient_balance'
  | 'insufficient_liquidity'
  | 'route_not_found'
  | 'amount_too_small'
  | 'rate_limit'
  | 'timeout'
  | 'unknown';

/**
 * Parse and categorize Biconomy API errors
 */
export function parseBiconomyError(error: unknown): BiconomyError {
  const errorStr = error instanceof Error ? error.message : String(error);
  const errorObj = error instanceof Error ? error : null;

  // Try to parse JSON error response
  let parsedError: any = null;
  try {
    if (typeof errorStr === 'string' && errorStr.startsWith('{')) {
      parsedError = JSON.parse(errorStr);
    } else if (errorObj && 'response' in errorObj) {
      const response = (errorObj as any).response;
      if (typeof response === 'string') {
        parsedError = JSON.parse(response);
      }
    }
  } catch {
    // Not JSON, continue with string parsing
  }

  const apiMessage = parsedError?.message || errorStr;
  const apiCode = parsedError?.code || parsedError?.status;

  // Check for specific error patterns
  if (/User rejected|User denied|rejected the request/i.test(errorStr)) {
    return {
      code: apiCode,
      message: errorStr,
      originalError: error,
      category: 'user_rejection',
      recoverable: true,
      userMessage: 'Transaction was rejected. Please try again when ready.',
      suggestions: ['Check your wallet and try again'],
    };
  }

  if (/insufficient balance|insufficient funds|balance too low/i.test(apiMessage)) {
    return {
      code: apiCode,
      message: errorStr,
      originalError: error,
      category: 'insufficient_balance',
      recoverable: false,
      userMessage: 'Insufficient balance to complete this transaction.',
      suggestions: ['Check your wallet balance', 'Reduce the amount'],
    };
  }

  if (/insufficient liquidity|not enough liquidity/i.test(apiMessage)) {
    return {
      code: apiCode,
      message: errorStr,
      originalError: error,
      category: 'insufficient_liquidity',
      recoverable: true,
      userMessage: 'Not enough liquidity available. Please try again later or with a smaller amount.',
      suggestions: ['Try a smaller amount', 'Wait a few minutes and retry'],
    };
  }

  if (/route not found|no route|routing failed/i.test(apiMessage)) {
    return {
      code: apiCode,
      message: errorStr,
      originalError: error,
      category: 'route_not_found',
      recoverable: true,
      userMessage: 'No route found for this swap. Try adjusting the amount or slippage.',
      suggestions: ['Increase the amount', 'Increase slippage tolerance', 'Try a different token pair'],
    };
  }

  if (/amount too small|minimum amount|below minimum/i.test(apiMessage)) {
    return {
      code: apiCode,
      message: errorStr,
      originalError: error,
      category: 'amount_too_small',
      recoverable: true,
      userMessage: 'Amount is too small. Please increase the amount.',
      suggestions: ['Try a larger amount', 'Check minimum amount requirements'],
    };
  }

  if (/rate limit|too many requests|429/i.test(apiMessage) || apiCode === 429) {
    return {
      code: apiCode,
      message: errorStr,
      originalError: error,
      category: 'rate_limit',
      recoverable: true,
      userMessage: 'Too many requests. Please wait a moment and try again.',
      suggestions: ['Wait 30-60 seconds', 'Retry the transaction'],
    };
  }

  if (/timeout|timed out|ETIMEDOUT/i.test(apiMessage)) {
    return {
      code: apiCode,
      message: errorStr,
      originalError: error,
      category: 'timeout',
      recoverable: true,
      userMessage: 'Request timed out. Please check your connection and try again.',
      suggestions: ['Check your internet connection', 'Retry the transaction'],
    };
  }

  if (/400|Bad Request/i.test(apiMessage) || apiCode === 400) {
    // Try to extract more specific info from 400 errors
    if (/amount|value|invalid amount/i.test(apiMessage)) {
      return {
        code: apiCode,
        message: errorStr,
        originalError: error,
        category: 'validation',
        recoverable: true,
        userMessage: 'Invalid amount or parameters. Please check your inputs.',
        suggestions: ['Verify the amount is correct', 'Check token addresses', 'Try increasing the amount'],
      };
    }
    return {
      code: apiCode,
      message: errorStr,
      originalError: error,
      category: 'validation',
      recoverable: true,
      userMessage: 'Invalid request. Please check your parameters and try again.',
      suggestions: ['Verify all inputs are correct', 'Try adjusting the amount or slippage'],
    };
  }

  if (/500|Internal Server Error|HTTP error.*500/i.test(apiMessage) || apiCode === 500) {
    // 500 errors from Biconomy API
    if (/Bad Request/i.test(apiMessage)) {
      // Sometimes 500 errors contain "Bad Request" - likely validation issue
      return {
        code: apiCode,
        message: errorStr,
        originalError: error,
        category: 'validation',
        recoverable: true,
        userMessage: 'Invalid request parameters. The amount may be too small or parameters invalid.',
        suggestions: [
          'Try increasing the amount',
          'Check that all parameters are valid',
          'Verify token addresses are correct',
          'Try adjusting slippage tolerance',
        ],
      };
    }
    return {
      code: apiCode,
      message: errorStr,
      originalError: error,
      category: 'api',
      recoverable: true,
      userMessage: 'Service temporarily unavailable. Please try again in a moment.',
      suggestions: ['Wait a few moments and retry', 'Try with a different amount', 'Check Biconomy service status'],
    };
  }

  if (/network|connection|fetch failed|ECONNREFUSED/i.test(apiMessage)) {
    return {
      code: apiCode,
      message: errorStr,
      originalError: error,
      category: 'network',
      recoverable: true,
      userMessage: 'Network error. Please check your connection and try again.',
      suggestions: ['Check your internet connection', 'Retry the transaction'],
    };
  }

  // Default/unknown error
  return {
    code: apiCode,
    message: errorStr,
    originalError: error,
    category: 'unknown',
    recoverable: true,
    userMessage: 'An unexpected error occurred. Please try again.',
    suggestions: ['Retry the transaction', 'Check your inputs', 'Try a different amount'],
  };
}

/**
 * Format error for display in UI
 */
export function formatErrorForDisplay(error: BiconomyError): {
  title: string;
  message: string;
  suggestions?: string[];
  showDetails?: boolean;
} {
  const categoryTitles: Record<ErrorCategory, string> = {
    validation: 'Invalid Request',
    api: 'Service Error',
    network: 'Network Error',
    user_rejection: 'Transaction Rejected',
    insufficient_balance: 'Insufficient Balance',
    insufficient_liquidity: 'Insufficient Liquidity',
    route_not_found: 'Route Not Found',
    amount_too_small: 'Amount Too Small',
    rate_limit: 'Rate Limited',
    timeout: 'Request Timeout',
    unknown: 'Error',
  };

  return {
    title: categoryTitles[error.category] || 'Error',
    message: error.userMessage,
    suggestions: error.suggestions,
    showDetails: error.category === 'unknown' || process.env.NODE_ENV === 'development',
  };
}

/**
 * Check if error is recoverable (user can retry)
 */
export function isRecoverableError(error: BiconomyError): boolean {
  return error.recoverable;
}

/**
 * Check if error suggests increasing amount
 */
export function shouldSuggestIncreaseAmount(error: BiconomyError): boolean {
  return ['amount_too_small', 'route_not_found', 'validation'].includes(error.category);
}



