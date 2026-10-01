import { describe, expect, it } from "vitest"
import { mayRetryAfterSilentFailure, pickXcEvmWallet } from "@/lib/crosschain/evm-wallet"

const EMBEDDED = "0x12c1000000000000000000000000000000002481"
const METAMASK = "0xAbCd00000000000000000000000000000000Ef01"
const embedded = { address: EMBEDDED, walletClientType: "privy", type: "ethereum" }
const metamask = { address: METAMASK, walletClientType: "metamask", type: "ethereum" }
const stellar = { address: "G" + "A".repeat(55), walletClientType: "privy-v2", type: "stellar" }

describe("pickXcEvmWallet", () => {
  it("takes the wallet wagmi is connected to", () => {
    expect(pickXcEvmWallet(METAMASK, [embedded, metamask])).toEqual({
      address: METAMASK,
      embedded: false,
      viaWagmi: true,
    })
  })

  it("knows the connected wallet as embedded whatever the casing", () => {
    expect(pickXcEvmWallet(EMBEDDED.toUpperCase().replace("0X", "0x"), [embedded])).toMatchObject({
      embedded: true,
      viaWagmi: true,
    })
  })

  it("falls back to the embedded wallet when wagmi has nothing", () => {
    expect(pickXcEvmWallet(undefined, [stellar, metamask, embedded])).toEqual({
      address: EMBEDDED,
      embedded: true,
      viaWagmi: false,
    })
  })

  it("never offers an external wallet wagmi is not connected to", () => {
    expect(pickXcEvmWallet(undefined, [metamask])).toBeNull()
  })

  it("never mistakes the embedded Stellar wallet for an EVM one", () => {
    expect(pickXcEvmWallet(undefined, [stellar])).toBeNull()
    expect(pickXcEvmWallet(undefined, null)).toBeNull()
  })
})

describe("mayRetryAfterSilentFailure", () => {
  it("allows a second attempt only when the nonce did not move", () => {
    expect(mayRetryAfterSilentFailure(7, 7)).toBe(true)
    expect(mayRetryAfterSilentFailure(7, 8)).toBe(false)
  })

  it("treats a nonce that could not be read as moved", () => {
    expect(mayRetryAfterSilentFailure(null, 7)).toBe(false)
    expect(mayRetryAfterSilentFailure(7, null)).toBe(false)
  })
})
