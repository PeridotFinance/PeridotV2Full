# Substream Project: Wormhole Bridge Indexer for Lend/Borrow Market

## 1. Project Overview

This project implements a Substream to index specific interactions with the Wormhole bridge program on the Solana blockchain (currently targeting Devnet, but configurable for Mainnet). The primary goal is to extract and structure data relevant to a decentralized lend/borrow market that utilizes Wormhole-attested tokens carrying custom application-specific payloads.

The Substream filters Solana transactions, identifies Wormhole bridge instructions, and decodes their data, with a special focus on the payloads of messages being bridged.

## 2. What are Substreams?

Substreams are a powerful technology for sourcing and transforming blockchain data. They allow developers to:

- **Extract data**: Read block and transaction data from various blockchains.
- **Filter**: Select specific transactions or events based on criteria like program ID, account ID, or instruction type.
- **Transform**: Decode instruction data, parse event logs, and structure the extracted information into a more usable format (typically Protobuf messages).
- **Compose**: Chain multiple Substream modules together, where the output of one module can be the input for another, allowing for complex data processing pipelines.
- **Sink**: Send the processed data to various destinations, such as databases (SQL), GraphQL endpoints (via Subgraphs), or direct application streams.

Essentially, Substreams provide a highly efficient and flexible way to create custom, real-time data feeds from blockchain activity.

## 3. Data Sources and Indexing Focus

This Substream is designed to monitor and decode key activities relevant to our lend/borrow application. This includes interactions with the Wormhole bridge program and the Metaplex Token Metadata program.

### 3.1 Wormhole Interactions

This specific Substream is designed to monitor and decode key activities on the Wormhole bridge program relevant to our lend/borrow application.

**Key Instructions We Index:**

- **`PostMessage`**: Triggered when a message (potentially including tokens and our custom application data) is sent _from_ Solana _to_ another chain via Wormhole.
- **`PostMessageUnreliable`**: Similar to `PostMessage` but for messages that might not require full guardian attestation reliability.
- **`PostVAA` (Verified Action Approval)**: Triggered when a verified message (a VAA, potentially including tokens and our custom application data) _from another chain_ is posted _to_ the Solana Wormhole bridge. This is how our application receives cross-chain messages/assets on Solana.

**Crucial Data Point: The Payload**

The most critical piece of information for our lend/borrow market is the **`payload`** field within these Wormhole messages. While Wormhole itself defines a generic VAA structure, our application embeds its own specific data format _inside_ Wormhole\'s `payload` field. This inner payload contains details essential for the lending/borrowing logic (e.g., target user, asset type, amount, loan parameters, deposit instructions, etc.).

**Current State of the Substream:**

- It filters transactions by the Wormhole Program ID.
- It identifies the `PostMessage`, `PostVAA`, and `PostMessageUnreliable` instructions by their discriminators.
- It deserializes the primary instruction data (e.g., `nonce`, `emitter_chain`, `emitter_address`, `sequence`, and the _raw Wormhole payload bytes_).
- This decoded data is then structured into Protobuf messages (`WormholeEvent`, `PostedMessageData`, `PostedVaaData`).

**Next Step / AI Task for Payload:** A key task for any AI working with this Substream\'s output will be to further **decode the custom application-specific data format embedded within the `payload` bytes** of the `PostedMessageData` and `PostedVAAData` Protobuf messages. The current Substream provides the raw payload; the consuming application or a subsequent Substream module would handle this secondary decoding.

### 3.2 NTT SPL Token with Metaplex Metadata

In addition to Wormhole interactions, this Substream will also index the creation and updates of Natively Transferred Tokens (NTTs) that utilize the Metaplex Token Metadata program. This is crucial for tracking the properties of tokens used within the lend/borrow market, especially if these tokens represent collateral or other specific assets whose metadata (like name, symbol, or specific attributes in the URI) is important.

**Metaplex Token Metadata Program ID:** `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`

**Key Instructions We Index from Metaplex:**

- **`CreateMetadataAccountV3`**: Triggered when metadata is first created for an SPL token, effectively "minting" its Metaplex representation.
- **`UpdateMetadataAccountV2`**: Triggered when the metadata for an existing SPL token is modified.

**Crucial Data Points from Metaplex Metadata:**

When these instructions are processed, the Substream will extract:

- **Token Mint Account**: The Public Key of the SPL token mint for which the metadata is being created or updated.
- **Update Authority**: The Public Key authorized to make changes to the metadata.
- **Metadata:**
  - `name`: The on-chain name of the token (e.g., "Wrapped SOL").
  - `symbol`: The on-chain symbol of the token (e.g., "WSOL").
  - `uri`: A URI pointing to off-chain JSON metadata which can contain more detailed attributes (e.g., image, description, custom properties). The Substream will capture the URI itself. Further fetching and parsing of the URI content would be a task for the consuming application or a subsequent module.
  - `sellerFeeBasisPoints`: Royalty information.
  - `creators`: Array of creators and their shares.
  - `collection`: Information if the token belongs to a Metaplex Certified Collection.
  - `uses`: Information about how the token can be used (e.g., for burnable tokens).
- **Mutability**: Whether the metadata can be changed in the future.

This information will be structured into new Protobuf messages (e.g., `MetaplexMetadataEvent`, `MetadataAccountData`).

By indexing Metaplex metadata, the Substream provides a comprehensive view of the tokens relevant to the lend/borrow market, complementing the Wormhole data by detailing the assets being bridged or managed.

## 4. What to Know About Wormhole for This Project

- **Generic Messaging Protocol**: Wormhole is a cross-chain message-passing protocol. It allows different blockchains to communicate with each other.
- **VAAs (Verifiable Action Approvals)**:
  - A VAA is a signed message attesting that a specific observation was made on a source chain by the Wormhole Guardian network.
  - It contains header information (version, guardian set index) and a body (timestamp, nonce, emitter chain ID, emitter address, sequence number, consistency level, and the actual `payload`).
  - Our Substream captures these VAA details when they are posted to Solana via the `PostVAA` instruction.
- **Message Flow for Our Application:**
  - **To Solana (Inbound):** An action on another chain (e.g., user wants to deposit collateral from Ethereum to our Solana market) results in a message being published to Wormhole. Guardians attest to this, creating a VAA. This VAA is then relayed to Solana and submitted to the Wormhole bridge program via a `PostVAA` transaction. Our Substream picks this up. The `payload` in this VAA contains the instructions for our Solana lending contract.
  - **From Solana (Outbound):** An action on our Solana market (e.g., user wants to withdraw collateral to Ethereum) results in our Solana contract calling `PostMessage` on the Wormhole bridge. This publishes the message to the Wormhole network. Our Substream picks this up. The `payload` in this message contains the instructions for the target chain.
- **Program ID**: The Wormhole bridge has a specific Program ID on each supported chain. Our Substream filters for this ID on Solana.
  - Solana Mainnet: `worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth`
  - Solana Devnet: `3u8hJhpWcB8GfnpnLCuRztPD6qgqbtT6NBKMLVMqYc6N` (currently targeted)

## 5. Summary of Data to be Indexed and Utilized

The Substream provides a structured feed of the following events, which are critical for the lend/borrow market:

- **For Wormhole `PostMessage` / `PostMessageUnreliable` (Outgoing from Solana):**

  - Transaction Signature
  - Block Slot & Time
  - Instruction Index
  - **Emitter Address (Solana account initiating the bridge-out)**
  - Nonce
  - **Raw Payload (bytes - requires further application-specific decoding)**
  - Consistency Level
  - Payer Address

- **For Wormhole `PostVAA` (Incoming to Solana):**

  - Transaction Signature
  - Block Slot & Time
  - Instruction Index
  - VAA Version
  - VAA Guardian Set Index
  - VAA Timestamp
  - VAA Nonce
  - **VAA Emitter Chain ID (Source chain)**
  - **VAA Emitter Address (Source contract/user address on the other chain)**
  - VAA Sequence
  - VAA Consistency Level
  - **Raw Payload (bytes - contains application-specific instructions, requires further decoding)**
  - Payer Address (who submitted the VAA to Solana)

- **For Metaplex `CreateMetadataAccountV3` / `UpdateMetadataAccountV2`:**

  - Transaction Signature
  - Block Slot & Time
  - Instruction Index
  - **Token Mint Account**
  - **Update Authority**
  - **Metadata Name**
  - **Metadata Symbol**
  - **Metadata URI**
  - **Seller Fee Basis Points**
  - **Creators**
  - **Collection Details**
  - **Uses**
  - **Is Mutable**
  - Payer Address (who paid for the metadata transaction)

This detailed, structured data will allow the lend/borrow application to react to cross-chain events, update user balances, manage collateral, track token characteristics, and trigger other necessary on-chain or off-chain logic.
