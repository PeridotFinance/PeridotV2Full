/**
 * Easy Mode migration tests — /app/easy/dev → /app/easy
 *
 * These tests verify the route migration is complete:
 *  1. No stale "/app/easy/dev" references remain in source code
 *  2. All required page files exist at /app/easy/... paths
 *  3. Navigation components use the new routes
 *  4. Header/footer wrappers gate on /app/easy (not /dev)
 *
 * Run: npx vitest run tests/easy-mode-migration.test.ts
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Recursively collect all files matching a filter */
function walkDir(dir: string, filter: (f: string) => boolean): string[] {
  const results: string[] = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // Skip node_modules, .next, .git
      if (['node_modules', '.next', '.git', 'dist'].includes(entry.name)) continue
      results.push(...walkDir(full, filter))
    } else if (filter(full)) {
      results.push(full)
    }
  }
  return results
}

/** Read file content as string */
function read(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8')
}

/** Check if a file exists */
function exists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath))
}

// ─── 1. No stale /app/easy/dev references ─────────────────────────────────────

describe('No stale /app/easy/dev references', () => {
  // Collect all source files (.ts, .tsx, .js, .jsx) excluding tests, node_modules, .next
  const sourceFiles = walkDir(ROOT, (f) =>
    /\.(tsx?|jsx?)$/.test(f) &&
    !f.includes('node_modules') &&
    !f.includes('.next') &&
    !f.includes('tests/easy-mode-migration') // exclude this test file
  )

  it('no source file contains a hardcoded /app/easy/dev route', () => {
    const violations: { file: string; line: number; text: string }[] = []

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        // Match "/app/easy/dev" as a route reference (in strings, hrefs, etc.)
        // Exclude comments about the migration itself
        if (lines[i].includes('/app/easy/dev') && !lines[i].includes('// migration')) {
          violations.push({
            file: path.relative(ROOT, file),
            line: i + 1,
            text: lines[i].trim(),
          })
        }
      }
    }

    expect(violations, `Found ${violations.length} stale /app/easy/dev references:\n${
      violations.map(v => `  ${v.file}:${v.line} → ${v.text}`).join('\n')
    }`).toHaveLength(0)
  })
})

// ─── 2. Required page files exist at /app/easy/... ────────────────────────────

describe('Easy Mode page files exist at /app/easy/', () => {
  const requiredPages = [
    'app/app/easy/page.tsx',
    'app/app/easy/layout.tsx',
    'app/app/easy/portfolio/page.tsx',
    'app/app/easy/activity/page.tsx',
    'app/app/easy/account/page.tsx',
    'app/app/easy/account/tax/page.tsx',
    'app/app/easy/portfolio/[posId]/page.tsx',
  ]

  for (const page of requiredPages) {
    it(`${page} exists`, () => {
      expect(exists(page), `Missing: ${page}`).toBe(true)
    })
  }
})

// ─── 3. Old /app/easy/dev directory is gone ───────────────────────────────────

describe('Old /app/easy/dev directory removed', () => {
  it('/app/easy/dev/ directory does not exist', () => {
    const devDir = path.join(ROOT, 'app/app/easy/dev')
    expect(fs.existsSync(devDir), 'app/app/easy/dev/ should be deleted after migration').toBe(false)
  })
})

// ─── 4. EasyCardDev navigation links use /app/easy ────────────────────────────

describe('EasyCardDev navigation links', () => {
  it('footer nav points to /app/easy/* (not /app/easy/dev/*)', () => {
    const content = read('components/easy/EasyCardDev.tsx')

    expect(content).toContain('/app/easy/portfolio')
    expect(content).toContain('/app/easy/activity')
    expect(content).toContain('/app/easy/account')
    expect(content).not.toContain('/app/easy/dev/')
  })
})

// ─── 5. DevNav links use /app/easy ────────────────────────────────────────────

describe('DevNav navigation links', () => {
  it('all nav items point to /app/easy/* (not /app/easy/dev/*)', () => {
    // DevNav may be renamed or moved — check both possible locations
    const possiblePaths = [
      'components/easy/dev/DevNav.tsx',
      'components/easy/DevNav.tsx',
    ]
    const navFile = possiblePaths.find(p => exists(p))
    expect(navFile, 'DevNav.tsx should exist in components/easy/').toBeDefined()

    const content = read(navFile!)
    expect(content).toContain('/app/easy"')           // Home link
    expect(content).toContain('/app/easy/portfolio')
    expect(content).toContain('/app/easy/activity')
    expect(content).toContain('/app/easy/account')
    expect(content).not.toContain('/app/easy/dev')
  })
})

// ─── 6. Header/footer wrappers gate on /app/easy ──────────────────────────────

describe('Site wrappers use /app/easy (not /app/easy/dev)', () => {
  it('site-header-wrapper hides on /app/easy', () => {
    const content = read('components/site-header-wrapper.tsx')
    // Should check startsWith('/app/easy') — NOT startsWith('/app/easy/dev')
    expect(content).toMatch(/startsWith\(['"]\/app\/easy['"]\)/)
    expect(content).not.toContain('/app/easy/dev')
  })

  it('site-footer-wrapper hides on /app/easy', () => {
    const content = read('components/site-footer-wrapper.tsx')
    expect(content).toMatch(/startsWith\(['"]\/app\/easy['"]\)/)
    expect(content).not.toContain('/app/easy/dev')
  })
})

// ─── 7. EasyManagementModal routes to /app/easy ───────────────────────────────

describe('EasyManagementModal routing', () => {
  it('router.push uses /app/easy (not /app/easy/dev)', () => {
    const content = read('components/easy/EasyManagementModal.tsx')
    // Should push to /app/easy after actions
    expect(content).toMatch(/router\.push\(['"]\/app\/easy['"]/)
    expect(content).not.toContain('/app/easy/dev')
  })
})

// ─── 8. Account page internal links ──────────────────────────────────────────

describe('Account page internal links', () => {
  it('tax link points to /app/easy/account/tax', () => {
    const content = read('app/app/easy/account/page.tsx')
    expect(content).toContain('/app/easy/account/tax')
    expect(content).not.toContain('/app/easy/dev')
  })

  it('tax back-link points to /app/easy/account', () => {
    const content = read('app/app/easy/account/tax/page.tsx')
    expect(content).toContain('/app/easy/account')
    expect(content).not.toContain('/app/easy/dev')
  })
})

// ─── 9. Portfolio detail page routes back to /app/easy ────────────────────────

describe('Portfolio detail page routing', () => {
  it('actions open the shared sheets and never link to /app/easy/dev', () => {
    const content = read('app/app/easy/portfolio/[posId]/page.tsx')
    // Add more / Withdraw / Repay run in the same sheets desktop uses.
    expect(content).toContain('openDeposit(')
    expect(content).toContain('openWithdraw(')
    expect(content).toContain('openRepay(')
    expect(content).not.toContain('/app/easy/dev')
  })

  it('portfolio list navigates to /app/easy/portfolio/[posId]', () => {
    const content = read('app/app/easy/portfolio/page.tsx')
    expect(content).toContain('/app/easy/portfolio/')
    expect(content).not.toContain('/app/easy/dev')
  })
})

// ─── 10. SupportChat gates on /app/easy ───────────────────────────────────────

describe('SupportChat easy mode detection', () => {
  it('checks /app/easy (not /app/easy/dev)', () => {
    const content = read('components/support/SupportChat.tsx')
    expect(content).toMatch(/startsWith\(['"]\/app\/easy['"]\)/)
    expect(content).not.toContain('/app/easy/dev')
  })
})
