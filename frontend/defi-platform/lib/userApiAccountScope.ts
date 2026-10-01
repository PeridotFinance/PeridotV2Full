export interface UserApiAccountScope {
  accountId: number | null
  requestedAddress: string
  resolvedWallets: string[]
}

export function createUserApiAccountScope(params: {
  accountId: number | null
  requestedAddress: string
  resolvedWallets: string[]
}): UserApiAccountScope {
  return {
    accountId: params.accountId,
    requestedAddress: params.requestedAddress,
    resolvedWallets: params.resolvedWallets,
  }
}

