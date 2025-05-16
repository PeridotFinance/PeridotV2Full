// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

interface INttManager {
    // Function to initiate a transfer
    function transfer(
        uint256 amount, // amount in atomic units
        uint16 recipientChain, // Wormhole chain ID
        bytes32 recipient // Wormhole formatted recipient address
    ) external payable returns (uint64 sequence);

    // Function to get estimated relay cost
    function quoteDeliveryPrice(
        uint16 recipientChain, // Wormhole chain ID
        bytes memory transceiverInstructions // Usually empty
    ) external view returns (uint256[] memory individualFees, uint256 totalFee);

    // You might need other functions depending on interactions, but these are key for transfer
}
