import { formatUnits } from 'viem'

export interface FeeBudgetErrorPayload {
  feeWei?: string
  feeBudgetWei?: string
  amountWei?: string
  requiredWei?: string
  feeToken?: string
  sameFeeToken?: boolean
  sourceChainId?: number
  destinationChainId?: number
}

const ERROR_PREFIX = 'INSUFFICIENT_FOR_FEE_BUDGET:'

export function parseFeeBudgetErrorPayload(message: string): FeeBudgetErrorPayload | null {
  if (!message?.includes('INSUFFICIENT_FOR_FEE_BUDGET')) return null
  const start = message.indexOf(ERROR_PREFIX)
  if (start === -1) return null
  const jsonPart = message.slice(start + ERROR_PREFIX.length).trim()
  if (!jsonPart) return null
  try {
    return JSON.parse(jsonPart) as FeeBudgetErrorPayload
  } catch {
    return null
  }
}

export function getRequiredWeiFromPayload(payload: FeeBudgetErrorPayload | null | undefined): bigint | null {
  if (!payload) return null
  try {
    if (payload.requiredWei) return BigInt(payload.requiredWei)
    if (payload.feeBudgetWei) return BigInt(payload.feeBudgetWei)
    if (payload.feeWei) return BigInt(payload.feeWei)
    return null
  } catch {
    return null
  }
}

export function formatTokenAmountFromWei(value: bigint, decimals: number, maximumFractionDigits = 6): string {
  const raw = formatUnits(value, decimals)
  if (!raw.includes('.')) return raw
  const [whole, frac = ''] = raw.split('.')
  const trimmedFrac = frac.slice(0, maximumFractionDigits).replace(/0+$/, '')
  return trimmedFrac ? `${whole}.${trimmedFrac}` : whole
}
