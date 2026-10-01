// Re-export shim. The button-phase copy now lives in the unified `lib/tx/txCopy`
// module (shared with the toast + terminal states). Kept here so existing
// imports (`hooks/use-tx-busy-phase` and others) stay valid.
export { busyPhaseLabel, type TxBusyPhase, type TxAction } from "@/lib/tx/txCopy"
