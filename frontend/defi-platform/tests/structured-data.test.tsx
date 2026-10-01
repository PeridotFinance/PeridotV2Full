import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import StructuredData from '@/components/StructuredData'
import { PERIDOT_ORGANIZATION } from '@/lib/seo/organization'

/**
 * The site described itself three different ways at once — "Peridot" in the root
 * layout, "Peridot Protocol" on the homepage, and "Peridot Finance" nowhere,
 * despite that being the name people search. These tests are the guard against
 * that drifting apart again.
 */

function renderGraph() {
  const html = renderToStaticMarkup(<StructuredData />)
  const match = html.match(/<script[^>]*>(.*)<\/script>/s)
  expect(match, 'StructuredData must render a script tag into the HTML').not.toBeNull()
  return JSON.parse(match![1])
}

describe('homepage structured data', () => {
  it('server-renders valid JSON-LD', () => {
    const graph = renderGraph()
    expect(graph['@context']).toBe('https://schema.org')
    expect(Array.isArray(graph['@graph'])).toBe(true)
  })

  it('names exactly one organization, and names it what people search for', () => {
    const graph = renderGraph()
    const orgs = graph['@graph'].filter(
      (n: any) => n['@type'] === 'Organization',
    )
    expect(orgs).toHaveLength(1)
    expect(orgs[0].name).toBe('Peridot Finance')
    // The old names must survive as aliases rather than disappear — they are
    // what the existing backlinks and mentions say.
    expect(orgs[0].alternateName).toContain('Peridot Protocol')
  })

  it('shares one identity with the root layout via @id', () => {
    const graph = renderGraph()
    const org = graph['@graph'].find((n: any) => n['@type'] === 'Organization')
    expect(org['@id']).toBe('https://peridot.finance/#organization')
    expect(org.name).toBe(PERIDOT_ORGANIZATION.name)
    expect(org.sameAs).toEqual([...PERIDOT_ORGANIZATION.sameAs])
  })

  it('corroborates the entity with more than one profile', () => {
    // One `sameAs` link was the state that let a gemstone and a US finance
    // company outrank the actual company for its own name.
    expect(PERIDOT_ORGANIZATION.sameAs.length).toBeGreaterThanOrEqual(4)
    for (const url of PERIDOT_ORGANIZATION.sameAs) {
      expect(url).toMatch(/^https:\/\//)
    }
  })

  it('tells search engines the product is on Stellar', () => {
    const graph = renderGraph()
    const faq = graph['@graph'].find((n: any) => n['@type'] === 'FAQPage')
    const chains = faq.mainEntity.find((q: any) =>
      q.name.toLowerCase().includes('blockchain'),
    )
    expect(chains.acceptedAnswer.text).toContain('Stellar')
  })
})
