/**
 * Device detection — pure functions used on both server (User-Agent) and
 * client (matchMedia). Kept free of React imports so server components and
 * middleware can call them directly.
 */

export type Device = "mobile" | "tablet" | "desktop"

/**
 * Resolve a device category from a `User-Agent` string.
 *
 * Intentionally conservative: anything that looks like a phone → "mobile",
 * anything that looks like a tablet → "tablet", everything else → "desktop".
 * Tablets get the desktop experience on `/app/easy` because the Stellar
 * layout is readable at ≥ md (≥ 768 px); the client viewport correction
 * will refine this post-mount.
 */
export function resolveDeviceFromUserAgent(ua: string | null | undefined): Device {
  if (!ua) return "desktop"
  const s = ua.toLowerCase()

  // Tablet first — iPad (modern Safari reports "macintosh" with touch, caught below)
  if (/ipad|tablet|playbook|silk/.test(s)) return "tablet"
  // iPad on iPadOS 13+ reports desktop UA, only "macintosh" + touch. We can't
  // test touch here — default to desktop, let the client correct if needed.

  // Phone patterns
  if (/iphone|ipod|android.*mobile|windows phone|blackberry|bb10|opera mini|opera mobi|iemobile|mobi(?!le\/safari)/.test(s)) {
    return "mobile"
  }

  // Plain "android" without "mobile" → tablet
  if (/android/.test(s)) return "tablet"

  return "desktop"
}

/**
 * Breakpoint shared with Tailwind's `md`. The Stellar desktop app is designed
 * for ≥ md, so this is the hard cutoff for the client-side correction.
 */
export const DESKTOP_BREAKPOINT_PX = 768

/**
 * Client-side device resolver — read the viewport width. Must only be called
 * from the browser (it reads `window`).
 */
export function resolveDeviceFromViewport(widthPx: number): Device {
  if (widthPx < DESKTOP_BREAKPOINT_PX) return "mobile"
  if (widthPx < 1024) return "tablet"
  return "desktop"
}
