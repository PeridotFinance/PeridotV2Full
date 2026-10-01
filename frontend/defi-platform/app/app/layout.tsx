import { headers } from "next/headers"
import { DeviceProvider } from "@/context/device"
import { metadata as appMetadata } from "./metadata"
import { DemoModeProvider } from "@/context/demo-mode"
import { DepositPanelProvider } from "@/context/deposit-panel"
import { resolveDeviceFromUserAgent } from "@/lib/device"

/**
 * Shared `/app/*` layout. Hosts the Easy-tree providers (`DeviceProvider`,
 * `DemoMode`, `DepositPanel`) that used to live under
 * `/app/app/easy/layout.tsx`. With them hoisted here, the in-place toggle
 * on `/app` can share state with the deep Easy subroutes (portfolio,
 * activity, account, history).
 *
 * Note: `ViewModeProvider` is NOT here — it lives one level up in
 * `RootProviders` so the `SiteHeader` (rendered outside `/app/*`) also sits
 * inside the same provider, otherwise the toggle in the header would hit a
 * no-op fallback while the body read a different state.
 */

/**
 * `app/app/metadata.ts` was never wired up — Next only reads a `metadata`
 * export from `page.tsx`/`layout.tsx`, so `/app` silently inherited the root
 * title. Re-exporting it here is what actually puts the `/app` copy on the
 * page; subroutes with their own `metadata` still override it.
 */
export const metadata = appMetadata
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const h = await headers()
  const ua = h.get("user-agent")
  const initialDevice = resolveDeviceFromUserAgent(ua)

  return (
    <DeviceProvider initialDevice={initialDevice}>
      <DemoModeProvider>
        <DepositPanelProvider>{children}</DepositPanelProvider>
      </DemoModeProvider>
    </DeviceProvider>
  )
}
