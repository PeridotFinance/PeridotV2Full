export interface SignablePayloadInfo {
  raw: any
  signable: any
  metadata?: any
  hasTypeWrapper: boolean
  hasSignableWrapper: boolean
}

export interface QuotePayloadExtraction {
  payloads: any[]
  rawPayloads: any[]
  source: string
}

const asArray = (maybe: any) => (Array.isArray(maybe) ? maybe : [])

export const extractQuotePayloads = (quote: any): QuotePayloadExtraction => {
  const direct = asArray(quote?.payloadToSign)
  if (direct.length) {
    return { payloads: direct.filter((entry) => entry != null), rawPayloads: direct, source: 'quote.payloadToSign' }
  }

  const payloadsObj = asArray(quote?.payloads?.toSign)
  if (payloadsObj.length) {
    return { payloads: payloadsObj.filter((entry) => entry != null), rawPayloads: payloadsObj, source: 'quote.payloads.toSign' }
  }

  const resultPayloads = asArray(quote?.result?.payloadToSign)
  if (resultPayloads.length) {
    return { payloads: resultPayloads.filter((entry) => entry != null), rawPayloads: resultPayloads, source: 'quote.result.payloadToSign' }
  }

  return { payloads: [], rawPayloads: [], source: 'none' }
}

export const unwrapPayload = (raw: any): SignablePayloadInfo => {
  const hasTypeWrapper = raw && raw.type && raw.data
  const hasSignableWrapper = raw && raw.signablePayload
  const signable = hasTypeWrapper ? raw.data : hasSignableWrapper ? raw.signablePayload : raw
  const metadata = hasSignableWrapper ? raw.metadata : undefined
  return { raw, signable, metadata, hasTypeWrapper, hasSignableWrapper }
}

export const getChainIdsFromPayloads = (payloads: any[]): Array<number | null> => {
  return payloads.map((entry) => {
    const { signable } = unwrapPayload(entry)
    const chainId = signable?.chainId || signable?.domain?.chainId || null
    return typeof chainId === 'string' ? Number(chainId) : (typeof chainId === 'number' ? chainId : null)
  })
}
