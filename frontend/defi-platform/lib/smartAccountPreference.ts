// Centralized preference storage for opting into Biconomy smart account flows
// Preference is stored per EOA address in localStorage. No secrets are stored.

const STORAGE_PREFIX = 'smart-account-preference'

function getStorageKey(address: `0x${string}`) {
  return `${STORAGE_PREFIX}:${address.toLowerCase()}`
}

export function isSmartAccountEnabled(address?: `0x${string}` | null): boolean {
  if (!address) return false
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(getStorageKey(address))
    return raw === '1' || raw === 'true'
  } catch {
    return false
  }
}

export function setSmartAccountEnabled(address: `0x${string}`, enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    const key = getStorageKey(address)
    if (enabled) window.localStorage.setItem(key, '1')
    else window.localStorage.removeItem(key)
    try {
      window.dispatchEvent(new CustomEvent('peridot:smart-account-pref-changed', { detail: { address, enabled } }))
    } catch {}
  } catch {}
}

export function toggleSmartAccountEnabled(address: `0x${string}`): boolean {
  const next = !isSmartAccountEnabled(address)
  setSmartAccountEnabled(address, next)
  return next
}


