/**
 * `/app/steallar` is now a legacy URL that redirects to `/app/easy` at the
 * page level. Keep the layout as a transparent pass-through so nothing here
 * pulls in client providers the redirected request would never use.
 */
export default function StealllarLegacyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
