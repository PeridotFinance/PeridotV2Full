"use client"

import { useEffect } from "react"
import { motion, useMotionValue, useSpring } from "framer-motion"
import { useReducedMotion } from "@/lib/use-reduced-motion"

export const CubeAnimation = () => {
  const { isLowPerfDevice, prefersReducedMotion } = useReducedMotion()
  const glyph = "$P"
  const maxTilt = 45
  const tiltX = useMotionValue(0)
  const tiltY = useMotionValue(0)
  const springTiltX = useSpring(tiltX, { stiffness: 140, damping: 18, mass: 0.45 })
  const springTiltY = useSpring(tiltY, { stiffness: 140, damping: 18, mass: 0.45 })

  useEffect(() => {
    if (isLowPerfDevice || prefersReducedMotion || typeof window === "undefined") return

    let rafId = 0
    let latestX = window.innerWidth / 2
    let latestY = window.innerHeight / 2

    const clamp = (value: number) => Math.max(-1, Math.min(1, value))

    const updateTilt = () => {
      const width = Math.max(window.innerWidth, 1)
      const height = Math.max(window.innerHeight, 1)
      const nx = clamp((latestX / width) * 2 - 1)
      const ny = clamp((latestY / height) * 2 - 1)

      tiltY.set(nx * maxTilt)
      tiltX.set(-ny * maxTilt)
      rafId = 0
    }

    const onPointerMove = (event: PointerEvent) => {
      latestX = event.clientX
      latestY = event.clientY
      if (!rafId) {
        rafId = window.requestAnimationFrame(updateTilt)
      }
    }

    const resetTilt = () => {
      tiltX.set(0)
      tiltY.set(0)
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true })
    window.addEventListener("blur", resetTilt)

    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("blur", resetTilt)
      if (rafId) {
        window.cancelAnimationFrame(rafId)
      }
      resetTilt()
    }
  }, [isLowPerfDevice, prefersReducedMotion, tiltX, tiltY])

  // Load CDN tilt scripts only after page load + idle time (never render-blocking).
  useEffect(() => {
    if (isLowPerfDevice || prefersReducedMotion || typeof window === "undefined") return

    const loadScript = (id: string, src: string) =>
      new Promise<void>((resolve) => {
        if (document.getElementById(id)) {
          resolve()
          return
        }
        const script = document.createElement("script")
        script.id = id
        script.src = src
        script.async = true
        script.defer = true
        script.onload = () => resolve()
        script.onerror = () => resolve()
        document.head.appendChild(script)
      })

    let timeoutId: number | null = null
    let idleId: number | null = null
    let cancelled = false

    const inject = async () => {
      if (cancelled) return
      await loadScript("optional-jquery-cdn", "https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js")
      if (cancelled) return
      await loadScript("optional-tilt-cdn", "https://cdnjs.cloudflare.com/ajax/libs/tilt.js/1.2.1/tilt.jquery.min.js")
    }

    const scheduleInject = () => {
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(() => {
          void inject()
        }, { timeout: 3000 })
      } else {
        timeoutId = window.setTimeout(() => {
          void inject()
        }, 1200)
      }
    }

    const onWindowLoad = () => {
      scheduleInject()
    }

    if (document.readyState === "complete") {
      scheduleInject()
    } else {
      window.addEventListener("load", onWindowLoad, { once: true })
    }

    return () => {
      cancelled = true
      window.removeEventListener("load", onWindowLoad)
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      if (idleId !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId)
      }
    }
  }, [isLowPerfDevice, prefersReducedMotion])

  // Skip animation on low performance devices or mobile
  if (isLowPerfDevice) {
    return (
      <div className="hidden md:block absolute right-8 top-1/2 -translate-y-1/2 w-64 h-64 pointer-events-none opacity-20">
        <div className="w-full h-full rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20 flex items-center justify-center">
          <span className="text-[6rem] leading-none font-black tracking-tight text-primary/80">
            {glyph}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="hidden md:block absolute right-8 top-1/2 -translate-y-1/2 w-64 h-64 pointer-events-none">
      <motion.div
        className="w-full h-full rounded-xl backdrop-blur-sm border border-primary/20 bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center"
        style={{
          rotateX: springTiltX,
          rotateY: springTiltY,
          transformPerspective: 900,
          transformStyle: "preserve-3d",
        }}
        animate={{
          y: [0, -10, 0],
          rotate: [0, 3, 0],
          filter: ["hue-rotate(0deg)", "hue-rotate(360deg)"]
        }}
        transition={{
          y: {
            duration: 3,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut"
          },
          rotate: {
            duration: 4,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut"
          },
          filter: {
            duration: 8,
            repeat: Infinity,
            ease: "linear"
          }
        }}
        whileHover={{
          scale: 1.1,
          boxShadow: "0 0 60px hsl(var(--primary) / 0.4)",
          transition: { duration: 0.3 }
        }}
      >
        <div
          aria-hidden="true"
          className="relative flex items-center justify-center text-[7.5rem] leading-none font-black tracking-tight select-none"
          style={{ transformStyle: "preserve-3d" }}
        >
          <span className="absolute translate-x-[8px] translate-y-[10px] text-primary/20 blur-[2px]">
            {glyph}
          </span>
          <span className="absolute translate-x-[4px] translate-y-[4px] text-accent/50">
            {glyph}
          </span>
          <span
            className="relative bg-gradient-to-br from-primary via-primary/90 to-accent bg-clip-text text-transparent"
            style={{ textShadow: "0 16px 36px rgba(5, 20, 18, 0.35)" }}
          >
            {glyph}
          </span>
        </div>
      </motion.div>
    </div>
  )
}

export default CubeAnimation
