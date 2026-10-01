"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"

type PositionLike = {
  assetId: string
  symbol: string
  suppliedValueUSD?: number
  borrowedValueUSD?: number
  chainId?: number
}

type LiveApyData = {
  [chainId: number]: {
    [assetId: string]: {
      supplyApy: number
      supplyRewardsApy: number
      borrowApy: number
      borrowRewardsApy: number
    }
  }
}

interface PortfolioReactorCanvasProps {
  suppliedPositions: PositionLike[]
  borrowedPositions: PositionLike[]
  totalSupplied: number
  totalBorrowed: number
  liveApyData?: LiveApyData
  height?: number
}

interface BlobNode {
  id: string
  label: string
  type: "supplied" | "borrowed"
  valueUSD: number
  radius: number
  baseRadius: number
  color: string
  x: number
  y: number
  vx: number
  vy: number
  chainId?: number
  apy?: number
  rewardsApy?: number
  seedX?: number
  seedY?: number
  speed?: number
}

function hashHue(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) hash = (hash << 5) - hash + input.charCodeAt(i)
  return Math.abs(hash) % 360
}

function colorFor(symbol: string, type: "supplied" | "borrowed") {
  const hue = hashHue(symbol)
  const saturation = type === "supplied" ? 80 : 70
  const lightness = type === "supplied" ? 55 : 45
  return `hsl(${hue} ${saturation}% ${lightness}%)`
}

// Helpers to create transparent colors regardless of format
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return `rgba(255,255,255,${alpha})`
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function hslToRgbaStr(hsl: string, alpha: number): string {
  // supports: hsl(h s% l%) or hsl(h, s%, l%)
  const nums = hsl.match(/[-\d\.]+/g)
  if (!nums || nums.length < 3) return `rgba(255,255,255,${alpha})`
  const h = parseFloat(nums[0])
  const s = parseFloat(nums[1]) / 100
  const l = parseFloat(nums[2]) / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let rP = 0, gP = 0, bP = 0
  if (0 <= h && h < 60) { rP = c; gP = x; bP = 0 }
  else if (60 <= h && h < 120) { rP = x; gP = c; bP = 0 }
  else if (120 <= h && h < 180) { rP = 0; gP = c; bP = x }
  else if (180 <= h && h < 240) { rP = 0; gP = x; bP = c }
  else if (240 <= h && h < 300) { rP = x; gP = 0; bP = c }
  else { rP = c; gP = 0; bP = x }
  const r = Math.round((rP + m) * 255)
  const g = Math.round((gP + m) * 255)
  const b = Math.round((bP + m) * 255)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function colorToRgba(color: string, alpha: number): string {
  if (color.startsWith('#')) return hexToRgba(color, alpha)
  if (color.startsWith('hsl')) return hslToRgbaStr(color, alpha)
  return color // fallback (assumes it already includes alpha)
}

function computeRadius(values: number[], value: number, minR = 14, maxR = 42) {
  if (values.length === 0) return minR
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return (minR + maxR) / 2
  const t = (Math.sqrt(value) - Math.sqrt(min)) / (Math.sqrt(max) - Math.sqrt(min))
  return minR + t * (maxR - minR)
}

export default function PortfolioReactorCanvas({
  suppliedPositions,
  borrowedPositions,
  totalSupplied,
  totalBorrowed,
  liveApyData,
  height = 300,
}: PortfolioReactorCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const blobCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const labelCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [hovered, setHovered] = useState<BlobNode | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  const blobs = useMemo<BlobNode[]>(() => {
    const nodes: BlobNode[] = []

    const supplyValues = suppliedPositions.map((p) => p.suppliedValueUSD || 0)
    const borrowValues = borrowedPositions.map((p) => p.borrowedValueUSD || 0)

    const supplyRadius = (v: number) => computeRadius(supplyValues, v)
    const borrowRadius = (v: number) => computeRadius(borrowValues, v)

    for (const p of suppliedPositions) {
      const v = Math.max(0, p.suppliedValueUSD || 0)
      if (!v) continue
      let apy: number | undefined
      let rewardsApy: number | undefined
      if (p.chainId && liveApyData && liveApyData[p.chainId]?.[p.assetId]) {
        apy = liveApyData[p.chainId][p.assetId].supplyApy
        rewardsApy = liveApyData[p.chainId][p.assetId].supplyRewardsApy
      }
      const r = supplyRadius(v)
      nodes.push({
        id: `${p.assetId}-s`,
        label: p.symbol,
        type: "supplied",
        valueUSD: v,
        radius: r,
        baseRadius: r,
        color: colorFor(p.symbol, "supplied"),
        x: (Math.random() - 0.5) * 50,
        y: (Math.random() - 0.5) * 50,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        chainId: p.chainId,
        apy,
        rewardsApy,
      })
    }

    for (const p of borrowedPositions) {
      const v = Math.max(0, p.borrowedValueUSD || 0)
      if (!v) continue
      let apy: number | undefined
      let rewardsApy: number | undefined
      if (p.chainId && liveApyData && liveApyData[p.chainId]?.[p.assetId]) {
        apy = liveApyData[p.chainId][p.assetId].borrowApy
        rewardsApy = liveApyData[p.chainId][p.assetId].borrowRewardsApy
      }
      const r = borrowRadius(v)
      nodes.push({
        id: `${p.assetId}-b`,
        label: p.symbol,
        type: "borrowed",
        valueUSD: v,
        radius: r,
        baseRadius: r,
        color: colorFor(p.symbol, "borrowed"),
        x: (Math.random() - 0.5) * 50,
        y: (Math.random() - 0.5) * 50,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        chainId: p.chainId,
        apy,
        rewardsApy,
      })
    }

    return nodes.slice(0, 40) // safety cap
  }, [suppliedPositions, borrowedPositions, liveApyData])

  useEffect(() => {
    const gridCanvas = gridCanvasRef.current
    const canvas = blobCanvasRef.current
    const labelCanvas = labelCanvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !gridCanvas || !labelCanvas) return

    const gridCtx = gridCanvas.getContext("2d")
    const ctx = canvas.getContext("2d")
    const labelCtx = labelCanvas.getContext("2d")
    if (!gridCtx || !ctx || !labelCtx) return

    let animationFrame = 0
    let width = container.clientWidth
    let heightPx = Math.max(200, height)
    const dpr = window.devicePixelRatio
    const setSize = (el: HTMLCanvasElement) => {
      el.width = width * dpr
      el.height = heightPx * dpr
      el.style.width = `${width}px`
      el.style.height = `${heightPx}px`
    }
    setSize(gridCanvas)
    setSize(canvas)
    setSize(labelCanvas)
    gridCtx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    labelCtx.setTransform(1, 0, 0, 1, 0, 0)
    gridCtx.scale(dpr, dpr)
    ctx.scale(dpr, dpr)
    labelCtx.scale(dpr, dpr)

    const centerX = width / 2
    const centerY = heightPx / 2

    function renderGrid(w: number, h: number) {
      gridCtx.clearRect(0, 0, w, h)
      gridCtx.strokeStyle = "rgba(128,128,128,0.15)"
      gridCtx.lineWidth = 1
      const gridSize = 22
      for (let x = 0; x < w; x += gridSize) {
        gridCtx.beginPath()
        gridCtx.moveTo(x + 0.5, 0)
        gridCtx.lineTo(x + 0.5, h)
        gridCtx.stroke()
      }
      for (let y = 0; y < h; y += gridSize) {
        gridCtx.beginPath()
        gridCtx.moveTo(0, y + 0.5)
        gridCtx.lineTo(w, y + 0.5)
        gridCtx.stroke()
      }
    }
    renderGrid(width, heightPx)

    let dragging: BlobNode | null = null
    let dragOffsetX = 0
    let dragOffsetY = 0

    // initialize seeds and positions in an annulus (between inner core and outer shell)
    const minDim = Math.min(width, heightPx)
    const innerCoreRadius = Math.max(40, minDim * 0.12)
    const outerMargin = 12
    const maxRadiusFromCenter = Math.min(width / 2, heightPx / 2) - outerMargin
    for (const n of blobs) {
      n.seedX = (Math.random() * 1000) | 0
      n.seedY = (Math.random() * 1000) | 0
      // speed: larger blobs move slower
      const base = 0.6 - n.radius * 0.006
      n.speed = Math.max(0.12, base)
      // random angle and radius within band
      const angle = Math.random() * Math.PI * 2
      const rBand = innerCoreRadius + 20 + Math.random() * (maxRadiusFromCenter - innerCoreRadius - 40)
      n.x = centerX + Math.cos(angle) * rBand
      n.y = centerY + Math.sin(angle) * rBand
    }

    let t = 0

    function resizeRadiiToFill() {
      // Dynamic radius multiplier to fill canvas proportionally
      const count = blobs.length
      if (count === 0) return
      const area = width * heightPx
      // target fill fraction: fewer blobs => more fill
      const targetFill = Math.min(0.55, 0.2 + (count <= 2 ? 0.48 : count <= 4 ? 0.38 : count <= 7 ? 0.3 : 0.24))
      const totalBaseArea = blobs.reduce((s, b) => s + Math.PI * b.baseRadius * b.baseRadius, 0)
      const k = Math.sqrt((area * targetFill) / Math.max(1, totalBaseArea))
      for (const b of blobs) {
        b.radius = b.baseRadius * k
        // update speed inversely to size for weighty feel
        const base = 0.7 - b.radius * 0.006
        b.speed = Math.max(0.10, base)
      }
    }

    function draw() {
      ctx.clearRect(0, 0, width, heightPx)
      labelCtx.clearRect(0, 0, width, heightPx)

      // ensure radii match container on first frames
      if (t === 0) resizeRadiiToFill()

      // physics
      for (let i = 0; i < blobs.length; i++) {
        const a = blobs[i]
        if (dragging !== a) {
          // gentle drift with constant speed (no acceleration)
          const sx = Math.sin((t * 0.0009) + (a.seedX || 0) * 0.013)
          const cx = Math.cos((t * 0.0012) + (a.seedY || 0) * 0.017)
          const sy = Math.sin((t * 0.0008) + (a.seedY || 0) * 0.015)
          const cy = Math.cos((t * 0.0010) + (a.seedX || 0) * 0.019)
          let vx = (sx + cx)
          let vy = (sy + cy)
          const len = Math.hypot(vx, vy) || 1
          const sp = a.speed || 0.2
          vx = (vx / len) * sp
          vy = (vy / len) * sp
          a.vx = vx
          a.vy = vy

          a.x += a.vx
          a.y += a.vy
        }
        
        // outer boundary collision with tangential glide (no acceleration)
        const r = a.radius
        const sp = a.speed || 0.2
        const nearLeft = a.x - r < 1
        const nearRight = width - (a.x + r) < 1
        const nearTop = a.y - r < 1
        const nearBottom = heightPx - (a.y + r) < 1
        if (nearLeft) {
          a.x = r
          a.vx = 0
          a.vy = a.vy >= 0 ? sp : -sp
        } else if (nearRight) {
          a.x = width - r
          a.vx = 0
          a.vy = a.vy >= 0 ? sp : -sp
        }
        if (nearTop) {
          a.y = r
          a.vy = 0
          a.vx = a.vx >= 0 ? sp : -sp
        } else if (nearBottom) {
          a.y = heightPx - r
          a.vy = 0
          a.vx = a.vx >= 0 ? sp : -sp
        }

        // corner retraction: if stuck near a corner, bias diagonally outwards at fixed speed
        const diag = sp / Math.SQRT2
        if (nearLeft && nearTop) { a.vx = diag; a.vy = diag }
        else if (nearRight && nearTop) { a.vx = -diag; a.vy = diag }
        else if (nearLeft && nearBottom) { a.vx = diag; a.vy = -diag }
        else if (nearRight && nearBottom) { a.vx = -diag; a.vy = -diag }
      }

      // prevent full overlap while allowing partial fusion: keep centers apart slightly
      for (let i = 0; i < blobs.length; i++) {
        for (let j = i + 1; j < blobs.length; j++) {
          const a = blobs[i]
          const b = blobs[j]
          let dx = b.x - a.x
          let dy = b.y - a.y
          let dist = Math.hypot(dx, dy)
          if (dist === 0) { dx = 0.001; dy = 0.001; dist = Math.hypot(dx, dy) }
          const allowedOverlap = Math.min(a.radius, b.radius) * 0.65
          const minDist = a.radius + b.radius - allowedOverlap
          if (dist < minDist) {
            const nx = dx / dist
            const ny = dy / dist
            const push = (minDist - dist) * 0.25
            a.x -= nx * push
            a.y -= ny * push
            b.x += nx * push
            b.y += ny * push
          }
          // gentle cohesion to encourage fusing without collapsing into one
          {
            const cdx = b.x - a.x
            const cdy = b.y - a.y
            const cdist = Math.hypot(cdx, cdy) || 1
            if (cdist < (a.radius + b.radius) * 1.6) {
              const cnx = cdx / cdist
              const cny = cdy / cdist
              const pull = 0.02
              a.x += cnx * pull
              a.y += cny * pull
              b.x -= cnx * pull
              b.y -= cny * pull
            }
          }
        }
      }

      // Do NOT resolve inter-blob collisions (metablob merging look)

      // draw blobs with clipped blurred background for liquid-glass effect
      for (const n of blobs) {
        // clip to blob circle
        ctx.save()
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
        ctx.clip()

        // draw blurred grid inside the blob
        const glassBlurAmount = 6
        ctx.filter = `blur(${glassBlurAmount}px)`
        ctx.drawImage(gridCanvas, 0, 0, width, heightPx)
        ctx.filter = 'none'
        // subtle refraction/magnification via parallax of background
        const parallaxX = (n.x - centerX) * 0.02
        const parallaxY = (n.y - centerY) * 0.02
        ctx.save()
        ctx.translate(-parallaxX, -parallaxY)
        ctx.globalAlpha = 0.35
        ctx.drawImage(gridCanvas, 0, 0, width, heightPx)
        ctx.globalAlpha = 1
        ctx.restore()

        // boost alpha base so gooey filter doesn't threshold it out
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.28)'
        ctx.fill()

        // faint color overlay
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
        ctx.fillStyle = colorToRgba(n.color, 0.36)
        ctx.fill()

        // subtle inner glow
        const gradient = ctx.createRadialGradient(n.x, n.y, n.radius * 0.5, n.x, n.y, n.radius)
        gradient.addColorStop(0, 'rgba(255,255,255,0.2)')
        gradient.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = gradient
        ctx.fill()

        ctx.restore()

        // sharp border (draw on label layer to avoid gooey blur)
        labelCtx.beginPath()
        labelCtx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
        labelCtx.strokeStyle = 'rgba(255, 255, 255, 0)'
        labelCtx.lineWidth = 1.25
        labelCtx.stroke()

        // specular highlight for glassy look (also on label layer)
        const hx = n.x - n.radius * 0.35
        const hy = n.y - n.radius * 0.35
        const hg = labelCtx.createRadialGradient(hx, hy, n.radius * 0.05, hx, hy, n.radius * 0.6)
        hg.addColorStop(0, 'rgba(255,255,255,0.35)')
        hg.addColorStop(1, 'rgba(255,255,255,0)')
        labelCtx.fillStyle = hg
        labelCtx.beginPath()
        labelCtx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
        labelCtx.fill()

        // text labels on separate, non-filtered layer
        labelCtx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, monospace"
        labelCtx.textAlign = "center"
        // draw thin dark stroke for contrast then white fill
        labelCtx.lineWidth = 3
        labelCtx.strokeStyle = "rgba(0,0,0,0.35)"
        labelCtx.strokeText(n.label, n.x, n.y + 4)
        labelCtx.fillStyle = "#ffffff"
        labelCtx.fillText(n.label, n.x, n.y + 4)
      }

      // gradient fusion on intersections: smooth color transition where blobs overlap
      for (let i = 0; i < blobs.length; i++) {
        for (let j = i + 1; j < blobs.length; j++) {
          const a = blobs[i]
          const b = blobs[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.hypot(dx, dy)
          if (dist >= a.radius + b.radius) continue

          // Intersection region clip A ∩ B
          ctx.save()
          ctx.beginPath()
          ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2)
          ctx.clip()
          ctx.beginPath()
          ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2)
          ctx.clip()

          // Linear gradient along line connecting centers
          const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
          grad.addColorStop(0, colorToRgba(a.color, 0.28))
          grad.addColorStop(1, colorToRgba(b.color, 0.28))
          ctx.fillStyle = grad
          const x0 = Math.min(a.x - a.radius, b.x - b.radius)
          const y0 = Math.min(a.y - a.radius, b.y - b.radius)
          const w = Math.max(a.x + a.radius, b.x + b.radius) - x0
          const h = Math.max(a.y + a.radius, b.y + b.radius) - y0
          ctx.fillRect(x0, y0, w, h)
          ctx.restore()
        }
      }

      animationFrame = requestAnimationFrame(draw)
      t += 16
    }

    let ro: ResizeObserver | null = new ResizeObserver(() => {
      width = container.clientWidth
      heightPx = Math.max(200, height)
      setSize(gridCanvas)
      setSize(canvas)
      setSize(labelCanvas)
      gridCtx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      labelCtx.setTransform(1, 0, 0, 1, 0, 0)
      gridCtx.scale(dpr, dpr)
      ctx.scale(dpr, dpr)
      labelCtx.scale(dpr, dpr)
      renderGrid(width, heightPx)
      resizeRadiiToFill()
    })
    ro.observe(container)

    const getPointer = (evt: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: evt.clientX - rect.left, y: evt.clientY - rect.top }
    }

    const onPointerMove = (evt: PointerEvent) => {
      const { x, y } = getPointer(evt)
      setTooltipPos({ x, y })

      if (dragging) {
        dragging.x = x - dragOffsetX
        dragging.y = y - dragOffsetY
        dragging.vx = 0
        dragging.vy = 0
        return
      }

      let found: BlobNode | null = null
      for (const n of blobs) {
        const d = Math.hypot(x - n.x, y - n.y)
        if (d <= n.radius) {
          found = n
          break
        }
      }
      setHovered(found)
    }

    const onPointerDown = (evt: PointerEvent) => {
      const { x, y } = getPointer(evt)
      for (const n of blobs) {
        const d = Math.hypot(x - n.x, y - n.y)
        if (d <= n.radius) {
          dragging = n
          dragOffsetX = x - n.x
          dragOffsetY = y - n.y
          canvas.setPointerCapture(evt.pointerId)
          break
        }
      }
    }

    const onPointerUp = (evt: PointerEvent) => {
      if (dragging) {
        canvas.releasePointerCapture(evt.pointerId)
      }
      dragging = null
    }

    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointerup", onPointerUp)

    draw()

    return () => {
      cancelAnimationFrame(animationFrame)
      ro && ro.disconnect()
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointerup", onPointerUp)
    }
  }, [blobs, height])

  const suppliedCount = suppliedPositions.filter((p) => (p.suppliedValueUSD || 0) > 0).length
  const borrowedCount = borrowedPositions.filter((p) => (p.borrowedValueUSD || 0) > 0).length

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      {/* SVG Gooey filter applied to a wrapper; keeps code self-contained */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <defs>
          <filter id="gooey" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix in="blur" mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      {/* Grid (unfiltered), Gooey blobs (filtered), Labels (unfiltered) */}
      <canvas ref={gridCanvasRef} className="absolute left-0 top-0 block w-full h-full" />
      <div style={{ filter: "url(#gooey)", width: "100%", height: "100%" }}>
        <canvas ref={blobCanvasRef} className="block w-full h-full" />
      </div>
      <canvas ref={labelCanvasRef} className="pointer-events-none absolute left-0 top-0 block w-full h-full" />

      {/* overlay info */}
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs text-white shadow-lg backdrop-blur"
          style={{ left: Math.min(tooltipPos.x + 16, (containerRef.current?.clientWidth || 0) - 180), top: tooltipPos.y + 16, width: 180 }}
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="opacity-80">{hovered.type === "supplied" ? "Supplied" : "Borrowed"}</span>
            <span className="font-semibold" style={{ color: hovered.color }}>{hovered.label}</span>
          </div>
          <div className="flex justify-between"><span className="opacity-70">Value</span><span className="font-semibold">${hovered.valueUSD.toLocaleString()}</span></div>
          {hovered.type === "supplied" && hovered.apy !== undefined && (
            <div className="flex justify-between"><span className="opacity-70">Supply APY</span><span className="font-semibold">{hovered.apy.toFixed(2)}%</span></div>
          )}
          {hovered.type === "borrowed" && hovered.apy !== undefined && (
            <div className="flex justify-between"><span className="opacity-70">Borrow APY</span><span className="font-semibold">{hovered.apy.toFixed(2)}%</span></div>
          )}
          {hovered.rewardsApy !== undefined && (
            <div className="flex justify-between"><span className="opacity-70">Rewards</span><span className="font-semibold">{hovered.rewardsApy.toFixed(2)}%</span></div>
          )}
        </div>
      )}

      {/* small legend */}
      <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[10px] uppercase tracking-wider text-white/80">
        <span>Assets • </span>
        <span>Supplied: {suppliedCount}</span>
        <span> • Borrowed: {borrowedCount}</span>
      </div>
    </div>
  )
}


