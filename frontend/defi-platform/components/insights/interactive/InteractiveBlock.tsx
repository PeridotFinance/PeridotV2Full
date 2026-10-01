"use client"

import type { InsightsBlock } from "./types"
import { CheckpointBlock } from "./CheckpointBlock"
import { CalculatorBlock } from "./CalculatorBlock"
import { PredictBlock } from "./PredictBlock"
import { JengaBlock } from "./JengaBlock"
import { VaultBuilder } from "./VaultBuilder"
import { BorrowingPowerStack } from "./BorrowingPowerStack"
import { LeverageSeesaw } from "./LeverageSeesaw"
import { RateHighway } from "./RateHighway"
import { LiquidationDominoes } from "./LiquidationDominoes"
import { ApySnowball } from "./ApySnowball"
import { PositionBuilder } from "./PositionBuilder"

export function InteractiveBlock({ block }: { block: InsightsBlock }) {
  switch (block.type) {
    case "checkpoint":
      return <CheckpointBlock question={block.question} options={block.options} />
    case "calculator":
      return <CalculatorBlock variant={block.variant} label={block.label} />
    case "predict":
      return (
        <PredictBlock
          prompt={block.prompt}
          options={block.options}
          correctIndex={block.correctIndex}
          reveal={block.reveal}
        />
      )
    case "jenga":
      return (
        <JengaBlock
          loanAmount={block.loanAmount}
          liqLtv={block.liqLtv}
          initialBlocks={block.initialBlocks}
        />
      )
    case "vault-builder":
      return (
        <VaultBuilder
          initialCoins={block.initialCoins}
          targetCollateral={block.targetCollateral}
        />
      )
    case "borrowing-power":
      return <BorrowingPowerStack assets={block.assets} />
    case "leverage-seesaw":
      return <LeverageSeesaw maxLeverage={block.maxLeverage} />
    case "rate-highway":
      return <RateHighway kinkUtilization={block.kinkUtilization} />
    case "liquidation-dominoes":
      return <LiquidationDominoes />
    case "apy-snowball":
      return <ApySnowball rate={block.rate} months={block.months} />
    case "position-builder":
      return <PositionBuilder />
    default:
      return null
  }
}
