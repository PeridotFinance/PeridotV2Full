import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Perry Agent | Peridot Finance',
  description: 'AI-powered DeFi investment co-pilot',
}

/**
 * Chat layout — owns the full viewport. The negative margin reclaims the
 * root layout's padding-top so the ambient shader background flows under
 * the floating header (which is `bg-background/70 backdrop-blur-md`).
 *
 * No spacer here: the inner AgentChatLayout pushes the sidebar / main
 * pane below the header height itself, so the background can paint the
 * full viewport without a visible seam.
 */
export default function AgentChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="-mt-24 md:-mt-28 lg:-mt-32 h-[100dvh] flex flex-col">
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
