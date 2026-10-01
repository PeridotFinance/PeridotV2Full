import { describe, it, expect } from "vitest"
import {
  resolveDeviceFromUserAgent,
  resolveDeviceFromViewport,
} from "@/lib/device"

describe("resolveDeviceFromUserAgent", () => {
  it("defaults to desktop on missing UA", () => {
    expect(resolveDeviceFromUserAgent(null)).toBe("desktop")
    expect(resolveDeviceFromUserAgent(undefined)).toBe("desktop")
    expect(resolveDeviceFromUserAgent("")).toBe("desktop")
  })

  it("detects iPhone", () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
    expect(resolveDeviceFromUserAgent(ua)).toBe("mobile")
  })

  it("detects Android phone", () => {
    const ua = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari"
    expect(resolveDeviceFromUserAgent(ua)).toBe("mobile")
  })

  it("detects iPad", () => {
    const ua = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
    expect(resolveDeviceFromUserAgent(ua)).toBe("tablet")
  })

  it("detects Android tablet (no 'Mobile' keyword)", () => {
    const ua = "Mozilla/5.0 (Linux; Android 14; Tab S9) AppleWebKit/537.36 Safari"
    expect(resolveDeviceFromUserAgent(ua)).toBe("tablet")
  })

  it("detects desktop macOS", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15"
    expect(resolveDeviceFromUserAgent(ua)).toBe("desktop")
  })

  it("detects desktop Windows", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    expect(resolveDeviceFromUserAgent(ua)).toBe("desktop")
  })
})

describe("resolveDeviceFromViewport", () => {
  it("< 768 → mobile", () => {
    expect(resolveDeviceFromViewport(375)).toBe("mobile")
    expect(resolveDeviceFromViewport(767)).toBe("mobile")
  })
  it("768..1023 → tablet", () => {
    expect(resolveDeviceFromViewport(768)).toBe("tablet")
    expect(resolveDeviceFromViewport(1023)).toBe("tablet")
  })
  it(">= 1024 → desktop", () => {
    expect(resolveDeviceFromViewport(1024)).toBe("desktop")
    expect(resolveDeviceFromViewport(1920)).toBe("desktop")
  })
})
