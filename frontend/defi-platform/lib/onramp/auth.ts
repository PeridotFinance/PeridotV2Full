// Identity auth for /api/onramp/* — same verified-Privy-token mechanism the
// bridge routes use (one human = one Privy DID, never trust a body address).
// Re-exported under onramp names so callers don't import "bridge" auth.
export {
  authenticateBridgeRequest as authenticateOnrampRequest,
  getPrivyClient,
} from "@/lib/bridge/auth"
export type { BridgeAuthContext as OnrampAuthContext } from "@/lib/bridge/auth"
