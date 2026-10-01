"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import {
  DESKTOP_BREAKPOINT_PX,
  resolveDeviceFromViewport,
  type Device,
} from "@/lib/device"

interface DeviceContextValue {
  device: Device
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
}

const DeviceContext = createContext<DeviceContextValue | null>(null)

interface DeviceProviderProps {
  /**
   * Server-detected device from the User-Agent header. The client may
   * revise this after mount if the actual viewport disagrees (e.g. iPad
   * on iPadOS lies about its UA).
   */
  initialDevice: Device
  children: ReactNode
}

export function DeviceProvider({ initialDevice, children }: DeviceProviderProps) {
  const [device, setDevice] = useState<Device>(initialDevice)

  useEffect(() => {
    // Correct the server guess using the real viewport. We prefer matchMedia
    // over a one-off width read so the value stays current across resizes
    // and orientation changes.
    if (typeof window === "undefined") return

    const mqMobile = window.matchMedia(`(max-width: ${DESKTOP_BREAKPOINT_PX - 1}px)`)
    const mqDesktop = window.matchMedia("(min-width: 1024px)")

    function sync() {
      const next = resolveDeviceFromViewport(window.innerWidth)
      setDevice((prev) => (prev === next ? prev : next))
    }

    sync()
    mqMobile.addEventListener("change", sync)
    mqDesktop.addEventListener("change", sync)
    window.addEventListener("resize", sync)
    return () => {
      mqMobile.removeEventListener("change", sync)
      mqDesktop.removeEventListener("change", sync)
      window.removeEventListener("resize", sync)
    }
  }, [])

  const value: DeviceContextValue = {
    device,
    isMobile: device === "mobile",
    isTablet: device === "tablet",
    // Tablets get the desktop treatment on /app/easy (≥ md).
    isDesktop: device === "desktop" || device === "tablet",
  }

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
}

export function useDevice(): DeviceContextValue {
  const ctx = useContext(DeviceContext)
  if (!ctx) {
    // Safe fallback when the tree isn't wrapped — default to desktop so
    // static / pre-boot renders don't collapse to the mobile layout.
    return { device: "desktop", isMobile: false, isTablet: false, isDesktop: true }
  }
  return ctx
}
