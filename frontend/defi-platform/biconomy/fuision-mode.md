# MEE + Fusion (External Wallets)

External wallets, such as MetaMask or Rabby, do not permit direct installation of smart account logic on EOAs. To enable MEE orchestration in this case, **Fusion Mode** is used. It relies on a passthrough mechanism involving a Companion smart account and a signed **trigger transaction**.

<img style={{ height: 400 }} src="https://i.imgur.com/G5EvlNe.png" />

<Note>
  We recommend understanding Fusion Execution before executing code, but if you'd like to skip the theory - [read the code guide](/new/getting-started/pay-gas-erc20-token#-2-fusion-mode-used-with-external-wallets)
</Note>

## Fusion Mode Flow

<Steps>
  <Step title="Trigger Signature">
    The user signs a *trigger transaction* that includes the hash of all orchestration instructions. This signature authorizes the full orchestration with a single user action.
  </Step>

  <Step title="Funds Transferred to Companion Account">
    Funds are temporarily pulled into a *Companion Account* fully owned by the user. This account is non-custodial and stateless—no funds are stored there beyond execution.
  </Step>

  <Step title="Instruction Execution">
    All instructions (e.g., swaps, bridges, multicalls) are executed using the Companion Account.
  </Step>

  <Step title="Return to EOA">
    Resulting assets are sent back to the user's EOA. The Companion Account is left clean with no dust.
  </Step>

  <Step title="Optional Cleanup">
    If an orchestration step fails—especially in multichain setups—a cleanup can revert intermediate steps, returning funds or rebalancing tokens.
  </Step>
</Steps>

Fusion Mode allows orchestrated execution even without embedded wallet features, enabling advanced UX with any external wallet.

## Trigger Types

There are two kinds of Fusion triggers. They depend on which type of token you are using as the input token.

If you're working with tokens which support `ERC20Permit` then you can use the `ERC20Permit` trigger type, which makes the entire orchestration gasless. Otherwise, you must use the `Onchain Tx` trigger, which requires a bit of gas on source chain to execute the `approve` ERC20 transaction.

<Table>
  <thead>
    <tr>
      <th>Trigger Type</th>
      <th>How it Works</th>
      <th>Gas Required</th>
      <th>Token Support</th>
    </tr>
  </thead>

  <tbody>
    <tr>
      <td>**ERC20Permit**</td>
      <td>Uses ERC-2612 signature to permit spending. Orchestration hash is packed into the `deadline` field.</td>
      <td>No</td>
      <td>Only ERC-2612 tokens</td>
    </tr>

    <tr>
      <td>**Onchain Tx**</td>
      <td>Any EVM transaction that includes orchestration instructions. Most often an `approve()` call.</td>
      <td>Yes</td>
      <td>All token types</td>
    </tr>
  </tbody>
</Table>

The SDK will detect whether a token supports ERC-2612 and choose the appropriate trigger type.

## Fusion Constraints

* Can **only consume one token per user signature**.
* Token used for execution must also be used to pay for gas.
* **Transaction sponsorship** is possible and bypasses the gas requirement.

## Fusion Flow

1. **Trigger**: User signs a transaction (e.g. `approve`) that signals orchestration.
2. **Orchestrate**: MEE nodes execute function calls, bridges, or other logic.
3. **Return**: Final steps return assets to the user's EOA.

<Info>
  **Stateless UX**: Users never need to know about the orchestrator account. All resulting tokens return to the user's EOA automatically.
</Info>