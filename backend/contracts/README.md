# Peridot V2 Contracts

This repository contains the smart contracts for Peridot V2, a decentralized lending protocol, potentially with cross-chain capabilities facilitated by a Hub and Spoke architecture.

## Overview

The Peridot V2 protocol allows users to lend and borrow assets. Key components include:

- `Peridottroller`: The risk management and governance layer of the protocol.
- `PToken`: Represents supplied assets (e.g., `PErc20`, `PEther`). Users mint PTokens when supplying assets and earn interest.
- `PriceOracle`: Provides price feeds for assets.
- `PeridotHub` / `PeridotSpoke`: Components likely enabling cross-chain functionality, possibly interacting with messaging layers like Wormhole.
- `NTTSpokeToken`: Potentially related to Native Token Transfers across chains.

The contracts are built and deployed using the [Foundry](https://github.com/foundry-rs/foundry) development toolkit.

## Prerequisites

- [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- [Foundry](https://book.getfoundry.sh/getting-started/installation)

## Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd PeridotV2Full/backend/contracts
    ```
2.  **Install dependencies:**
    ```bash
    forge install
    # or if using submodules
    # git submodule update --init --recursive
    # forge build
    ```
    _(Adjust based on your dependency management)_

## Deployment

The contracts are deployed using Forge scripts located in the `script/` directory.

**Environment Variables:**

Before running deployment scripts, you typically need to set environment variables, such as:

- `RPC_URL`: The RPC endpoint for the target blockchain.
- `PRIVATE_KEY`: The private key of the deployer account.

You can also

```bash
export PRIVATE_KEY=YOURPRIVATEEKEY
```

instead of using Environment Variables

Note that Wormhole is currently not available on Soneium and IOTA yet.

**Example Deployment Command:**

```bash
forge script script/DeployHub.s.sol:DeployHubScript --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast --verify -vvvv
```

Replace `script/DeployHub.s.sol:DeployHubScript` with the specific script and contract name you want to deploy. Add necessary constructor arguments or script variables via command-line flags or environment variables as defined within your scripts.

**Key Deployment Scripts & Order:**

Deploying Peridot V2 involves multiple steps, and the order matters due to dependencies between contracts. While the exact sequence might vary based on specific configurations, a typical order is:

1.  **Price Oracle:** Deploy the chosen price feed mechanism.
    - `DeployOracle.s.sol`: Deploys the `SimplePriceOracle` or potentially configures another oracle source.
2.  **Peridottroller Implementation:** Deploy the main logic contract.
    - `DeployPeridottroller.s.sol`: Deploys the `Peridottroller` implementation (e.g., `PeridottrollerG7`).
3.  **Unitroller (Proxy Admin & Storage):** Deploy the proxy contract that holds storage and points to the implementation. The `Peridottroller` implementation address is needed here.
    - `DeployEIP1967Proxy.s.sol` (or similar logic within `DeployPeridottroller.s.sol`): Deploys the `Unitroller` proxy and sets its initial implementation.
4.  **Interest Rate Models:** Deploy the interest rate model(s) to be used by PTokens.
    - _(Script name might vary - could be part of PToken deployment or separate, e.g., deploying `JumpRateModelV2`)_
5.  **PToken Implementations & Proxies:** Deploy the logic for each PToken market and its corresponding proxy (delegator). These often need the `Peridottroller` address and an interest rate model address.
    - `DeployPErc20.s.sol`: Deploys `PErc20Immutable` (implementation) and `PErc20Delegator` (proxy) for a given underlying ERC20 token.
    - `DeployPEther.s.sol`: Deploys the `PEther` market.
6.  **Hub/Spoke (If applicable):**
    - `DeployHub.s.sol`: Deploys the `PeridotHub` contract.
    - `DeploySpoke.s.sol`: Deploys `PeridotSpoke` contracts on connected chains. Hub address might be needed.
7.  **NTT (If applicable):**
    - `DeployNttSpokeToken.s.sol`: Deploys the `NTTSpokeToken` contract, likely needing Hub/Spoke addresses.
8.  **Initial Configuration:** Run scripts to link components, e.g., listing markets in the `Peridottroller`, setting price feeds in the oracle, setting emitters for cross-chain communication.
    - `SetEmitter.s.sol`: Configures cross-chain emitter addresses.

## Running Scripts

The `script/` directory also contains utility scripts for interacting with the deployed contracts.

**Example Script Execution:**

```bash
forge script script/AttestToken.s.sol:AttestTokenScript --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast -vvvv
```

Similar to deployment, ensure required environment variables are set and pass any necessary arguments.

**Available Scripts:**

- `AttestToken.s.sol`: For registering tokens with the Wormhole cross-chain bridge.
- `CompletePayload.s.sol` / `CompleteTransfer.s.sol`: Used to finalize cross-chain operations initiated via Wormhole/NTT by submitting the VAA (Verified Action Approval).
- `DeployEIP1967Proxy.s.sol`: Deploys a standard EIP-1967 compliant proxy contract, often used for `Unitroller` or PToken delegators.
- `DeployERC20.s.sol`: Deploys a standard ERC20 token contract (likely for testing or representing underlying assets).
- `DeployHub.s.sol`: Deploys the `PeridotHub` contract.
- `DeployNttSpokeToken.s.sol`: Deploys the `NTTSpokeToken` contract.
- `DeployOracle.s.sol`: Deploys the `SimplePriceOracle`.
- `DeployPErc20.s.sol`: Deploys a `PErc20Immutable` implementation and a `PErc20Delegator` proxy for a specific underlying ERC20 token.
- `DeployPEther.s.sol`: Deploys the `PEther` market contract.
- `DeployPeridottoken.s.sol`: (Purpose unclear from name - might deploy a governance token or helper contract. Check script content.)
- `DeployPeridottroller.s.sol`: Deploys the `Peridottroller` (or `PeridottrollerG7`) implementation contract.
- `DeploySpoke.s.sol`: Deploys the `PeridotSpoke` contract.
- `FetchPrice.s.sol`: Queries the deployed `PriceOracle` for an asset's price.
- `SetEmitter.s.sol`: Configures trusted emitter addresses (likely Wormhole Bridge endpoints on other chains) in Hub/Spoke contracts.
- `SpokeDeposit.s.sol`: Initiates a deposit action on a `PeridotSpoke` contract.
- `TransferNttToken.s.sol`: Transfers NTT tokens, likely part of the cross-chain workflow.
- `TransferToken.s.sol`: Transfers standard ERC20 tokens (useful for setup or testing).
- `WrappedToken.s.sol`: (Purpose unclear from name - might deploy a wrapped version of a token or interact with one. Check script content.)

## Testing

Run the test suite using:

```bash
forge test
```
