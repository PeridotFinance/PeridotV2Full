import type { Metadata } from "next"

// The dataroom is shared by link with investors and partners — keep it out of
// search engines and previews even though it is password gated.
export const metadata: Metadata = {
  title: "Peridot Dataroom",
  description: "Protocol traction and liquidity data.",
  robots: { index: false, follow: false, nocache: true },
}

export default function DataroomLayout({ children }: { children: React.ReactNode }) {
  return children
}
