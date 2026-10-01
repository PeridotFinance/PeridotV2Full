/**
 * The one description of who Peridot is, for search engines.
 *
 * There used to be three. The root layout served an Organization called
 * "Peridot" on every page; the homepage's structured data declared a second one
 * called "Peridot Protocol" with a different logo; and neither agreed with the
 * name people actually search for. Search Console shows what that costs: 247
 * impressions for "perseid finance crypto", 171 for "perito blockchain", 128 for
 * "peridot financing", a US finance company, and a run of Polkadot audit
 * queries, all with zero clicks. Google is guessing, and with conflicting names
 * and a single `sameAs` link there is nothing to make it stop guessing.
 *
 * `name` is the query that carries the traffic: "peridot finance" accounts for
 * 202 of the 501 clicks the domain earns in a year. Every `sameAs` entry was
 * checked to resolve, since a dead profile link is worse than a short list, because
 * it is exactly the corroboration signal that is being claimed.
 */
export const PERIDOT_ORGANIZATION = {
  "@type": "Organization",
  name: "Peridot Finance",
  alternateName: ["Peridot Protocol", "Peridot"],
  slogan: "The first DeFi broker",
  description:
    "Peridot Finance is a non-custodial lending and borrowing protocol on the Stellar network. Users earn interest on dollars, euros and Lumens, or borrow against them without selling.",
  url: "https://peridot.finance",
  logo: {
    "@type": "ImageObject",
    url: "https://peridot.finance/misc/thumbnail-preview.webp",
  },
  sameAs: [
    "https://x.com/peridotprotocol",
    "https://github.com/peridotfinance",
    "https://www.linkedin.com/company/peridotlabs",
    "https://t.me/peridotlabs",
    "https://defillama.com/protocol/peridot",
    "https://communityfund.stellar.org/project/peridot-finance-e0j",
  ],
} as const
