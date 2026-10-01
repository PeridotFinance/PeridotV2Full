# Execute Composable Batch Calls

This tutorial demonstrates how to execute a **fully gas-abstracted, multi-step transaction** on Base using one user signature. No bridging. No leftover tokens. Just one-click UX with **gas paid in USDC** and a guarantee that either **all instructions succeed or none do**.

Unlike regular batch execute, composable batch execution allows developers to use the output of one function call as the input for the next one. To learn more, read the [Runtime Parameter Injection](/new/getting-started/understanding-runtime-injection) guide.

<Tip>
  **Single Chain**: This guide covers single-chain batch execution. The Biconomy stack supports multi-chain batch execution with a single signature as well. Follow [this guide](/new/getting-started/orchestrate-transactions-across-chains) to learn how.
</Tip>

<Info>
  **Using EIP-7702**: This guide focuses on atomic execution from External Wallets though the usage of *Fusion Execution*. If you're working with Embedded Wallets - adapt the `toMultichainNexusAccount`, `.getQuote` and `.execute` steps to work with EIP-7702. [Follow the EIP-7702 guide here](/new/getting-started/enable-mee-eoa-7702)
</Info>

## Why Should You Care?

* **No ETH required** for gas — everything is paid in USDC.
* **Lower dropoff** in multi-step flows — users only sign once.
* **Eliminates complexity** — no frontend juggling approvals, swaps, and deposits.
* **Business win**: better UX, fewer support issues, and higher conversion.
* **Full support**: Works for all EOA users, including regular MetaMask, Rabby, Trust, etc...

<Steps>
  <Step title="Setup">
    Import all the required dependencies.

    ```ts  theme={null}
    import {
      createMeeClient,
      toMultichainNexusAccount,
      UniswapSwapRouterAbi,
      getMeeScanLink,
      runtimeERC20BalanceOf,
      greaterThanOrEqualTo,
      getMEEVersion,
      MEEVersion
    } from "@biconomy/abstractjs";

    import { http, parseUnits } from "viem";
    import { privateKeyToAccount } from "viem/accounts";
    import { base, optimism } from "viem/chains";
    import { balanceNotZeroConstraint } from "../utils/balanceNotZero.util";
    ```
  </Step>

  <Step title="Create an Orchestrator">
    An orchestrator is a smart account owned by the user. All instructions are executed on top of this account.

    ```ts  theme={null}
    const eoa = privateKeyToAccount(Bun.env.PRIVATE_KEY as `0x${string}`);

    const orchestrator = await toMultichainNexusAccount({
      chainConfigurations: [
        {
          chain: optimism,
          transport: http(),
          version: getMEEVersion(MEEVersion.V2_1_0)
        },
        {
          chain: base,
          transport: http(),
          version: getMEEVersion(MEEVersion.V2_1_0)
        }
      ],
      signer: eoa,
    });
    ```

    <Info>
      **What is Nexus?** Nexus is the engine behind composable orchestration and gasless execution. It's the most gas efficient smart account system.
    </Info>
  </Step>

  <Step title="Connect to the Modular Execution Environment (MEE)">
    Gasless multichain orchestration is enabled by connecting to the Modular Execution Environment. This is a trustless, globally distributed network of Relayer nodes executing instructions on top of smart accounts.

    ```ts  theme={null}
    const meeClient = await createMeeClient({ account: orchestrator });
    ```
  </Step>

  <Step title="Declare Constants">
    These are the contract addresses we'll need for this tutorial.

    ```ts  theme={null}
    const UNISWAP_ROUTER_BASE = "0x2626664c2603336E57B271c5C0b26F421741e481";
    const USDC_BASE           = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    const WETH_BASE           = "0x4200000000000000000000000000000000000006";
    const MORPHO_RE7_POOL     = "0xA2Cac0023a4797b4729Db94783405189a4203AFc";

    // Change to be whatever you want the input to be.
    const inputAmount = parseUnits("10", 6);
    ```
  </Step>

  <Step title="Build Instructions">
    ### Approve Uniswap

    This will encode an `ERC-20` `approve` function which approves the Uniswap contract to spend USDC.

    ```ts  theme={null}
    const approveUniswap = await orchestrator.buildComposable({
      type: "approve",
      data: {
        spender: UNISWAP_ROUTER_BASE,
        tokenAddress: USDC_BASE,
        chainId: base.id,
        amount: inputAmount,
      },
    });
    ```

    <Info>
      **Helper Function**: This is a helper. You can always encode it manually with `type: "default"` and `erc20Abi` if needed.
    </Info>

    ### Swap USDC → WETH (Runtime Injection)

    Using the `.buildComposable` helper, we are encoding a call to the `exactInputSingle` function on the Uniswap contract. This will swap USDC for WETH.

    Note the use of `runtimeERC20BalanceOf` in the `amountIn` field of the call. This means that we're not predetermining the amount being swapped - we'll use whatever is available on the orchestrator account.

    ```ts  theme={null}
    const swapUSDCtoWeth = await orchestrator.buildComposable({
      type: "default",
      data: {
        chainId: base.id,
        abi: UniswapSwapRouterAbi,
        to: UNISWAP_ROUTER_BASE,
        functionName: "exactInputSingle",
        args: [{
          tokenIn:  USDC_BASE,
          amountIn: runtimeERC20BalanceOf({
            tokenAddress: USDC_BASE,
            targetAddress: orchestrator.addressOn(base.id, true),
            constraints: [balanceNotZeroConstraint],
          }),
          tokenOut: WETH_BASE,
          recipient: orchestrator.addressOn(base.id, true),
          fee: 100,
          amountOutMinimum: 0n,
          sqrtPriceLimitX96: 0n,
        }],
      },
    });
    ```

    <Note>
      **Runtime injection** lets you defer the exact amount to use until **execution time** — crucial when the actual balance isn't known upfront.
    </Note>

    ### Approve Morpho

    This instruction approves Morpho to spend WETH. Again, note the usage of `runtimeERC20BalanceOf` function. Since we don't know how much exactly we'll get from a swap on Uniswap due to slippage - we're working with runtime values.

    Another thing to note is the `constraints` field. It defines the minimum amount of WETH on the account before the orchestration will proceed with the approve instruction.

    ```ts  theme={null}
    const approveMorpho = await orchestrator.buildComposable({
      type: "approve",
      data: {
        spender: MORPHO_RE7_POOL,
        chainId: base.id,
        tokenAddress: WETH_BASE,
        amount: runtimeERC20BalanceOf({
          tokenAddress: WETH_BASE,
          targetAddress: orchestrator.addressOn(base.id, true),
          constraints: [ balanceNotZeroConstraint ],
        }),
      },
    });
    ```

    ### Deposit WETH into Morpho

    Deposit WETH to Morpho. Ordering for this function call depends on two factors:

    * `balanceNotZeroConstraint` defines that the instruction can't be executed until the swap has happened
    * **Implicit Ordering** works here as well. The orchestrator will wait until the approval has been set

    ```ts  theme={null}
    const supplyWeth = await orchestrator.buildComposable({
      type: "default",
      data: {
        abi: [{
          name: "deposit",
          inputs: [
            { name: "assets",   type: "uint256" },
            { name: "receiver", type: "address" },
          ],
          stateMutability: "nonpayable",
          type: "function",
        }],
        to: MORPHO_RE7_POOL,
        chainId: base.id,
        functionName: "deposit",
        args: [
          runtimeERC20BalanceOf({
            tokenAddress: WETH_BASE,
            targetAddress: orchestrator.addressOn(base.id, true),
            constraints: [balanceNotZeroConstraint],
          }),
          orchestrator.addressOn(base.id, true),
        ],
      },
    });
    ```
  </Step>

  <Step title="Quote & Execute (Fusion)">
    ### Create the Fusion trigger

    In order for the orchestrator account to "pull" the funds for orchestration, we must give it an approval to do so. This is done by the `trigger` param. It tells the orchestrator which token on which chain and which amount to approve.

    [Read more about triggers](/new/getting-started/enable-mee-eoa-users#fusion-mode-orchestration-external-wallets)

    ```ts  theme={null}
    const trigger: Trigger = {
      chainId: base.id,
      tokenAddress: USDC_BASE,
      amount: inputAmount,
    };
    ```

    ### Quote the cost

    ```ts  theme={null}
    const quote = await meeClient.getFusionQuote({
      trigger,
      feeToken: { address: USDC_BASE, chainId: base.id },
      instructions: [approveUniswap, swapUSDCtoWeth, approveMorpho, supplyWeth],
    });
    ```

    ### Execute the flow

    ```ts  theme={null}
    const { hash } = await meeClient.executeFusionQuote({ fusionQuote: quote });
    console.log(`Explorer: ${getMeeScanLink(hash)}`);
    ```
  </Step>

  <Step title="Confirm Atomic Completion">
    ```ts  theme={null}
    const receipt = await meeClient.waitForSupertransactionReceipt({ hash });
    console.log("Batch complete:", receipt);
    ```

    All instructions succeed, or none are processed. Fully atomic.
  </Step>
</Steps>

## Checklist Before Production

<Card>
  <ul>
    <li>Replace `amountOutMinimum: 0n` with real slippage.</li>
    <li>Dial in `gasLimit`s to optimize quotes.</li>
    <li>Add cleanup `transfer` if leftover tokens aren't desired.</li>
    <li>Monitor quote accuracy vs. actual gas used.</li>
  </ul>
</Card>

Enjoy full-chain composability!