'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChatSidebar } from './ChatSidebar'
import { ChatMessageList } from './ChatMessageList'
import { ChatInputBar } from './ChatInputBar'
import { AutoExecuteConsentDialog } from './AutoExecuteConsentDialog'
import { CrystalLatticeBackground } from './CrystalLatticeBackground'
import { useAgentConversations } from '@/hooks/use-agent-conversations'
import { useAgentChat } from '@/hooks/use-agent-chat'
import { useAgentProfile } from '@/hooks/use-agent-profile'
import { useAutoExecuteConsent } from '@/hooks/use-auto-execute-consent'
import { useChainId } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'
import { useStellarAgentAuth } from '@/hooks/use-stellar-agent-auth'
import { AlertCircle, X, Menu, RefreshCw, Wallet } from 'lucide-react'

export function AgentChatLayout() {
  const chainId = useChainId()
  const { ready: privyReady, authenticated, login } = usePrivy()
  // Pure-Freighter users (Stellar wallet, no Privy session) sign in with a
  // wallet signature instead (Stufe 3).
  const stellarWallet = useStellarWallet()
  const stellarAuth = useStellarAgentAuth(
    privyReady && !authenticated && stellarWallet.isConnected,
  )
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const {
    conversations,
    isLoading: convLoading,
    createConversation,
    deleteConversation,
    archiveConversation,
  } = useAgentConversations(showArchived)

  const { profile } = useAgentProfile()
  const {
    shouldShow: shouldShowAutoExecuteConsent,
    resolve: resolveAutoExecuteConsent,
  } = useAutoExecuteConsent()

  const {
    messages,
    isLoading: msgLoading,
    isStreaming,
    streamingText,
    streamingBlocks,
    error,
    sendMessage,
    stopStreaming,
  } = useAgentChat({
    conversationId: activeConversationId,
    chainId,
    stellarAddress: stellarWallet.address,
  })

  const handleCreateConversation = useCallback(async () => {
    try {
      const result = await createConversation.mutateAsync()
      setActiveConversationId(result.id)
      setMobileDrawerOpen(false)
    } catch {
      // Error handled by React Query
    }
  }, [createConversation])

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await deleteConversation.mutateAsync(id)
        if (activeConversationId === id) {
          setActiveConversationId(null)
        }
      } catch (err) {
        // React Query still mutates `deleteConversation.isError`, but users
        // won't see that by default — surface the failure explicitly so they
        // know their click didn't silently vanish.
        const msg = err instanceof Error ? err.message : 'Failed to delete chat'
        if (typeof window !== 'undefined') {
          window.alert(`Could not delete this chat: ${msg}`)
        }
      }
    },
    [deleteConversation, activeConversationId],
  )

  const handleArchiveConversation = useCallback(
    async (id: string, isArchived: boolean) => {
      try {
        await archiveConversation.mutateAsync({ id, isArchived })
        if (activeConversationId === id && isArchived) {
          setActiveConversationId(null)
        }
      } catch {
        // Error handled by React Query
      }
    },
    [archiveConversation, activeConversationId],
  )

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveConversationId(id)
      setMobileDrawerOpen(false)
    },
    [],
  )

  const [localError, setLocalError] = useState<string | null>(null)

  const handleSend = useCallback(
    async (content: string) => {
      setLocalError(null)
      if (!activeConversationId) {
        try {
          const result = await createConversation.mutateAsync(content.slice(0, 60))
          setActiveConversationId(result.id)
          // Pass the fresh id explicitly — the hook's closure still has `null`
          // until React re-renders, which the setTimeout hack used to race on.
          sendMessage(content, result.id)
          return
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to create conversation'
          setLocalError(msg)
          console.error('[agent-chat] createConversation failed:', err)
          return
        }
      }
      sendMessage(content)
    },
    [activeConversationId, createConversation, sendMessage],
  )

  const handleSuggestionClick = useCallback(
    (text: string) => {
      handleSend(text)
    },
    [handleSend],
  )

  // QuickReplyBlock chips dispatch this — forward to the chat send pipeline.
  // Decoupled via window event so historical messages can fire without
  // prop-drilling through the renderer.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message?: string } | undefined
      const message = detail?.message?.trim()
      if (!message || isStreaming) return
      handleSend(message)
    }
    window.addEventListener('peridot:agent-chat-send', handler)
    return () => window.removeEventListener('peridot:agent-chat-send', handler)
  }, [handleSend, isStreaming])

  const handleRegenerate = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUserMsg) {
      sendMessage(lastUserMsg.content)
    }
  }, [messages, sendMessage])

  // Auto-resume: select the most recent conversation on initial load
  const [hasAutoResumed, setHasAutoResumed] = useState(false)
  useEffect(() => {
    if (
      !hasAutoResumed &&
      !convLoading &&
      !activeConversationId &&
      conversations.length > 0
    ) {
      setActiveConversationId(conversations[0].id)
      setHasAutoResumed(true)
    }
  }, [hasAutoResumed, convLoading, activeConversationId, conversations])

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === 'k') {
        e.preventDefault()
        handleCreateConversation()
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        setSidebarCollapsed((p) => !p)
      }
      if (e.key === 'Escape' && mobileDrawerOpen) {
        setMobileDrawerOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleCreateConversation, mobileDrawerOpen])

  // Dismiss error
  const [dismissedError, setDismissedError] = useState(false)
  useEffect(() => {
    if (error) setDismissedError(false)
  }, [error])

  // ── Auth gate ────────────────────────────────────────────────────
  // Privy users pass straight through. A pure-Freighter user (external Stellar
  // wallet, no Privy session) signs a message to mint an agent session, then
  // the same chat works. Anyone with neither gets the connect CTA.
  const stellarSignedIn = stellarAuth.status === 'authed'
  const canChat = authenticated || (stellarWallet.isConnected && stellarSignedIn)
  if (privyReady && !canChat) {
    const stellarMode = stellarWallet.isConnected
    const busy = stellarAuth.status === 'signing' || stellarAuth.status === 'checking'
    return (
      <div className="flex h-full items-center justify-center bg-background border-t border-border/30 rounded-t-xl p-8">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Wallet className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">
            {stellarMode
              ? 'Sign in with your Stellar wallet'
              : 'Connect your wallet to chat with Perry'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {stellarMode
              ? 'Sign a quick message to start a session with Perry. This only proves the wallet is yours — it does not move any funds.'
              : 'Perry uses your wallet to personalize recommendations and pull your live portfolio. Your session stays on-device.'}
          </p>
          {stellarMode && stellarAuth.error ? (
            <p className="text-sm text-destructive">{stellarAuth.error}</p>
          ) : null}
          <button
            onClick={() => (stellarMode ? stellarAuth.signIn() : login())}
            disabled={stellarMode && busy}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {stellarMode
              ? stellarAuth.status === 'signing'
                ? 'Waiting for signature…'
                : stellarAuth.status === 'checking'
                  ? 'Checking…'
                  : 'Sign in with Stellar'
              : 'Connect wallet'}
          </button>
        </div>
      </div>
    )
  }

  if (!privyReady) {
    return (
      <div className="flex h-full items-center justify-center bg-background border-t border-border/30 rounded-t-xl">
        <div className="text-sm text-muted-foreground animate-pulse">Loading session…</div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full overflow-hidden">
      {/* Ambient peridot crystal lattice — fills the full viewport and shows
          through the floating header's frosted-glass background. The sidebar
          has its own gradient bg so the shader is hidden behind it; the main
          pane stays transparent so the shader shows through the gaps. */}
      <CrystalLatticeBackground />

      {/* One-time opt-in prompt for Perry auto-execute (Phase 3.1). Renders
          only when the user has an embedded wallet, hasn't decided yet, and
          hasn't dismissed this session. */}
      <AutoExecuteConsentDialog
        open={shouldShowAutoExecuteConsent}
        onResolve={(choice, limit) => {
          resolveAutoExecuteConsent(choice, limit).catch(() => {})
        }}
      />

      {/* Desktop sidebar (hidden on mobile). pt-* clears the floating header. */}
      <div className="hidden md:flex relative z-10 pt-24 md:pt-28 lg:pt-32">
        <ChatSidebar
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={handleSelectConversation}
          onCreate={handleCreateConversation}
          onDelete={handleDeleteConversation}
          onArchive={handleArchiveConversation}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
          profile={profile}
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived((p) => !p)}
        />
      </div>

      {/* Mobile drawer overlay */}
      <AnimatePresence>
        {mobileDrawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              onClick={() => setMobileDrawerOpen(false)}
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed inset-y-0 left-0 z-50 w-[280px] md:hidden"
            >
              <ChatSidebar
                conversations={conversations}
                activeId={activeConversationId}
                onSelect={handleSelectConversation}
                onCreate={handleCreateConversation}
                onDelete={handleDeleteConversation}
                onArchive={handleArchiveConversation}
                isCollapsed={false}
                onToggleCollapse={() => setMobileDrawerOpen(false)}
                profile={profile}
                showArchived={showArchived}
                onToggleArchived={() => setShowArchived((p) => !p)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main chat area. pt-* clears the floating header so messages start
          below it; the canvas keeps painting under the header pill. */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10 pt-24 md:pt-28 lg:pt-32">
        {/* Mobile top bar with hamburger */}
        <div className="flex md:hidden items-center gap-3 px-4 py-2 border-b border-border/30">
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors"
          >
            <Menu className="w-5 h-5 text-muted-foreground" />
          </button>
          <span className="text-sm font-semibold font-inter truncate flex-1">
            {activeConversationId
              ? conversations.find((c) => c.id === activeConversationId)?.title ?? 'Chat'
              : 'Perry Agent'}
          </span>
          {isStreaming && (
            <span
              className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"
              style={{ boxShadow: '0 0 10px rgba(16,185,129,0.7)' }}
              aria-label="Perry is thinking"
              role="status"
            />
          )}
        </div>

        {/* Error banner */}
        {(error || localError) && !dismissedError && (
          <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{localError ?? error}</span>
            <button
              onClick={handleRegenerate}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-destructive/10 hover:bg-destructive/20 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
            <button
              onClick={() => setDismissedError(true)}
              className="p-0.5 rounded hover:bg-destructive/10 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Messages */}
        <ChatMessageList
          messages={messages}
          isStreaming={isStreaming}
          streamingText={streamingText}
          streamingBlocks={streamingBlocks}
          onSuggestionClick={handleSuggestionClick}
          onRegenerate={handleRegenerate}
        />

        {/* Input — only block while actively streaming, not while background queries load */}
        <ChatInputBar
          onSend={handleSend}
          onStop={stopStreaming}
          isStreaming={isStreaming}
          disabled={isStreaming}
        />
      </div>
    </div>
  )
}
