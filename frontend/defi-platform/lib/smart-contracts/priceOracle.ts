import { ethers } from "ethers";
import PriceOracle from "../../app/abis/PriceOracle.json";

// Adresse des deployten Smart Contracts (musst du von deinem Kollegen bekommen)
const PRICE_ORACLE_ADDRESS = "0xdefE2f4D1Bf069C7167f9b093F2ee9f01D557812"; 

export const getPriceOracleContract = (providerOrSigner: ethers.Signer | ethers.Provider) => {
    return new ethers.Contract(
        PRICE_ORACLE_ADDRESS,
        PriceOracle.abi,
        providerOrSigner
    );
};
