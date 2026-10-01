"use client";

import { useEffect, useState } from "react";
import { ethers, Eip1193Provider } from "ethers";
import { getPriceOracleContract } from "../lib/smart-contracts/priceOracle";

const PriceOracleReader = () => {
  const [price, setPrice] = useState<string>("");
  const [isOracle, setIsOracle] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const loadContractData = async () => {
      try {
        if (typeof window !== "undefined" && window.ethereum) {
          // Use a type assertion to fix the type error
          const provider = new ethers.BrowserProvider(window.ethereum as Eip1193Provider);
          await provider.send("eth_requestAccounts", []);
          const signer = await provider.getSigner();

          const contract = getPriceOracleContract(signer);

          const oracleCheck = await contract.isPriceOracle();
          setIsOracle(oracleCheck);

          // Beispieladresse eines PToken (muss angepasst werden)
          // Verwende eine tatsächliche PToken-Adresse aus deinem System
          const examplePToken = "0x1234567890123456789012345678901234567890"; 
          const underlyingPrice = await contract.getUnderlyingPrice(examplePToken);
          
          // Der Preis wird im Smart Contract meist als "wei" gespeichert (1e18)
          const formattedPrice = ethers.formatUnits(underlyingPrice, 18);
          setPrice(formattedPrice);
        } else {
          setError("MetaMask or compatible wallet not detected");
        }
      } catch (error) {
        console.error("Error loading contract data", error);
        setError(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    loadContractData();
  }, []);

  return (
    <div className="p-4 rounded-lg border border-gray-200 shadow-sm">
      <h2 className="text-xl font-bold mb-4">Price Oracle Info</h2>
      {error ? (
        <p className="text-red-500">{error}</p>
      ) : (
        <>
          <p className="mb-2">Is Price Oracle: {isOracle ? "✅ Yes" : "❌ No"}</p>
          <p>Example Underlying Price: {price ? `${price} ETH` : "Loading..."}</p>
        </>
      )}
    </div>
  );
};

export default PriceOracleReader; 