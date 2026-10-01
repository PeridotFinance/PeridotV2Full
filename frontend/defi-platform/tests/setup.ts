import '@testing-library/jest-dom'

// jsdom ships no ResizeObserver, and Radix measures its primitives with one
// (`@radix-ui/react-use-size`). Any test that renders a Slider, Tooltip or
// Popover throws on mount without this. A no-op is enough: the tests assert on
// values and DOM, never on measured geometry.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// Same story for matchMedia, which jsdom also omits: framer-motion asks it for
// `prefers-reduced-motion` on mount, so any component with an animation throws
// before it renders. Report "no preference" — the tests assert on content, and
// the animated wrappers still mount their children either way.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}
