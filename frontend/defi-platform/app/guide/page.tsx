import type { Metadata } from "next"
import { GuideHandbook } from "@/components/guide/GuideHandbook"

export const metadata: Metadata = {
  title: "App Handbook | Peridot Finance",
  description:
    "A visual reference for the Peridot app: every screen and every state — deposit, waiting, success, error — on desktop and mobile.",
  alternates: { canonical: "/guide" },
  openGraph: {
    title: "App Handbook | Peridot Finance",
    description: "Every screen, every state of the Peridot app — explained visually.",
    url: "/guide",
  },
}

export default function GuidePage() {
  return <GuideHandbook />
}
