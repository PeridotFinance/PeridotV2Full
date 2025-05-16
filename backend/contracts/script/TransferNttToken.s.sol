// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "../lib/openzeppelin-contracts/contracts/interfaces/IERC20.sol";
import {BytesParsing} from "../lib/wormhole-solidity-sdk/src/libraries/BytesParsing.sol";
import "../lib/wormhole-ntt/src/interfaces/INttManager.sol";

contract TransferNttToken is Script {
    address constant ARB_SEPOLIA_NTT_MANAGER =
        0x10b644913592549aAf55ED9573E8455e70692EeB;
    address constant ARB_SEPOLIA_TOKEN =
        0x3ed59D5D0a2236cDAd22aDFFC5414df74Ccb3040;
    uint16 constant SOLANA_CHAIN_ID = 1; // Wormhole Chain ID for Solana

    // Recipient address on Solana (Base58 encoded string )
    string constant RECIPIENT_ADDRESS_SOLANA_B58 =
        "EhDUmmxeFwNYtKPw5swPqshVLRoJmzvbkxcnSLGcybBW";

    //we use the python script to get the bytes32 address
    bytes32 constant RECIPIENT_ADDRESS_SOLANA_BYTES32 =
        0xcb7545b2df7c81b581df1000ca9568adf19b13990c6540f3db2a2612b0c633b9; // <<< REPLACE THIS VALUE

    // Amount to transfer (in ATOMIC units - e.g., if 18 decimals, 1 * 10**18 for 1 token)
    uint256 constant TRANSFER_AMOUNT_ATOMIC = 1 * 10 ** 18; // Example: 1 token with 18 decimals

    // --- Interfaces ---
    INttManager nttManager = INttManager(ARB_SEPOLIA_NTT_MANAGER);
    IERC20 token = IERC20(ARB_SEPOLIA_TOKEN);

    function run() external {
        // Input Validation
        require(
            RECIPIENT_ADDRESS_SOLANA_BYTES32 != bytes32(0),
            "Recipient address (bytes32) cannot be zero"
        );
        require(
            TRANSFER_AMOUNT_ATOMIC > 0,
            "Transfer amount must be greater than zero"
        );

        // Get deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address sender = vm.addr(deployerPrivateKey);

        // Check token balance
        uint256 balance = token.balanceOf(sender);
        console.log("Sender Address:", sender);
        console.log("Sender Token Balance (atomic):", balance);
        require(
            balance >= TRANSFER_AMOUNT_ATOMIC,
            "Insufficient token balance"
        );

        console.log(
            "Recipient Address (Solana, Base58):",
            RECIPIENT_ADDRESS_SOLANA_B58
        );
        console.log("Recipient Address (Solana, bytes32):");
        console.logBytes32(RECIPIENT_ADDRESS_SOLANA_BYTES32);

        // Get estimated delivery fee
        // Note: The second parameter for quoteDeliveryPrice is transceiverInstructions.
        // Using hex"01" to try and skip relayer send for quoting.
        (, uint256 totalFee) = nttManager.quoteDeliveryPrice(
            SOLANA_CHAIN_ID,
            hex"01"
        );
        console.log("Estimated Delivery Fee (Wei):", totalFee);

        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);

        // 1. Approve the NTT Manager to spend the tokens
        console.log("Approving NTT Manager to spend tokens...");
        token.approve(ARB_SEPOLIA_NTT_MANAGER, TRANSFER_AMOUNT_ATOMIC);
        console.log("Approval successful.");

        console.log("Initiating NTT transfer to Solana...");

        uint64 sequence = nttManager.transfer{value: totalFee}(
            TRANSFER_AMOUNT_ATOMIC,
            SOLANA_CHAIN_ID,
            RECIPIENT_ADDRESS_SOLANA_BYTES32
        );
        console.log("Transfer initiated. Sequence:", sequence);

        // Stop broadcasting
        vm.stopBroadcast();

        console.log("Script finished successfully.");
    }
}
