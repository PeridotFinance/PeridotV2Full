/**
 * Service worker for Peridot push notifications — margin liquidation warnings
 * and the on-ramp's "your money arrived".
 *
 * The only reason it exists: a page can't be told anything once its tab is
 * closed. This can — the push service wakes it, it draws the notification, and
 * a tap brings the trader back to the position.
 *
 * Deliberately tiny and deliberately scoped to nothing else. It does not cache,
 * intercept fetches, or take over the app in any way; a service worker that
 * starts serving assets is a whole class of "why is the site stale" bugs, and
 * none of that is needed to show a notification.
 */

self.addEventListener('install', () => {
  // Replace an older version immediately — a warning worker one deploy behind is
  // the kind of thing nobody notices until it matters.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = {}
  }

  const title = data.title || 'Peridot margin'
  const body = data.body || 'One of your positions needs attention.'
  const critical = data.level === 'critical'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/Peridot-Icon-Only-Mint-Green.svg',
      badge: '/Peridot-Icon-Only-Mint-Green.svg',
      // One notification per subject: a new push about the same position (or
      // the same deposit) replaces the old one instead of stacking. The payload
      // may name its own tag; the margin fallback predates that field.
      tag:
        data.tag ||
        (data.positionId ? `peridot-margin-${data.positionId}` : 'peridot-margin'),
      renotify: true,
      // A warning that disappears while the phone is in a pocket has done
      // nothing. Only the loudest level gets to insist.
      requireInteraction: critical,
      data: { url: data.url || '/app/margin' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/app/margin'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reuse a tab that is already on the target rather than opening a third
      // copy of it — the user is about to act, and doing that in a fresh tab
      // means re-connecting a wallet first.
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
