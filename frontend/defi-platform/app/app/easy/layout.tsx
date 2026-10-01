import { EasyLayoutShell } from "./EasyLayoutShell"

/**
 * `/app/easy/*` chrome. The providers that used to live here
 * (`DeviceProvider`, `DemoMode`, `DepositPanel`) were hoisted into
 * `app/app/layout.tsx` so the in-place view toggle on `/app` shares state
 * with the deep Easy subroutes (portfolio, activity, account, history).
 *
 * This file now only contributes the full-screen Easy app shell.
 */
export default function EasyLayout({ children }: { children: React.ReactNode }) {
  return <EasyLayoutShell>{children}</EasyLayoutShell>
}
