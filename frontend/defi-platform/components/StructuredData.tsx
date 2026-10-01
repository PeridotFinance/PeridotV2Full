import { PERIDOT_ORGANIZATION } from "@/lib/seo/organization"

export default function StructuredData() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "name": "Peridot Finance",
        "url": "https://peridot.finance",
        "potentialAction": {
          "@type": "SearchAction",
          "target": "https://peridot.finance/search?q={search_term_string}",
          "query-input": "required name=search_term_string"
        }
      },
      {
        // Same identity as the root layout, imported rather than restated, because
        // two hand-maintained copies is how they drifted apart in the first place.
        "@id": "https://peridot.finance/#organization",
        ...PERIDOT_ORGANIZATION,
      },
      {
        "@type": "SoftwareApplication",
        "name": "Peridot: The first DeFi broker",
        "alternateName": "Peridot Cross-Chain Lending",
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Web",
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD"
        },
        "description": "Earn interest on your crypto and borrow funds without selling, all with smart, fair rates across multiple blockchains.",
        "featureList": [
          "Access Liquidity Instantly: Borrow against your crypto without selling.",
          "Earn While You Hold: Generate passive income on your idle crypto assets.",
          "100% Secure & Transparent: Secured by smart contracts and fully auditable.",
          "No Paperwork Required: Instant access to funds without credit checks."
        ],
        "screenshot": "https://peridot.finance/misc/thumbnail-preview.webp",
        "requirements": "Web3 Wallet (e.g., MetaMask, WalletConnect)"
      },
      {
        "@type": "HowTo",
        "name": "How to Use Peridot Finance",
        "description": "Step-by-step guide to earning interest and borrowing assets on Peridot.",
        "step": [
          {
            "@type": "HowToStep",
            "name": "Supply Assets",
            "text": "Deposit your crypto to start earning interest. You receive pTokens that show your deposit, and your balance automatically grows with interest.",
            "position": 1
          },
          {
            "@type": "HowToStep",
            "name": "Collateralize",
            "text": "Enable your deposited crypto as collateral. This allows you to borrow other assets up to a specific limit based on your collateral value.",
            "position": 2
          },
          {
            "@type": "HowToStep",
            "name": "Borrow Assets",
            "text": "Borrow assets against your collateral. Interest rates adjust automatically based on market demand. You can repay your loan at any time.",
            "position": 3
          }
        ]
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": "https://peridot.finance"
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "App",
            "item": "https://peridot.finance/app"
          }
        ]
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "What is Peridot?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Peridot is the first DeFi broker: a single account through which you reach on-chain money markets across multiple blockchains, earn interest on your crypto assets and borrow against your collateral. The platform uses algorithmic interest rates based on supply and demand to create efficient money markets for various crypto assets across multiple blockchains."
            }
          },
          {
            "@type": "Question",
            "name": "What is a DeFi broker?",
            "acceptedAnswer": {
              // The definition that substantiates the "first" claim: broker in the
              // sense of a single access point to many markets, explicitly NOT in
              // the regulated sense of a firm executing orders or holding assets.
              "@type": "Answer",
              "text": "A DeFi broker is a single access point to many on-chain markets at once: one account, one interface, and one view of your positions, while the trades and loans themselves settle directly on the underlying blockchains. Peridot is the first product to offer this broker-style access to decentralized money markets across chains. Unlike a traditional broker, Peridot is non-custodial and does not execute orders on your behalf or take your assets into custody, so you always sign your own transactions and keep control of your funds."
            }
          },
          {
            "@type": "Question",
            "name": "How do I start using Peridot?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "To start using Peridot, hit the launch app button on the top right of the page and connect your wallet. You can then supply assets to earn interest or borrow against your collateral. Earn points by interacting with the protocol and climb the leaderboard."
            }
          },
          {
            "@type": "Question",
            "name": "What blockchains does Peridot support?",
            "acceptedAnswer": {
              "@type": "Answer",
              // This used to list Ethereum, Polygon, Avalanche, Arbitrum, Optimism
              // and XDC without naming Stellar once, on the domain that now shows
              // Stellar markets and nothing else. Telling Google the opposite of
              // what the product is undercuts every other signal on the page.
              "text": "Lending and borrowing on peridot.finance runs on Stellar, where Peridot offers markets in USDC, EURC and XLM. The full multi-chain version, covering Binance Smart Chain, Monad and the Ethereum, Polygon, Avalanche, Arbitrum and Base spokes, remains available at v1.peridot.finance for users with existing positions there."
            }
          },
          {
            "@type": "Question",
            "name": "How are interest rates determined?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Interest rates on Peridot are determined algorithmically based on the utilization rate of each asset. When demand for borrowing an asset is high (high utilization), interest rates increase to incentivize more supply. When demand is low, rates decrease to encourage more borrowing. This dynamic adjustment ensures optimal capital efficiency and fair rates for all users."
            }
          },
          {
            "@type": "Question",
            "name": "Is Peridot secure?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Peridot prioritizes security through multiple measures: our smart contracts have undergone rigorous security audits by leading firms, we implement robust risk management protocols, and we maintain a conservative approach to collateral factors. Additionally, our non-custodial architecture means users always maintain control of their assets."
            }
          }
        ]
      }
    ]
  }

  return (
    // A plain <script> rather than next/script: the default strategy injects
    // after hydration, so the whole graph was invisible to anything that reads
    // HTML without executing it. JSON-LD costs nothing to server-render.
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  )
}
