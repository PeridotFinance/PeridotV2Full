/**
 * "Add money" is one door.
 *
 * Money used to come in through four different surfaces, each with its own
 * copy and its own destination: the Easy home card's `AddMoneyDialog`, the
 * wallet dialog's funding tab, the deposit sheet's card checkout and the
 * account page's "Add cash". They are now one sheet, opened by
 * `openAddMoney()` from `lib/onramp/add-money`.
 *
 * These are source-level checks on purpose: what matters is that no surface
 * grows its own funding flow again.
 *
 * Run: npx vitest run tests/add-money-one-door.test.ts
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel))

const CALLERS = [
  'components/easy/EasyCardDev.tsx',
  'components/ui/WalletManagementDialog.tsx',
  'components/steallar/sheets/DepositSheet.tsx',
  'components/steallar/DepositSlidePanel.tsx',
  'components/steallar/TxToast.tsx',
  'app/app/easy/account/page.tsx',
  'app/app/easy/portfolio/page.tsx',
]

describe('Add money: one sheet for every surface', () => {
  it('the sheet and its opener exist', () => {
    expect(exists('lib/onramp/add-money.ts')).toBe(true)
    expect(exists('components/onramp/AddMoneyHost.tsx')).toBe(true)
  })

  it('is mounted once, for every app route', () => {
    expect(read('components/providers/root-providers.tsx')).toContain('<AddMoneyHost />')
  })

  it('every funding surface opens it instead of its own flow', () => {
    for (const file of CALLERS) {
      const src = read(file)
      expect(src, `${file} should open the Add money sheet`).toMatch(/openAddMoney(Sheet)?\(/)
      expect(src, `${file} should not run its own card checkout`).not.toContain('fundWithMeld')
      expect(src, `${file} should not open the legacy Swapper`).not.toContain('openSwapperModal')
    }
  })

  it('the replaced surfaces are gone', () => {
    expect(exists('components/onramp/AddMoneyDialog.tsx')).toBe(false)
    expect(exists('components/onramp/AddMoneyButton.tsx')).toBe(false)
    expect(read('components/ui/WalletManagementDialog.tsx')).not.toContain("label: 'Funding'")
  })

  it('the bank-transfer body stays shared, not copied', () => {
    // One implementation of the SEPA flow, embedded by the sheet, the deposit
    // sheet's bank step and the wallet dialog's cash-out view.
    for (const file of [
      'components/onramp/AddMoneyHost.tsx',
      'components/steallar/sheets/DepositSheet.tsx',
      'components/ui/WalletManagementDialog.tsx',
    ]) {
      expect(read(file)).toContain('AddMoneyBody')
    }
  })
})
