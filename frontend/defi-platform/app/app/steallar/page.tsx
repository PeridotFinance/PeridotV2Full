import { redirect } from "next/navigation"

/**
 * `/app/steallar` is the legacy desktop URL. The canonical entry point is
 * now `/app/easy`, which picks mobile vs. desktop via User-Agent + viewport.
 * We keep the route so external links don't 404 and forward the search
 * params (in particular `?e2e=1`) so dev / Playwright workflows survive.
 */
export default async function StealllarRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((vv) => qs.append(k, vv))
    else if (typeof v === "string") qs.set(k, v)
  }
  const tail = qs.toString()
  redirect(tail ? `/app/easy?${tail}` : "/app/easy")
}
