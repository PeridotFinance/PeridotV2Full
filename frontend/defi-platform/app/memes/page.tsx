'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { Download, Flame, Trophy, ImageIcon, Zap, Heart, RefreshCw, Sparkles, X, AlertCircle, CheckCircle2, Info } from 'lucide-react'

/* ─────────────────────────── canvas constants ─────────────────────────── */

const CW = 800
const CH = 500

function buildSubmitMessage(wallet: string, timestamp: number) {
  return `Peridot: submit meme for ${wallet} at ${timestamp}`
}
function buildVoteSessionMessage(wallet: string, timestamp: number) {
  return `Peridot: meme voting session for ${wallet} at ${timestamp}`
}

const SESSION_KEY    = 'peridot_meme_session'
const SESSION_WINDOW = 8 * 60 * 60 * 1000

type VoteSession = { signature: string; timestamp: number; wallet: string }

function loadSession(wallet: string): VoteSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s: VoteSession = JSON.parse(raw)
    if (s.wallet.toLowerCase() !== wallet.toLowerCase()) return null
    if (Date.now() - s.timestamp > SESSION_WINDOW) { sessionStorage.removeItem(SESSION_KEY); return null }
    return s
  } catch { return null }
}
function saveSession(session: VoteSession) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)) } catch { /* ignore */ }
}

/* ─────────────────────── template / overlay data ──────────────────────── */

type Template = { id: string; label: string; type: 'gradient' | 'image'; colors?: string[]; src?: string; accentGlow?: string }

const TEMPLATES: Template[] = [
  { id: 'dark-peridot', label: '🌿 Peridot Dark', type: 'gradient', colors: ['#030a03', '#071407', '#0c2010'], accentGlow: 'rgba(50,200,100,0.14)' },
  { id: 'neon',         label: '⚡ Neon Degen',   type: 'gradient', colors: ['#020206', '#05050f', '#0a0a1e'], accentGlow: 'rgba(0,240,255,0.16)' },
  { id: 'olive',        label: '🍃 Olive Grove',  type: 'gradient', colors: ['#0c0f07', '#16200c', '#203014'], accentGlow: 'rgba(120,180,50,0.12)' },
  { id: 'fire',         label: '🔥 Degen Mode',   type: 'gradient', colors: ['#0f0202', '#1d0404', '#2a0808'], accentGlow: 'rgba(255,60,0,0.18)' },
  { id: 'network',      label: '🌐 DeFi Net',     type: 'image', src: '/interconnected-geometric-finance.webp' },
  { id: 'abstract',     label: '💎 Abstract',     type: 'image', src: '/abstract-defi-network.png' },
]

type Overlay = { id: string; label: string; src: string | null }
const OVERLAYS: Overlay[] = [
  { id: 'none',    label: 'None',      src: null },
  { id: 'owl',     label: '🦉 Owl',    src: '/Owl Mascot - Colored.svg' },
  { id: 'owl-btc', label: '₿ BTC Owl', src: '/Owl Mascot - Bitcoin - Colored.svg' },
  { id: 'icon',    label: '💚 Icon',   src: '/Peridot-Icon-Only-Mint-Green.svg' },
  { id: 'logo',    label: '🏷 Logo',   src: '/Peridot-Logo-Green-White-Typeface.svg' },
]

const TOP_SUGGESTIONS    = ['wen mainnet?', 'ser pls', 'WAGMI', 'LFG 🚀', 'ngmi without DeFi']
const BOTTOM_SUGGESTIONS = ['peridot.finance', 'Cross-chain or nothing', '#PeridotMeme', '$P season 2', 'supply. borrow. win.']

/* ─────────────────────────── sticker types ─────────────────────────── */

type StickerId = 'identity' | 'apy'

type UserData = {
  username: string | null
  rank: number | null
  badge: { icon: string; borderColor: string | null; name: string } | null
}

/* ───────────────────────────── gallery types ───────────────────────────── */

type Meme = { id: number; image_url: string; image_url_hd: string | null; creator_name: string | null; wallet_address: string; votes: number; created_at: string }

function truncateAddr(addr: string) { return `${addr.slice(0, 6)}…${addr.slice(-4)}` }

/* ─────────────── canvas helpers: meme text ─────────────── */

function drawMemeText(ctx: CanvasRenderingContext2D, text: string, cw: number, ch: number, position: 'top' | 'bottom') {
  if (!text.trim()) return
  const words = text.toUpperCase().split(' ')
  let fontSize = 68
  ctx.font = `900 ${fontSize}px Impact, 'Arial Black', sans-serif`
  while (ctx.measureText(words.join(' ')).width > cw - 50 && fontSize > 20) {
    fontSize -= 2; ctx.font = `900 ${fontSize}px Impact, 'Arial Black', sans-serif`
  }
  const lines: string[] = []; let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (ctx.measureText(test).width > cw - 50) { if (current) lines.push(current); current = word } else { current = test }
  }
  if (current) lines.push(current)
  const lineH = fontSize * 1.18
  ctx.textAlign = 'center'; ctx.lineJoin = 'round'
  if (position === 'top') {
    lines.forEach((line, i) => {
      const y = 20 + fontSize + i * lineH
      ctx.lineWidth = Math.max(fontSize * 0.09, 3); ctx.strokeStyle = 'rgba(0,0,0,0.95)'; ctx.strokeText(line, cw / 2, y)
      ctx.fillStyle = '#fff'; ctx.fillText(line, cw / 2, y)
    })
  } else {
    const startY = ch - 22 - lines.length * lineH + fontSize
    lines.forEach((line, i) => {
      const y = startY + i * lineH
      ctx.lineWidth = Math.max(fontSize * 0.09, 3); ctx.strokeStyle = 'rgba(0,0,0,0.95)'; ctx.strokeText(line, cw / 2, y)
      ctx.fillStyle = '#fff'; ctx.fillText(line, cw / 2, y)
    })
  }
}

/* ─────────────── canvas helpers: sticker drawing (for export) ─────────────── */

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawIdentityOnCanvas(ctx: CanvasRenderingContext2D, x: number, y: number, userData: UserData, address: string) {
  const emoji       = userData.badge?.icon ?? ''
  const borderColor = userData.badge?.borderColor ?? '#4ade80'
  const name        = userData.username ? `@${userData.username}` : truncateAddr(address)
  const rankText    = userData.rank ? `  #${userData.rank}` : ''

  const BASE = 28
  ctx.font = `700 ${BASE}px Inter, -apple-system, sans-serif`
  const nameW  = ctx.measureText(name).width
  const rankW  = rankText ? ctx.measureText(rankText).width : 0
  const emojiW = emoji ? BASE + 10 : 0
  const pad    = 22
  const h      = 50
  const w      = pad * 2 + emojiW + nameW + rankW + 4
  const r      = h / 2

  ctx.fillStyle = 'rgba(0,0,0,0.80)'
  roundRect(ctx, x, y, w, h, r); ctx.fill()
  ctx.strokeStyle = borderColor; ctx.lineWidth = 3
  roundRect(ctx, x, y, w, h, r); ctx.stroke()

  ctx.textBaseline = 'middle'
  let tx = x + pad
  if (emoji) {
    ctx.font = `${BASE}px serif`; ctx.fillStyle = '#fff'
    ctx.fillText(emoji, tx, y + h / 2); tx += emojiW
  }
  ctx.font = `700 ${BASE}px Inter, -apple-system, sans-serif`
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'
  ctx.fillText(name, tx, y + h / 2); tx += nameW
  if (rankText) {
    ctx.font = `400 ${BASE * 0.75}px Inter, -apple-system, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillText(rankText, tx, y + h / 2)
  }
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center'
}

function drawApyOnCanvas(ctx: CanvasRenderingContext2D, x: number, y: number, apy: number) {
  const text   = `📈 ${apy.toFixed(1)}% APY`
  const BASE   = 28
  ctx.font     = `900 ${BASE}px Inter, -apple-system, sans-serif`
  const textW  = ctx.measureText(text).width
  const pad    = 26
  const h      = 50
  const w      = textW + pad * 2
  const r      = h / 2

  ctx.fillStyle = 'rgba(74,222,128,0.92)'
  roundRect(ctx, x, y, w, h, r); ctx.fill()
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
  ctx.fillStyle = '#071407'
  ctx.fillText(text, x + pad, y + h / 2)
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center'
}

/* ─────────────────────────── toast system ──────────────────────────── */

type ToastType = 'success' | 'error' | 'info'
type Toast     = { id: number; type: ToastType; text: string }

/* ═════════════════════════════ page ═════════════════════════════ */

export default function MemeLab() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync }     = useSignMessage()
  const canvasRef          = useRef<HTMLCanvasElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)

  /* ── meme controls ── */
  const [template,     setTemplate]    = useState(TEMPLATES[0].id)
  const [overlay,      setOverlay]     = useState('owl')
  const [topText,      setTopText]     = useState('')
  const [bottomText,   setBottomText]  = useState('peridot.finance')
  const [creatorName,  setCreatorName] = useState('')
  const [submitPhase,  setSubmitPhase] = useState<'idle' | 'signing' | 'uploading'>('idle')
  const [submitMsg,    setSubmitMsg]   = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  /* ── toast notifications ── */
  const [toasts, setToasts] = useState<Toast[]>([])
  const addToast = useCallback((type: ToastType, text: string) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])
  const dismissToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id))

  /* ── gallery ── */
  const [memes,        setMemes]        = useState<Meme[]>([])
  const [total,        setTotal]        = useState(0)
  const [loadingMemes, setLoadingMemes] = useState(true)
  const [galleryError, setGalleryError] = useState<string | null>(null)
  const [votedMemes,   setVotedMemes]   = useState<Set<number>>(new Set())
  const [votingId,     setVotingId]     = useState<number | null>(null)

  /* ── sticker user data ── */
  const [userData, setUserData] = useState<UserData | null>(null)
  const [bestApy,  setBestApy]  = useState<number | null>(null)

  /* ── sticker visibility (state = triggers render toggle) ── */
  const [stickerVisible, setStickerVisible] = useState<Record<StickerId, boolean>>({
    identity: false,
    apy:      false,
  })

  /* ── sticker positions — ref + direct DOM update, zero re-renders during drag ── */
  const stickerPos = useRef<Record<StickerId, { x: number; y: number }>>({
    identity: { x: 14, y: 14 },
    apy:      { x: 14, y: 80 },
  })
  const stickerDomRef = {
    identity: useRef<HTMLDivElement>(null),
    apy:      useRef<HTMLDivElement>(null),
  }
  const dragState = useRef<{ id: StickerId; ox: number; oy: number } | null>(null)

  const imgCache = useRef<Record<string, HTMLImageElement>>({})

  /* ── fetch user data when wallet connects ── */
  useEffect(() => {
    if (!address) { setUserData(null); return }
    fetch(`/api/leaderboard?wallet=${address}`)
      .then(r => r.json())
      .then(data => {
        const u = data.user
        setUserData({
          username: u?.username ?? null,
          rank:     u?.global_rank ?? null,
          badge:    u?.displayBadge ? { icon: u.displayBadge.icon, borderColor: u.displayBadge.borderColor, name: u.displayBadge.name } : null,
        })
      })
      .catch(() => {})
  }, [address])

  /* ── fetch best APY on mount ── */
  useEffect(() => {
    fetch('/api/apy')
      .then(r => r.json())
      .then(data => {
        if (!data.data) return
        let max = 0
        for (const assetMap of Object.values(data.data) as Record<number, { totalSupplyApy?: number }>[])
          for (const chainData of Object.values(assetMap))
            if ((chainData.totalSupplyApy ?? 0) > max) max = chainData.totalSupplyApy!
        if (max > 0) setBestApy(max)
      })
      .catch(() => {})
  }, [])

  /* ── image preloader ── */
  const loadImg = useCallback((src: string): Promise<HTMLImageElement> => {
    if (imgCache.current[src]) return Promise.resolve(imgCache.current[src])
    return new Promise((resolve, reject) => {
      const img = new window.Image()
      img.crossOrigin = 'anonymous'
      img.onload  = () => { imgCache.current[src] = img; resolve(img) }
      img.onerror = reject
      img.src     = src
    })
  }, [])

  /* ── canvas renderer (background + text only — stickers composited separately for export) ── */
  const drawMeme = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const tmpl = TEMPLATES.find(t => t.id === template) ?? TEMPLATES[0]
    const ovl  = OVERLAYS.find(o => o.id === overlay)

    if (tmpl.type === 'gradient' && tmpl.colors) {
      const grad = ctx.createRadialGradient(CW / 2, CH / 2, 0, CW / 2, CH / 2, Math.hypot(CW, CH) * 0.6)
      grad.addColorStop(0, tmpl.colors[1]); grad.addColorStop(0.6, tmpl.colors[1]); grad.addColorStop(1, tmpl.colors[0])
      ctx.fillStyle = grad; ctx.fillRect(0, 0, CW, CH)
      ctx.strokeStyle = 'rgba(255,255,255,0.025)'; ctx.lineWidth = 0.5
      for (let x = 0; x < CW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke() }
      for (let y = 0; y < CH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke() }
      if (tmpl.accentGlow) {
        const glow = ctx.createRadialGradient(CW / 2, CH / 2, 0, CW / 2, CH / 2, 260)
        glow.addColorStop(0, tmpl.accentGlow); glow.addColorStop(1, 'transparent')
        ctx.fillStyle = glow; ctx.fillRect(0, 0, CW, CH)
      }
    } else if (tmpl.type === 'image' && tmpl.src) {
      try {
        const img = await loadImg(tmpl.src)
        const sc  = Math.max(CW / img.width, CH / img.height)
        ctx.drawImage(img, (CW - img.width * sc) / 2, (CH - img.height * sc) / 2, img.width * sc, img.height * sc)
        ctx.fillStyle = 'rgba(0,0,0,0.52)'; ctx.fillRect(0, 0, CW, CH)
      } catch { ctx.fillStyle = '#0a0f0a'; ctx.fillRect(0, 0, CW, CH) }
    }

    if (ovl?.src) {
      try {
        const img = await loadImg(ovl.src)
        const h   = CH * 0.68; const sc = h / img.height; const w = img.width * sc
        ctx.globalAlpha = 0.92; ctx.drawImage(img, CW - w - 16, (CH - h) / 2, w, h); ctx.globalAlpha = 1
      } catch { /* ignore */ }
    }

    drawMemeText(ctx, topText,    CW, CH, 'top')
    drawMemeText(ctx, bottomText, CW, CH, 'bottom')
    ctx.font = '500 13px Inter, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.textAlign = 'right'; ctx.fillText('peridot.finance', CW - 10, CH - 10)
  }, [template, overlay, topText, bottomText, loadImg])

  useEffect(() => { drawMeme() }, [drawMeme])

  /* ── composite stickers onto canvas (only called just before export) ── */
  const compositeStickers = useCallback((ctx: CanvasRenderingContext2D) => {
    const container = canvasContainerRef.current
    if (!container) return
    const rect   = container.getBoundingClientRect()
    const scaleX = CW / rect.width
    const scaleY = CH / rect.height

    if (stickerVisible.identity && isConnected && address) {
      const pos = stickerPos.current.identity
      drawIdentityOnCanvas(ctx, pos.x * scaleX, pos.y * scaleY, userData ?? { username: null, rank: null, badge: null }, address)
    }
    if (stickerVisible.apy && bestApy !== null) {
      const pos = stickerPos.current.apy
      drawApyOnCanvas(ctx, pos.x * scaleX, pos.y * scaleY, bestApy)
    }
  }, [stickerVisible, isConnected, address, userData, bestApy])

  /* ── gallery ── */
  const fetchMemes = useCallback(async () => {
    setLoadingMemes(true)
    setGalleryError(null)
    try {
      const res = await fetch('/api/memes/list')
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setMemes(data.memes ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setGalleryError('Could not load memes. Check your connection and try again.')
    }
    setLoadingMemes(false)
  }, [])

  useEffect(() => { fetchMemes() }, [fetchMemes])

  /* ── sticker drag (pointer capture — no document listeners, zero re-renders) ── */
  const startDrag = (e: React.PointerEvent, id: StickerId) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragState.current = { id, ox: e.clientX - stickerPos.current[id].x, oy: e.clientY - stickerPos.current[id].y }
  }
  const moveDrag = (e: React.PointerEvent, id: StickerId) => {
    if (!dragState.current || dragState.current.id !== id) return
    const container = canvasContainerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const x    = Math.max(0, Math.min(e.clientX - dragState.current.ox, rect.width  - 20))
    const y    = Math.max(0, Math.min(e.clientY - dragState.current.oy, rect.height - 20))
    stickerPos.current[id] = { x, y }
    const el = stickerDomRef[id].current
    if (el) { el.style.left = `${x}px`; el.style.top = `${y}px` }
  }
  const endDrag = () => { dragState.current = null }

  const toggleSticker = (id: StickerId) =>
    setStickerVisible(prev => ({ ...prev, [id]: !prev[id] }))

  /* ── download ── */
  const handleDownload = async () => {
    const canvas = canvasRef.current; if (!canvas) return
    await drawMeme()
    const ctx = canvas.getContext('2d')!
    compositeStickers(ctx)
    const a = document.createElement('a'); a.download = 'peridot-meme.png'; a.href = canvas.toDataURL('image/png'); a.click()
    await drawMeme()
  }

  /* ── submit ── */
  const handleSubmit = async () => {
    if (!isConnected || !address) return
    const canvas = canvasRef.current; if (!canvas) return
    setSubmitPhase('signing')
    setSubmitMsg(null)
    try {
      const timestamp = Date.now()
      const message   = buildSubmitMessage(address.toLowerCase(), timestamp)
      let signature: string
      try {
        signature = await signMessageAsync({ message })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : ''
        const rejected = /rejected|denied|cancel/i.test(msg)
        setSubmitMsg({ type: 'error', text: rejected ? 'Signature cancelled — approve in your wallet to submit' : 'Wallet error — could not get signature' })
        setSubmitPhase('idle')
        return
      }

      setSubmitPhase('uploading')
      await drawMeme()
      const ctx = canvas.getContext('2d')!
      compositeStickers(ctx)

      // Full-res PNG (800×500) for HD download
      const imageData = canvas.toDataURL('image/png')

      // Thumbnail JPEG (400×250) for gallery display — drawn from the already-composited canvas
      const thumbCanvas    = document.createElement('canvas')
      thumbCanvas.width    = 400
      thumbCanvas.height   = 250
      thumbCanvas.getContext('2d')!.drawImage(canvas, 0, 0, 400, 250)
      const thumbData = thumbCanvas.toDataURL('image/jpeg', 0.82)

      const res  = await fetch('/api/memes/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData, thumbData, creatorName: creatorName.trim() || null, walletAddress: address, signature, timestamp }),
      })
      const data = await res.json()

      if (res.ok) {
        setSubmitMsg({ type: 'success', text: '🎉 Meme submitted! Good luck in the competition!' })
        fetchMemes()
      } else if (res.status === 429) {
        setSubmitMsg({ type: 'error', text: data.error ?? 'You\'ve hit the daily submission limit — try again tomorrow' })
      } else if (res.status === 413) {
        setSubmitMsg({ type: 'error', text: 'Image is too large — try a shorter meme' })
      } else {
        setSubmitMsg({ type: 'error', text: data.error ?? 'Submission failed — please try again' })
      }

      await drawMeme()
    } catch {
      setSubmitMsg({ type: 'error', text: 'Network error — check your connection and try again' })
    }
    setSubmitPhase('idle')
  }

  /* ── vote ── */
  const handleVote = async (memeId: number) => {
    if (!isConnected || !address || votingId === memeId) return
    setVotingId(memeId)
    const wasVoted = votedMemes.has(memeId)
    let session = loadSession(address)

    if (!session) {
      try {
        const timestamp = Date.now()
        const message   = buildVoteSessionMessage(address.toLowerCase(), timestamp)
        addToast('info', 'Sign once to start your 8-hour voting session')
        const signature = await signMessageAsync({ message })
        session = { signature, timestamp, wallet: address.toLowerCase() }
        saveSession(session)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : ''
        if (!/rejected|denied|cancel/i.test(msg)) {
          addToast('error', 'Could not start voting session — try again')
        }
        setVotingId(null)
        return
      }
    }

    // Optimistic update
    setVotedMemes(prev => { const s = new Set(prev); wasVoted ? s.delete(memeId) : s.add(memeId); return s })
    setMemes(prev => prev.map(m => m.id === memeId ? { ...m, votes: m.votes + (wasVoted ? -1 : 1) } : m))

    try {
      const res = await fetch('/api/memes/vote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memeId, walletAddress: address, sessionSignature: session.signature, sessionTimestamp: session.timestamp }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // Roll back optimistic update
        setVotedMemes(prev => { const s = new Set(prev); wasVoted ? s.add(memeId) : s.delete(memeId); return s })
        setMemes(prev => prev.map(m => m.id === memeId ? { ...m, votes: m.votes + (wasVoted ? 1 : -1) } : m))
        if (data.code === 'SESSION_EXPIRED') {
          sessionStorage.removeItem(SESSION_KEY)
          addToast('info', 'Session expired — click vote again to sign a new one')
        } else {
          addToast('error', data.error ?? 'Vote failed — please try again')
        }
      }
    } catch {
      setVotedMemes(prev => { const s = new Set(prev); wasVoted ? s.add(memeId) : s.delete(memeId); return s })
      setMemes(prev => prev.map(m => m.id === memeId ? { ...m, votes: m.votes + (wasVoted ? 1 : -1) } : m))
      addToast('error', 'Network error — vote could not be saved')
    }
    setVotingId(null)
  }

  const hasIdentityData = isConnected && address
  const hasApyData      = bestApy !== null

  /* ═══════════════════════════ render ═══════════════════════════ */
  return (
    <div className="min-h-screen bg-background">

      {/* Contest banner */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border-b border-primary/20">
        <div className="container mx-auto px-4 py-3 flex items-center justify-center gap-3 flex-wrap text-sm">
          <Trophy className="h-4 w-4 text-yellow-500 flex-shrink-0" />
          <span className="text-foreground/80 font-medium text-center">
            <span className="text-primary font-bold">1 USDC</span> Prize Pool — best memes win &amp; get posted on{' '}
            <span className="text-primary font-semibold">@PeridotFinance</span>
          </span>
          <Trophy className="h-4 w-4 text-yellow-500 flex-shrink-0" />
        </div>
      </div>

      {/* Hero */}
      <div className="text-center pt-14 pb-10 px-4">
        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/25 rounded-full px-4 py-1.5 text-primary text-[11px] font-bold mb-6 uppercase tracking-[0.15em]">
          <Flame className="h-3 w-3" />
          Meme Competition Live
        </div>
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-black text-foreground leading-none mb-4 tracking-tight">
          PERIDOT<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-emerald-500 to-primary">MEME LAB</span>
        </h1>
        <p className="text-muted-foreground text-base max-w-md mx-auto leading-relaxed">
          Create a Peridot meme. Submit it. Let the community vote.
          Top memes get featured on X and split the prize pool.
        </p>
      </div>

      {/* Generator */}
      <div className="container mx-auto px-4 pb-20 max-w-6xl">
        <div className="grid lg:grid-cols-[1fr_400px] gap-6">

          {/* ── Canvas + Sticker overlay ── */}
          <div>
            <div
              ref={canvasContainerRef}
              className="relative rounded-2xl overflow-hidden border border-border shadow-xl bg-black"
            >
              <canvas ref={canvasRef} width={CW} height={CH} className="w-full h-auto block" />

              {/* Draggable sticker chips — positioned absolutely over canvas */}
              {stickerVisible.identity && hasIdentityData && (
                <div
                  ref={stickerDomRef.identity}
                  className="absolute select-none touch-none cursor-grab active:cursor-grabbing"
                  style={{ left: stickerPos.current.identity.x, top: stickerPos.current.identity.y }}
                  onPointerDown={e => startDrag(e, 'identity')}
                  onPointerMove={e => moveDrag(e, 'identity')}
                  onPointerUp={endDrag}
                >
                  <IdentitySticker userData={userData} address={address!} />
                </div>
              )}

              {stickerVisible.apy && hasApyData && (
                <div
                  ref={stickerDomRef.apy}
                  className="absolute select-none touch-none cursor-grab active:cursor-grabbing"
                  style={{ left: stickerPos.current.apy.x, top: stickerPos.current.apy.y }}
                  onPointerDown={e => startDrag(e, 'apy')}
                  onPointerMove={e => moveDrag(e, 'apy')}
                  onPointerUp={endDrag}
                >
                  <ApySticker apy={bestApy!} />
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-muted-foreground hover:border-border/80 hover:text-foreground text-sm font-medium transition-all bg-muted/50 hover:bg-muted"
              >
                <Download className="h-4 w-4" />
                Download PNG
              </button>
              <button
                onClick={handleSubmit}
                disabled={!isConnected || submitPhase !== 'idle'}
                className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl bg-primary hover:bg-primary/90 active:scale-[0.98] text-primary-foreground font-black text-sm tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
              >
                {submitPhase === 'signing'   ? <><span className="animate-pulse">Check your wallet…</span></>
                  : submitPhase === 'uploading' ? <><span className="animate-pulse">Uploading meme…</span></>
                  : isConnected              ? <><Zap className="h-4 w-4" />Submit to Competition</>
                  : 'Connect Wallet to Submit'}
              </button>
            </div>

            {submitMsg && (
              <div className={`mt-3 px-4 py-3 rounded-xl text-sm font-medium flex items-start gap-2 ${submitMsg.type === 'success' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
                {submitMsg.type === 'success'
                  ? <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  : <AlertCircle  className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                <span>{submitMsg.text}</span>
              </div>
            )}

            {!isConnected && (
              <p className="text-muted-foreground/60 text-xs mt-2 text-center">
                Connect your wallet above to submit and vote
              </p>
            )}
            {isConnected && submitPhase === 'idle' && !submitMsg && (
              <p className="text-muted-foreground/60 text-xs mt-2 text-center">
                Submit requires a wallet signature · Voting signs once per 8-hour session
              </p>
            )}
          </div>

          {/* ── Controls ── */}
          <div className="space-y-5">

            {/* Background */}
            <div>
              <label className="text-muted-foreground text-[11px] font-bold uppercase tracking-widest mb-2.5 block">Background</label>
              <div className="grid grid-cols-3 gap-2">
                {TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => setTemplate(t.id)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all text-left leading-snug ${template === t.id ? 'bg-primary/15 border border-primary text-primary' : 'bg-muted/50 border border-border text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Overlay */}
            <div>
              <label className="text-muted-foreground text-[11px] font-bold uppercase tracking-widest mb-2.5 block">Overlay</label>
              <div className="grid grid-cols-3 gap-2">
                {OVERLAYS.map(o => (
                  <button key={o.id} onClick={() => setOverlay(o.id)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all ${overlay === o.id ? 'bg-primary/15 border border-primary text-primary' : 'bg-muted/50 border border-border text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Top Text */}
            <div>
              <label className="text-muted-foreground text-[11px] font-bold uppercase tracking-widest mb-2 block">Top Text</label>
              <input type="text" value={topText} onChange={e => setTopText(e.target.value)} placeholder="TOP TEXT…" maxLength={80}
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-foreground uppercase placeholder:text-muted-foreground/40 text-sm font-bold focus:outline-none focus:border-primary/50 focus:bg-muted transition-all" />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {TOP_SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => setTopText(s)} className="text-[11px] px-2.5 py-1 rounded-full bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all">{s}</button>
                ))}
              </div>
            </div>

            {/* Bottom Text */}
            <div>
              <label className="text-muted-foreground text-[11px] font-bold uppercase tracking-widest mb-2 block">Bottom Text</label>
              <input type="text" value={bottomText} onChange={e => setBottomText(e.target.value)} placeholder="BOTTOM TEXT…" maxLength={80}
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-foreground uppercase placeholder:text-muted-foreground/40 text-sm font-bold focus:outline-none focus:border-primary/50 focus:bg-muted transition-all" />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {BOTTOM_SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => setBottomText(s)} className="text-[11px] px-2.5 py-1 rounded-full bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all">{s}</button>
                ))}
              </div>
            </div>

            {/* Stickers */}
            {(hasIdentityData || hasApyData) && (
              <div>
                <label className="text-muted-foreground text-[11px] font-bold uppercase tracking-widest mb-1 block">
                  Stickers{' '}
                  <span className="font-normal normal-case text-muted-foreground/50">drag to place on image</span>
                </label>
                <div className="space-y-2 mt-2.5">

                  {hasIdentityData && (
                    <button
                      onClick={() => toggleSticker('identity')}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        stickerVisible.identity
                          ? 'bg-primary/10 border-primary/40 text-primary'
                          : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="flex-1 text-left">
                        {userData?.badge?.icon && <span className="mr-1">{userData.badge.icon}</span>}
                        {userData?.username ? `@${userData.username}` : truncateAddr(address!)}
                        {userData?.rank && <span className="ml-1.5 text-xs opacity-60">#{userData.rank}</span>}
                      </span>
                      <span className="text-xs opacity-50">{stickerVisible.identity ? 'on' : 'off'}</span>
                    </button>
                  )}

                  {hasApyData && (
                    <button
                      onClick={() => toggleSticker('apy')}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        stickerVisible.apy
                          ? 'bg-primary/10 border-primary/40 text-primary'
                          : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <span className="flex-shrink-0">📈</span>
                      <span className="flex-1 text-left">{bestApy!.toFixed(1)}% APY on Peridot</span>
                      <span className="text-xs opacity-50">{stickerVisible.apy ? 'on' : 'off'}</span>
                    </button>
                  )}

                </div>
              </div>
            )}

            {/* Creator Handle */}
            <div>
              <label className="text-muted-foreground text-[11px] font-bold uppercase tracking-widest mb-2 block">
                Your Handle <span className="font-normal normal-case text-muted-foreground/60">(optional)</span>
              </label>
              <input type="text" value={creatorName} onChange={e => setCreatorName(e.target.value)}
                placeholder={address ? truncateAddr(address) : 'anon'} maxLength={50}
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/40 text-sm focus:outline-none focus:border-primary/50 focus:bg-muted transition-all" />
            </div>

          </div>
        </div>
      </div>

      {/* Gallery */}
      <div className="border-t border-border/50 bg-muted/40">
        <div className="container mx-auto px-4 py-16 max-w-6xl">
          <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-black text-foreground tracking-tight">Community Memes</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Sorted by votes · {isConnected ? 'Click ♡ to vote, sign once per session' : 'Connect wallet to vote'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-3xl font-black text-primary leading-none">{total}</div>
                <div className="text-muted-foreground/70 text-xs mt-0.5">submitted</div>
              </div>
              <button onClick={fetchMemes} className="p-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-border/80 transition-all">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {loadingMemes ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-xl overflow-hidden bg-muted animate-pulse">
                  <div className="aspect-video bg-muted-foreground/10" /><div className="p-3 h-12" />
                </div>
              ))}
            </div>
          ) : galleryError ? (
            <div className="text-center py-24">
              <AlertCircle className="h-12 w-12 text-destructive/40 mx-auto mb-4" />
              <p className="text-foreground font-semibold text-lg">Failed to load memes</p>
              <p className="text-muted-foreground text-sm mt-1 mb-6">{galleryError}</p>
              <button
                onClick={fetchMemes}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-muted border border-border text-sm font-medium text-foreground hover:bg-muted/80 transition-all"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </button>
            </div>
          ) : memes.length === 0 ? (
            <div className="text-center py-24">
              <ImageIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground font-semibold text-lg">No memes yet</p>
              <p className="text-muted-foreground/60 text-sm mt-1">Be the first to submit above ↑</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {memes.map((meme, rank) => {
                const medal  = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : null
                const voted  = votedMemes.has(meme.id)
                const voting = votingId === meme.id
                return (
                  <div key={meme.id} className="group rounded-xl overflow-hidden border border-border/50 bg-card hover:border-border hover:shadow-md transition-all">
                    <div className="relative aspect-video bg-black overflow-hidden">
                      {medal && (
                        <div className="absolute top-2 left-2 z-10 bg-black/70 backdrop-blur-sm text-white text-[11px] font-black px-2 py-0.5 rounded-lg border border-white/10">
                          {medal} #{rank + 1}
                        </div>
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={meme.image_url} alt="Peridot meme" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" loading="lazy" />
                    </div>
                    <div className="p-3 flex items-center justify-between gap-2">
                      <p className="text-muted-foreground text-xs truncate min-w-0 font-medium">
                        {meme.creator_name ?? truncateAddr(meme.wallet_address)}
                      </p>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {meme.image_url_hd && (
                          <a
                            href={meme.image_url_hd}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border transition-all"
                            title="Download HD"
                          >
                            <Download className="h-3 w-3" />
                          </a>
                        )}
                        <button
                          onClick={() => handleVote(meme.id)}
                          disabled={!isConnected || voting}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${voted ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-muted text-muted-foreground border border-border hover:text-foreground hover:bg-muted/80'} disabled:cursor-not-allowed ${voting ? 'opacity-50' : ''}`}
                        >
                          <Heart className={`h-3 w-3 ${voted ? 'fill-primary' : ''}`} />
                          {meme.votes}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Toast stack — bottom-right, auto-dismiss after 5 s */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-medium backdrop-blur-md transition-all animate-in slide-in-from-right-4 fade-in duration-200 ${
                t.type === 'success' ? 'bg-primary/10 border-primary/30 text-primary'
                  : t.type === 'error'   ? 'bg-destructive/10 border-destructive/30 text-destructive'
                  : 'bg-muted border-border text-foreground'
              }`}
            >
              {t.type === 'success' ? <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                : t.type === 'error'  ? <AlertCircle  className="h-4 w-4 mt-0.5 flex-shrink-0" />
                : <Info               className="h-4 w-4 mt-0.5 flex-shrink-0" />}
              <span className="flex-1 leading-snug">{t.text}</span>
              <button onClick={() => dismissToast(t.id)} className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity mt-0.5">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}

/* ═══════════════════════ sticker chip components ═══════════════════════ */

function IdentitySticker({ userData, address }: { userData: UserData | null; address: string }) {
  const borderColor = userData?.badge?.borderColor ?? '#4ade80'
  const emoji       = userData?.badge?.icon ?? ''
  const name        = userData?.username ? `@${userData.username}` : truncateAddr(address)
  const rank        = userData?.rank

  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-white shadow-xl backdrop-blur-md rounded-full whitespace-nowrap"
      style={{ background: 'rgba(0,0,0,0.78)', border: `2.5px solid ${borderColor}` }}
    >
      {emoji && <span className="text-base leading-none">{emoji}</span>}
      <span>{name}</span>
      {rank && <span className="text-white/45 font-normal text-[11px]">#{rank}</span>}
    </div>
  )
}

function ApySticker({ apy }: { apy: number }) {
  return (
    <div
      className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-black shadow-xl backdrop-blur-md rounded-full whitespace-nowrap"
      style={{ background: 'rgba(74,222,128,0.88)', color: '#071407' }}
    >
      📈 {apy.toFixed(1)}% APY
    </div>
  )
}
