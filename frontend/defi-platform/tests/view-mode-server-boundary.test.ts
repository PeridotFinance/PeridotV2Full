/**
 * View-mode server/client boundary guard.
 *
 * A server component that imports `VIEW_MODE_COOKIE` from the "use client"
 * module `context/view-mode.tsx` receives a client reference instead of the
 * string, so `cookies().get(...)` silently matches nothing. That shipped once:
 * the root layout always reported "easy", the header therefore rendered the
 * Easy nav (including the Borrow tab) for Expert users, and `/app/borrow` —
 * which reads the cookie correctly — bounced them straight back to `/app`.
 *
 * Dev never reproduced it; only the production bundle splits the modules that
 * way. These tests pin the arrangement that makes it impossible.
 *
 * Run: npx vitest run tests/view-mode-server-boundary.test.ts
 *
 * @vitest-environment node
 */

import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

const ROOT = path.resolve(__dirname, "..")
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8")

/** Files that read the cookie on the server and must use the shared module. */
const SERVER_READERS = ["app/layout.tsx", "app/app/borrow/page.tsx"]

describe("view-mode cookie constant", () => {
  it("lives in a module without the 'use client' directive", () => {
    const src = read("lib/view-mode.ts")
    expect(src).not.toMatch(/^\s*["']use client["']/m)
    expect(src).toContain('VIEW_MODE_COOKIE = "peridot_view_mode"')
  })

  it("is re-exported by the client context so existing imports keep working", () => {
    const src = read("context/view-mode.tsx")
    expect(src).toContain('from "@/lib/view-mode"')
    expect(src).toMatch(/export\s*\{[^}]*VIEW_MODE_COOKIE/)
  })

  for (const file of SERVER_READERS) {
    it(`${file} imports the constant from @/lib/view-mode, not the client context`, () => {
      const src = read(file)
      expect(src).toMatch(/import\s*\{[^}]*VIEW_MODE_COOKIE[^}]*\}\s*from\s*["']@\/lib\/view-mode["']/)
      expect(src).not.toMatch(
        /import\s*\{[^}]*VIEW_MODE_COOKIE[^}]*\}\s*from\s*["']@\/context\/view-mode["']/
      )
    })

    it(`${file} reads the cookie through the constant, not a bare literal`, () => {
      const src = read(file)
      // A hardcoded name drifts silently if the cookie is ever renamed.
      const literalLookups = src.match(/\.get\(\s*["']peridot_view_mode["']\s*\)/g) ?? []
      expect(literalLookups).toEqual([])
      expect(src).toContain("VIEW_MODE_COOKIE")
    })
  }

  it("no server component imports values from the client context module", () => {
    // `type` imports are erased at compile time and stay safe.
    for (const file of SERVER_READERS) {
      const src = read(file)
      const valueImport = new RegExp(
        String.raw`import\s+(?!type\s)\{([^}]*)\}\s*from\s*["']@/context/view-mode["']`
      )
      const hit = src.match(valueImport)
      if (hit) {
        const named = hit[1].split(",").map((s) => s.trim())
        const values = named.filter((n) => n && !n.startsWith("type "))
        expect(values, `${file} imports runtime values from a "use client" module`).toEqual([])
      }
    }
  })
})

describe("client provider stays in step with the server", () => {
  it("re-reads the cookie on mount so a stale server value can't strand the UI", () => {
    const src = read("context/view-mode.tsx")
    expect(src).toContain("readCookie")
    expect(src).toContain("document.cookie")
  })

  it("still lets a ?view= deep-link outrank the cookie", () => {
    const src = read("context/view-mode.tsx")
    const viewIdx = src.indexOf('sp?.get("view")')
    // The call site inside the mount effect, not the helper's definition.
    const cookieIdx = src.indexOf("= readCookie()")
    expect(viewIdx).toBeGreaterThan(-1)
    expect(cookieIdx).toBeGreaterThan(viewIdx)
  })
})
