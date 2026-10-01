import type { ComponentType } from "react"
import WhatIsPeridot from "./what-is-peridot"
import Quickstart from "./quickstart"
import EasyAndExpertMode from "./easy-and-expert-mode"
import NetworksAndAssets from "./networks-and-assets"
import SupplyingAndPTokens from "./supplying-and-ptokens"
import InterestRates from "./interest-rates"
import BorrowingAndCollateral from "./borrowing-and-collateral"
import HealthFactorAndLiquidation from "./health-factor-and-liquidation"
import ApyAndRewards from "./apy-and-rewards"
import Risks from "./risks"
import PortfolioAndActivity from "./portfolio-and-activity"
import AddAndWithdrawMoney from "./add-and-withdraw-money"
import MarginTrading from "./margin-trading"
import PointsAndLeaderboard from "./points-and-leaderboard"

/** slug (see lib/docs/registry.ts) → content component */
export const DOC_CONTENT: Record<string, ComponentType> = {
  "what-is-peridot": WhatIsPeridot,
  quickstart: Quickstart,
  "easy-and-expert-mode": EasyAndExpertMode,
  "networks-and-assets": NetworksAndAssets,
  "supplying-and-ptokens": SupplyingAndPTokens,
  "interest-rates": InterestRates,
  "borrowing-and-collateral": BorrowingAndCollateral,
  "health-factor-and-liquidation": HealthFactorAndLiquidation,
  "apy-and-rewards": ApyAndRewards,
  risks: Risks,
  "portfolio-and-activity": PortfolioAndActivity,
  "add-and-withdraw-money": AddAndWithdrawMoney,
  "margin-trading": MarginTrading,
  "points-and-leaderboard": PointsAndLeaderboard,
}
