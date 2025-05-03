"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useToast } from "@/components/ui/use-toast"
import { Core } from "@walletconnect/core"
import { WalletKit, WalletKitTypes } from "@reown/walletkit"
import { buildApprovedNamespaces, getSdkError } from "@walletconnect/utils"

type WalletType = "metamask" | "phantom" | "solflare" | "walletconnect" | null
type ChainType = "ethereum" | "polygon" | "avalanche" | "solana" | "bsc" | null

interface WalletContextType {
  address: string | null
  chainId: string | null
  chainType: ChainType
  walletType: WalletType
  isConnecting: boolean
  isConnected: boolean
  connectMetaMask: () => Promise<void>
  connectPhantom: () => Promise<void>
  connectSolflare: () => Promise<void>
  connectWalletConnect: () => Promise<void>
  disconnect: () => void
}

const WalletContext = createContext<WalletContextType>({
  address: null,
  chainId: null,
  chainType: null,
  walletType: null,
  isConnecting: false,
  isConnected: false,
  connectMetaMask: async () => {},
  connectPhantom: async () => {},
  connectSolflare: async () => {},
  connectWalletConnect: async () => {},
  disconnect: () => {},
})

export const useWallet = () => useContext(WalletContext)

interface WalletProviderProps {
  children: ReactNode
}

// Initialize WalletConnect Core and WalletKit
let walletKitInstance: any = null;

const initWalletKit = async () => {
  if (typeof window === "undefined" || walletKitInstance) return walletKitInstance;
  
  try {
    const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || ""; // Should be set in your .env file
    
    if (!projectId) {
      console.error("WalletConnect project ID is not set");
      return null;
    }
    
    const core = new Core({
      projectId,
    });
    
    walletKitInstance = await WalletKit.init({
      core,
      metadata: {
        name: "CrossLend App",
        description: "DeFi lending and borrowing platform",
        url: window.location.origin,
        icons: [`${window.location.origin}/logo.png`],
      },
    });
    
    return walletKitInstance;
  } catch (error) {
    console.error("Failed to initialize WalletKit:", error);
    return null;
  }
};

export function WalletProvider({ children }: WalletProviderProps) {
  const [address, setAddress] = useState<string | null>(null)
  const [chainId, setChainId] = useState<string | null>(null)
  const [chainType, setChainType] = useState<ChainType>(null)
  const [walletType, setWalletType] = useState<WalletType>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [walletKit, setWalletKit] = useState<any>(null)
  const { toast } = useToast()

  // Initialize WalletKit on mount
  useEffect(() => {
    const initialize = async () => {
      const instance = await initWalletKit();
      setWalletKit(instance);
      
      if (instance) {
        // Handle session_proposal
        instance.on("session_proposal", onSessionProposal);
        
        // Handle session_request
        instance.on("session_request", onSessionRequest);
        
        // Handle session_delete (disconnection)
        instance.on("session_delete", () => {
          if (walletType === "walletconnect") {
            disconnect();
          }
        });
      }
    };
    
    initialize();
    
    return () => {
      if (walletKit) {
        walletKit.off("session_proposal", onSessionProposal);
        walletKit.off("session_request", onSessionRequest);
        walletKit.off("session_delete", () => {});
      }
    };
  }, []);
  
  // Handle WalletConnect session proposals
  const onSessionProposal = async ({ id, params }: WalletKitTypes.SessionProposal) => {
    try {
      if (!walletKit) throw new Error("WalletKit not initialized");
      
      // Build approved namespaces
      const approvedNamespaces = buildApprovedNamespaces({
        proposal: params,
        supportedNamespaces: {
          eip155: {
            chains: ['eip155:1', 'eip155:137', 'eip155:43114', 'eip155:56'],
            methods: [
              'eth_sendTransaction',
              'eth_signTransaction',
              'eth_sign',
              'personal_sign',
              'eth_signTypedData',
            ],
            events: ['accountsChanged', 'chainChanged'],
            accounts: [
              // Will be filled dynamically when connecting
              ...(address ? [`eip155:1:${address}`, `eip155:137:${address}`, `eip155:43114:${address}`, `eip155:56:${address}`] : [])
            ]
          }
        }
      });
      
      const session = await walletKit.approveSession({
        id,
        namespaces: approvedNamespaces
      });
      
      // Extract account from session if not set yet
      if (!address && session.namespaces.eip155?.accounts?.length) {
        const accountCaip = session.namespaces.eip155.accounts[0];
        const addressFromCaip = accountCaip.split(':')[2];
        const chainIdFromCaip = accountCaip.split(':')[1];
        
        setAddress(addressFromCaip);
        setChainId(`0x${parseInt(chainIdFromCaip).toString(16)}`);
        setWalletType("walletconnect");
        setChainType(getChainType(`0x${parseInt(chainIdFromCaip).toString(16)}`));
        setIsConnected(true);
      }
      
    } catch (error: any) {
      console.error("Error approving WalletConnect session:", error);
      
      if (walletKit) {
        await walletKit.rejectSession({
          id,
          reason: getSdkError("USER_REJECTED")
        });
      }
      
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect with WalletConnect",
        variant: "destructive",
      });
    }
  };

  // Handle WalletConnect session requests (like signing messages)
  const onSessionRequest = async (event: WalletKitTypes.SessionRequest) => {
    try {
      if (!walletKit) throw new Error("WalletKit not initialized");
      
      const { topic, params, id } = event;
      const { request } = params;
      
      // Here you would handle different request methods
      // For example eth_sendTransaction, personal_sign, etc.
      // For this implementation, we'll just acknowledge the request
      
      // This is a placeholder. In a real app, you would implement proper handling
      // of different request methods.
      const response = { 
        id, 
        jsonrpc: "2.0", 
        result: "Acknowledged but not implemented" 
      };
      
      await walletKit.respondSessionRequest({ topic, response });
      
    } catch (error: any) {
      console.error("Error handling WalletConnect request:", error);
      
      // Reject the request
      if (walletKit && event) {
        const errorResponse = {
          id: event.id,
          jsonrpc: "2.0",
          error: {
            code: 5000,
            message: "Request handling failed",
          },
        };
        
        await walletKit.respondSessionRequest({ 
          topic: event.topic, 
          response: errorResponse 
        });
      }
    }
  };

  // Check for existing connections on mount
  useEffect(() => {
    const checkExistingConnection = async () => {
      // Check for MetaMask connection
      if (typeof window !== "undefined" && window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" })
          if (accounts.length > 0) {
            const chainId = await window.ethereum.request({ method: "eth_chainId" })
            setAddress(accounts[0])
            setChainId(chainId)
            setWalletType("metamask")
            setChainType(getChainType(chainId))
            setIsConnected(true)
          }
        } catch (error) {
          console.error("Error checking existing MetaMask connection:", error)
        }
      }

      // Check for Phantom connection
      if (typeof window !== "undefined" && window.solana) {
        try {
          const resp = await window.solana.connect({ onlyIfTrusted: true })
          if (resp.publicKey) {
            setAddress(resp.publicKey.toString())
            setChainId("solana")
            setWalletType("phantom")
            setChainType("solana")
            setIsConnected(true)
          }
        } catch (error) {
          // User hasn't connected before or has revoked access
        }
      }
      
      // Check for WalletConnect sessions
      if (walletKit) {
        const activeSessions = walletKit.getActiveSessions();
        const sessionKeys = Object.keys(activeSessions);
        
        if (sessionKeys.length > 0) {
          // Get the most recent session
          const session = activeSessions[sessionKeys[0]];
          
          // Get the accounts from the session
          const eip155Accounts = session.namespaces.eip155?.accounts || [];
          
          if (eip155Accounts.length > 0) {
            // CAIP-10 format: eip155:1:0x...
            const accountCaip = eip155Accounts[0];
            const parts = accountCaip.split(':');
            
            if (parts.length === 3) {
              const chainIdFromCaip = parts[1];
              const addressFromCaip = parts[2];
              
              setAddress(addressFromCaip);
              setChainId(`0x${parseInt(chainIdFromCaip).toString(16)}`);
              setWalletType("walletconnect");
              setChainType(getChainType(`0x${parseInt(chainIdFromCaip).toString(16)}`));
              setIsConnected(true);
            }
          }
        }
      }
    }

    checkExistingConnection()
  }, [walletKit])

  // Listen for account changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (window.ethereum && walletType === "metamask") {
        const handleAccountsChanged = (accounts: string[]) => {
          if (accounts.length === 0) {
            // User disconnected
            disconnect()
          } else {
            // Account changed
            setAddress(accounts[0])
          }
        }

        const handleChainChanged = (chainId: string) => {
          setChainId(chainId)
          setChainType(getChainType(chainId))
          window.location.reload()
        }

        window.ethereum.on("accountsChanged", handleAccountsChanged)
        window.ethereum.on("chainChanged", handleChainChanged)

        return () => {
          window.ethereum.removeListener("accountsChanged", handleAccountsChanged)
          window.ethereum.removeListener("chainChanged", handleChainChanged)
        }
      }

      if (window.solana && (walletType === "phantom" || walletType === "solflare")) {
        const handleDisconnect = () => {
          disconnect()
        }

        window.solana.on("disconnect", handleDisconnect)

        return () => {
          window.solana.removeListener("disconnect", handleDisconnect)
        }
      }
    }
  }, [walletType])

  const getChainType = (chainId: string): ChainType => {
    // Convert chainId to decimal for easier comparison
    const chainIdDecimal = Number.parseInt(chainId, 16)

    switch (chainIdDecimal) {
      case 1: // Ethereum Mainnet
        return "ethereum"
      case 137: // Polygon Mainnet
        return "polygon"
      case 43114: // Avalanche C-Chain
        return "avalanche"
      case 56: // Binance Smart Chain
        return "bsc"
      default:
        return null
    }
  }

  const connectMetaMask = async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      toast({
        title: "MetaMask not found",
        description: "Please install MetaMask browser extension and try again.",
        variant: "destructive",
      })
      return
    }

    setIsConnecting(true)

    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" })
      const chainId = await window.ethereum.request({ method: "eth_chainId" })

      setAddress(accounts[0])
      setChainId(chainId)
      setWalletType("metamask")
      setChainType(getChainType(chainId))
      setIsConnected(true)

      toast({
        title: "Wallet connected",
        description: `Connected to MetaMask: ${accounts[0].substring(0, 6)}...${accounts[0].substring(
          accounts[0].length - 4,
        )}`,
      })
    } catch (error: any) {
      console.error("Error connecting to MetaMask:", error)
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect to MetaMask",
        variant: "destructive",
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const connectPhantom = async () => {
    if (typeof window === "undefined" || !window.solana || !window.solana.isPhantom) {
      toast({
        title: "Phantom wallet not found",
        description: "Please install Phantom wallet extension and try again.",
        variant: "destructive",
      })
      return
    }

    setIsConnecting(true)

    try {
      const resp = await window.solana.connect()
      const publicKey = resp.publicKey.toString()

      setAddress(publicKey)
      setChainId("solana")
      setWalletType("phantom")
      setChainType("solana")
      setIsConnected(true)

      toast({
        title: "Wallet connected",
        description: `Connected to Phantom: ${publicKey.substring(0, 6)}...${publicKey.substring(publicKey.length - 4)}`,
      })
    } catch (error: any) {
      console.error("Error connecting to Phantom:", error)
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect to Phantom wallet",
        variant: "destructive",
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const connectSolflare = async () => {
    if (typeof window === "undefined" || !window.solflare) {
      toast({
        title: "Solflare wallet not found",
        description: "Please install Solflare wallet extension and try again.",
        variant: "destructive",
      })
      return
    }

    setIsConnecting(true)

    try {
      await window.solflare.connect()
      const publicKey = window.solflare.publicKey.toString()

      setAddress(publicKey)
      setChainId("solana")
      setWalletType("solflare")
      setChainType("solana")
      setIsConnected(true)

      toast({
        title: "Wallet connected",
        description: `Connected to Solflare: ${publicKey.substring(0, 6)}...${publicKey.substring(
          publicKey.length - 4,
        )}`,
      })
    } catch (error: any) {
      console.error("Error connecting to Solflare:", error)
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect to Solflare wallet",
        variant: "destructive",
      })
    } finally {
      setIsConnecting(false)
    }
  }
  
  const connectWalletConnect = async () => {
    if (!walletKit) {
      toast({
        title: "WalletConnect not initialized",
        description: "Unable to initialize WalletConnect. Please try again later.",
        variant: "destructive",
      });
      return;
    }

    setIsConnecting(true);

    try {
      // Generate the connection URI
      const { uri } = await walletKit.pair({});
      
      if (!uri) {
        throw new Error("Failed to generate WalletConnect URI");
      }
      
      // Open the WalletConnect QR code modal
      // You can use a QR code library here to show the QR code
      // For now, we'll just console log the URI
      console.log("WalletConnect URI:", uri);
      
      // For testing: You can show the URI in an alert or custom modal
      // In a real app, you'd use a QR code component
      const qrModal = document.createElement('div');
      qrModal.style.position = 'fixed';
      qrModal.style.top = '0';
      qrModal.style.left = '0';
      qrModal.style.width = '100%';
      qrModal.style.height = '100%';
      qrModal.style.backgroundColor = 'rgba(0,0,0,0.8)';
      qrModal.style.display = 'flex';
      qrModal.style.flexDirection = 'column';
      qrModal.style.alignItems = 'center';
      qrModal.style.justifyContent = 'center';
      qrModal.style.zIndex = '9999';
      qrModal.style.color = 'white';
      qrModal.style.padding = '2rem';
      qrModal.style.textAlign = 'center';
      
      qrModal.innerHTML = `
        <div style="background: white; padding: 1rem; border-radius: 0.5rem; max-width: 80%; overflow-wrap: break-word;">
          <h3 style="color: black; margin-bottom: 1rem;">Scan with WalletConnect</h3>
          <p style="color: black; word-break: break-all; font-size: 12px;">${uri}</p>
          <button id="closeWcModal" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #f44336; color: white; border: none; border-radius: 0.25rem; cursor: pointer;">Close</button>
        </div>
      `;
      
      document.body.appendChild(qrModal);
      
      document.getElementById('closeWcModal')?.addEventListener('click', () => {
        document.body.removeChild(qrModal);
        setIsConnecting(false);
      });
      
      // The connection will be handled by the session_proposal event handler
      
    } catch (error: any) {
      console.error("Error initiating WalletConnect:", error);
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect with WalletConnect",
        variant: "destructive",
      });
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    if (walletType === "phantom" && window.solana) {
      window.solana.disconnect()
    } else if (walletType === "solflare" && window.solflare) {
      window.solflare.disconnect()
    } else if (walletType === "walletconnect" && walletKit) {
      // Disconnect all WalletConnect sessions
      const activeSessions = walletKit.getActiveSessions();
      Object.keys(activeSessions).forEach(topic => {
        walletKit.disconnectSession({
          topic,
          reason: getSdkError("USER_DISCONNECTED")
        });
      });
    }

    setAddress(null)
    setChainId(null)
    setWalletType(null)
    setChainType(null)
    setIsConnected(false)

    toast({
      title: "Wallet disconnected",
      description: "Your wallet has been disconnected.",
    })
  }

  return (
    <WalletContext.Provider
      value={{
        address,
        chainId,
        chainType,
        walletType,
        isConnecting,
        isConnected,
        connectMetaMask,
        connectPhantom,
        connectSolflare,
        connectWalletConnect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

// Add type definitions for window
declare global {
  interface Window {
    ethereum?: any
    solana?: any
    solflare?: any
  }
}
