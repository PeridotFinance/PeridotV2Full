'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Headset, X, Send, Loader2, Sparkles, UserRound, MessageSquarePlus } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { usePathname } from 'next/navigation'
import { usePrivy } from '@privy-io/react-auth'

// Theme-token-driven markdown renderer for non-user bubbles. Agent replies
// often arrive with bullet lists, bold, paragraphs, occasional links — this
// keeps them legible without any styling work upstream. Plain `<p>` is kept
// for user messages (they don't write markdown and the white-on-primary
// styling stays simple).
function SupportMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-1.5">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="my-1.5 ml-4 space-y-0.5 list-disc marker:text-current/40">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1.5 ml-4 space-y-0.5 list-decimal marker:text-current/50">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              {children}
            </a>
          ),
          code: ({ children, className: codeClass }) => {
            const isBlock = codeClass?.includes('language-')
            if (isBlock) {
              return (
                <code className="block my-2 p-2.5 rounded-xl bg-background/60 border border-current/10 text-[12.5px] font-mono overflow-x-auto whitespace-pre">
                  {children}
                </code>
              )
            }
            return (
              <code className="px-1.5 py-0.5 rounded bg-background/50 text-[12.5px] font-mono">
                {children}
              </code>
            )
          },
          pre: ({ children }) => <div className="my-2">{children}</div>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 pl-2.5 border-l-2 border-current/20 opacity-80 italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-2.5 border-current/10" />,
          h1: ({ children }) => (
            <h3 className="text-[14px] font-bold mt-2 mb-1 first:mt-0">
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h3 className="text-[14px] font-bold mt-2 mb-1 first:mt-0">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h3 className="text-[13px] font-semibold mt-1.5 mb-0.5 first:mt-0">
              {children}
            </h3>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-xl border border-current/10">
              <table className="w-full text-[12.5px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="px-2.5 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wider opacity-70 bg-current/[0.04]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-2.5 py-1.5 border-t border-current/10">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// Thinking bubble — same anatomy as an agent message bubble (avatar + label +
// rounded bubble), but with three bouncing dots inside. Rendered when the
// last message in the thread is from the user, so we naturally clear it the
// moment any agent / team / system message arrives.
function ThinkingBubble() {
  return (
    <div className="flex gap-2 max-w-[85%] self-start animate-in fade-in slide-in-from-bottom-1 duration-300">
      <Avatar className="h-8 w-8 mt-1 shrink-0 rounded-2xl overflow-hidden">
        <AvatarFallback className="bg-primary/15 text-primary text-xs rounded-2xl flex items-center justify-center">
          <Sparkles className="h-3.5 w-3.5" />
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-1 items-start">
        <span className="text-[10px] text-muted-foreground ml-1">
          Peridot Assistant
        </span>
        <div className="bg-primary/5 text-foreground border border-primary/10 rounded-2xl rounded-tl-none px-3.5 py-2.5 shadow-sm">
          <div className="flex gap-1 items-center h-3.5">
            <span
              className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce"
              style={{ animationDelay: '0ms', animationDuration: '900ms' }}
            />
            <span
              className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce"
              style={{ animationDelay: '150ms', animationDuration: '900ms' }}
            />
            <span
              className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce"
              style={{ animationDelay: '300ms', animationDuration: '900ms' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Types ---

type SenderType = 'user' | 'team' | 'agent'

interface Message {
  id: number
  senderType: SenderType
  content: string
  // Set on agent rows that are still being streamed into the DB. Drives the
  // adaptive polling cadence and a small "still typing" cursor on the bubble.
  isStreaming?: boolean
  createdAt: string
}

const senderLabel = (s: SenderType) =>
  s === 'agent' ? 'Peridot Assistant' : 'Peridot Team'

// Small blinking cursor appended to streaming agent bubbles so the user can
// tell apart "still typing" from "done". Disappears the instant the row's
// is_streaming flag flips to false on the server.
function StreamingCursor() {
  return (
    <span
      aria-hidden
      className="inline-block w-[6px] h-[14px] align-[-1px] ml-0.5 bg-primary/60 animate-pulse rounded-sm"
    />
  )
}

interface SupportSession {
  sessionId: string
  isNew: boolean
}

// --- Constants ---

const LOCAL_STORAGE_KEY = 'peridot_support_session_id'
// Adaptive polling: while we're waiting on an agent/team reply (last message
// from user), poll fast so the answer shows up snappy. Once a reply has
// landed, slow down to save round-trips when the user is just reading.
const POLLING_INTERVAL_FAST = 2000   // waiting on a reply
const POLLING_INTERVAL_IDLE = 6500   // idle / reply already shown

// --- Component ---

export function SupportChat() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isActive, setIsActive] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)
  // Bumped by "start new session" to force the sync effect to re-run and mint a
  // fresh local_session_id (and thus a brand-new DB row, needs_human=false).
  // Without this the effect's deps never change on reset, so no new session is
  // ever created and the input stays disabled.
  const [sessionNonce, setSessionNonce] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const { getAccessToken } = usePrivy()

  // Track wallet/chain state locally in the chat component
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [hubChainId, setHubChainId] = useState<number | null>(null)

  // Listen for wallet sync events from the ContextProvider
  useEffect(() => {
    const handleSync = (e: any) => {
      const { address, chainId } = e.detail
      setWalletAddress(address)
      setHubChainId(chainId)
    }

    window.addEventListener('peridot_support_wallet_sync', handleSync)
    return () => window.removeEventListener('peridot_support_wallet_sync', handleSync)
  }, [])

  // 1. Initialize or Update Session
  useEffect(() => {
    if (!isOpen) return // Only sync if chat is open

    const syncSession = async () => {
      const storedSession = localStorage.getItem(LOCAL_STORAGE_KEY)
      let localId = storedSession
      
      if (!localId) {
        localId = crypto.randomUUID()
        localStorage.setItem(LOCAL_STORAGE_KEY, localId)
      }
      
      try {
         const headers: HeadersInit = { 'Content-Type': 'application/json' }
         
         // Try to get Privy access token if wallet is connected
         if (walletAddress) {
           try {
             const token = await getAccessToken()
             if (token) {
               headers['Authorization'] = `Bearer ${token}`
             }
           } catch (e) {
             console.warn('Could not get Privy token for support chat', e)
           }
         }

         const res = await fetch('/api/support/session', {
           method: 'POST',
           headers,
           body: JSON.stringify({ 
             localSessionId: localId,
             walletAddress: walletAddress,
             hubChainId: hubChainId
           })
         })
         
         if (!res.ok) throw new Error('Failed to sync session')
         
         const data = await res.json()
         if (data.sessionId) {
           setSessionId(data.sessionId) // Store the DB UUID
           setIsActive(data.isActive ?? true)
           setIsInitialized(true)
         }
      } catch (e) {
        console.error('Failed to sync support session', e)
      }
    }

    syncSession()
  }, [isOpen, walletAddress, hubChainId, getAccessToken, sessionNonce]) // Re-sync if open, wallet/chain changes, or a new session was requested

  // Determine if we are on a route that has Web3 providers enabled
  // This matches the logic in RootProviders.tsx
  const isWeb3Route = 
    pathname?.startsWith('/app') || 
    pathname?.startsWith('/redeem') || 
    pathname?.startsWith('/connect') ||
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/bridge')

  // 2. Fetch Messages
  const { data: messages = [], isLoading, refetch } = useQuery({
    queryKey: ['support-messages', sessionId],
    queryFn: async () => {
      if (!sessionId) return []
      const res = await fetch(`/api/support/messages?sessionId=${sessionId}`)
      if (!res.ok) throw new Error('Failed to fetch messages')
      const data = await res.json()
      return data.messages as Message[]
    },
    enabled: !!sessionId && isOpen, // Only fetch when open
    refetchInterval: (q) => {
      if (!isOpen) return false
      const list = (q.state.data as Message[] | undefined) ?? []
      const last = list[list.length - 1]
      // Fast poll while we're waiting on a reply OR a reply is mid-stream.
      // Slow poll once the latest agent message is fully written.
      const isWaiting = last?.senderType === 'user' || last?.isStreaming === true
      return isWaiting ? POLLING_INTERVAL_FAST : POLLING_INTERVAL_IDLE
    },
  })

  // 3. Send Message Mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!sessionId) throw new Error('No session ID')
      const res = await fetch('/api/support/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          content,
          // Helps the AI agent ground its references — "this page" etc.
          currentPath: pathname ?? undefined,
        }),
      })
      if (!res.ok) throw new Error('Failed to send message')
      return res.json()
    },
    onMutate: async (newContent) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['support-messages', sessionId] })
      const previousMessages = queryClient.getQueryData(['support-messages', sessionId])

      const optimisitcMessage: Message = {
        id: Date.now(), // temporary ID
        senderType: 'user',
        content: newContent,
        createdAt: new Date().toISOString(),
      }

      queryClient.setQueryData(['support-messages', sessionId], (old: Message[] = []) => [
        ...old,
        optimisitcMessage,
      ])

      return { previousMessages }
    },
    onError: (err, newTodo, context) => {
      queryClient.setQueryData(['support-messages', sessionId], context?.previousMessages)
      console.error(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['support-messages', sessionId] })
    },
  })

  // Filter out empty streaming agent placeholders — between the row INSERT
  // and the first text delta there's a brief window where the row exists
  // with empty content. We'd render an awkward empty bubble; instead we
  // let the ThinkingBubble continue to show.
  const visibleMessages = messages.filter(
    (m) => !(m.senderType === 'agent' && m.isStreaming && !m.content.trim()),
  )

  // Show the thinking bubble whenever we're between the user's send and the
  // first token of the agent reply. Either the last visible message is from
  // the user (no agent row yet) or the last row IS the empty streaming
  // placeholder (which we just filtered out above).
  const lastVisible = visibleMessages[visibleMessages.length - 1]
  const showThinking =
    isActive &&
    visibleMessages.length > 0 &&
    lastVisible?.senderType === 'user'

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  const handleSend = () => {
    if (!inputValue.trim()) return
    sendMessageMutation.mutate(inputValue)
    setInputValue('')
  }

  const handleRequestHuman = () => {
    if (!sessionId || sendMessageMutation.isPending) return
    // Deterministic escalation: flip needs_human server-side immediately so the
    // Telegram bot has a hard signal to ping the team — independent of whatever
    // the agent replies. Fire-and-forget; the visible message below is what the
    // user (and the conversation log) sees.
    fetch('/api/support/escalate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).catch((e) => console.warn('Could not flag session for human', e))
    sendMessageMutation.mutate('🙋 I would like to speak with a human, please.')
  }

  const handleStartNewSession = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY)
    setSessionId(null)
    setIsActive(true)
    setIsInitialized(false)
    setInputValue('')
    queryClient.setQueryData(['support-messages', null], [])
    queryClient.invalidateQueries({ queryKey: ['support-messages'] })
    // Force the sync effect to re-run — mints a fresh local id + DB row so the
    // input re-enables and the "needs human" flag resets (new row defaults to
    // false). Without this the chat would stay frozen with no session.
    setSessionNonce((n) => n + 1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // The Easy mobile shell (bottom nav) covers the Home route `/app` (exact),
  // the deep Easy subroutes `/app/easy/*`, and the standalone Borrow page.
  // Home is NOT under /app/easy, so it must be matched explicitly — otherwise
  // the launcher falls back to its default bottom-right position and overlaps
  // the Profile tab in the bottom nav.
  //
  // Margin joins them for a different reason: no bottom nav, but a single dense
  // column of numbers that runs the height of the phone. The round launcher
  // parks a 56px disc over the bottom-right corner of it, which is where the
  // order summary's values and the "why can't I trade" line sit — the last two
  // things read before committing. The peekaboo tab occupies a ~22px sliver of
  // the edge instead.
  const isEasyDev =
    pathname === '/app' ||
    pathname === '/app/borrow' ||
    pathname === '/app/margin' ||
    pathname?.startsWith('/app/easy')
  /** …but only the Easy shell actually renders one. */
  const hasBottomNav = isEasyDev && pathname !== '/app/margin'

  if (isEasyDev) {
    return (
      <>
        {/* ── Peekaboo tab ────────────────────────────────────────────────────
            Closed: almost fully off-screen to the right, only a 6px sliver
            visible at the edge. Click → springs in fully + chat opens.       */}
        <motion.button
          initial={false}
          animate={{ x: isOpen ? 0 : 'calc(100% - 22px)' }}
          transition={{ type: 'spring', damping: 26, stiffness: 260 }}
          onClick={() => setIsOpen((o) => !o)}
          aria-label="Support chat"
          // Mobile: dock just above the bottom nav (4.5rem tall + safe-area) so the
          // peekaboo tab can never overlap the right-most Profile tab. Desktop has
          // no bottom nav (DevNav is md:hidden) → restore the original mid-edge spot.
          // While open on mobile the panel's own header X closes it, so the tab
          // would just overlap the panel input → hide it there.
          className={cn(
            "fixed right-0 z-[55] md:bottom-auto md:top-[65%] flex items-center gap-2 pl-[7px] pr-3 py-3 rounded-l-2xl bg-primary shadow-xl cursor-pointer select-none active:brightness-90",
            // The 5.75rem lift exists to clear the bottom nav. Margin has none,
            // so the same number would leave the tab hovering in the middle of
            // the trade panel's right edge for no reason.
            hasBottomNav
              ? "bottom-[calc(env(safe-area-inset-bottom,0px)+5.75rem)]"
              : "bottom-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]",
            isOpen && "max-md:hidden"
          )}
        >
          {/* Icon — sits in the peekaboo sliver as the visual hint */}
          {isOpen
            ? <X className="w-[14px] h-[14px] text-white shrink-0" />
            : <Headset className="w-[14px] h-[14px] text-white shrink-0" />
          }
          {/* Label — only visible once tab springs open */}
          <span className="text-[11px] font-bold text-white tracking-wide whitespace-nowrap">
            {isOpen ? 'Close' : 'Help'}
          </span>
        </motion.button>

        {/* ── Chat panel ──────────────────────────────────────────────────── */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              key="easy-chat-panel"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed right-3 z-[55]"
              style={{ bottom: '5.5rem' }}
            >
              <Card className="w-[min(320px,calc(100vw-1.5rem))] h-[440px] shadow-2xl flex flex-col border-primary/20 rounded-2xl overflow-hidden">
                <CardHeader className="p-4 border-b flex flex-row items-center justify-between bg-muted/90 backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Avatar className="h-8 w-8 border-2 border-background rounded-2xl overflow-hidden">
                        <AvatarFallback className="bg-primary text-primary-foreground rounded-2xl">P</AvatarFallback>
                      </Avatar>
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold">Peridot Support</CardTitle>
                      <p className="text-xs text-muted-foreground">Assistant + human team</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {visibleMessages.length > 0 && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-2xl hover:bg-muted text-muted-foreground hover:text-foreground" onClick={handleStartNewSession} title="Start a new conversation">
                        <MessageSquarePlus className="h-4 w-4" />
                        <span className="sr-only">Start new conversation</span>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-2xl hover:bg-muted" onClick={() => setIsOpen(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 p-0 overflow-hidden relative bg-background/50 backdrop-blur-sm">
                  <ScrollArea className="h-full px-4 py-4">
                    <div className="flex flex-col gap-4 min-h-full">
                      {/* Welcome */}
                      <div className="flex gap-2 max-w-[85%]">
                        <Avatar className="h-8 w-8 mt-1 shrink-0 rounded-2xl overflow-hidden">
                          <AvatarFallback className="bg-primary text-primary-foreground text-xs rounded-2xl">P</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground ml-1">Peridot Team</span>
                          <div className="bg-muted p-3 rounded-2xl rounded-tl-none text-sm shadow-sm">
                            <p>Hi there! 👋 How can we help you with Peridot Finance today?</p>
                          </div>
                        </div>
                      </div>

                      {visibleMessages.map((msg, index) => {
                        const isUser = msg.senderType === 'user'
                        const isAgent = msg.senderType === 'agent'
                        const streaming = isAgent && msg.isStreaming
                        return (
                          <div key={msg.id || index} className={cn('flex gap-2 max-w-[85%]', isUser ? 'self-end flex-row-reverse' : 'self-start')}>
                            {!isUser && (
                              <Avatar className="h-8 w-8 mt-1 shrink-0 rounded-2xl overflow-hidden">
                                <AvatarFallback className={cn('text-xs rounded-2xl flex items-center justify-center', isAgent ? 'bg-primary/15 text-primary' : 'bg-primary text-primary-foreground')}>
                                  {isAgent ? <Sparkles className="h-3.5 w-3.5" /> : 'P'}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div className={cn('flex flex-col gap-1 min-w-0', isUser ? 'items-end' : 'items-start')}>
                              {!isUser && <span className="text-[10px] text-muted-foreground ml-1">{senderLabel(msg.senderType)}</span>}
                              <div className={cn('p-3 rounded-2xl text-sm break-words shadow-sm', isUser ? 'bg-primary text-primary-foreground rounded-tr-none' : isAgent ? 'bg-primary/5 text-foreground border border-primary/10 rounded-tl-none' : 'bg-muted text-foreground rounded-tl-none')}>
                                {isUser
                                  ? <p className="whitespace-pre-wrap">{msg.content}</p>
                                  : <><SupportMarkdown content={msg.content} />{streaming && <StreamingCursor />}</>
                                }
                              </div>
                              <span className="text-[10px] text-muted-foreground opacity-70 px-1">
                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        )
                      })}

                      {showThinking && <ThinkingBubble />}
                      <div ref={scrollRef} />
                    </div>
                  </ScrollArea>
                </CardContent>

                <CardFooter className="p-3 border-t bg-muted/10 backdrop-blur-md">
                  {!isActive ? (
                    <div className="w-full flex flex-col gap-2">
                      <div className="w-full text-center py-3 px-2 bg-muted/30 rounded-2xl border border-dashed border-muted-foreground/30">
                        <p className="text-xs text-muted-foreground italic font-medium">This conversation has been resolved.</p>
                      </div>
                      <Button onClick={handleStartNewSession} className="w-full rounded-2xl">Start New Session</Button>
                    </div>
                  ) : (
                    <div className="flex w-full flex-col gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRequestHuman}
                        disabled={!sessionId || sendMessageMutation.isPending}
                        className="w-full rounded-2xl text-xs gap-1.5 h-8 border-primary/20 text-primary hover:bg-primary/5"
                      >
                        <UserRound className="h-3.5 w-3.5" />
                        Get Human
                      </Button>
                      <form className="flex w-full gap-2 items-end" onSubmit={(e) => { e.preventDefault(); handleSend() }}>
                        <Input value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type a message..." className="flex-1 bg-background/50 focus-visible:ring-1 min-h-[44px] rounded-2xl border-primary/10" />
                        <Button type="submit" size="icon" disabled={!inputValue.trim() || sendMessageMutation.isPending || !sessionId} className={cn('h-[44px] w-[44px] rounded-2xl', (inputValue.trim() && sessionId) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                          {sendMessageMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                        </Button>
                      </form>
                    </div>
                  )}
                </CardFooter>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6 pointer-events-none">
      <div
        className={cn(
          "origin-bottom-right transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          isOpen 
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto visible" 
            : "opacity-0 scale-95 translate-y-4 pointer-events-none invisible h-0 w-0"
        )}
      >
        <Card className="w-[350px] sm:w-[380px] h-[500px] shadow-2xl flex flex-col border-primary/20 rounded-2xl overflow-hidden pointer-events-auto">
          <CardHeader className="p-4 border-b flex flex-row items-center justify-between bg-muted/90 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Avatar className="h-8 w-8 border-2 border-background rounded-2xl overflow-hidden">
                  <AvatarFallback className="bg-primary text-primary-foreground rounded-2xl">P</AvatarFallback>
                </Avatar>
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold">Peridot Support</CardTitle>
                <p className="text-xs text-muted-foreground">Talk directly to a human</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {visibleMessages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-2xl hover:bg-muted text-muted-foreground hover:text-foreground"
                  onClick={handleStartNewSession}
                  title="Start a new conversation"
                >
                  <MessageSquarePlus className="h-4 w-4" />
                  <span className="sr-only">Start new conversation</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-2xl hover:bg-muted"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close chat</span>
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="flex-1 p-0 overflow-hidden relative bg-background/50 backdrop-blur-sm">
            <ScrollArea className="h-full px-4 py-4">
              <div className="flex flex-col gap-4 min-h-full">
                {/* Welcome Message */}
                <div className="flex gap-2 max-w-[85%]">
                  <Avatar className="h-8 w-8 mt-1 shrink-0 rounded-2xl overflow-hidden">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs rounded-2xl">P</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-muted-foreground ml-1">Peridot Team</span>
                    <div className="bg-muted p-3 rounded-2xl rounded-tl-none text-sm shadow-sm">
                      <p>Hi there! 👋 How can we help you with Peridot Finance today?</p>
                    </div>
                  </div>
                </div>

                {/* Message List */}
                {visibleMessages.map((msg, index) => {
                  const isUser = msg.senderType === 'user'
                  const isAgent = msg.senderType === 'agent'
                  const streaming = isAgent && msg.isStreaming
                  return (
                    <div
                      key={msg.id || index}
                      className={cn(
                        "flex gap-2 max-w-[85%]",
                        isUser ? "self-end flex-row-reverse" : "self-start"
                      )}
                    >
                      {!isUser && (
                        <Avatar className="h-8 w-8 mt-1 shrink-0 rounded-2xl overflow-hidden">
                          <AvatarFallback className={cn(
                            "text-xs rounded-2xl flex items-center justify-center",
                            isAgent ? "bg-primary/15 text-primary" : "bg-primary text-primary-foreground"
                          )}>
                            {isAgent ? <Sparkles className="h-3.5 w-3.5" /> : "P"}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className={cn("flex flex-col gap-1 min-w-0", isUser ? "items-end" : "items-start")}>
                        {!isUser && <span className="text-[10px] text-muted-foreground ml-1">{senderLabel(msg.senderType)}</span>}
                        <div
                          className={cn(
                            "p-3 rounded-2xl text-sm break-words shadow-sm",
                            isUser
                              ? "bg-primary text-primary-foreground rounded-tr-none"
                              : isAgent
                                ? "bg-primary/5 text-foreground border border-primary/10 rounded-tl-none"
                                : "bg-muted text-foreground rounded-tl-none"
                          )}
                        >
                          {isUser ? (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          ) : (
                            <>
                              <SupportMarkdown content={msg.content} />
                              {streaming && <StreamingCursor />}
                            </>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground opacity-70 px-1 flex items-center gap-1">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {isUser && (
                            <span className="text-[8px] opacity-50">✓</span>
                          )}
                        </span>
                      </div>
                    </div>
                  )
                })}

                {/* Thinking Indicator — same anatomy as an agent bubble so the
                    flow stays visually consistent. Disappears the moment the
                    first agent text-delta lands (i.e. the streaming bubble
                    becomes non-empty). */}
                {showThinking && <ThinkingBubble />}
                
                {/* Invisible div for auto-scrolling */}
                <div ref={scrollRef} />
              </div>
            </ScrollArea>
          </CardContent>

          <CardFooter className="p-3 border-t bg-muted/10 backdrop-blur-md">
            {!isActive ? (
              <div className="w-full flex flex-col gap-2">
                <div className="w-full text-center py-3 px-2 bg-muted/30 rounded-2xl border border-dashed border-muted-foreground/30">
                  <p className="text-xs text-muted-foreground italic font-medium">This conversation has been resolved.</p>
                </div>
                <Button 
                  onClick={handleStartNewSession}
                  className="w-full rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all duration-200 py-5"
                >
                  Start New Session
                </Button>
              </div>
            ) : (
              <div className="flex w-full flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRequestHuman}
                  disabled={!sessionId || sendMessageMutation.isPending}
                  className="w-full rounded-2xl text-xs gap-1.5 h-9 border-primary/20 text-primary hover:bg-primary/5 transition-colors"
                >
                  <UserRound className="h-3.5 w-3.5" />
                  Get Human
                </Button>
                <form
                  className="flex w-full gap-2 items-end"
                  onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                >
                  <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    className="flex-1 bg-background/50 focus-visible:ring-1 min-h-[44px] rounded-2xl border-primary/10 shadow-inner"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!inputValue.trim() || sendMessageMutation.isPending || !sessionId}
                    className={cn(
                      "h-[44px] w-[44px] rounded-2xl transition-all duration-300 shadow-md",
                      (inputValue.trim() && sessionId)
                        ? "bg-primary text-primary-foreground hover:scale-105 active:scale-95"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {sendMessageMutation.isPending || (isOpen && isInitialized && !sessionId) ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                    <span className="sr-only">Send</span>
                  </Button>
                </form>
              </div>
            )}
          </CardFooter>
        </Card>
      </div>

      <Button
        onClick={() => setIsOpen(!isOpen)}
        size="icon"
        className={cn(
          "h-14 w-14 rounded-2xl shadow-xl transition-all duration-500 ease-in-out relative overflow-hidden active:scale-90 hover:scale-105 pointer-events-auto",
          isOpen ? "bg-destructive hover:bg-destructive/90 rotate-[360deg]" : "bg-primary hover:bg-primary/90 hover:shadow-primary/20"
        )}
      >
        <div className="relative h-full w-full flex items-center justify-center">
          <X 
            className={cn(
              "h-6 w-6 transition-all duration-500 absolute",
              isOpen ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"
            )} 
          />
          <Headset 
            className={cn(
              "h-6 w-6 transition-all duration-500 absolute",
              isOpen ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"
            )} 
          />
        </div>
        <span className="sr-only">Toggle support chat</span>
      </Button>
    </div>
  )
}

