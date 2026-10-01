type SmartAccountProviderDetails = {
  isSmartAccount: boolean
  smartAccountAddress?: `0x${string}`
}

const HEX_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/i

const toAddress = (value: unknown): `0x${string}` | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return HEX_ADDRESS_REGEX.test(trimmed) ? (trimmed as `0x${string}`) : undefined
}

const collectAddress = (value: unknown, bucket: Set<`0x${string}`>) => {
  const addr = toAddress(value)
  if (addr) bucket.add(addr)
}

const inspectSession = (session: any, addresses: Set<`0x${string}`>): boolean => {
  if (!session || typeof session !== 'object') return false
  let flagged = false
  const accountType = (session as any)?.accountType || (session as any)?.type
  if (typeof accountType === 'string' && accountType.toLowerCase() === 'smartaccount') {
    flagged = true
  }
  if ((session as any)?.smartAccount === true) flagged = true
  collectAddress((session as any)?.smartAccountAddress, addresses)
  collectAddress((session as any)?.smartAccount?.address, addresses)
  collectAddress((session as any)?.smartAccount?.smartAccountAddress, addresses)
  collectAddress((session as any)?.scwAddress, addresses)

  const embedded = (session as any)?.embeddedWallet || (session as any)?.embeddedWalletInfo || (session as any)?.wallet || null
  if (embedded && typeof embedded === 'object') {
    const embeddedType = (embedded as any)?.accountType
    if (typeof embeddedType === 'string' && embeddedType.toLowerCase() === 'smartaccount') {
      flagged = true
    }
    collectAddress((embedded as any)?.smartAccountAddress, addresses)
    collectAddress((embedded as any)?.smartAccount?.address, addresses)
  }

  return flagged
}

const inspectProvider = (ethereum: any, addresses: Set<`0x${string}`>): SmartAccountProviderDetails => {
  let flagged = false

  if (!ethereum) return { isSmartAccount: false }

  const mark = () => {
    flagged = true
  }

  // AppKit specific surfaces
  if (ethereum?.appkit?.smartAccount) mark()
  collectAddress(ethereum?.appkit?.smartAccountAddress, addresses)
  collectAddress(ethereum?.appkit?.smartAccount?.address, addresses)

  const appkitProvider = ethereum?.appkitProvider || ethereum?.appKitProvider
  if (appkitProvider) {
    if (appkitProvider?.smartAccount) mark()
    collectAddress(appkitProvider?.smartAccountAddress, addresses)
    collectAddress(appkitProvider?.smartAccount?.address, addresses)
    if (inspectSession(appkitProvider?.session, addresses)) mark()
  }

  if (inspectSession(ethereum?.session, addresses)) mark()
  if (inspectSession(ethereum?.embeddedSession, addresses)) mark()

  // Generic wallet hints
  if (ethereum?.smartAccount?.active) mark()
  collectAddress(ethereum?.smartAccount?.address, addresses)
  if (ethereum?.providerConfig?.smartAccount === true) mark()
  if (ethereum?.wallet?.smartAccount === true) mark()

  // Biconomy / AbstractJS hints
  if (ethereum?.isBiconomy === true) mark()
  if (ethereum?.biconomy?.smartAccount) mark()
  collectAddress(ethereum?.biconomy?.smartAccount?.address, addresses)

  const caps = (ethereum as any)?.capabilities || (ethereum as any)?.features || null
  if (caps) {
    const text = JSON.stringify(caps).toLowerCase()
    if (text.includes('smart') && text.includes('account')) mark()
    collectAddress((caps as any)?.smartAccount?.address, addresses)
    collectAddress((caps as any)?.smartAccountAddress, addresses)
  }

  const smartAccountAddress = Array.from(addresses)[0]
  if (!flagged && smartAccountAddress) {
    flagged = true
  }

  return { isSmartAccount: flagged, smartAccountAddress }
}

export function extractSmartAccountProviderDetails(ethereum: any): SmartAccountProviderDetails {
  try {
    const addresses = new Set<`0x${string}`>()
    return inspectProvider(ethereum, addresses)
  } catch {
    return { isSmartAccount: false }
  }
}

export function getSmartAccountAddressHint(ethereum: any): `0x${string}` | undefined {
  return extractSmartAccountProviderDetails(ethereum).smartAccountAddress
}

export function detectSmartAccountProviderHints(ethereum: any): boolean {
  return extractSmartAccountProviderDetails(ethereum).isSmartAccount
}
