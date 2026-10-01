'use client'

import { useCallback, useMemo, useState } from 'react'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useAgentProfile } from '@/hooks/use-agent-profile'
import type { ConsentChoice } from '@/components/agents/chat/AutoExecuteConsentDialog'

/**
 * Decides whether to show the one-time "Let Perry handle small amounts?"
 * opt-in dialog, and persists the user's answer.
 *
 * Show conditions:
 *   - embedded wallet (canAutoSign wallet-level gate true)
 *   - profile loaded
 *   - auto_execute_enabled === false (not already on)
 *   - auto_execute_prompted_at is null (never asked before)
 *
 * After the user resolves, we write to the profile and the dialog flips off
 * for the rest of the session (defer keeps prompted_at null so we ask again
 * on a future chat session; deny_forever writes prompted_at so we never ask
 * again; allow flips enabled=true + writes prompted_at).
 */
export function useAutoExecuteConsent() {
  const { canAutoSign, isEmbeddedWallet } = useActiveWallet()
  const { profile, updateProfile } = useAgentProfile()
  const [sessionDismissed, setSessionDismissed] = useState(false)

  // We need `isEmbeddedWallet` (wallet IS embedded) even if `canAutoSign` is
  // false — the feature flag might be off at the wallet level, but the dialog
  // should still show when the wallet is embedded and no consent has been given.
  // Here we use isEmbeddedWallet directly so the flag doesn't hide the prompt.
  const shouldShow = useMemo(() => {
    if (!isEmbeddedWallet) return false
    if (!profile) return false
    if (profile.autoExecuteEnabled === true) return false
    if (profile.autoExecutePromptedAt != null) return false
    if (sessionDismissed) return false
    return true
  }, [isEmbeddedWallet, profile, sessionDismissed])

  const resolve = useCallback(
    async (choice: ConsentChoice, limitUsd: number) => {
      setSessionDismissed(true)

      const now = new Date().toISOString()
      if (choice === 'allow') {
        await updateProfile.mutateAsync({
          autoExecuteEnabled: true,
          autoExecuteLimitUsd: limitUsd,
          autoExecutePromptedAt: now,
        })
      } else if (choice === 'deny_forever') {
        await updateProfile.mutateAsync({
          autoExecuteEnabled: false,
          autoExecutePromptedAt: now,
        })
      }
      // 'defer' does not write to the server — we'll ask again next session
    },
    [updateProfile],
  )

  return {
    shouldShow,
    resolve,
    /** Exposed for tests + consumer inspection */
    canAutoSign,
    isEmbeddedWallet,
  }
}
