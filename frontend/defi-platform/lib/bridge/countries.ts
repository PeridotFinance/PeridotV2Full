/**
 * Country eligibility for the Bridge.xyz EUR/SEPA on-ramp.
 *
 * All codes are ISO 3166-1 alpha-3, matching the `country` field Bridge expects
 * in residential addresses.
 *
 * Sources (May 2026 snapshot — re-verify with Bridge before launch):
 *  - Prohibited / unavailable jurisdictions:
 *    https://apidocs.bridge.xyz/platform/customers/compliance/supported-countries-list
 *  - SEPA geographic scope: European Payments Council SEPA participant list.
 */

/** Hard-prohibited by Bridge — sanctioned / OFAC. No onboarding at all. */
export const BRIDGE_PROHIBITED_COUNTRIES: ReadonlySet<string> = new Set([
  "AFG", // Afghanistan
  "BLR", // Belarus
  "COD", // Congo (DR)
  "CUB", // Cuba
  "IRN", // Iran
  "IRQ", // Iraq
  "LBN", // Lebanon
  "LBY", // Libya
  "MMR", // Myanmar
  "PRK", // North Korea
  "RUS", // Russia
  "SOM", // Somalia
  "SSD", // South Sudan
  "SDN", // Sudan
  "SYR", // Syria
  "VEN", // Venezuela
  "YEM", // Yemen
  // Crimea / occupied Ukrainian territories have no distinct ISO code; Bridge
  // screens them at the address level.
])

/** Service simply unavailable here (not sanctioned, but Bridge does not serve). */
export const BRIDGE_UNAVAILABLE_COUNTRIES: ReadonlySet<string> = new Set([
  "DZA", // Algeria
  "BDI", // Burundi
  "CHN", // China
  "JPN", // Japan
  "TUN", // Tunisia
])

/**
 * SEPA geographic scope — a customer resident here can be issued a EUR IBAN and
 * fund it by SEPA transfer. None of these overlap the prohibited/unavailable
 * lists, but `supportsSepaOnramp` re-checks defensively.
 */
export const SEPA_ONRAMP_COUNTRIES: ReadonlySet<string> = new Set([
  // EU-27
  "AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA",
  "DEU", "GRC", "HUN", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD",
  "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE",
  // EEA (non-EU) + Switzerland
  "ISL", "LIE", "NOR", "CHE",
  // SEPA participants outside the EU/EEA
  "GBR", "MCO", "SMR", "AND", "VAT",
])

function normalize(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase()
}

/** True when Bridge will onboard a customer resident in this country at all. */
export function isOnboardingAllowed(country: string | null | undefined): boolean {
  const c = normalize(country)
  if (c.length !== 3) return false
  return !BRIDGE_PROHIBITED_COUNTRIES.has(c) && !BRIDGE_UNAVAILABLE_COUNTRIES.has(c)
}

/** True when the customer can receive a EUR IBAN and fund it via SEPA. */
export function supportsSepaOnramp(country: string | null | undefined): boolean {
  const c = normalize(country)
  return SEPA_ONRAMP_COUNTRIES.has(c) && isOnboardingAllowed(c)
}

/** Display options for the residence picker in the on-ramp UI (alphabetical). */
export const SEPA_ONRAMP_COUNTRY_OPTIONS: ReadonlyArray<{ code: string; name: string }> = [
  { code: "AND", name: "Andorra" },
  { code: "AUT", name: "Austria" },
  { code: "BEL", name: "Belgium" },
  { code: "BGR", name: "Bulgaria" },
  { code: "HRV", name: "Croatia" },
  { code: "CYP", name: "Cyprus" },
  { code: "CZE", name: "Czechia" },
  { code: "DNK", name: "Denmark" },
  { code: "EST", name: "Estonia" },
  { code: "FIN", name: "Finland" },
  { code: "FRA", name: "France" },
  { code: "DEU", name: "Germany" },
  { code: "GRC", name: "Greece" },
  { code: "HUN", name: "Hungary" },
  { code: "ISL", name: "Iceland" },
  { code: "IRL", name: "Ireland" },
  { code: "ITA", name: "Italy" },
  { code: "LVA", name: "Latvia" },
  { code: "LIE", name: "Liechtenstein" },
  { code: "LTU", name: "Lithuania" },
  { code: "LUX", name: "Luxembourg" },
  { code: "MLT", name: "Malta" },
  { code: "MCO", name: "Monaco" },
  { code: "NLD", name: "Netherlands" },
  { code: "NOR", name: "Norway" },
  { code: "POL", name: "Poland" },
  { code: "PRT", name: "Portugal" },
  { code: "ROU", name: "Romania" },
  { code: "SMR", name: "San Marino" },
  { code: "SVK", name: "Slovakia" },
  { code: "SVN", name: "Slovenia" },
  { code: "ESP", name: "Spain" },
  { code: "SWE", name: "Sweden" },
  { code: "CHE", name: "Switzerland" },
  { code: "GBR", name: "United Kingdom" },
]
