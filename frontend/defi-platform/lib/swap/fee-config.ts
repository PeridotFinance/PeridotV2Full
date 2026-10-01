/**
 * Centralized fee configuration for all swap/bridge providers.
 * All fees flow to the same Peridot wallet.
 */

/** Peridot fee collection wallet */
export const FEE_WALLET = '0x49b7e0B48980059Bd7eaF1E0987F6ad73f6285e4'

/** Fee rate as decimal (0.007 = 0.7%) — used by Bitget Order Mode */
export const FEE_RATE = '0.007'

/** Fee in basis points (70 = 0.7%) — used by Squid Router */
export const FEE_BPS = 70
