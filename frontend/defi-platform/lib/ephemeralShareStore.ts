type SharePayload = {
  walletAddress: string
  usernameOrAddr: string
  points: number
  rank: number | string
  tierLabel: string
  medals: Array<{ emoji: string; name: string }>
  referralUrl: string
}

type Stored = {
  payload: SharePayload
  expiresAt: number
}

class EphemeralShareStore {
  private store: Map<string, Stored>
  private cleanupTimer: NodeJS.Timeout | null

  constructor() {
    this.store = new Map()
    this.cleanupTimer = null
    this.ensureCleanup()
  }

  set(token: string, payload: SharePayload, ttlMs: number) {
    const expiresAt = Date.now() + ttlMs
    this.store.set(token, { payload, expiresAt })
  }

  get(token: string): SharePayload | null {
    const v = this.store.get(token)
    if (!v) return null
    if (Date.now() > v.expiresAt) {
      this.store.delete(token)
      return null
    }
    return v.payload
  }

  delete(token: string) {
    this.store.delete(token)
  }

  private ensureCleanup() {
    if (this.cleanupTimer) return
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [k, v] of this.store.entries()) {
        if (now > v.expiresAt) this.store.delete(k)
      }
    }, 15_000)
  }
}

// Singleton instance shared across imports in a single runtime
export const ephemeralShareStore = new EphemeralShareStore()

export type { SharePayload }


