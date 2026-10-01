import type { Metadata } from "next"
import { InteractiveDemoWrapper } from "./InteractiveDemoWrapper"

export const metadata: Metadata = {
  title: "Understanding Health Factor in DeFi Lending · Peridot Insights",
  description:
    "Your health factor is the single most important number in DeFi lending. Learn what it is, how it moves, and what happens when it reaches 1.0.",
}

export default function InteractiveDemoPage() {
  return <InteractiveDemoWrapper />
}
