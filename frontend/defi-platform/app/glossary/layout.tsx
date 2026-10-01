import type { Metadata } from "next"
import Script from "next/script"

export const metadata: Metadata = {
  title: "DeFi Glossary | Peridot: Key Terms Explained",
  description: "Comprehensive DeFi glossary: understand yield farming, collateral, liquidation, APY, TVL, flash loans, smart contracts, DAOs, and 10+ more essential DeFi terms.",
  alternates: { canonical: "/glossary" },
  openGraph: {
    title: "DeFi Glossary | Peridot",
    description: "18 essential DeFi terms explained in plain English, from yield farming to liquidation and beyond.",
    url: "/glossary",
  },
}

const glossarySchema = {
  "@context": "https://schema.org",
  "@type": "DefinedTermSet",
  name: "DeFi Glossary by Peridot",
  description: "Key terms in Decentralized Finance (DeFi) explained in plain English.",
  url: "https://peridot.finance/glossary",
  hasDefinedTerm: [
    { "@type": "DefinedTerm", name: "DeFi", termCode: "defi", description: "Decentralized Finance (DeFi) is an emerging financial technology based on secure distributed ledgers similar to those used by cryptocurrencies. It aims to recreate traditional financial systems with open-source software." },
    { "@type": "DefinedTerm", name: "Yield Farming", termCode: "yield-farming", description: "Yield farming, also referred to as liquidity mining, is a way to generate rewards with cryptocurrency holdings by locking up cryptocurrencies and getting rewards in the form of additional cryptocurrency." },
    { "@type": "DefinedTerm", name: "Smart Contract", termCode: "smart-contract", description: "A smart contract is a self-executing contract with the terms of the agreement directly written into code. They run on a blockchain, meaning they are stored on a public database and cannot be changed once deployed." },
    { "@type": "DefinedTerm", name: "Liquidity Pool", termCode: "liquidity-pool", description: "A liquidity pool is a crowdsourced pool of cryptocurrencies or tokens locked in a smart contract used to facilitate trades between assets on a decentralized exchange and other DeFi platforms." },
    { "@type": "DefinedTerm", name: "DAO", termCode: "dao", description: "A Decentralized Autonomous Organization (DAO) is an organization represented by rules encoded as a computer program that is transparent, controlled by organization members, and not influenced by a central government." },
    { "@type": "DefinedTerm", name: "NFT", termCode: "nft", description: "A Non-Fungible Token (NFT) is a unique digital asset that represents ownership of real-world items like art, video clips, or music. NFTs are recorded on a blockchain which certifies their authenticity and ownership." },
    { "@type": "DefinedTerm", name: "DEX", termCode: "dex", description: "A Decentralized Exchange (DEX) is a peer-to-peer marketplace where cryptocurrency traders make transactions directly with one another without handing over management of their funds to an intermediary." },
    { "@type": "DefinedTerm", name: "Lending Protocol", termCode: "lending-protocol", description: "A DeFi lending protocol allows users to lend their crypto assets to earn interest or borrow assets by providing collateral. These are typically governed by smart contracts." },
    { "@type": "DefinedTerm", name: "Collateral", termCode: "collateral", description: "Collateral is an asset that a borrower pledges to a lender to secure a loan. In DeFi, this is typically another cryptocurrency. If the value of the collateral falls below a certain threshold, it may be liquidated." },
    { "@type": "DefinedTerm", name: "Liquidation", termCode: "liquidation", description: "In DeFi lending, liquidation occurs when a borrower's collateral value drops below the required collateralization ratio, leading to the forced sale of the collateral to repay the loan and cover penalties." },
    { "@type": "DefinedTerm", name: "Flash Loan", termCode: "flash-loan", description: "A flash loan is an uncollateralized loan in DeFi that must be borrowed and repaid within the same blockchain transaction. They are used for arbitrage, collateral swaps, or liquidations." },
    { "@type": "DefinedTerm", name: "Oracle", termCode: "oracle", description: "In blockchain and smart contracts, an oracle is a third-party service that provides external data (like asset prices) to smart contracts, enabling them to interact with real-world information." },
    { "@type": "DefinedTerm", name: "TVL", termCode: "tvl", description: "Total Value Locked (TVL) represents the total amount of assets deposited in a DeFi protocol. It is a key metric to gauge the health and adoption of a protocol." },
    { "@type": "DefinedTerm", name: "APY", termCode: "apy", description: "Annual Percentage Yield (APY) is the real rate of return earned on an investment, taking into account the effect of compounding interest. In DeFi, APYs can be highly variable." },
    { "@type": "DefinedTerm", name: "Leverage", termCode: "leverage", description: "Leverage allows traders to control a larger position size with a smaller amount of capital. While it can amplify profits, it also significantly increases risk, especially in volatile crypto markets." },
    { "@type": "DefinedTerm", name: "Perpetual Swap", termCode: "perpetual-swap", description: "A perpetual swap is a derivative similar to a futures contract but without an expiration date. It allows traders to speculate on the future price of an asset indefinitely." },
    { "@type": "DefinedTerm", name: "Funding Rate", termCode: "funding-rate", description: "In perpetual swaps, the funding rate is a periodic payment exchanged between long and short traders to keep the perpetual swap price aligned with the underlying asset's spot price." },
    { "@type": "DefinedTerm", name: "Borrowing", termCode: "borrowing", description: "In DeFi, borrowing involves taking out a loan in one cryptocurrency by locking up another cryptocurrency as collateral. Interest rates are algorithmically determined based on supply and demand." },
  ],
}

export default function GlossaryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        id="glossary-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(glossarySchema) }}
      />
      {children}
    </>
  )
}
