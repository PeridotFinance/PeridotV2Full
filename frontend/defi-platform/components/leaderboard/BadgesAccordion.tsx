'use client'

import { useMemo, useState } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { cn } from '@/lib/utils'
import { getAllBadges, type Badge, type AchievementCriteria } from '@/lib/achievements'
import { motion, useReducedMotion } from 'framer-motion'

type Props = {
  earnedBadgeIds?: Set<string>
}

export default function BadgesAccordion({ earnedBadgeIds }: Props) {
  const prefersReducedMotion = useReducedMotion()
  const [openId, setOpenId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filterTier, setFilterTier] = useState<'all' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'>('all')
  const [filterRarity, setFilterRarity] = useState<'all' | Badge['rarity']>('all')
  const [filterSeason, setFilterSeason] = useState<'all' | 's1' | 's2'>('s2')
  const [showLockedOnly, setShowLockedOnly] = useState(false)
  const badgesByTier = useMemo(() => {
    const groups: Record<string, ReturnType<typeof getAllBadges>> = {
      bronze: [], silver: [], gold: [], platinum: [], diamond: [],
    } as any
    for (const b of getAllBadges()) {
      (groups[b.tier] as any[]).push(b)
    }
    ;(Object.keys(groups) as Array<keyof typeof groups>).forEach(k => {
      (groups[k] as any[]).sort((a, b) => (a.sortOrder || a.xpThreshold || 0) - (b.sortOrder || b.xpThreshold || 0))
    })
    return groups
  }, [])

  const allBadges = useMemo(() => getAllBadges(), [])
  const recommended = useMemo(() => allBadges.filter(b => !earnedBadgeIds?.has(b.id)).slice(0, 6), [allBadges, earnedBadgeIds])

  const items: Array<{ key: keyof typeof badgesByTier; title: string; crest: string; gradient: string }> = [
    { key: 'bronze', title: 'Bronze', crest: '🥉', gradient: 'from-amber-700/30 via-amber-500/20 to-amber-400/10' },
    { key: 'silver', title: 'Silver', crest: '🥈', gradient: 'from-slate-400/30 via-slate-300/20 to-slate-200/10' },
    { key: 'gold', title: 'Gold', crest: '🥇', gradient: 'from-yellow-500/30 via-amber-400/20 to-amber-300/10' },
    { key: 'platinum', title: 'Platinum', crest: '💠', gradient: 'from-cyan-400/30 via-sky-300/20 to-sky-200/10' },
    { key: 'diamond', title: 'Diamond', crest: '💎', gradient: 'from-emerald-400/30 via-emerald-300/20 to-emerald-200/10' },
  ]

  return (
    <div className="relative space-y-4">
      {!prefersReducedMotion && (
        <>
          <motion.div aria-hidden className="pointer-events-none absolute -top-16 -left-12 h-48 w-48 rounded-full bg-emerald-400/25 blur-3xl" animate={{ opacity: [0.35, 0.15, 0.35] }} transition={{ repeat: Infinity, duration: 3.2 }} />
          <motion.div aria-hidden className="pointer-events-none absolute -bottom-16 -right-12 h-56 w-56 rounded-full bg-indigo-400/25 blur-3xl" animate={{ opacity: [0.25, 0.1, 0.25] }} transition={{ repeat: Infinity, duration: 3.8 }} />
        </>
      )}
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search badges" className="px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30" />
        {/* Season toggle */}
        <div className="inline-flex rounded-xl border border-black/10 dark:border-white/10 overflow-hidden text-[11px]">
          {(['s2', 's1', 'all'] as const).map(s => (
            <button key={s} type="button" onClick={() => setFilterSeason(s)}
              className={cn('px-3 py-2 transition-colors',
                filterSeason === s
                  ? s === 's2' ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-semibold'
                    : s === 's1' ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold'
                    : 'bg-white/60 dark:bg-white/10 font-semibold'
                  : 'bg-white/30 dark:bg-black/20 text-slate-500 hover:bg-white/50 dark:hover:bg-white/10'
              )}>
              {s === 'all' ? 'All seasons' : s === 's1' ? 'Season 1' : 'Season 2'}
            </button>
          ))}
        </div>
        <select value={filterTier} onChange={(e) => setFilterTier(e.target.value as any)} className="px-2 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30">
          <option value="all">All tiers</option>
          {(['bronze','silver','gold','platinum','diamond'] as const).map(t => <option key={t} value={t}>{t[0].toUpperCase()+t.slice(1)}</option>)}
        </select>
        <select value={filterRarity} onChange={(e) => setFilterRarity(e.target.value as any)} className="px-2 py-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30">
          <option value="all">All rarity</option>
          <option value="common">Common</option>
          <option value="uncommon">Uncommon</option>
          <option value="rare">Rare</option>
          <option value="superrare">Superrare</option>
          <option value="legendary">Legendary</option>
          <option value="secret">Secret</option>
        </select>
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={showLockedOnly} onChange={(e) => setShowLockedOnly(e.target.checked)} />
          Locked only
        </label>
      </div>

      <Accordion type="multiple" className="badge-accordion-wrap relative overflow-hidden w-full divide-y divide-black/10 dark:divide-white/10 rounded-2xl border border-black/10 dark:border-white/10 bg-transparent dark:bg-black/20">
        {!prefersReducedMotion && (
          <motion.div aria-hidden className="pointer-events-none absolute inset-0" animate={{ opacity: [0.35, 0.15, 0.35] }} transition={{ repeat: Infinity, duration: 4.2 }} style={{ background: 'radial-gradient(26rem 14rem at 30% 10%, rgba(255,255,255,0.10), transparent)'}} />
        )}
        {(['bronze','silver','gold','platinum','diamond'] as const).map((key) => (
          <AccordionItem key={key} value={key} className="border-white/10">
            <AccordionTrigger className="text-left px-4">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/30 dark:bg-white/10 border border-white/20">{key==='bronze'?'🥉':key==='silver'?'🥈':key==='gold'?'🥇':key==='platinum'?'💠':'💎'}</span>
                  <span className="font-semibold">{key[0].toUpperCase()+key.slice(1)}</span>
                </div>
                {(() => {
                  const tierBadges = (badgesByTier[key] || []).filter(b =>
                    filterSeason === 'all' || (b.seasonIds && b.seasonIds.includes(filterSeason))
                  )
                  const earnedCount = tierBadges.filter(b => earnedBadgeIds?.has(b.id)).length
                  return (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500">{earnedCount}/{tierBadges.length}</span>
                      <span className="relative inline-block h-1.5 w-24 rounded-full bg-white/40 dark:bg-white/10 overflow-hidden">
                        <span className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/50" style={{ width: `${Math.round((earnedCount / Math.max(1, tierBadges.length)) * 100)}%` }} />
                      </span>
                    </div>
                  )
                })()}
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3">
              <ul className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {(badgesByTier[key] || []).filter(b =>
                  (filterTier === 'all' || b.tier === filterTier) &&
                  (filterRarity === 'all' || b.rarity === filterRarity) &&
                  (!showLockedOnly || !earnedBadgeIds?.has(b.id)) &&
                  (query.trim() === '' || b.name.toLowerCase().includes(query.toLowerCase())) &&
                  (filterSeason === 'all' || (b.seasonIds && b.seasonIds.includes(filterSeason)))
                ).map((b) => {
                  const achieved = !!earnedBadgeIds?.has(b.id)
                  const badgeSeason = b.seasonIds?.includes('s1') && !b.seasonIds?.includes('s2') ? 's1'
                    : b.seasonIds?.includes('s2') && !b.seasonIds?.includes('s1') ? 's2' : null
                  const isOpen = openId === b.id
                  const accent = (
                    b.tier === 'bronze' ? { hex: '#b7791f', rgba: 'rgba(183,121,31,0.25)' } :
                    b.tier === 'silver' ? { hex: '#94a3b8', rgba: 'rgba(148,163,184,0.25)' } :
                    b.tier === 'gold' ? { hex: '#f59e0b', rgba: 'rgba(245,158,11,0.25)' } :
                    b.tier === 'platinum' ? { hex: '#38bdf8', rgba: 'rgba(56,189,248,0.25)' } :
                    b.tier === 'diamond' ? { hex: '#10b981', rgba: 'rgba(16,185,129,0.25)' } :
                    { hex: '#a7a7a7', rgba: 'rgba(167,167,167,0.22)' }
                  )
                  return (
                    <motion.li
                      key={b.id}
                      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 4 }}
                      whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '-20% 0px -20% 0px' }}
                      whileHover={prefersReducedMotion ? undefined : { y: -2, scale: 1.01 }}
                      transition={{ duration: 0.25 }}
                      className={cn('badge-card rounded-xl border text-sm transition will-change-transform relative overflow-hidden', achieved ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-white/10 bg-white/40 dark:bg-black/20')}
                      style={{ ['--badge-accent' as any]: accent.hex, ['--badge-accent-20' as any]: accent.rgba }}
                    >
                      {!prefersReducedMotion && (
                        <span aria-hidden className="pointer-events-none absolute -inset-0.5 rounded-[14px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'conic-gradient(from 180deg at 50% 50%, rgba(16,185,129,0.12), rgba(99,102,241,0.12), transparent 30%)' }} />
                      )}
                      <button type="button" onClick={() => setOpenId(isOpen ? null : b.id)} aria-expanded={isOpen}
                        className="group relative w-full px-3 py-2 flex items-center gap-2">
                        <span aria-hidden className="badge-rim" />
                        <span aria-hidden className="badge-gloss" />
                        {!prefersReducedMotion && (
                          <span aria-hidden className="holo-sheen" />
                        )}
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg glass" aria-hidden>{b.unlockEmoji || b.icon || '🎖️'}</span>
                        <span className="truncate text-left flex-1 font-medium">{b.name}</span>
                        {b.rarity ? <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/20 bg-white/40 dark:bg-white/10">{b.rarity}</span> : null}
                        <span className={cn('text-xs transition-transform ml-1', isOpen ? 'rotate-180' : '')} aria-hidden>▾</span>
                        {achieved ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-400/30 ml-1">Done</span> : null}
                        {badgeSeason === 's1' ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-700/30 ml-1">S1</span> : null}
                        {badgeSeason === 's2' ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-400/30 ml-1">S2</span> : null}
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-3">
                          {b.description ? <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">{b.description}</p> : null}
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            {typeof b.pointsReward === 'number' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-600 px-2 py-1 border border-amber-400/30 text-[11px]">+{b.pointsReward} pts</span>
                            ) : null}
                            {b.unlockEmoji ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 text-indigo-600 px-2 py-1 border border-indigo-400/30 text-[11px]">Unlocks emoji {b.unlockEmoji}</span>
                            ) : null}
                            {b.unlockBorderColor ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/10 text-pink-600 px-2 py-1 border border-pink-400/30 text-[11px]">Unlocks border <span className="ml-1 inline-block h-3 w-3 rounded-full" style={{ backgroundColor: b.unlockBorderColor }} /></span>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-400">
                            <div className="font-semibold mb-1">Criteria</div>
                            {b.criteria && b.criteria.length > 0 ? (
                              <ul className="list-disc ml-4 space-y-1">
                                {b.criteria.map((c, i) => (
                                  <li key={i}>{formatCriterion(c)}</li>
                                ))}
                              </ul>
                            ) : b.xpThreshold ? (
                              <div>Earn at least {b.xpThreshold.toLocaleString()} XP</div>
                            ) : (
                              <div>Complete related actions to unlock.</div>
                            )}
                          </div>
                        </div>
                      )}
                    </motion.li>
                  )
                })}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <style jsx>{`
        .glass {
          position: relative;
          background: rgba(255,255,255,0.55);
          border: 1px solid rgba(255,255,255,0.35);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.3);
        }
        :global(html.dark) .glass {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.12);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
        }
        .glass::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.28), rgba(255,255,255,0.05) 40%, transparent 60%);
          mix-blend-mode: screen;
          pointer-events: none;
          border-radius: 0.5rem;
          opacity: 0.55;
        }
        .badge-gloss {
          position: absolute;
          top: 0; left: 0; right: 0; height: 52%;
          background: linear-gradient(180deg, rgba(255,255,255,0.66), rgba(255,255,255,0.22) 45%, rgba(255,255,255,0.0) 70%);
          border-radius: 0.75rem 0.75rem 0 0;
          pointer-events: none;
          opacity: 0.55;
          mix-blend-mode: screen;
          transition: opacity 200ms ease;
        }
        :global(html.dark) .badge-gloss { opacity: 0.18; }
        .badge-card:hover .badge-gloss { opacity: 0.75; }
        .badge-accordion-wrap::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(60rem 30rem at 10% 0%, rgba(94,121,69,0.08), transparent),
            radial-gradient(50rem 40rem at 100% 120%, rgba(99,102,241,0.06), transparent),
            linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px);
          background-size:
            auto,
            auto,
            20px 20px,
            20px 20px;
          background-position: center center, center center, 0 0, 0 0;
          pointer-events: none;
          z-index: 0;
        }
        .badge-accordion-wrap::after {
          content: "";
          position: absolute;
          inset: 0;
          background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23n)" opacity="0.03"/></svg>');
          background-repeat: repeat;
          mix-blend-mode: multiply;
          pointer-events: none;
          z-index: 0;
        }
        :global(html.dark) .badge-accordion-wrap::before {
          background-image:
            radial-gradient(60rem 30rem at 10% 0%, rgba(16,185,129,0.10), transparent),
            radial-gradient(50rem 40rem at 100% 120%, rgba(99,102,241,0.08), transparent),
            linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px);
        }
        :global(html.dark) .badge-accordion-wrap::after {
          mix-blend-mode: screen;
          opacity: 0.06;
        }
        .badge-card {
          backdrop-filter: saturate(1.05) blur(6px);
          -webkit-backdrop-filter: saturate(1.05) blur(6px);
        }
        .badge-card::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 0.75rem;
          box-shadow: inset 0 0 0 1px rgba(0,0,0,0.06), inset 0 10px 22px rgba(0,0,0,0.04);
          pointer-events: none;
        }
        :global(html.dark) .badge-card::before {
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 10px 22px rgba(255,255,255,0.03);
        }
        .badge-card::after {
          content: "";
          position: absolute;
          top: -40%; left: -20%;
          width: 60%; height: 200%;
          background: radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.15), transparent 60%);
          transform: rotate(12deg);
          opacity: 0.35;
          pointer-events: none;
        }
        :global(html.dark) .badge-card::after { opacity: 0.18; }
        .badge-rim {
          position: absolute;
          inset: 0;
          border-radius: 0.75rem;
          box-shadow: 0 0 0 1px rgba(0,0,0,0.06);
          background:
            radial-gradient(24rem 18rem at 10% -10%, var(--badge-accent-20), transparent 60%),
            radial-gradient(24rem 18rem at 110% 120%, var(--badge-accent-20), transparent 60%);
          opacity: 0.55;
          pointer-events: none;
        }
        :global(html.dark) .badge-rim { box-shadow: 0 0 0 1px rgba(255,255,255,0.08); opacity: 0.35; }
        .badge-card:hover .badge-rim { opacity: 0.8; }
        .holo-sheen {
          position: absolute;
          top: -10%; bottom: -10%;
          left: -30%; width: 30%;
          background: linear-gradient(120deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0) 100%);
          transform: translateX(-120%);
          transition: transform 600ms ease, opacity 600ms ease;
          filter: blur(0.5px);
          opacity: 0.0;
          pointer-events: none;
        }
        .badge-card:hover .holo-sheen,
        .badge-card:focus-within .holo-sheen {
          transform: translateX(260%);
          opacity: 1;
        }
        @media (prefers-reduced-motion: reduce) {
          .glass::after { display: none; }
          .badge-accordion-wrap::before, .badge-accordion-wrap::after { display: none; }
          .badge-card::after { display: none; }
          .holo-sheen { display: none; }
        }
      `}</style>
    </div>
  )
}

function formatCriterion(c: AchievementCriteria): string {
  switch (c.type) {
    case 'xp_at_least':
      return `Reach ${c.value.toLocaleString()} XP`
    case 'login_streak_at_least':
      return `Login for ${c.days} consecutive days`
    case 'total_days_logged_in_at_least':
      return `Login on ${c.days} separate days`
    case 'transaction_streak_at_least':
      return `Make transactions for ${c.days} days in a row`
    case 'transactions_at_least': {
      const acts = c.actionTypes?.join(' + ')
      return c.actionTypes && c.actionTypes.length > 0
        ? `Do ${c.count} ${acts}`
        : `Complete ${c.count} total transactions`
    }
    case 'supply_position_days_at_least':
      return `Maintain a supply position for ${c.days} days`
    case 'position_maintained_for_days':
      return `Maintain a ${c.positionType} position for ${c.days} days${c.minUsdValue ? ` (≥ $${c.minUsdValue.toLocaleString()})` : ''}`
    case 'multi_position_maintained':
      return `Maintain ${c.positionCount} ${c.positionType} positions (≥ $${c.minUsdValuePerPosition.toLocaleString()} each) for ${c.days} days`
    case 'usd_volume_at_least':
      return `Reach $${c.amount.toLocaleString()} total volume`
    case 'season_in':
      return `Available in selected seasons`
    case 'distinct_assets_interacted_with':
      return `Interact with ${c.count} distinct assets`
    case 'leaderboard_rank_at_least':
      return `Reach top ${c.rank} on ${c.board.replaceAll('_', ' ')}`
    case 'achievements_completed_at_least':
      return `Complete ${c.count}${c.tier ? ` ${c.tier}` : ''} achievements`
    case 'achievements_completed_all':
      return `Complete a specific set of achievements`
    case 'effective_apy_at_least':
      return `Achieve at least ${c.value}% effective APY`
    case 'total_lifetime_earnings_at_least':
      return `Accrue at least $${c.amount.toLocaleString()} in total lifetime earnings`
    case 'daily_average_earnings_at_least':
      return `Achieve at least $${c.amount.toLocaleString()} in daily average earnings`
    default:
      return 'Meet special conditions'
  }
}


