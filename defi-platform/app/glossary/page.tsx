'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import AlphabetWheel from './components/AlphabetWheel';

// Light Mode Color Palette (Peridot)
const LM_PRIMARY_OLIVE = 'rgb(94, 121, 70)';
const LM_PALE_OLIVE = 'rgb(132, 161, 107)';
const LM_WHITE = 'rgb(255, 255, 255)';
const LM_NEAR_WHITE = 'rgb(255, 255, 254)';
const LM_HEADING_COLOR = LM_PRIMARY_OLIVE;
const LM_TEXT_COLOR = 'rgb(70, 85, 50)';
const LM_WORD_BG = LM_WHITE;
const LM_WORD_BORDER = LM_PALE_OLIVE;
const LM_WORD_TEXT = LM_PRIMARY_OLIVE;
const LM_WORD_HOVER_BG = LM_PALE_OLIVE;
const LM_WORD_HOVER_TEXT = LM_WHITE;
const LM_WORD_HOVER_BORDER = LM_PRIMARY_OLIVE;
const LM_HEADER_BG = LM_WHITE;
const LM_HEADER_BORDER = LM_PALE_OLIVE;

// Dark Mode Color Palette (Peridot)
const DM_PAGE_BG = 'rgb(30, 35, 28)';
const DM_HEADER_BG = 'rgb(40, 48, 35)';
const DM_HEADER_BORDER = 'rgb(60, 70, 55)';
const DM_HEADING_COLOR = 'rgb(160, 180, 140)'; // Brighter olive for dark bg
const DM_TEXT_COLOR = 'rgb(200, 210, 190)'; // Lighter text for dark bg
const DM_WORD_BG = 'rgb(45, 55, 40)';
const DM_WORD_BORDER = 'rgb(70, 85, 60)';
const DM_WORD_TEXT = 'rgb(180, 200, 160)'; // Lighter olive text for words
const DM_WORD_HOVER_BG = 'rgb(132, 161, 107)'; // Pale Olive can work well for hover
const DM_WORD_HOVER_TEXT = 'rgb(20, 25, 18)'; // Dark text on pale olive hover
const DM_WORD_HOVER_BORDER = 'rgb(152, 181, 127)';

// Updated glossaryData with slugs
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

interface WordCloudProps {
  terms: GlossaryTerm[];
  onWordClick: (term: GlossaryTerm) => void;
  isDarkMode: boolean;
}

const InteractiveWordCloud: React.FC<WordCloudProps> = ({ terms, onWordClick, isDarkMode }) => {
  const getWordStyle = (index: number) => {
    const sizes = ['1em', '1.2em', '1.5em', '1.8em', '2em', '1.3em', '1.6em'];
    
    const baseStyle = {
        padding: '10px 15px',
        margin: '6px',
        borderRadius: '25px',
        backgroundColor: isDarkMode ? DM_WORD_BG : LM_WORD_BG,
        color: isDarkMode ? DM_WORD_TEXT : LM_WORD_TEXT,
        fontSize: sizes[index % sizes.length],
        cursor: 'pointer',
        border: `1px solid ${isDarkMode ? DM_WORD_BORDER : LM_WORD_BORDER}`,
        boxShadow: `2px 2px 5px ${isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(94, 121, 70, 0.1)'}`,
        transition: 'transform 0.2s ease-in-out, boxShadow 0.2s ease-in-out, background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease',
        display: 'inline-block',
        fontWeight: 500,
    };
    return baseStyle;
  };

  if (terms.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: isDarkMode ? DM_TEXT_COLOR : LM_TEXT_COLOR }}>
        <p style={{fontSize: '1.2em'}}>No terms match the selected letter.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', alignItems: 'center', padding: '20px', marginTop: '20px' }}>
      {terms.map((term, index) => (
        <button
          key={term.id}
          onClick={() => onWordClick(term)}
          style={getWordStyle(index)}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = `4px 4px 10px ${isDarkMode ? 'rgba(0,0,0,0.3)': 'rgba(94, 121, 70, 0.2)'}`;
            e.currentTarget.style.backgroundColor = isDarkMode ? DM_WORD_HOVER_BG : LM_WORD_HOVER_BG;
            e.currentTarget.style.color = isDarkMode ? DM_WORD_HOVER_TEXT : LM_WORD_HOVER_TEXT;
            e.currentTarget.style.borderColor = isDarkMode ? DM_WORD_HOVER_BORDER : LM_WORD_HOVER_BORDER;
          }}
          onMouseOut={(e) => {
            const baseStyle = getWordStyle(index); // Recalculate base style for current mode
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = baseStyle.boxShadow!;
            e.currentTarget.style.backgroundColor = baseStyle.backgroundColor!;
            e.currentTarget.style.color = baseStyle.color!;
            e.currentTarget.style.borderColor = baseStyle.border!.split(' ').slice(2).join(' ');
          }}
        >
          {term.term}
        </button>
      ))}
    </div>
  );
};

export default function GlossaryPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const [clientIsDarkMode, setClientIsDarkMode] = useState(false);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);

  useEffect(() => {
    setClientIsDarkMode(theme === 'dark');
  }, [theme]);

  const handleWordClick = (term: GlossaryTerm) => {
    router.push(`/glossary/${term.slug}`);
  };

  const handleLetterSelect = (letter: string) => {
    if (letter === selectedLetter || letter === '') {
      setSelectedLetter(null);
    } else {
      setSelectedLetter(letter);
    }
  };

  const filteredTerms = selectedLetter
    ? glossaryData.filter(term => term.term.toUpperCase().startsWith(selectedLetter))
    : glossaryData;
  
  const pageBgColor = clientIsDarkMode ? DM_PAGE_BG : LM_NEAR_WHITE;
  const headerBgColor = clientIsDarkMode ? DM_HEADER_BG : LM_HEADER_BG;
  const headerBorderColor = clientIsDarkMode ? DM_HEADER_BORDER : LM_HEADER_BORDER;
  const headingColor = clientIsDarkMode ? DM_HEADING_COLOR : LM_HEADING_COLOR;
  const textColor = clientIsDarkMode ? DM_TEXT_COLOR : LM_TEXT_COLOR;

  return (
    <div style={{ padding: '0 0 20px 0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', backgroundColor: pageBgColor }}>
      <header style={{ textAlign: 'center', marginBottom: '0', padding: '30px 15px', backgroundColor: headerBgColor, borderBottom: `1px solid ${headerBorderColor}` }}>
        <h1 style={{ color: headingColor, fontSize: '2.8em', fontWeight: 700, margin: '0 0 10px 0' }}>DeFi Glossary</h1>
        <p style={{ color: textColor, fontSize: '1.2em', margin: 0 }}>Explore and understand key terms in Decentralized Finance.</p>
      </header>
      
      <AlphabetWheel onLetterClick={handleLetterSelect} selectedLetter={selectedLetter} />

      <InteractiveWordCloud terms={filteredTerms} onWordClick={handleWordClick} isDarkMode={clientIsDarkMode} />
    </div>
  );
} 