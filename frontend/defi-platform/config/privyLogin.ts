/**
 * Which Privy login methods each entry point shows.
 *
 * Our own chooser (`ConnectChooser`) already asks "email/social or wallet?",
 * so the Privy modal that follows must not ask again. `login()` takes
 * `loginMethods` per call and Privy's landing screen honours it: socials only
 * renders email + social buttons with no wallet list, and wallet only opens
 * straight on the wallet list.
 *
 * Every method here must also be enabled in the Privy dashboard.
 */

export const SOCIAL_LOGIN_METHODS = [
  'email',
  'google',
  'apple',
  'github',
  'twitter',
  'linkedin',
  'instagram',
  'discord',
] as const

export const WALLET_LOGIN_METHODS = ['wallet'] as const

/** Provider-level list: the union, so both chooser branches can be served. */
export const ALL_LOGIN_METHODS = [...WALLET_LOGIN_METHODS, ...SOCIAL_LOGIN_METHODS]

/** `login(SOCIAL_LOGIN)` = the "Continue with email or social" path. */
export const SOCIAL_LOGIN = { loginMethods: [...SOCIAL_LOGIN_METHODS] }

/** `login(WALLET_LOGIN)` = the "Browser wallet" path. */
export const WALLET_LOGIN = { loginMethods: [...WALLET_LOGIN_METHODS] }
