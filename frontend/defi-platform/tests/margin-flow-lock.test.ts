/**
 * The margin flow lock, specifically the half that leaves the tab.
 *
 * Every leg of an open or a close is signed by the same Stellar account, whose
 * sequence number is read fresh per transaction. Two flows at once means the
 * loser dies of txBadSeq somewhere in the middle, which is how positions strand
 * in PendingOpen/PendingClose. A module-level lock stopped that within one tab
 * and was blind to a second one — so these cover what the in-memory lock alone
 * could not see, plus the ways a shared lock can go wrong that a private one
 * cannot: stealing someone else's release, and getting stuck on a claim nobody
 * is holding any more.
 */
import { describe, it, expect, beforeEach } from "vitest"
import {
  isMarginFlowBusy,
  busyMarginFlowKind,
  acquireMarginFlow,
  releaseMarginFlow,
} from "@/app/app/margin/lib/marginFlowLock"

const KEY = "peridot:margin-flow-lock"

/**
 * This jsdom build exposes a `localStorage` object with no methods on it, so the
 * shared half of the lock would be a no-op and every assertion below would pass
 * for the wrong reason. Install a real one.
 */
function installStorage(): Storage {
  const map = new Map<string, string>()
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size
    },
  } as unknown as Storage
  Object.defineProperty(window, "localStorage", { configurable: true, value: store })
  return store
}

let storage: Storage

/**
 * Write a claim the way another tab would — straight into shared storage, under
 * a different owner id. The id is what release checks: an earlier version
 * matched on the timestamp instead, and two acquires in the same millisecond
 * (which is what this file's own test produced) made one tab the apparent owner
 * of the other's lock.
 */
const otherTabHolds = (kind: "open" | "close", ageMs = 0) =>
  storage.setItem(
    KEY,
    JSON.stringify({ at: Date.now() - ageMs, kind, owner: "some-other-tab" }),
  )

beforeEach(() => {
  storage = installStorage()
  releaseMarginFlow()
  storage.clear()
})

describe("marginFlowLock", () => {
  it("is free when nothing holds it", () => {
    expect(isMarginFlowBusy()).toBe(false)
    expect(busyMarginFlowKind()).toBe(null)
  })

  it("blocks this tab while another tab is mid-flow", () => {
    // Nothing in this JS context acquired anything; the only evidence is the
    // shared record. Before it existed, this tab would have happily started a
    // second flow against the same account sequence.
    otherTabHolds("close")
    expect(isMarginFlowBusy()).toBe(true)
    expect(busyMarginFlowKind()).toBe("close")
  })

  it("reports the kind of flow that is in the way", () => {
    // The busy toast names it ("still finishing your other trade" vs "still
    // closing your other position"), so the wrong kind is actively misleading.
    acquireMarginFlow("open")
    expect(busyMarginFlowKind()).toBe("open")
  })

  it("publishes its own claim so other tabs can see it", () => {
    acquireMarginFlow("close")
    const stored = JSON.parse(storage.getItem(KEY) as string)
    expect(stored.kind).toBe("close")
    expect(typeof stored.at).toBe("number")
  })

  it("frees the lock on release", () => {
    acquireMarginFlow("open")
    releaseMarginFlow()
    expect(isMarginFlowBusy()).toBe(false)
    expect(storage.getItem(KEY)).toBe(null)
  })

  it("does not release a claim it doesn't own", () => {
    // This tab finishes its flow while the other one is still running. Clearing
    // the shared record here would re-open the exact race the lock exists for.
    acquireMarginFlow("open")
    otherTabHolds("close")
    releaseMarginFlow()
    expect(isMarginFlowBusy()).toBe(true)
    expect(busyMarginFlowKind()).toBe("close")
  })

  it("ignores a claim older than the TTL", () => {
    // A tab closed mid-flow can never release. Without the age bound its claim
    // would lock margin trading for good, in every tab, until storage is cleared
    // by hand.
    otherTabHolds("close", 241_000)
    expect(isMarginFlowBusy()).toBe(false)
  })

  it("ignores a claim from the future", () => {
    // A clock that jumped, or a record synced in from another machine. Trusting
    // it parks trading for the full TTL of real time.
    storage.setItem(KEY, JSON.stringify({ at: Date.now() + 60_000, kind: "open" }))
    expect(isMarginFlowBusy()).toBe(false)
  })

  it("ignores junk in storage rather than throwing", () => {
    // Shared storage is writable by anything on the origin, including an older
    // build of this app. A parse error must not take the trade button with it.
    storage.setItem(KEY, "not json")
    expect(isMarginFlowBusy()).toBe(false)
    storage.setItem(KEY, JSON.stringify({ at: "soon", kind: "open" }))
    expect(isMarginFlowBusy()).toBe(false)
  })

  it("still guards this tab when storage is unavailable", () => {
    // Safari private mode, some embedded webviews. Degrading to the old
    // in-memory behaviour is acceptable; throwing on acquire is not.
    const original = Object.getOwnPropertyDescriptor(window, "localStorage")
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError: storage is disabled")
      },
    })
    try {
      expect(() => acquireMarginFlow("close")).not.toThrow()
      expect(isMarginFlowBusy()).toBe(true)
      expect(busyMarginFlowKind()).toBe("close")
      expect(() => releaseMarginFlow()).not.toThrow()
      expect(isMarginFlowBusy()).toBe(false)
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original)
    }
  })
})
