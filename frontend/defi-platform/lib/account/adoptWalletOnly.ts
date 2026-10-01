/**
 * Merge a wallet-only Peridot account into a real (Privy) one.
 *
 * A trader who entered the trading challenge with nothing but a Freighter key
 * gets an account keyed on a synthetic DID (`stellar:G…`, see
 * lib/challenge/db.ts). If that same person later signs up with Privy and links
 * the very same address, the global unique index on
 * `account_wallet_links(chain_namespace, normalized_address)` would reject the
 * link — the address is taken, by their own earlier self, and the wallet-links
 * route would answer "already linked to another Peridot account".
 *
 * So the earlier account is absorbed rather than defended: its links, challenge
 * entry, score row and chat authorship move to the Privy account and the
 * synthetic row is deleted. Their standings survive the upgrade, which is the
 * whole point — the alternative is a trader losing a live competition entry by
 * creating an account.
 *
 * Safe because both sides are proofs of the same key: the synthetic account
 * only ever exists after a signature from that address.
 *
 * Server-only. Runs in one transaction — a half-merged identity would show the
 * same person twice on the board.
 */
import { sql } from "@/lib/database"
import { getTableNames } from "@/lib/tableResolver"
import { isWalletOnlyDid } from "@/lib/challenge/db"

/**
 * The account that holds `normalizedAddress`, when it is a wallet-only one.
 * Returns null for a real account (nothing to adopt — that is a genuine
 * conflict and the caller must still refuse).
 */
export async function findWalletOnlyOwner(
  chainNamespace: "evm" | "stellar",
  normalizedAddress: string,
): Promise<number | null> {
  // Only Stellar addresses can ever be held by a wallet-only account.
  if (chainNamespace !== "stellar") return null
  const t = getTableNames()
  const rows = (await sql`
    SELECT a.id, a.privy_user_id
    FROM ${sql(t.accountWalletLinks)} l
    JOIN ${sql(t.peridotAccounts)} a ON a.id = l.account_id
    WHERE l.chain_namespace = 'stellar' AND l.normalized_address = ${normalizedAddress}
    LIMIT 1
  `) as unknown as Array<{ id: number; privy_user_id: string }>
  const row = rows[0]
  if (!row || !isWalletOnlyDid(row.privy_user_id)) return null
  return Number(row.id)
}

/**
 * Move everything owned by `fromAccountId` onto `toAccountId` and delete the
 * source account. A no-op when both ids are the same.
 *
 * Every move is written as "transfer what the target doesn't already have,
 * drop the rest": the target may legitimately hold its own row for the same
 * challenge (it entered separately) or the same address (impossible today, but
 * the unique indexes would be the ones to find out).
 */
export async function adoptWalletOnlyAccount(fromAccountId: number, toAccountId: number): Promise<void> {
  if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) return
  const t = getTableNames()

  await sql.begin(async (tx) => {
    // Wallet links. `is_primary` is cleared on the way over — the target's own
    // primary must keep winning, and the partial unique index would reject a
    // second primary for the chain. A target left with no primary at all gets
    // one back below.
    await tx`
      UPDATE ${tx(t.accountWalletLinks)} l
      SET account_id = ${toAccountId}, is_primary = FALSE, updated_at = NOW()
      WHERE l.account_id = ${fromAccountId}
        AND NOT EXISTS (
          SELECT 1 FROM ${tx(t.accountWalletLinks)} o
          WHERE o.account_id = ${toAccountId}
            AND o.chain_namespace = l.chain_namespace
            AND o.normalized_address = l.normalized_address
        )
    `
    await tx`DELETE FROM ${tx(t.accountWalletLinks)} WHERE account_id = ${fromAccountId}`

    // Stale link nonces belong to the account that requested them.
    await tx`DELETE FROM ${tx(t.walletLinkChallenges)} WHERE account_id = ${fromAccountId}`

    // Challenge entry + score. Handles are unique per challenge and travel with
    // the row, so no rename is needed; a target that already entered keeps its
    // own entry and the source's is dropped.
    await tx`
      UPDATE challenge_participants p
      SET account_id = ${toAccountId}
      WHERE p.account_id = ${fromAccountId}
        AND NOT EXISTS (
          SELECT 1 FROM challenge_participants o
          WHERE o.challenge_id = p.challenge_id AND o.account_id = ${toAccountId}
        )
    `
    await tx`DELETE FROM challenge_participants WHERE account_id = ${fromAccountId}`

    await tx`
      UPDATE challenge_scores s
      SET account_id = ${toAccountId}
      WHERE s.account_id = ${fromAccountId}
        AND NOT EXISTS (
          SELECT 1 FROM challenge_scores o
          WHERE o.challenge_id = s.challenge_id AND o.account_id = ${toAccountId}
        )
    `
    await tx`DELETE FROM challenge_scores WHERE account_id = ${fromAccountId}`

    // Authorship of anything already said in the feed. No uniqueness here, so
    // every message moves.
    await tx`
      UPDATE challenge_chat_messages SET account_id = ${toAccountId}
      WHERE account_id = ${fromAccountId}
    `

    await tx`DELETE FROM ${tx(t.peridotAccounts)} WHERE id = ${fromAccountId}`

    // Re-establish a primary per chain if the merge left the target without
    // one (it had no link for that chain before).
    await tx`
      UPDATE ${tx(t.accountWalletLinks)} l
      SET is_primary = TRUE, updated_at = NOW()
      WHERE l.id IN (
        SELECT DISTINCT ON (c.chain_namespace) c.id
        FROM ${tx(t.accountWalletLinks)} c
        WHERE c.account_id = ${toAccountId}
          AND NOT EXISTS (
            SELECT 1 FROM ${tx(t.accountWalletLinks)} p
            WHERE p.account_id = ${toAccountId}
              AND p.chain_namespace = c.chain_namespace
              AND p.is_primary = TRUE
          )
        ORDER BY c.chain_namespace, c.created_at ASC
      )
    `
  })
}
