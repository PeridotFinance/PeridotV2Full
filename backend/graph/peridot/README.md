# peridot Substreams modules

This package was initialized via `substreams init`, using the `sol-minimal` template, and has been extended to include mappers for SPL Token, Wormhole, and Metaplex Token Metadata events.

## Usage

```bash
substreams build
substreams auth
substreams gui       			  # Get streaming!
```

Optionally, you can publish your Substreams to the [Substreams Registry](https://substreams.dev).

```bash
substreams registry login         # Login to substreams.dev
substreams registry publish       # Publish your Substreams to substreams.dev
```

## Modules

This Substream is designed to extract and structure data related to SPL Tokens, Wormhole bridge interactions, and Metaplex Token Metadata from the Solana blockchain.

### Filter Modules (Inputs)

Several modules are used to pre-filter transactions based on program IDs:

- **`map_filtered_transactions`**: Retrieves Solana transactions filtered for the SPL Token Program ID (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`). This serves as input for `map_spl_mint_burn`.
- **`map_filtered_wormhole_transactions`**: Retrieves Solana transactions filtered for the Wormhole Program ID (e.g., `3u8hJhpWcB8GfnpnLCuRztPD6qgqbtT6NBKMLVMqYc6N` on Devnet). This serves as input for `map_wormhole_events`.
- **`map_filtered_metaplex_transactions`**: Retrieves Solana transactions filtered for the Metaplex Token Metadata Program ID (`metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`). This serves as input for `map_metaplex_events`.

These modules utilize the `solana:transactions_by_programid_without_votes` Substream imported as `solana`. Transactions containing voting instructions are excluded.

### Data Mapping Modules

- **`map_spl_mint_burn`**

  - **Input**: `map_filtered_transactions`
  - **Output**: `proto:spl_token.v1.MintOrBurnEvents`
  - **Description**: This module processes transactions from the SPL Token program, specifically identifying and decoding `MintTo` and `Burn` instructions. It extracts details like mint account, token account, authority, and amount.

- **`map_wormhole_events`**

  - **Input**: `map_filtered_wormhole_transactions`
  - **Output**: `proto:wormhole.v1.WormholeEvents`
  - **Description**: This module focuses on interactions with the Wormhole bridge program. It decodes instructions like `PostMessage` and `PostVAA`, extracting data such as emitter, payload, consistency level, and VAA details.

- **`map_metaplex_events`**
  - **Input**: `map_filtered_metaplex_transactions`
  - **Output**: `proto:peridot.metaplex.v1.MetaplexEvents`
  - **Description**: This module processes transactions interacting with the Metaplex Token Metadata program. It identifies and decodes instructions for creating (`CreateMetadataAccountV3`) and updating (`UpdateMetadataAccountV2`) token metadata. It extracts metadata details like name, symbol, URI, creators, collection information, and mutability status.
