'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
// const repeatedAlphabet = [...alphabet, ...alphabet, ...alphabet]; // Removed repetition

interface AlphabetWheelProps {
  onLetterClick: (letter: string) => void;
  selectedLetter: string | null;
}

// Light Mode Colors (Peridot)
const LM_PRIMARY_OLIVE = 'rgb(94, 121, 70)';
const LM_PALE_OLIVE = 'rgb(132, 161, 107)';
const LM_DARKER_OLIVE = 'rgb(93, 120, 69)';
const LM_WHITE = 'rgb(255, 255, 255)';
const LM_CONTAINER_BG = 'rgb(240, 242, 238)';
const LM_BUTTON_TEXT = LM_PRIMARY_OLIVE;
const LM_BUTTON_BORDER = LM_PALE_OLIVE;

// Dark Mode Colors (Peridot)
const DM_PRIMARY_OLIVE = 'rgb(94, 121, 70)'; // Can remain strong accent
const DM_PALE_OLIVE = 'rgb(132, 161, 107)'; // Good for text/hover on dark
const DM_TEXT_ON_ACCENT = 'rgb(255, 255, 254)';
const DM_CONTAINER_BG = 'rgb(35, 40, 32)'; // Darker container bg
const DM_BUTTON_BG = 'rgb(50, 60, 45)'; // Button bg on dark
const DM_BUTTON_TEXT = 'rgb(220, 225, 215)'; // Off-white text for buttons
const DM_BUTTON_BORDER = 'rgb(70, 85, 60)';
const DM_SCROLLBAR_TRACK = DM_CONTAINER_BG;
const DM_SCROLLBAR_THUMB = 'rgb(70, 85, 60)';
const DM_SCROLLBAR_THUMB_HOVER = LM_PALE_OLIVE;

const AlphabetWheel: React.FC<AlphabetWheelProps> = ({ onLetterClick, selectedLetter }) => {
  const { theme } = useTheme();
  const [clientIsDarkMode, setClientIsDarkMode] = useState(false);

  useEffect(() => {
    setClientIsDarkMode(theme === 'dark');
  }, [theme]);

  const handleLetterClick = (letter: string) => {
    // If the clicked letter is already selected, treat it as a deselect/clear filter action
    if (letter === selectedLetter) {
      onLetterClick(''); // Pass empty string to signify clear filter
    } else {
      onLetterClick(letter);
    }
  };

  const containerBg = clientIsDarkMode ? DM_CONTAINER_BG : LM_CONTAINER_BG;
  const borderTopColor = clientIsDarkMode ? DM_PALE_OLIVE : LM_PALE_OLIVE;
  const borderBottomColor = clientIsDarkMode ? DM_PALE_OLIVE : LM_PALE_OLIVE;
  const scrollbarThumb = clientIsDarkMode ? DM_SCROLLBAR_THUMB : LM_PALE_OLIVE;
  const scrollbarTrack = clientIsDarkMode ? DM_SCROLLBAR_TRACK : LM_CONTAINER_BG;
  const scrollbarThumbHover = clientIsDarkMode ? DM_SCROLLBAR_THUMB_HOVER : LM_PRIMARY_OLIVE;

  return (
    <div style={{
      width: '100%',
      overflowX: 'auto',
      whiteSpace: 'nowrap',
      padding: '15px 0',
      backgroundColor: containerBg,
      borderTop: `1px solid ${borderTopColor}`,
      borderBottom: `1px solid ${borderBottomColor}`,
      scrollbarWidth: 'thin',
      scrollbarColor: `${scrollbarThumb} ${scrollbarTrack}`,
      textAlign: 'center', // Center the buttons if they don't fill the width
    }}>
      <style>
        {`
          div::-webkit-scrollbar {
            height: 8px;
          }
          div::-webkit-scrollbar-track {
            background: ${scrollbarTrack};
            border-radius: 4px;
          }
          div::-webkit-scrollbar-thumb {
            background-color: ${scrollbarThumb};
            border-radius: 4px;
            border: 2px solid ${scrollbarTrack};
          }
          div::-webkit-scrollbar-thumb:hover {
            background-color: ${scrollbarThumbHover};
          }
        `}
      </style>
      {alphabet.map((letter, index) => { // Changed from repeatedAlphabet to alphabet
        const isSelected = letter === selectedLetter;

        const buttonBgColor = isSelected 
            ? (clientIsDarkMode ? DM_PRIMARY_OLIVE : LM_PRIMARY_OLIVE) 
            : (clientIsDarkMode ? DM_BUTTON_BG : LM_WHITE);
        const buttonTextColor = isSelected 
            ? DM_TEXT_ON_ACCENT 
            : (clientIsDarkMode ? DM_BUTTON_TEXT : LM_BUTTON_TEXT);
        const buttonBorderColor = isSelected 
            ? (clientIsDarkMode ? DM_PALE_OLIVE : LM_DARKER_OLIVE) 
            : (clientIsDarkMode ? DM_BUTTON_BORDER : LM_BUTTON_BORDER);
        
        const hoverBgColor = clientIsDarkMode ? DM_PALE_OLIVE : LM_PALE_OLIVE;
        const hoverTextColor = DM_TEXT_ON_ACCENT;
        const hoverBorderColor = clientIsDarkMode ? DM_PRIMARY_OLIVE : LM_PRIMARY_OLIVE; 

        return (
          <button
            key={`${letter}-${index}`}
            onClick={() => handleLetterClick(letter)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '45px', // Slightly smaller for more letters to fit
              height: '45px',
              margin: '0 4px',
              fontSize: '1.1em',
              fontWeight: isSelected ? 700 : 500,
              color: buttonTextColor,
              backgroundColor: buttonBgColor,
              border: `1px solid ${buttonBorderColor}`,
              borderRadius: '50%',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease, color 0.2s ease, transform 0.1s ease, border-color 0.2s ease, box-shadow 0.2s ease',
              boxShadow: isSelected ? `0 3px 6px ${clientIsDarkMode ? 'rgba(132, 161, 107, 0.3)' : 'rgba(94, 121, 70, 0.4)'}` : `0 2px 4px ${clientIsDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)'}'`
            }}
            onMouseOver={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = hoverBgColor;
                e.currentTarget.style.color = hoverTextColor;
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.borderColor = hoverBorderColor;
              }
            }}
            onMouseOut={(e) => {
              if (!isSelected) {
                // Revert to base non-selected style based on current clientIsDarkMode state
                e.currentTarget.style.backgroundColor = clientIsDarkMode ? DM_BUTTON_BG : LM_WHITE;
                e.currentTarget.style.color = clientIsDarkMode ? DM_BUTTON_TEXT : LM_BUTTON_TEXT;
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.borderColor = clientIsDarkMode ? DM_BUTTON_BORDER : LM_BUTTON_BORDER;
              }
            }}
          >
            {letter}
          </button>
        );
      })}
    </div>
  );
};

export default AlphabetWheel; 