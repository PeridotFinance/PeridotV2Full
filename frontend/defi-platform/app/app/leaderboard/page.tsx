'use client'
import dynamic from 'next/dynamic'

// Lazy-loaded so the leaderboard data hooks (and react-query state) don't
// run on the SSR pass — same pattern as `/app/stats`.
const LeaderboardBW = dynamic(
  () => import('@/components/leaderboard/LeaderboardBW'),
  { ssr: false, loading: () => <LeaderboardSkeleton /> },
)

export default function LeaderboardPage() {
  return <LeaderboardBW />
}

// ─── Skeleton matches the new B/W aesthetic — no glass, no gradient ──────────

function LeaderboardSkeleton() {
  return (
    <main className="min-h-screen bg-background -mt-24 md:-mt-28 lg:-mt-32 pt-24 md:pt-28 lg:pt-32">
      <div className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 pt-10 pb-6">
        <div className="skeleton-shimmer h-8 w-48 rounded" />
        <div className="skeleton-shimmer mt-2 h-4 w-80 rounded" />
        <div className="skeleton-shimmer mt-6 h-9 w-72 rounded-full" />
      </div>
      <div className="mx-6 border-t border-foreground/[0.06]" />
      <div className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-foreground/[0.06] rounded-xl overflow-hidden border border-foreground/[0.06]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-background px-5 py-5 md:px-6 md:py-6">
              <div className="skeleton-shimmer h-3 w-24 rounded" />
              <div className="skeleton-shimmer mt-3 h-7 w-32 rounded" />
              <div className="skeleton-shimmer mt-2 h-3 w-40 rounded" />
            </div>
          ))}
        </div>
      </div>
      <div className="mx-6 border-t border-foreground/[0.06]" />
      <div className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-[80vw] mx-auto px-6 py-10 space-y-2">
        <div className="skeleton-shimmer h-5 w-40 rounded mb-5" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="skeleton-shimmer skeleton-shimmer-slow h-14 border border-foreground/[0.06] rounded-md"
          />
        ))}
      </div>
    </main>
  )
}
