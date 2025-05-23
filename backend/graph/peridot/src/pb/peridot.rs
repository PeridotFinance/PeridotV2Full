// @generated
// This file is @generated by prost-build.
/// Define the structure for our output data
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct MetadataEvents {
    #[prost(message, repeated, tag="1")]
    pub events: ::prost::alloc::vec::Vec<MetadataEvent>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct MetadataEvent {
    /// Transaction ID
    #[prost(string, tag="1")]
    pub tx_signature: ::prost::alloc::string::String,
    #[prost(uint64, tag="2")]
    pub block_slot: u64,
    /// Unix timestamp
    #[prost(int64, tag="3")]
    pub block_time: i64,
    /// "CreateMetadataV3" or "UpdateMetadataV2"
    #[prost(string, tag="4")]
    pub instruction_type: ::prost::alloc::string::String,
    /// Mint address
    #[prost(string, tag="5")]
    pub mint: ::prost::alloc::string::String,
    /// Metadata account address
    #[prost(string, tag="6")]
    pub metadata_pda: ::prost::alloc::string::String,
    #[prost(string, tag="7")]
    pub update_authority: ::prost::alloc::string::String,
    #[prost(string, tag="8")]
    pub name: ::prost::alloc::string::String,
    #[prost(string, tag="9")]
    pub symbol: ::prost::alloc::string::String,
    #[prost(string, tag="10")]
    pub uri: ::prost::alloc::string::String,
    /// Add other fields you might need, like creators, sellerFeeBasisPoints etc.
    #[prost(bool, tag="11")]
    pub is_mutable: bool,
}
// @@protoc_insertion_point(module)
