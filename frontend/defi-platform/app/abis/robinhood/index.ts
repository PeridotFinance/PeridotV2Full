/**
 * ABIs of the Robinhood Chain NVDA/USDG margin deployment, one export per
 * contract, keyed the way manifest.json keys its artifacts. The JSON files are
 * the deployer's handout verbatim (SHA256SUMS beside them); do not edit them,
 * replace the folder from a new handout instead.
 *
 * Addresses live in config/robinhood.ts. Errors thrown by nested calls surface
 * with the nested contract's ABI, so a decoder should try ROBINHOOD_ABIS_ALL.
 */
import executor from "./IsolatedMarginExecutorUpgradeable.abi.json"
import marginVault from "./IsolatedMarginVaultUpgradeable.abi.json"
import config from "./IsolatedMarginConfigUpgradeable.abi.json"
import riskEngine from "./IsolatedMarginRiskEngineUpgradeable.abi.json"
import quoter from "./IsolatedMarginQuoter.abi.json"
import liquidator from "./IsolatedMarginLiquidatorUpgradeable.abi.json"
import oracle from "./RobinhoodMarginPriceOracle.abi.json"
import guardedSource from "./GuardedMarginPriceSource.abi.json"
import flashVault from "./SimpleFlashLoanVault.abi.json"
import router from "./RobinhoodV4RouterAdapter.abi.json"
import swapModule from "./IsolatedMarginSwapModule.abi.json"
import accountFactory from "./IsolatedMarginAccountFactory.abi.json"
import insuranceFund from "./MarginInsuranceFundUpgradeable.abi.json"
import feeDistributor from "./MarginFeeDistributorUpgradeable.abi.json"
import pToken from "./RobinhoodBoostedDelegate.abi.json"
import erc20 from "./IERC20.abi.json"

export const ROBINHOOD_ABIS = {
  executor,
  marginVault,
  config,
  riskEngine,
  quoter,
  liquidator,
  oracle,
  guardedSource,
  flashVault,
  router,
  swapModule,
  accountFactory,
  insuranceFund,
  feeDistributor,
  pToken,
  erc20,
} as const

export type RobinhoodAbiKey = keyof typeof ROBINHOOD_ABIS

/** Every ABI concatenated, for decoding reverts that originate in a nested contract. */
export const ROBINHOOD_ABIS_ALL = Object.values(ROBINHOOD_ABIS).flat()
