/** @type {import('next').NextConfig} */
const nextConfig = {
  // Essential for PostHog and development
  eslint: {
    // We recommend removing this setting in production to catch errors during build.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // We recommend removing this setting in production to catch errors during build.
    ignoreBuildErrors: true,
  },

  transpilePackages: [
    "@0xsquid/widget",
    "@0xsquid/react-hooks",
    "@privy-io/wagmi",
    // Stellar Wallets Kit is pure ESM and re-exports rxjs named imports from
    // its transitive xbull-wallet-connect dep — webpack mis-resolves those
    // unless we let Next.js transpile both packages itself.
    "@creit.tech/stellar-wallets-kit",
    "@creit.tech/xbull-wallet-connect",
    // Forces Next.js to webpack-transpile rxjs instead of routing it through
    // the barrel optimizer. `experimental.optimizePackageImports: []` does
    // NOT disable the built-in default opt-in list — rxjs is on that list,
    // so without this the optimizer rewrites `import { ..., takeUntil } from
    // 'rxjs'` into a synthetic `__barrel_optimize__?names=…!rxjs` module
    // whose generated re-export drops `takeUntil` on Linux x64 (prod box),
    // breaking xbull-wallet-connect's bundle. Listing it here is the
    // documented escape hatch — a package in `transpilePackages` is never
    // routed through the barrel optimizer.
    "rxjs",
  ],
  images: {
    formats: ['image/webp'],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "walletconnect.com",
      },
      // Firebase Storage public URLs
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
      // Cloudflare R2 API endpoint (for internal use)
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
        port: '',
        pathname: '/**',
        search: '',
      },
      // Cloudflare R2 public development URLs (pub-*.r2.dev format)
      // All blog images are under /blog/** path
      {
        protocol: "https",
        hostname: "*.r2.dev",
        port: '',
        pathname: '/blog/**',
        search: '',
      },
      // Explicit R2 bucket hostname for reliability - matches exact URL pattern
      {
        protocol: "https",
        hostname: "pub-d4fb029b7ba9442aa0f0b8d8952ce01d.r2.dev",
        port: '',
        pathname: '/blog/**',
        search: '',
      },
      // Cloudflare R2 custom production domain (update with your actual domain)
      {
        protocol: "https",
        hostname: "cdn.peridot.finance",
        port: '',
        pathname: '/**',
        search: '',
      },
      // Alternative: support any subdomain of peridot.finance for CDN
      {
        protocol: "https",
        hostname: "*.peridot.finance",
        port: '',
        pathname: '/**',
        search: '',
      }
    ],
  },
  // PostHog trailing slash support
  skipTrailingSlashRedirect: true,
  // PostHog ingestion rewrites
  async rewrites() {
    return [];
  },
  // Permanent home for the in-app agent chat moved out of /app/agents/chat.
  // Keeps old links, bookmarks and prior system-prompt references alive.
  async redirects() {
    return [
      {
        source: '/app/agents/chat',
        destination: '/chat',
        permanent: false,
      },
    ];
  },
  // Set global body size limits for Server Actions
  serverActions: {
    bodySizeLimit: '1mb',
  },
  experimental: {
    // Next.js's barrel optimizer rewrites `import {x,y} from 'rxjs'` into a
    // synthetic `__barrel_optimize__?names=…!=!rxjs` module. On Linux x64
    // (prod box) it drops `takeUntil` from the generated re-export, breaking
    // xbull-wallet-connect's bundle even though darwin-arm64 builds fine.
    // Empty array replaces the default opt-in list, disabling auto-optimisation.
    // Critical: must live in the same `experimental` block as viewTransition —
    // a second `experimental:` key in this object literal silently overwrites
    // this one (the .next wipe in deploy.sh surfaces it as a build failure).
    optimizePackageImports: [],
    // Limit body size for internal proxying and middleware buffering
    proxyClientMaxBodySize: '1mb',
    middlewareClientMaxBodySize: '1mb',
    // Native CSS View Transitions API on App Router navigation.
    // Enables a same-document `document.startViewTransition` wrap on
    // route changes, so we can drive page transitions with the
    // ::view-transition-old(name) / ::view-transition-new(name)
    // pseudo-elements. The actual transition styling lives in
    // globals.css under `@supports (view-transition-name: x)`.
    // Falls back to a hard cut in non-supporting browsers (Firefox
    // pre-Nightly) — graceful, no JS polyfill needed.
    viewTransition: true,
  },
  // Add security headers
  async headers() {
    return [
      // `v1.peridot.finance` runs the same build as the apex — it is the full
      // multi-chain surface kept alive next to the Stellar-only main site, not
      // a staging host. It stays reachable for the people who use it, but every
      // page on it is a byte-for-byte duplicate of the apex, so it must never
      // compete in the index. Host-matched here rather than in middleware,
      // where an early return would skip rate limiting and admin auth.
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'v1.peridot.finance' }],
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-site',
          },
        ],
      },
    ];
  },
  // Add webpack externals for AppKit compatibility
  webpack: (config, { isServer }) => {
    // Fixes npm packages that depend on `fs` module
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        net: false,
        tls: false,
      };
    }
    // Required by WalletConnect
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

// Export the original config directly without the Sentry wrapper
module.exports = nextConfig; 
