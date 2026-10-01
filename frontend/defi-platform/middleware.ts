import { NextRequest, NextResponse } from 'next/server'

// --- Rate Limiting Configuration ---
type RateLimitRecord = {
  count: number;
  lastReset: number;
};

// In-memory store for IP hits
const ipCache = new Map<string, RateLimitRecord>();

// Config: Differentiated limits per category
const LIMITS = {
  GENERAL_GET: 60,       // 60/min for standard reads
  GENERAL_POST: 15,      // 15/min for standard writes
  HEAVY_AGGREGATE: 5,    // 5/min for database-heavy routes (e.g. leaderboard aggregate)
  ADMIN_ACTIONS: 10,     // 10/min for blog/admin APIs
  EXPORT_CSV: 1,         // 1 per 20 seconds for heavy CSV export queries
  CHALLENGE_JOIN: 5,     // 5/min strict limit for joining the challenge
  CHALLENGE_CHAT: 10,    // 10/min — the trading-challenge feed is a public,
                         // participant-writable stream next to a prize board;
                         // 10 is a comfortable conversation and a useless spam rate
  PRICE_FEED: 20,        // 20/min — price proxy routes; server caches 60 s so legitimate
                         // clients need at most 1 req/min; 20 gives headroom for retries
  AGENT_CHAT: 10,        // 10/min — streaming AI chat endpoint (each request is expensive)
  AGENT_GET: 180,        // 180/min — agent GETs (activity, profile, timeline/action,
                         // conversations). Isolated from GENERAL_GET so concurrent
                         // polls + event-triggered refreshes during a tx flow don't
                         // exhaust the global read budget and 429 the activity panel.
  SUPPORT_AGENT: 8,      // 8/min — every POST to /api/support/messages triggers a
                         // fire-and-forget LLM reply server-side, so this bucket
                         // protects the LLM cost surface (the modal is reachable
                         // without auth).
  BRIDGE_WEBHOOK: 240,   // 240/min — Bridge.xyz delivers signature-verified
                         // webhooks from its own IPs; a burst of deposits /
                         // status transitions must not be throttled. The RSA
                         // signature check in the route is the real gate.
  ASANA_WEBHOOK: 120,    // 120/min — Asana batches task events and retries
                         // aggressively; throttling a delivery only makes it
                         // come back. The HMAC check in the route is the gate.
  STELLAR_RPC: 300,      // 300/min: the same-origin Soroban proxy, used only
                         // when the public endpoints throttle a user. It is a
                         // read path a portfolio refresh hits many times over,
                         // so the general write budget of 15 would black out
                         // exactly the fail-over it exists to be. The method
                         // allowlist and the shared cache in the route are the
                         // real gates.
  ROBINHOOD_RPC: 120,    // 120/min: the Robinhood read proxy; viem batches a
                         // whole multicall into one request, so a tab needs a
                         // handful per minute even with every hook mounted.
};

// Config: Time windows per category (in milliseconds)
const WINDOWS: Record<keyof typeof LIMITS, number> = {
  GENERAL_GET: 60 * 1000,        // 60 seconds
  GENERAL_POST: 60 * 1000,       // 60 seconds
  HEAVY_AGGREGATE: 60 * 1000,    // 60 seconds
  ADMIN_ACTIONS: 60 * 1000,      // 60 seconds
  EXPORT_CSV: 20 * 1000,         // 20 seconds
  CHALLENGE_JOIN: 60 * 1000,     // 60 seconds
  CHALLENGE_CHAT: 60 * 1000,     // 60 seconds
  PRICE_FEED: 60 * 1000,         // 60 seconds
  AGENT_CHAT: 60 * 1000,         // 60 seconds
  AGENT_GET: 60 * 1000,          // 60 seconds
  SUPPORT_AGENT: 60 * 1000,      // 60 seconds
  BRIDGE_WEBHOOK: 60 * 1000,     // 60 seconds
  ASANA_WEBHOOK: 60 * 1000,      // 60 seconds
  STELLAR_RPC: 60 * 1000,        // 60 seconds
  ROBINHOOD_RPC: 60 * 1000,      // 60 seconds
};

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // Default window (for cleanup)

// Config: Maximum body size for POST/PUT/PATCH requests (1MB)
const MAX_BODY_SIZE = 1024 * 1024;

// Image uploads are the one place where a 1MB JSON-sized cap is wrong — a
// phone photo or a designed cover is routinely several megabytes. These routes
// enforce their own 8MB limit and reject non-image types.
const IMAGE_UPLOAD_PATHS = new Set([
  '/api/blog/upload-image',
  '/api/blog/upload-insights-image',
]);
const MAX_IMAGE_UPLOAD_SIZE = 10 * 1024 * 1024;

function maxBodySizeFor(pathname: string): number {
  return IMAGE_UPLOAD_PATHS.has(pathname) ? MAX_IMAGE_UPLOAD_SIZE : MAX_BODY_SIZE;
}

/**
 * Checks if a given IP is exceeding the rate limit for a specific category.
 */
function isRateLimited(ip: string, category: keyof typeof LIMITS = 'GENERAL_GET'): boolean {
  const now = Date.now();
  const cacheKey = `${ip}:${category}`;
  const record = ipCache.get(cacheKey);
  const threshold = LIMITS[category];
  const windowMs = WINDOWS[category] || RATE_LIMIT_WINDOW_MS;

  if (!record) {
    ipCache.set(cacheKey, { count: 1, lastReset: now });
    return false;
  }

  // If the window has passed, reset the count
  if (now - record.lastReset > windowMs) {
    record.count = 1;
    record.lastReset = now;
    return false;
  }

  // Increment and check limit
  record.count++;
  return record.count > threshold;
}

// Memory Cleanup: Periodically remove expired IP records to prevent memory growth
// Note: In Next.js Edge Runtime/Middleware, we can't use setInterval,
// so we perform a "lazy cleanup" occasionally.
let lastCleanupTime = Date.now();
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes

function performLazyCleanup() {
  const now = Date.now();
  if (now - lastCleanupTime > CLEANUP_INTERVAL) {
    for (const [key, record] of ipCache.entries()) {
      // Extract category from cache key (format: "ip:category")
      // Handle IPv6 addresses which contain colons by finding the last colon
      const lastColonIndex = key.lastIndexOf(':');
      if (lastColonIndex === -1) continue; // Skip malformed keys
      
      const category = key.substring(lastColonIndex + 1) as keyof typeof LIMITS;
      const windowMs = WINDOWS[category] || RATE_LIMIT_WINDOW_MS;
      
      // Use the correct window for each category
      if (now - record.lastReset > windowMs) {
        ipCache.delete(key);
      }
    }
    lastCleanupTime = now;
  }
}

// Query params that indicate referral/affiliate tracking
const REFERRAL_PARAMS = ['ref', 'referral', 'r', 'invite', 'code', 'affiliate']

// Admin blog protection
const ADMIN_BLOG_ENABLED = process.env.ADMIN_BLOG_ENABLED === 'true'
const ADMIN_BLOG_PASSWORD = process.env.ADMIN_BLOG_PASSWORD
const isDevelopment = process.env.NODE_ENV === 'development'
const ADMIN_BLOG_COOKIE_NAME = 'admin_blog_session'

async function verifyAdminBlogCookie(cookieValue: string, secret: string): Promise<boolean> {
  const [expiry, sigB64] = cookieValue.split('.')
  if (!expiry || !sigB64) return false
  const exp = parseInt(expiry, 10)
  if (Number.isNaN(exp) || Date.now() > exp) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(expiry))
  const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return expectedB64 === sigB64
}

export async function middleware(request: NextRequest) {
  const url = request.nextUrl
  const pathname = url.pathname

  // 0. One canonical host for search engines.
  //
  // Three hostnames serve the identical app — the apex, `www.`, and `v1.` (the
  // full multi-chain build kept alive next to the Stellar-only apex). None of
  // them redirected or carried a canonical, so Google saw three copies of every
  // page and split what little authority the domain has. `www.` is a plain
  // duplicate and gets redirected away here; `v1.` is a deliberate product
  // surface that people still use, so it stays fully reachable and is only kept
  // out of the index — that happens via an `X-Robots-Tag` header in
  // next.config.js, not here, because an early return would skip the rate
  // limiting and admin auth below. API routes are exempt from the redirect:
  // webhook senders (Bridge, Asana) do not follow 308s, and a redirected POST
  // is a lost delivery.
  const host = (request.headers.get('host') || '').toLowerCase().split(':')[0]

  if (host.startsWith('www.') && !pathname.startsWith('/api/')) {
    // Built from the forwarded scheme and a bare hostname rather than from
    // `request.url`: behind nginx that URL is the internal `http://…:3000`,
    // and echoing it back would send visitors to a plaintext, port-bearing
    // address that only Cloudflare's upgrade quietly repairs.
    const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')
    const target = new URL(`${proto}://${host.slice(4)}${pathname}${url.search}`)
    return NextResponse.redirect(target, 308)
  }

  // 1. Apply Rate Limiting to API and sensitive routes
  if (pathname.startsWith('/api/')) {
    const ip = request.headers.get('cf-connecting-ip') || 
               request.headers.get('x-forwarded-for') || 
               '127.0.0.1';

    // Block high-risk blog endpoints in production unless admin blog is enabled.
    // When admin blog is enabled, blog API routes are still protected below by
    // admin auth checks (cookie/password).
    const blockedInProduction = [
      '/api/blog/create',              // Multi-step DB upsert - moderate risk
      '/api/blog/generate',            // Heavy AI generation - high risk
      '/api/blog/generate-stream',     // Long-lived AI stream - high risk
      '/api/blog/generate-cover-image',// Expensive AI image generation - high risk
      '/api/blog/upload-image',        // File storage IO - moderate risk
      '/api/blog/criticize-claim',     // AI fact-check call - moderate risk
      '/api/blog/enhance-claim',       // AI fact-check call - moderate risk
    ];
    
    const shouldBlockHighRiskBlogEndpoint =
      blockedInProduction.includes(pathname) &&
      !isDevelopment &&
      !(ADMIN_BLOG_ENABLED && pathname.startsWith('/api/blog'))

    if (shouldBlockHighRiskBlogEndpoint) {
      console.warn(`[Security] Blocked production access to ${pathname} from ${ip}`);
      return new NextResponse('Not Found', { status: 404 });
    }

    performLazyCleanup();
    
    // Check for browser context on sensitive endpoints
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    
    // Server-to-server endpoints (token-gated, called by cron — never a browser).
    // Exempt from the browser-context gate; they enforce their own auth.
    const isServerToServerEndpoint =
      pathname === '/api/margin/keeper/run' ||
      pathname === '/api/margin/close-sweeper/run' ||
      pathname === '/api/margin/risk-watch/run';

    // List of endpoints that should only be accessed via a browser
    const isBrowserOnlyEndpoint =
      !isServerToServerEndpoint && (
      pathname.startsWith('/api/tvl') ||
      pathname.startsWith('/api/apy') ||
      pathname.startsWith('/api/leaderboard') ||
      pathname.startsWith('/api/user/me') ||
      pathname.startsWith('/api/user/portfolio-data') ||
      pathname.startsWith('/api/user/earnings') ||
      pathname.startsWith('/api/user/transactions') ||
      pathname.startsWith('/api/user/export-csv') ||
      pathname.startsWith('/api/trading-challenge') ||
      pathname.startsWith('/api/support') ||
      pathname.startsWith('/api/margin/') ||
      pathname.startsWith('/api/agents/') ||
      pathname.startsWith('/api/swap/') ||
      pathname.startsWith('/api/crosschain/'));

    // Block requests missing both origin and referer (indicative of automation/direct script access)
    // We allow this in development for easier testing unless specified otherwise
    if (isBrowserOnlyEndpoint && !origin && !referer && !isDevelopment) {
      console.warn(`[Security] Blocked header-less request from ${ip} for ${pathname}`);
      return new NextResponse(
        JSON.stringify({ 
          success: false, 
          error: 'Access denied. Browser context required.' 
        }),
        { 
          status: 403, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    // Determine rate limit category
    let category: keyof typeof LIMITS = 'GENERAL_GET';
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      category = 'GENERAL_POST';
      if (pathname === '/api/bridge/webhook') {
        // Inbound Bridge.xyz webhooks — authenticated by RSA signature in the
        // route, delivered from Bridge's IPs; needs headroom for burst retries.
        category = 'BRIDGE_WEBHOOK';
      } else if (pathname === '/api/asana/webhook') {
        // Inbound Asana webhooks — HMAC-verified in the route. Includes the
        // handshake POST, which Asana issues synchronously while creating the
        // webhook: a 429 there fails registration outright.
        category = 'ASANA_WEBHOOK';
      } else if (pathname.startsWith('/api/blog') || pathname.startsWith('/api/admin')) {
        category = 'ADMIN_ACTIONS';
      } else if (pathname === '/api/trading-challenge/join') {
        category = 'CHALLENGE_JOIN';
      } else if (pathname === '/api/margin-challenge/chat') {
        category = 'CHALLENGE_CHAT';
      } else if (pathname === '/api/margin-challenge/join') {
        // Same strict budget as the Solana challenge's join above — a prize
        // entry point is worth brute-forcing handles against.
        category = 'CHALLENGE_JOIN';
      } else if (pathname === '/api/stellar/rpc') {
        category = 'STELLAR_RPC';
      } else if (pathname === '/api/robinhood/rpc') {
        // Same shape as the Soroban proxy: a read-only fail-over the margin
        // hooks hit once per multicall batch, not a write endpoint.
        category = 'ROBINHOOD_RPC';
      } else if (pathname.startsWith('/api/agents/chat')) {
        category = 'AGENT_CHAT';
      } else if (pathname === '/api/support/messages') {
        // Each POST triggers a fire-and-forget LLM reply server-side, so we
        // tighten the bucket to defend the cost surface. Session creation
        // (/api/support/session) and message GET stay on the general bucket.
        category = 'SUPPORT_AGENT';
      }
    } else if (
      pathname === '/api/leaderboard/aggregate' ||
      pathname === '/api/leaderboard/breakdown'
    ) {
      category = 'HEAVY_AGGREGATE';
    } else if (pathname === '/api/user/export-csv') {
      category = 'EXPORT_CSV';
    } else if (pathname === '/api/markets/timeseries') {
      // The chart reads (JSON) are cached and cheap; only the export form
      // scans the raw feeds uncached, so just that one joins the CSV bucket.
      category = request.nextUrl.searchParams.get('format') === 'csv'
        ? 'EXPORT_CSV'
        : 'GENERAL_GET';
    } else if (pathname === '/api/token/price') {
      category = 'PRICE_FEED';
    } else if (pathname.startsWith('/api/swap/status')) {
      category = 'PRICE_FEED'; // 20/min — status polling needs higher limit
    } else if (pathname.startsWith('/api/agents/activity/stream')) {
      // Long-lived SSE connection — counting per-request is wrong semantically
      // (one connect can serve minutes of events). Keep in GENERAL_GET so a
      // reconnect loop still gets rate-limited, but note we only count the
      // initial handshake.
      category = 'GENERAL_GET';
    } else if (pathname.startsWith('/api/agents/')) {
      // Activity panel polls, profile loads, timeline/action re-mount lookups,
      // conversation list — all share the same agent-UI budget. Kept separate
      // from the global read bucket because a concurrent chat flow + panel
      // poll can otherwise exhaust 60/min quickly and 429 the activity card.
      category = 'AGENT_GET';
    }

    if (isRateLimited(ip, category)) {
      console.warn(`[RateLimit] Blocked ${category} request from ${ip} for ${pathname}`);
      const windowMs = WINDOWS[category] || RATE_LIMIT_WINDOW_MS;
      const retryAfterSeconds = Math.ceil(windowMs / 1000);
      const retryMessage = category === 'EXPORT_CSV'
        ? 'Please wait 20 seconds before requesting another export.'
        : category === 'PRICE_FEED'
          ? 'Price data is cached — please wait 60 seconds before retrying.'
          : 'Please try again in a minute.';
      const errorSuffix = category === 'GENERAL_GET' ? ' for this resource' : ' for this action';
      return new NextResponse(
        JSON.stringify({
          success: false,
          error: `Too many requests${category === 'PRICE_FEED' ? '' : errorSuffix}. ${retryMessage}`
        }),
        { 
          status: 429, 
          headers: { 
            'Content-Type': 'application/json',
            'Retry-After': retryAfterSeconds.toString()
          } 
        }
      );
    }

    // 1.2 Apply Body Size Limits to POST/PUT/PATCH requests
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const contentLength = request.headers.get('content-length');
      const maxBodySize = maxBodySizeFor(pathname);
      if (contentLength && parseInt(contentLength) > maxBodySize) {
        console.warn(`[Security] Blocked oversized request from ${ip} for ${pathname} (${contentLength} bytes)`);
        return new NextResponse(
          JSON.stringify({ 
            success: false, 
            error: `Payload too large. Maximum size is ${Math.round(maxBodySize / (1024 * 1024))}MB.` 
          }),
          { 
            status: 413, 
            headers: { 'Content-Type': 'application/json' } 
          }
        );
      }
    }
  }

  // 2. Protect admin blog routes
  if (pathname.startsWith('/admin/blog') || pathname.startsWith('/api/blog')) {
    if (!ADMIN_BLOG_ENABLED) {
      return new NextResponse('Not Found', { status: 404 })
    }
    // Allow login page and login API without auth (so marketer can sign in)
    if (pathname === '/admin/blog' || pathname === '/admin/blog/') {
      return NextResponse.next()
    }
    if (pathname === '/api/blog/admin-login' && request.method === 'POST') {
      return NextResponse.next()
    }
    if (ADMIN_BLOG_PASSWORD && !isDevelopment) {
      const providedPassword =
        request.headers.get('x-admin-password') ||
        url.searchParams.get('admin_password')
      const cookie = request.cookies.get(ADMIN_BLOG_COOKIE_NAME)?.value
      const cookieValid =
        cookie && ADMIN_BLOG_PASSWORD
          ? await verifyAdminBlogCookie(cookie, ADMIN_BLOG_PASSWORD)
          : false
      const passwordValid = providedPassword === ADMIN_BLOG_PASSWORD
      if (!cookieValid && !passwordValid) {
        return new NextResponse('Unauthorized', { status: 401 })
      }
    }
  }

  // 2b. Protect support-admin (ugamau) routes — same gate as the blog admin,
  //     shares ADMIN_BLOG_PASSWORD + ADMIN_BLOG_ENABLED + admin_blog_session
  //     cookie so a single login serves both surfaces.
  if (pathname.startsWith('/admin/create/ugamau') || pathname.startsWith('/api/admin/ugamau')) {
    if (!ADMIN_BLOG_ENABLED) {
      return new NextResponse('Not Found', { status: 404 })
    }
    // Login page (top-level only) is reachable without auth; deeper paths are
    // gated. The login API is intentionally the same /api/blog/admin-login —
    // no separate endpoint needed since the cookie is shared.
    if (pathname === '/admin/create/ugamau' || pathname === '/admin/create/ugamau/') {
      return NextResponse.next()
    }
    if (ADMIN_BLOG_PASSWORD && !isDevelopment) {
      const providedPassword =
        request.headers.get('x-admin-password') ||
        url.searchParams.get('admin_password')
      const cookie = request.cookies.get(ADMIN_BLOG_COOKIE_NAME)?.value
      const cookieValid =
        cookie && ADMIN_BLOG_PASSWORD
          ? await verifyAdminBlogCookie(cookie, ADMIN_BLOG_PASSWORD)
          : false
      const passwordValid = providedPassword === ADMIN_BLOG_PASSWORD
      if (!cookieValid && !passwordValid) {
        // Page navigations get redirected to the login form; API calls
        // get a 401 so the client can handle it explicitly.
        if (pathname.startsWith('/admin/create/ugamau')) {
          const loginUrl = new URL('/admin/create/ugamau', url)
          return NextResponse.redirect(loginUrl)
        }
        return new NextResponse('Unauthorized', { status: 401 })
      }
    }
  }

  // 3. Handle referral/affiliate tracking
  const searchParams = url.searchParams
  let hasReferralParam = false
  const canonicalUrl = new URL(url.toString())

  for (const param of REFERRAL_PARAMS) {
    if (searchParams.has(param)) {
      hasReferralParam = true
      canonicalUrl.searchParams.delete(param)
    }
  }

  // If no referral params, proceed normally
  if (!hasReferralParam) {
    return NextResponse.next()
  }

  // Set an HTTP rel=canonical header pointing at the clean URL
  const response = NextResponse.next()
  response.headers.set('Link', `<${canonicalUrl.toString()}>; rel="canonical"`)

  // Prevent indexing of URLs with referral parameters
  // This tells search engines not to index these URLs but still follow links
  response.headers.set('X-Robots-Tag', 'noindex, follow')

  return response
}


// Apply to all requests, including API routes for admin blog protection
export const config = {
  matcher: [
    // Match all routes including API routes (but exclude static assets)
    // This pattern already matches /admin/blog/* and /api/blog/* routes
    '/((?!_next/|static/|fonts/|images/|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml)).*)'
  ]
}
