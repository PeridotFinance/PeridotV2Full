/**
 * The load-bearing assumption, tested against real wagmi.
 *
 * The announcer only works because the Squid widget derives its wallet picker
 * from `wagmi.useConnectors()` over a config it builds itself, and leaves
 * `multiInjectedProviderDiscovery` at wagmi's default. Nothing in our own
 * component would notice if that stopped being true — the Peridot row would
 * just quietly disappear from the picker. So this rebuilds the widget's setup
 * and checks that an announcement really does become a connector.
 *
 * It also pins the reason we announce under ONE stable uuid. wagmi has two
 * routes in, and they are not equally forgiving:
 *
 *   - `hydrate().onMount()` sweeps whatever is already in the mipd store into
 *     connectors. It dedupes each mipd provider against the connectors that
 *     existed BEFORE the sweep, and never against the ones it adds during it —
 *     so two mipd entries sharing our rdns become two rows in the picker.
 *   - `mipd.subscribe` handles anything announced later, and does dedupe by
 *     rdns — but bails out early until the persisted store has hydrated.
 *
 * A stable uuid keeps mipd at exactly one entry for us (it dedupes by uuid),
 * which makes the duplicate row structurally impossible on the first route
 * while still covering the second. Re-announcing under a fresh uuid on a timer
 * would have been the obvious way to harden the timing, and is exactly what
 * these semantics rule out.
 *
 * Not covered here: the post-hydration `subscribe` route. `hasHydrated()` never
 * flips in jsdom, so asserting on it would test the environment rather than the
 * code. The route this suite does cover is the one our mount order puts us on —
 * mipd's store dispatches its discovery request from inside `createConfig`,
 * before `onMount` runs.
 */
import { describe, it, expect } from "vitest"
// Both from `@wagmi/core`, not `wagmi`: the React package re-exports
// `createConfig` but not `hydrate`, and mixing the two package instances would
// hand `hydrate` a config whose internals it doesn't own.
import { createConfig, http, hydrate } from "@wagmi/core"
import { mainnet } from "viem/chains"

const RDNS = "finance.peridot.wallet"

/** Mirrors the announcement in `components/wallet/PeridotWalletAnnouncer.tsx`. */
function announcePeridotWallet(uuid = "11111111-2222-3333-4444-555555555555") {
  window.dispatchEvent(
    new CustomEvent("eip6963:announceProvider", {
      detail: Object.freeze({
        info: { uuid, name: "Peridot Wallet", icon: "data:image/svg+xml;utf8,<svg/>", rdns: RDNS },
        provider: { request: async () => null },
      }),
    }),
  )
}

/** Same shape as `createWagmiConfig` in @0xsquid/react-hooks: an explicit
 *  connector list, `ssr: true`, and no `multiInjectedProviderDiscovery`
 *  override. */
function squidShapedConfig() {
  return createConfig({
    chains: [mainnet],
    transports: { [mainnet.id]: http() },
    connectors: [],
    ssr: true,
  })
}

/** `connectors: []` narrows wagmi's connector array to `never[]`, so reading
 *  `.id` off it needs the shape spelled out. Only the two fields we assert on. */
function connectorsOf(config: ReturnType<typeof squidShapedConfig>) {
  return config.connectors as ReadonlyArray<{ id: string; name: string }>
}

/** What `WagmiProvider` does on mount. Without it an `ssr: true` config never
 *  hydrates, and no discovered provider ever becomes a connector. */
async function mount(config: ReturnType<typeof squidShapedConfig>) {
  await hydrate(config, { initialState: undefined, reconnectOnMount: false }).onMount()
}

describe("EIP-6963 discovery in a Squid-shaped wagmi config", () => {
  it("turns the announced wallet into a connector", async () => {
    const config = squidShapedConfig()
    announcePeridotWallet()
    await mount(config)

    // The widget matches its connected wallet by `connector.id === wallet.rdns`,
    // so the id has to be our rdns, not a generated one.
    expect(connectorsOf(config).map((c) => c.id)).toContain(RDNS)
    expect(connectorsOf(config).find((c) => c.id === RDNS)?.name).toBe("Peridot Wallet")
  })

  it("stays a single row when the same uuid is announced repeatedly", async () => {
    const config = squidShapedConfig()
    // What our component does when it answers several discovery requests.
    announcePeridotWallet()
    announcePeridotWallet()
    announcePeridotWallet()
    await mount(config)

    expect(connectorsOf(config).filter((c) => c.id === RDNS)).toHaveLength(1)
  })

  it("would duplicate the row if we announced under fresh uuids", async () => {
    const config = squidShapedConfig()
    announcePeridotWallet("aaaaaaaa-2222-3333-4444-555555555555")
    announcePeridotWallet("bbbbbbbb-2222-3333-4444-555555555555")
    await mount(config)

    // Not a wish — a guard. This documents why the component holds one uuid for
    // its lifetime; if a wagmi upgrade ever dedupes the sweep by rdns too, this
    // test fails and the constraint can be relaxed deliberately.
    expect(connectorsOf(config).filter((c) => c.id === RDNS)).toHaveLength(2)
  })
})
