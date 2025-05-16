mod pb; // Reference the auto-generated protobuf code

use borsh::BorshDeserialize;
use pb::spl_token::v1::{MintOrBurnEvent, MintOrBurnEvents, EventType}; // SPL Token specific
// use solana_program::pubkey::Pubkey; // Marked as unused by the compiler
use substreams_solana::pb::sf::solana::r#type::v1::Block;

// Metaplex related imports
use crate::pb::peridot::metaplex::v1::{
    MetaplexEvent, MetaplexEvents, MetaplexTokenMetadata, MetaplexCreator, MetaplexCollection,
    MetaplexUses, MetaplexCollectionDetails, CreateMetadataAccountV3Data, UpdateMetadataAccountV2Data,
    metaplex_collection_details::V1 as ProtoCollectionDetailsV1, MetaplexUseMethod as ProtoUseMethod
};
use mpl_token_metadata::types::{
    CollectionDetails as MplCollectionDetails, Creator as MplCreator, Collection as MplCollection,
    Uses as MplUses, DataV2 as MplDataV2, UseMethod as MplUseMethod
};
use mpl_token_metadata::instructions::{
    CreateMetadataAccountV3InstructionArgs as CreateMetadataAccountArgsV3,
    UpdateMetadataAccountV2InstructionArgs as UpdateMetadataAccountArgsV2
};
// use mpl_token_metadata::accounts::Metadata as TokenMetadata; // Marked as unused by the compiler

use prost_types::Timestamp;

// --- SPL Token Instruction Argument Structs ---
// These structs represent the DATA part of the instructions.
// The accounts involved are passed separately in the CompiledInstruction.

// Data for MintTo instruction (discriminator 7)
// Expected layout: [7, amount: u64]
#[derive(BorshDeserialize, Debug)]
struct MintToArgs {
    amount: u64,
}

// Data for Burn instruction (discriminator 8)
// Expected layout: [8, amount: u64]
#[derive(BorshDeserialize, Debug)]
struct BurnArgs {
    amount: u64,
}

// SPL Token Program ID
const SPL_TOKEN_PROGRAM_ID: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// Helper to safely get account bytes as base58 string
fn get_account_b58(accounts: &[Vec<u8>], index: u8) -> String {
    accounts.get(index as usize)
        .map_or_else(String::new, |acc_bytes| bs58::encode(acc_bytes).into_string())
}

// Helper to convert mpl_token_metadata Creator to Protobuf Creator
fn convert_mpl_creator_to_pb(mpl_creator: &MplCreator) -> MetaplexCreator {
    MetaplexCreator {
        address: mpl_creator.address.to_string(),
        verified: mpl_creator.verified,
        share: mpl_creator.share as u32,
    }
}

// Helper to convert mpl_token_metadata Collection to Protobuf Collection
fn convert_mpl_collection_to_pb(mpl_collection: &MplCollection) -> MetaplexCollection {
    MetaplexCollection {
        verified: mpl_collection.verified,
        key: mpl_collection.key.to_string(),
    }
}

// Helper to convert mpl_token_metadata Uses to Protobuf Uses
fn convert_mpl_uses_to_pb(mpl_uses: &MplUses) -> MetaplexUses {
    MetaplexUses {
        use_method: match mpl_uses.use_method {
            MplUseMethod::Burn => ProtoUseMethod::Burn as i32,
            MplUseMethod::Multiple => ProtoUseMethod::Multiple as i32,
            MplUseMethod::Single => ProtoUseMethod::Single as i32,
        },
        remaining: mpl_uses.remaining,
        total: mpl_uses.total,
    }
}

// Helper to convert mpl_token_metadata DataV2 to Protobuf MetaplexTokenMetadata
fn convert_mpl_data_v2_to_pb(mpl_data: &MplDataV2) -> MetaplexTokenMetadata {
    MetaplexTokenMetadata {
        name: mpl_data.name.clone(),
        symbol: mpl_data.symbol.clone(),
        uri: mpl_data.uri.clone(),
        seller_fee_basis_points: mpl_data.seller_fee_basis_points as u32,
        creators: mpl_data.creators.as_ref().map_or_else(Vec::new, |creators| {
            creators.iter().map(convert_mpl_creator_to_pb).collect()
        }),
        collection: mpl_data.collection.as_ref().map(convert_mpl_collection_to_pb),
        uses: mpl_data.uses.as_ref().map(convert_mpl_uses_to_pb),
    }
}

const TOKEN_METADATA_PROGRAM_ID: &str = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const METAPLEX_CREATE_V3_DISCRIMINATOR: u8 = 33;
const METAPLEX_UPDATE_V2_DISCRIMINATOR: u8 = 15;

#[substreams::handlers::map]
fn map_metaplex_events(block: Block) -> Result<MetaplexEvents, substreams::errors::Error> {
    let mut events = vec![];
    let metaplex_program_id_bytes = bs58::decode(TOKEN_METADATA_PROGRAM_ID)
        .into_vec()
        .map_err(|e| substreams::errors::Error::msg(format!("Failed to decode Metaplex Program ID: {}", e)))?;

    for trx in block.transactions.iter().filter(|trx| trx.meta().is_some()) {
        let meta = trx.meta.as_ref().unwrap();
        if meta.err.is_some() {
            continue; // Skip failed transactions
        }

        let msg = trx.transaction.as_ref().unwrap().message.as_ref().unwrap();
        let account_keys_raw = &msg.account_keys; // Raw account keys (Vec<Vec<u8>>)
        
        let payer_address = account_keys_raw.get(0).map_or_else(String::new, |pk_bytes| bs58::encode(pk_bytes).into_string());


        for (idx, inst) in msg.instructions.iter().enumerate() {
            let program_id_index = inst.program_id_index as usize;
            let program_id_bytes = account_keys_raw.get(program_id_index);

            if program_id_bytes.is_none() || program_id_bytes.unwrap().as_slice() != metaplex_program_id_bytes.as_slice() {
                continue; // Not a Metaplex instruction
            }

            let instruction_discriminator = inst.data.first().copied();
            let instruction_data_slice = if inst.data.len() > 1 { &inst.data[1..] } else { &[] };

            let block_time_timestamp = block.block_time.as_ref().map(|t| Timestamp {
                seconds: t.timestamp,
                nanos: 0,
            });
            let tx_hash = bs58::encode(&trx.transaction.as_ref().unwrap().signatures[0]).into_string();


            match instruction_discriminator {
                Some(METAPLEX_CREATE_V3_DISCRIMINATOR) => {
                    if let Ok(args) = CreateMetadataAccountArgsV3::try_from_slice(instruction_data_slice) {
                        substreams::log::info!("Decoded CreateMetadataAccountArgsV3: {:?}", args);
                        
                        let metadata_account_address = inst.accounts.get(0).map_or_else(String::new, |&acc_idx| get_account_b58(account_keys_raw, acc_idx));
                        let token_mint_account_address = inst.accounts.get(1).map_or_else(String::new, |&acc_idx| get_account_b58(account_keys_raw, acc_idx));
                        // inst.accounts[2] is mint_authority
                        // inst.accounts[3] is payer (already captured as payer_address)
                        let update_authority_address = inst.accounts.get(4).map_or_else(String::new, |&acc_idx| get_account_b58(account_keys_raw, acc_idx));


                        let pb_data = convert_mpl_data_v2_to_pb(&args.data);
                        let pb_collection_details = args.collection_details.map(|cd| {
                            match cd {
                                MplCollectionDetails::V1 { size } => MetaplexCollectionDetails {
                                    details: Some(crate::pb::peridot::metaplex::v1::metaplex_collection_details::Details::V1(ProtoCollectionDetailsV1 { size })),
                                },
                                MplCollectionDetails::V2 { padding: _ } => {
                                    substreams::log::info!("Encountered CollectionDetails::V2, currently not processed. Tx: {}", tx_hash);
                                    // Return a default/empty MetaplexCollectionDetails or handle as needed.
                                    // For now, effectively skipping it by not assigning to pb_collection_details within this arm directly,
                                    // relying on the outer .map() to produce None if this is the only variant encountered and not re-assigned.
                                    // To be more explicit, we could return a default MetaplexCollectionDetails, but that might imply it *was* processed.
                                    // Let's return an empty one, signifying we acknowledged it but have no specific data for it in proto.
                                    MetaplexCollectionDetails { details: None }
                                }
                            }
                        });

                        events.push(MetaplexEvent {
                            tx_hash: tx_hash.clone(),
                            block_slot: block.slot,
                            block_time: block_time_timestamp.clone(),
                            instruction_index: idx as u32,
                            payer_address: payer_address.clone(),
                            token_mint_account: token_mint_account_address,
                            metadata_account: metadata_account_address,
                            update_authority: update_authority_address,
                            event_type: Some(crate::pb::peridot::metaplex::v1::metaplex_event::EventType::CreateMetadataV3(
                                CreateMetadataAccountV3Data {
                                    data: Some(pb_data),
                                    is_mutable: args.is_mutable,
                                    collection_details: pb_collection_details,
                                }
                            )),
                        });
                    } else {
                        substreams::log::info!("Failed to decode CreateMetadataAccountArgsV3 data (len {}): tx {}", instruction_data_slice.len(), tx_hash);
                    }
                }
                Some(METAPLEX_UPDATE_V2_DISCRIMINATOR) => {
                    if let Ok(args) = UpdateMetadataAccountArgsV2::try_from_slice(instruction_data_slice) {
                        substreams::log::info!("Decoded UpdateMetadataAccountArgsV2: {:?}", args);

                        let metadata_account_address = inst.accounts.get(0).map_or_else(String::new, |&acc_idx| get_account_b58(account_keys_raw, acc_idx));
                        let update_authority_signer_address = inst.accounts.get(1).map_or_else(String::new, |&acc_idx| get_account_b58(account_keys_raw, acc_idx));
                        
                        let pb_data = args.data.as_ref().map(convert_mpl_data_v2_to_pb);

                        events.push(MetaplexEvent {
                            tx_hash: tx_hash.clone(),
                            block_slot: block.slot,
                            block_time: block_time_timestamp.clone(),
                            instruction_index: idx as u32,
                            payer_address: payer_address.clone(),
                            token_mint_account: String::new(), // Not easily available from update instruction data directly
                            metadata_account: metadata_account_address,
                            update_authority: update_authority_signer_address, // This is the signer
                            event_type: Some(crate::pb::peridot::metaplex::v1::metaplex_event::EventType::UpdateMetadataV2(
                                UpdateMetadataAccountV2Data {
                                    data: pb_data,
                                    new_update_authority: args.new_update_authority.map(|pk| pk.to_string()),
                                    primary_sale_happened: args.primary_sale_happened,
                                    is_mutable: args.is_mutable,
                                }
                            )),
                        });
                    } else {
                        substreams::log::info!("Failed to decode UpdateMetadataAccountArgsV2 data (len {}): tx {}", instruction_data_slice.len(), tx_hash);
                    }
                }
                _ => {
                    // Intentionally ignoring other Metaplex instructions
                }
            }
        }
    }

    Ok(MetaplexEvents { events })
}

#[substreams::handlers::map]
fn map_spl_mint_burn(block: Block) -> Result<MintOrBurnEvents, substreams::errors::Error> {
    let mut events = vec![];
    let spl_token_program_id_bytes = bs58::decode(SPL_TOKEN_PROGRAM_ID)
        .into_vec()
        .map_err(|e| substreams::errors::Error::msg(format!("Failed to decode SPL Token Program ID: {}", e)))?;

    for trx in block.transactions.iter().filter(|trx| trx.meta().is_some()) {
        let meta = trx.meta.as_ref().unwrap();
        if meta.err.is_some() {
            continue; // Skip failed transactions
        }

        let msg = trx.transaction.as_ref().unwrap().message.as_ref().unwrap();
        let accounts = &msg.account_keys; // Reference to the list of accounts in the transaction

        for (idx, inst) in msg.instructions.iter().enumerate() {
            let program_id_bytes = accounts.get(inst.program_id_index as usize);

            // Check if the instruction is for the SPL Token program
            if program_id_bytes.map_or(false, |bytes| bytes.as_slice() == spl_token_program_id_bytes.as_slice()) {

                // Identify instruction by discriminator (first byte of data)
                match inst.data.first() {
                    // MintTo instruction discriminator (decimal 7)
                    Some(&7) => {
                        // Expected accounts for MintTo:
                        // 0: Mint account
                        // 1: Destination token account
                        // 2: Mint authority
                        if inst.accounts.len() < 3 {
                             substreams::log::info!("Skipping MintTo instruction with insufficient accounts: tx {}", bs58::encode(&trx.transaction.as_ref().unwrap().signatures[0]).into_string());
                             continue;
                        }
                        if let Ok(args) = MintToArgs::try_from_slice(&inst.data[1..]) {
                            events.push(MintOrBurnEvent {
                                tx_signature: bs58::encode(&trx.transaction.as_ref().unwrap().signatures[0]).into_string(),
                                block_slot: block.slot,
                                block_time: block.block_time.as_ref().map_or(0, |t| t.timestamp),
                                instruction_index: idx as u32,
                                event_type: EventType::Mint as i32,
                                program_id: SPL_TOKEN_PROGRAM_ID.to_string(),
                                mint_account: get_account_b58(accounts, inst.accounts[0]),
                                token_account: get_account_b58(accounts, inst.accounts[1]),
                                authority: get_account_b58(accounts, inst.accounts[2]),
                                amount: args.amount,
                            });
                        } else {
                             substreams::log::info!("Failed to decode MintTo data (len {}): tx {}", inst.data.len(), bs58::encode(&trx.transaction.as_ref().unwrap().signatures[0]).into_string());
                        }
                    }
                    // Burn instruction discriminator (decimal 8)
                    Some(&8) => {
                        // Expected accounts for Burn:
                        // 0: Source token account
                        // 1: Mint account
                        // 2: Owner/Delegate authority
                         if inst.accounts.len() < 3 {
                             substreams::log::info!("Skipping Burn instruction with insufficient accounts: tx {}", bs58::encode(&trx.transaction.as_ref().unwrap().signatures[0]).into_string());
                             continue;
                        }
                        if let Ok(args) = BurnArgs::try_from_slice(&inst.data[1..]) {
                             events.push(MintOrBurnEvent {
                                tx_signature: bs58::encode(&trx.transaction.as_ref().unwrap().signatures[0]).into_string(),
                                block_slot: block.slot,
                                block_time: block.block_time.as_ref().map_or(0, |t| t.timestamp),
                                instruction_index: idx as u32,
                                event_type: EventType::Burn as i32,
                                program_id: SPL_TOKEN_PROGRAM_ID.to_string(),
                                mint_account: get_account_b58(accounts, inst.accounts[1]),
                                token_account: get_account_b58(accounts, inst.accounts[0]), // Source account
                                authority: get_account_b58(accounts, inst.accounts[2]),
                                amount: args.amount,
                            });
                        } else {
                            substreams::log::info!("Failed to decode Burn data (len {}): tx {}", inst.data.len(), bs58::encode(&trx.transaction.as_ref().unwrap().signatures[0]).into_string());
                        }
                    }
                    _ => {
                        // Intentionally ignoring other SPL Token instructions
                    }
                }
            }
        }
    }

    Ok(MintOrBurnEvents { events })
}

// --- Wormhole Specific Code ---

// Import Wormhole protobuf types, aliasing to avoid potential conflicts
use pb::wormhole::v1::{
    WormholeEvent,
    WormholeEvents,
    PostedMessageData as WormholePostedMessageProto,
    PostedVaaData as WormholePostedVAAProto,
    PostedMessageUnreliableData as WormholePostedMessageUnreliableProto,
    InstructionType as WormholeInstructionTypePb,
};

// Wormhole Program ID on Solana Devnet
const WORMHOLE_PROGRAM_ID: &str = "3u8hJhpWcB8GfnpnLCuRztPD6qgqbtT6NBKMLVMqYc6N"; // Changed to Devnet ID

// Internal struct mirroring wormhole bridge's PostMessageData
// (nonce: u32, payload: Vec<u8>, consistency_level: u8)
#[derive(BorshDeserialize, Debug)]
struct WormholePostMessageDataInternal {
    nonce: u32,
    payload: Vec<u8>,
    consistency_level: u8, // Actually a ConsistencyLevel enum in wormhole, u8 when serialized
}

// Internal struct mirroring wormhole bridge's PostVAAData (the VAA itself for post_vaa instruction)
// (version: u8, guardian_set_index: u32, timestamp: u32, nonce: u32, emitter_chain: u16, emitter_address: [u8;32], sequence: u64, consistency_level: u8, payload: Vec<u8>)
#[derive(BorshDeserialize, Debug)]
struct WormholePostVAADataInternal {
    version: u8,
    guardian_set_index: u32,
    timestamp: u32,
    nonce: u32,
    emitter_chain: u16,
    emitter_address: [u8; 32],
    sequence: u64,
    consistency_level: u8, // Actually a ConsistencyLevel enum, u8 when serialized
    payload: Vec<u8>,
}

#[substreams::handlers::map]
fn map_wormhole_events(block: Block) -> Result<WormholeEvents, substreams::errors::Error> {
    let mut events = vec![];
    let wormhole_program_id_bytes = bs58::decode(WORMHOLE_PROGRAM_ID)
        .into_vec()
        .map_err(|e| substreams::errors::Error::msg(format!("Failed to decode Wormhole Program ID: {}", e)))?;

    for trx in block.transactions.iter().filter(|trx| trx.meta().is_some()) {
        let meta = trx.meta.as_ref().unwrap();
        if meta.err.is_some() {
            continue; // Skip failed transactions
        }

        let msg = trx.transaction.as_ref().unwrap().message.as_ref().unwrap();
        let accounts = &msg.account_keys; // Transaction-wide accounts
        let tx_signature = bs58::encode(&trx.transaction.as_ref().unwrap().signatures[0]).into_string();

        for (idx, inst) in msg.instructions.iter().enumerate() {
            let program_id_acct_bytes = accounts.get(inst.program_id_index as usize);

            if program_id_acct_bytes.map_or(false, |bytes| bytes.as_slice() == wormhole_program_id_bytes.as_slice()) {
                let instruction_data = &inst.data;
                
                // Wormhole instruction discriminators are single bytes at the start
                match instruction_data.first() {
                    Some(&1) => { // PostMessage instruction
                        if let Ok(args) = WormholePostMessageDataInternal::try_from_slice(&instruction_data[1..]) {
                            // Account indices for PostMessage (from wormhole/solana/bridge/program/src/instructions.rs):
                            // accounts[2] is emitter (signer)
                            // accounts[4] is payer (signer)
                            let emitter_address = get_account_b58(accounts, inst.accounts.get(2).copied().unwrap_or_default());
                            let payer_address = get_account_b58(accounts, inst.accounts.get(4).copied().unwrap_or_default());

                            events.push(WormholeEvent {
                                tx_signature: tx_signature.clone(),
                                block_slot: block.slot,
                                block_time: block.block_time.as_ref().map_or(0, |t| t.timestamp),
                                instruction_type: WormholeInstructionTypePb::PostMessage as i32,
                                instruction_index: idx as u32,
                                event_data: Some(pb::wormhole::v1::wormhole_event::EventData::PostedMessage(
                                    WormholePostedMessageProto {
                                        emitter: emitter_address,
                                        nonce: args.nonce,
                                        payload: args.payload,
                                        consistency_level: args.consistency_level as u32,
                                        payer: payer_address,
                                    }
                                )),
                            });
                        } else {
                            substreams::log::info!("Failed to decode Wormhole PostMessage data (len {}): tx {}", instruction_data.len(), tx_signature);
                        }
                    }
                    Some(&2) => { // PostVAA instruction
                        if let Ok(args) = WormholePostVAADataInternal::try_from_slice(&instruction_data[1..]) {
                            // Account indices for PostVAA:
                            // accounts[4] is payer (signer)
                            let payer_address = get_account_b58(accounts, inst.accounts.get(4).copied().unwrap_or_default());
                            
                            events.push(WormholeEvent {
                                tx_signature: tx_signature.clone(),
                                block_slot: block.slot,
                                block_time: block.block_time.as_ref().map_or(0, |t| t.timestamp),
                                instruction_type: WormholeInstructionTypePb::PostVaa as i32,
                                instruction_index: idx as u32,
                                event_data: Some(pb::wormhole::v1::wormhole_event::EventData::PostedVaa(
                                    WormholePostedVAAProto {
                                        version: args.version as u32,
                                        guardian_set_index: args.guardian_set_index,
                                        vaa_timestamp: args.timestamp,
                                        vaa_nonce: args.nonce,
                                        emitter_chain: args.emitter_chain as u32,
                                        emitter_address: args.emitter_address.to_vec(),
                                        sequence: args.sequence,
                                        consistency_level: args.consistency_level as u32,
                                        payload: args.payload,
                                        payer: payer_address,
                                    }
                                )),
                            });
                        } else {
                            substreams::log::info!("Failed to decode Wormhole PostVAA data (len {}): tx {}", instruction_data.len(), tx_signature);
                        }
                    }
                    Some(&8) => { // PostMessageUnreliable instruction (same data structure as PostMessage)
                         if let Ok(args) = WormholePostMessageDataInternal::try_from_slice(&instruction_data[1..]) {
                            // Account indices for PostMessageUnreliable (same as PostMessage for emitter & payer):
                            // accounts[2] is emitter (signer)
                            // accounts[4] is payer (signer)
                            let emitter_address = get_account_b58(accounts, inst.accounts.get(2).copied().unwrap_or_default());
                            let payer_address = get_account_b58(accounts, inst.accounts.get(4).copied().unwrap_or_default());

                            events.push(WormholeEvent {
                                tx_signature: tx_signature.clone(),
                                block_slot: block.slot,
                                block_time: block.block_time.as_ref().map_or(0, |t| t.timestamp),
                                instruction_type: WormholeInstructionTypePb::PostMessageUnreliable as i32,
                                instruction_index: idx as u32,
                                event_data: Some(pb::wormhole::v1::wormhole_event::EventData::PostedMessageUnreliable(
                                    WormholePostedMessageUnreliableProto {
                                        emitter: emitter_address,
                                        nonce: args.nonce,
                                        payload: args.payload,
                                        consistency_level: args.consistency_level as u32,
                                        payer: payer_address,
                                    }
                                )),
                            });
                        } else {
                            substreams::log::info!("Failed to decode Wormhole PostMessageUnreliable data (len {}): tx {}", instruction_data.len(), tx_signature);
                        }
                    }
                    _ => {
                        // Intentionally ignoring other Wormhole instructions
                        // substreams::log::info!("Other Wormhole instruction with discriminator: {:?}, tx: {}", instruction_data.first(), tx_signature);
                    }
                }
            }
        }
    }
    Ok(WormholeEvents { events })
}
