/**
 * Announcing the Privy embedded wallet over EIP-6963.
 *
 * This is what gets the user's own wallet into the Squid widget's picker, and
 * the widget only ever sees us through these events. So the things worth
 * pinning down are: that we answer a late discovery request (the widget loads
 * dynamically and asks after we mount — the first announcement almost always
 * misses it), that we announce the embedded wallet and nothing else, and that
 * one wallet produces one row.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, waitFor, cleanup } from "@testing-library/react"

const provider = { request: vi.fn(async () => null) }
const getEthereumProvider = vi.fn(async () => provider)

let privyState = { ready: true, authenticated: true }
let walletList: Array<Record<string, unknown>> = []

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => privyState,
  useWallets: () => ({ wallets: walletList }),
}))

import { PeridotWalletAnnouncer } from "@/components/wallet/PeridotWalletAnnouncer"

const EMBEDDED = {
  address: "0xEmbedded",
  walletClientType: "privy",
  getEthereumProvider,
}
const EXTERNAL = {
  address: "0xMetaMask",
  walletClientType: "metamask",
  getEthereumProvider: vi.fn(async () => ({ request: vi.fn() })),
}

/** Every announcement seen since the listener was installed. */
let announced: Array<{ info: Record<string, string>; provider: unknown }>
const onAnnounce = (e: Event) => {
  announced.push((e as CustomEvent).detail)
}

beforeEach(() => {
  announced = []
  privyState = { ready: true, authenticated: true }
  walletList = [EMBEDDED]
  getEthereumProvider.mockClear()
  window.addEventListener("eip6963:announceProvider", onAnnounce)
})

afterEach(() => {
  window.removeEventListener("eip6963:announceProvider", onAnnounce)
  cleanup()
})

describe("PeridotWalletAnnouncer", () => {
  it("announces the embedded wallet as an EIP-6963 provider", async () => {
    render(<PeridotWalletAnnouncer />)

    await waitFor(() => expect(announced.length).toBeGreaterThan(0))
    const { info, provider: announcedProvider } = announced[0]
    expect(info.name).toBe("Peridot Wallet")
    expect(info.rdns).toBe("finance.peridot.wallet")
    // A path would be dropped by conforming consumers — the spec wants a data URI.
    expect(info.icon.startsWith("data:image/svg+xml")).toBe(true)
    expect(typeof info.uuid).toBe("string")
    expect(announcedProvider).toBe(provider)
  })

  it("answers a discovery request that arrives after mount", async () => {
    render(<PeridotWalletAnnouncer />)
    await waitFor(() => expect(announced.length).toBe(1))

    // The widget builds its wagmi config well after we mount, so this — not the
    // initial announcement — is the path that actually reaches the picker.
    window.dispatchEvent(new Event("eip6963:requestProvider"))

    expect(announced.length).toBe(2)
    expect(announced[1].provider).toBe(provider)
  })

  it("keeps one identity across repeated announcements", async () => {
    render(<PeridotWalletAnnouncer />)
    await waitFor(() => expect(announced.length).toBe(1))

    window.dispatchEvent(new Event("eip6963:requestProvider"))
    window.dispatchEvent(new Event("eip6963:requestProvider"))

    // Consumers key on the uuid; a fresh one per announcement would list the
    // same wallet several times.
    const uuids = new Set(announced.map((a) => a.info.uuid))
    expect(uuids.size).toBe(1)
  })

  it("ignores an external wallet — it already announces itself", async () => {
    walletList = [EXTERNAL]
    render(<PeridotWalletAnnouncer />)

    window.dispatchEvent(new Event("eip6963:requestProvider"))
    await Promise.resolve()

    expect(announced).toHaveLength(0)
    expect(EXTERNAL.getEthereumProvider).not.toHaveBeenCalled()
  })

  it("announces nothing while the user is logged out", async () => {
    privyState = { ready: true, authenticated: false }
    render(<PeridotWalletAnnouncer />)

    window.dispatchEvent(new Event("eip6963:requestProvider"))
    await Promise.resolve()

    expect(announced).toHaveLength(0)
    expect(getEthereumProvider).not.toHaveBeenCalled()
  })

  it("stops answering once unmounted", async () => {
    const { unmount } = render(<PeridotWalletAnnouncer />)
    await waitFor(() => expect(announced.length).toBe(1))

    unmount()
    window.dispatchEvent(new Event("eip6963:requestProvider"))

    expect(announced.length).toBe(1)
  })
})
