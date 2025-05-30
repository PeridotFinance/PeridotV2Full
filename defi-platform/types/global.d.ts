import { Eip1193Provider } from 'ethers';
import 'react';

declare global {
  interface Window {
    ethereum: Eip1193Provider;
    solana?: any; // Solana wallet providers
  }

  namespace JSX {
    interface IntrinsicElements {
      /**
       * The AppKit button web component. Registered globally by AppKit.
       */
      'appkit-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'appkit-network-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

// Ensures file is treated as a module
export {}; 