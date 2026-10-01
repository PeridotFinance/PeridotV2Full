# Batch Composable Cross-Chain Calls

This tutorial shows how to:

1. **Bridge** USDC from **Arbitrum** to **Base** using Across
2. **Swap** bridged USDC → WETH on Base via Uniswap V3
3. **Supply** the WETH to Morpho RE7's WETH pool
4. **Return** the RE7 vault tokens back to the user's EOA

All steps run as **one Fusion transaction** with gas paid in USDC.

## Demo of Composable Orchestration

<div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
  <iframe src="https://www.loom.com/embed/04c21d08208d4c789c6af3b4c74b1d03?sid=ddebfd28-c367-4726-82b5-c25c2eb6d3d4" frameBorder="0" allowFullScreen style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
</div>

## Why this matters

With **one user signature** you can:

* Bridge, swap, stake — any multi-step flow — without asking the user to sign again.
* Pay **all gas for every step** in **one ERC-20 (USDC)** instead of native ETH on multiple chains.
* Leave **zero "dust"**: every last token that isn't needed is auto-returned to the user.
* Keep the user in a single, familiar wallet; no pop-ups, no chain switching, no scary approvals.

### Business impact

<Table>
  <thead>
    <tr>
      <th>Pain today</th>
      <th>Benefit with this flow</th>
    </tr>
  </thead>

  <tbody>
    <tr>
      <td>Users rage-quit after the 2nd confirm</td>
      <td>**Single click** → drastically lower drop-off</td>
    </tr>

    <tr>
      <td>Confusing gas settings on multiple chains</td>
      <td>**One token, one fee** shown up front</td>
    </tr>

    <tr>
      <td>Support tickets about stuck "dust"</td>
      <td>No residual balances, fewer refunds</td>
    </tr>

    <tr>
      <td>Weeks of Solidity + audits</td>
      <td>**All TypeScript**, ship in hours</td>
    </tr>
  </tbody>
</Table>

Developers get shorter build cycles; users get a smoother checkout-style experience. That's higher conversion and faster feature delivery with almost no smart-contract risk.

## Key Concepts Used

<Table>
  <thead>
    <tr>
      <th>Concept</th>
      <th>Why it's needed</th>
    </tr>
  </thead>

  <tbody>
    <tr>
      <td>**Fusion trigger**</td>
      <td>Starts orchestration from an empty EOA with one `transfer` / `permit`</td>
    </tr>

    <tr>
      <td>**`runtimeERC20BalanceOf`**</td>
      <td>Injects *whatever* tokens arrive from bridge or swap</td>
    </tr>

    <tr>
      <td>**Constraint `greaterThanOrEqualTo`**</td>
      <td>Ensures we meet minimum slippage tolerance</td>
    </tr>

    <tr>
      <td>**`balanceNotZeroConstraint`** (implicit)</td>
      <td>Used for ordering when bridged tokens haven't landed yet</td>
    </tr>
  </tbody>
</Table>

## Code Walk‑Through

Below we highlight the critical parts of `supplyToMorpho.ts`. Full file lives in your repo.

<Steps>
  <Step title="Initialise Multichain Account & MEE Client">
    ```ts
    const oNexus = await toMultichainNexusAccount({
      signer: walletProvider,           // Embedded or EOA signer
      chainConfigurations: [
        {
          chain: arbitrum,
          transport: http(),
          version: getMEEVersion(MEEVersion.V2_1_0)
        },
        {
          chain: base,
          transport: http(),
          version: getMEEVersion(MEEVersion.V2_1_0)
        }
      ],
    });

    const meeClient = await createMeeClient({ account: oNexus });
    ```
  </Step>

  <Step title="Define Trigger & Constraints">
    ```ts
    const amountConsumed = parseUnits(amount, 6);
    const minAfterSlippage = amountConsumed * 80n / 100n;  // 20 % tolerance
    const executionConstraints = [greaterThanOrEqualTo(minAfterSlippage)];

    const transferToNexusTrigger = {
      tokenAddress: mcUSDC.addressOn(arbitrum.id),
      amount: amountConsumed,
      chainId: arbitrum.id,
    };
    ```

    <Info>
      **Why**: Fusion mode starts with an empty orchestrator. A single USDC transfer funds it and reveals the amount we'll use.
    </Info>
  </Step>

  <Step title="Bridge USDC with Across">
    Follow the [Across Integration Tutorial]() to learn how to encode Across.

    ```ts
    const depositAcrossData = await prepareAcrossBridgeTransaction({
      depositor: oNexus.addressOn(arbitrum.id),
      recipient: oNexus.addressOn(base.id),
      inputToken: mcUSDC.addressOn(arbitrum.id),
      outputToken: mcUSDC.addressOn(base.id),
      inputAmount: amountConsumed,
      originChainId: arbitrum.id,
      destinationChainId: base.id,
    });
    ```

    Two instructions are added:

    1. **Approve** USDC to Across
    2. **Raw calldata** deposit
  </Step>

  <Step title="Swap USDC → WETH on Base">
    ```ts
    const swapUSDCtoWeth = await oNexus.buildComposable({
      type: "default",
      data: {
        chainId: base.id,
        abi: UniswapSwapRouterAbi,
        to: mcUniswapSwapRouter.addressOn(base.id),
        functionName: "exactInputSingle",
        args: [{
          tokenIn: mcUSDC.addressOn(base.id),
          amountIn: runtimeERC20BalanceOf({
            tokenAddress: mcUSDC.addressOn(base.id),
            targetAddress: oNexus.addressOn(base.id, true),
            constraints: executionConstraints,
          }),
          tokenOut: weth_Base,
          recipient: oNexus.addressOn(base.id, true),
          amountOutMinimum: 0n,
          fee: 100,
          sqrtPriceLimitX96: 0n,
        }],
      },
    });
    ```

    `runtimeERC20BalanceOf` waits until bridged USDC arrives and meets `executionConstraints`.
  </Step>

  <Step title="Supply WETH to Morpho & Return Vault Tokens">
    ```ts
    const supplyToMorpho = await oNexus.buildComposable({
      type: "default",
      data: {
        abi: MorphoPoolAbi,
        to: weth_Re7_Morpho_Pool,
        chainId: base.id,
        functionName: "deposit",
        args: [
          runtimeERC20BalanceOf({
            tokenAddress: weth_Base,
            targetAddress: oNexus.addressOn(base.id, true),
            constraints: executionConstraints,
          }),
          oNexus.addressOn(base.id, true),
        ],
      },
    });
    ```

    Then transfer RE7 vault tokens back to the user EOA.
  </Step>

  <Step title="Quote & Execute Fusion Transaction">
    ```ts
    const quote = await meeClient.getFusionQuote({
      trigger: transferToNexusTrigger,
      feeToken: toFeeToken({ mcToken: mcUSDC, chainId: arbitrum.id }),
      instructions: [
        approveUsdcSpendToAcross,
        depositAcross,
        approveUniswapToSpendUSDC,
        swapUSDCtoWeth,
        approveMorphoVaultToSpendWeth,
        supplyToMorpho,
        moveRe7WethBackToEOA,
      ],
    });

    const { hash } = await meeClient.executeFusionQuote({ fusionQuote: quote });
    ```
  </Step>
</Steps>

## What You Achieved

* One signature → multi‑step, cross‑chain flow
* Gas paid in USDC, no ETH needed
* Exact amounts supplied, no guesswork
* Vault tokens automatically returned to user

Extend this flow by adding staking, leverage, or any other operation—without writing Solidity.