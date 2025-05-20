'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from 'next-themes';

// Light Mode Color Palette (Peridot)
const LM_PRIMARY_OLIVE = 'rgb(94, 121, 70)';
const LM_PALE_OLIVE = 'rgb(132, 161, 107)';
const LM_DARKER_OLIVE = 'rgb(93, 120, 69)';
const LM_WHITE = 'rgb(255, 255, 255)';
const LM_NEAR_WHITE = 'rgb(255, 255, 254)';
const LM_HEADING_COLOR = LM_PRIMARY_OLIVE;
const LM_TEXT_COLOR = 'rgb(70, 85, 50)';
const LM_CONTAINER_BG = LM_WHITE;
const LM_BORDER_COLOR = LM_PALE_OLIVE;
const LM_BUTTON_BG = 'rgb(240, 242, 238)';
const LM_BUTTON_TEXT = LM_DARKER_OLIVE;
const LM_BUTTON_HOVER_BG = LM_PALE_OLIVE;
const LM_BUTTON_HOVER_TEXT = LM_WHITE;
const LM_LINK_COLOR = LM_PRIMARY_OLIVE;

// Dark Mode Color Palette (Peridot)
const DM_PAGE_BG = 'rgb(30, 35, 28)';
const DM_CONTAINER_BG = 'rgb(45, 55, 40)'; // Card background
const DM_HEADING_COLOR = 'rgb(160, 180, 140)'; // Brighter olive for dark bg
const DM_TEXT_COLOR = 'rgb(200, 210, 190)'; // Lighter text for dark bg
const DM_BORDER_COLOR = 'rgb(70, 85, 60)';
const DM_BUTTON_BG = 'rgb(55, 65, 50)';
const DM_BUTTON_TEXT = 'rgb(220, 225, 215)';
const DM_BUTTON_HOVER_BG = 'rgb(132, 161, 107)'; // Pale Olive
const DM_BUTTON_HOVER_TEXT = 'rgb(20, 25, 18)'; // Dark text on pale olive hover
const DM_BUTTON_BORDER_HOVER = 'rgb(152, 181, 127)';
const DM_LINK_COLOR = 'rgb(160, 180, 140)'; // Brighter olive for links

// In a real app, you'd likely fetch this data or have a more robust way to access it.
// For now, we re-import it. Consider moving glossaryData to a shared location if it grows.
const glossaryData = [
  { id: '1', term: 'DeFi', slug: 'defi', explanation: 'Decentralized Finance (DeFi) is an emerging financial technology based on secure distributed ledgers similar to those used by cryptocurrencies. It aims to recreate traditional financial systems with open-source software.' },
  { id: '2', term: 'Yield Farming', slug: 'yield-farming', explanation: 'Yield farming, also referred to as liquidity mining, is a way to generate rewards with cryptocurrency holdings. In simple terms, it means locking up cryptocurrencies and getting rewards in the form of additional cryptocurrency.' },
  { id: '3', term: 'Smart Contract', slug: 'smart-contract', explanation: 'A smart contract is a self-executing contract with the terms of the agreement directly written into code. They run on a blockchain, meaning they are stored on a public database and cannot be changed once deployed.' },
  { id: '4', term: 'Liquidity Pool', slug: 'liquidity-pool', explanation: 'A liquidity pool is a crowdsourced pool of cryptocurrencies or tokens locked in a smart contract. These pools are used to facilitate trades between the assets on a decentralized exchange (DEX) and other DeFi platforms.' },
  { id: '5', term: 'DAO', slug: 'dao', explanation: 'A Decentralized Autonomous Organization (DAO) is an organization represented by rules encoded as a computer program that is transparent, controlled by the organization members, and not influenced by a central government or single entity.' },
  { id: '6', term: 'NFT', slug: 'nft', explanation: 'A Non-Fungible Token (NFT) is a unique digital asset that represents ownership of real-world items like art, video clips, music, and more. NFTs are recorded on a blockchain, which certifies their authenticity and ownership.' },
  { id: '7', term: 'DEX', slug: 'dex', explanation: 'A Decentralized Exchange (DEX) is a peer-to-peer marketplace where cryptocurrency traders make transactions directly with one another without handing over management of their funds to an intermediary or custodian.' },
  { id: '8', term: 'Lending Protocol', slug: 'lending-protocol', explanation: 'A DeFi lending protocol allows users to lend their crypto assets to earn interest or borrow assets by providing collateral. These are typically governed by smart contracts.' },
  { id: '9', term: 'Borrowing', slug: 'borrowing', explanation: 'In DeFi, borrowing involves taking out a loan in one cryptocurrency by locking up another cryptocurrency as collateral. Interest rates are algorithmically determined based on supply and demand.' },
  { id: '10', term: 'Collateral', slug: 'collateral', explanation: 'Collateral is an asset that a borrower pledges to a lender to secure a loan. In DeFi, this is typically another cryptocurrency. If the value of the collateral falls below a certain threshold, it may be liquidated.' },
  { id: '11', term: 'Liquidation', slug: 'liquidation', explanation: 'In DeFi lending, liquidation occurs when a borrower\'s collateral value drops below the required collateralization ratio, leading to the forced sale of the collateral to repay the loan and cover penalties.' },
  { id: '12', term: 'Perpetual Swap', slug: 'perpetual-swap', explanation: 'A perpetual swap, or perpetual future, is a type of derivative similar to a futures contract but without an expiration date. It allows traders to speculate on the future price of an asset.' },
  { id: '13', term: 'Funding Rate', slug: 'funding-rate', explanation: 'In perpetual swaps, the funding rate is a periodic payment exchanged between long and short traders. It helps keep the perpetual swap price aligned with the underlying asset\'s spot price.' },
  { id: '14', term: 'Leverage', slug: 'leverage', explanation: 'Leverage allows traders to control a larger position size with a smaller amount of capital. While it can amplify profits, it also significantly increases risk, especially in volatile crypto markets.' },
  { id: '15', term: 'Flash Loan', slug: 'flash-loan', explanation: 'A flash loan is an uncollateralized loan option in DeFi that must be borrowed and repaid within the same blockchain transaction. They are often used for arbitrage, collateral swaps, or liquidations.' },
  { id: '16', term: 'Oracle', slug: 'oracle', explanation: 'In the context of blockchains and smart contracts, an oracle is a third-party service that provides external data (like asset prices) to smart contracts, enabling them to interact with real-world information.' },
  { id: '17', term: 'TVL', slug: 'tvl', explanation: 'Total Value Locked (TVL) represents the total amount of assets deposited in a DeFi protocol or across the entire DeFi ecosystem. It is a key metric to gauge the health and adoption of a protocol.' },
  { id: '18', term: 'APY', slug: 'apy', explanation: 'Annual Percentage Yield (APY) is the real rate of return earned on an investment, taking into account the effect of compounding interest. In DeFi, APYs can be highly variable.' }
];

interface GlossaryTerm {
  id: string;
  term: string;
  slug: string;
  explanation: string;
}

export default function TermDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { theme } = useTheme();
  const [clientIsDarkMode, setClientIsDarkMode] = useState(false);
  const slug = params.slug as string;

  useEffect(() => {
    setClientIsDarkMode(theme === 'dark');
  }, [theme]);

  const term = glossaryData.find(t => t.slug === slug);

  const pageBg = clientIsDarkMode ? DM_PAGE_BG : LM_NEAR_WHITE;
  const cardBg = clientIsDarkMode ? DM_CONTAINER_BG : LM_CONTAINER_BG;
  const cardShadow = clientIsDarkMode ? `0 8px 25px rgba(0, 0, 0, 0.25)` : `0 8px 25px rgba(94, 121, 70, 0.12)`;
  const headingColor = clientIsDarkMode ? DM_HEADING_COLOR : LM_HEADING_COLOR;
  const textColor = clientIsDarkMode ? DM_TEXT_COLOR : LM_TEXT_COLOR;
  const borderColor = clientIsDarkMode ? DM_BORDER_COLOR : LM_BORDER_COLOR;
  
  const buttonBg = clientIsDarkMode ? DM_BUTTON_BG : LM_BUTTON_BG;
  const buttonText = clientIsDarkMode ? DM_BUTTON_TEXT : LM_BUTTON_TEXT;
  const buttonBorder = clientIsDarkMode ? DM_BORDER_COLOR : LM_BORDER_COLOR; // Use consistent border color for buttons
  const buttonHoverBg = clientIsDarkMode ? DM_BUTTON_HOVER_BG : LM_BUTTON_HOVER_BG;
  const buttonHoverText = clientIsDarkMode ? DM_BUTTON_HOVER_TEXT : LM_BUTTON_HOVER_TEXT;
  const buttonHoverBorder = clientIsDarkMode ? DM_BUTTON_BORDER_HOVER : LM_DARKER_OLIVE; // LM_DARKER_OLIVE was missing, using it here

  const linkColor = clientIsDarkMode ? DM_LINK_COLOR : LM_LINK_COLOR;

  if (!term) {
    return (
      <div style={{
        padding: '40px 20px',
        textAlign: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        minHeight: 'calc(100vh - 80px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: pageBg
      }}>
        <div style={{
          backgroundColor: cardBg,
          padding: '30px 40px',
          borderRadius: '12px',
          boxShadow: cardShadow,
        }}>
          <h1 style={{ color: headingColor, marginBottom: '15px' }}>Term Not Found</h1>
          <p style={{ color: textColor, marginBottom: '25px' }}>The glossary term you are looking for does not exist.</p>
          <Link href="/glossary" style={{ color: linkColor, textDecoration: 'underline', fontWeight: '500' }}>
            Back to Glossary
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{
        backgroundColor: pageBg,
        padding: '40px 15px',
        minHeight: '100vh'
    }}>
        <div style={{
          maxWidth: '750px',
          margin: '0 auto',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          backgroundColor: cardBg,
          borderRadius: '16px',
          boxShadow: cardShadow,
          padding: '30px 40px',
        }}>
          <button
            onClick={() => router.back()}
            style={{
              marginBottom: '30px',
              padding: '10px 20px',
              backgroundColor: buttonBg,
              color: buttonText,
              border: `1px solid ${buttonBorder}`,
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.95em',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease'
            }}
            onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = buttonHoverBg;
                e.currentTarget.style.color = buttonHoverText;
                e.currentTarget.style.borderColor = buttonHoverBorder;
            }}
            onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = buttonBg;
                e.currentTarget.style.color = buttonText;
                e.currentTarget.style.borderColor = buttonBorder;
            }}
          >
            &larr; Back to Glossary
          </button>

          <h1 style={{
            color: headingColor,
            fontSize: '3em',
            fontWeight: 700,
            borderBottom: `2px solid ${borderColor}`,
            paddingBottom: '20px',
            marginBottom: '30px',
          }}>
            {term.term}
          </h1>
          <div style={{
            color: textColor,
            lineHeight: 1.8,
            fontSize: '1.15em',
            whiteSpace: 'pre-line'
          }}>
            {term.explanation}
          </div>
        </div>
    </div>
  );
} 