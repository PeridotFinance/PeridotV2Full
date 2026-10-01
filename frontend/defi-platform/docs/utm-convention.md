# UTM convention

Over the 90 days to 2026-08-20, PostHog saw ~1,400 people and **5** of them
arrived on a tagged link. Every campaign, thread, newsletter and partner post in
that window is indistinguishable from the rest of `$direct`, which is the single
largest bucket at 635 people. Nothing that was spent in that period can be
credited or written off.

Tagging is the whole fix. PostHog already reads `utm_*` off the landing URL and
keeps it on the person, so a tagged link is attributed for the lifetime of that
visitor — including the wallet connect that happens three sessions later. No
code change is needed; the links just have to carry the parameters.

## The parameters

Only three are mandatory. Keep them lowercase — `X` and `x` are two different
sources in every report, and the difference is invisible until the numbers are
already split.

| Param | Meaning | Allowed values |
| --- | --- | --- |
| `utm_source` | **where** the click came from | `x`, `telegram`, `discord`, `reddit`, `linkedin`, `newsletter`, `stellar`, `partner-<name>` |
| `utm_medium` | **what kind** of placement | `social`, `email`, `referral`, `paid`, `community`, `qr` |
| `utm_campaign` | **which push**, dated | `<topic>-<yyyy-mm>`, e.g. `stellar-borrow-2026-09` |

`utm_content` is optional and distinguishes two placements inside one campaign —
two tweets in a thread, two buttons in a mail. Use it when you would otherwise
have to guess which one worked.

Rules that keep the reports readable:

- **Never tag internal links.** A `utm_source` on a link from `/blog` to `/app`
  restarts attribution and overwrites the real source with your own site. This is
  the most common way tracking gets destroyed.
- **Never put personal data in a UTM.** They land in nginx logs, referrer headers
  and PostHog alike.
- `ref`, `r`, `invite`, `code` and `affiliate` are the *referral* system and are
  handled separately by `middleware.ts` — they are stripped from the advertised
  canonical and set `noindex`. They are not a substitute for UTMs, and the two
  can be combined on one link.

## Building a link

```bash
node scripts/utm.mjs /app/borrow x social stellar-borrow-2026-09
# https://peridot.finance/app/borrow?utm_source=x&utm_medium=social&utm_campaign=stellar-borrow-2026-09
```

The script rejects uppercase, spaces, and unknown mediums rather than silently
producing a link that will fragment a report three weeks from now.

## Reading it back

HogQL, in PostHog → SQL:

```sql
select
  properties.utm_source   as source,
  properties.utm_campaign as campaign,
  count(distinct person_id) as people
from events
where event = '$pageview'
  and timestamp > now() - interval 30 day
  and properties.utm_source is not null
group by source, campaign
order by people desc
```

For the number that actually matters, join the campaign to `wallet_connected`
rather than to pageviews — traffic that never connects a wallet is not a result:

```sql
select any_source as source, count() as people, sum(connected) as connected
from (
  select person_id,
         any(properties.utm_source) as any_source,
         max(if(event = 'wallet_connected', 1, 0)) as connected
  from events
  where timestamp > now() - interval 90 day
  group by person_id
)
group by any_source
order by people desc
```
