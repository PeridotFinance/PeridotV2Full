# Sponsor Gas for Users

<Warning>
  **Prerequisites**: This tutorial assumes you've read the [Enable MEE for EOA Users](/new/getting-started/enable-mee-eoa-users) and understand EIP-7702 based execution and Fusion execution.
</Warning>

Gas sponsorship in Biconomy MEE allows developers to fully abstract gas costs from end-users—regardless of wallet type or chain. Whether you're building on embedded wallets with EIP-7702, using native smart contract accounts, or orchestrating through Fusion from EOAs like MetaMask, MEE provides a unified, scalable sponsorship model.

<Note>
  **Simplify Your Operations**: One gas tank. Many chains. Sponsorships can be powered across **all supported chains** from a single gas tank and infrastructure.
</Note>

This guide will:

* Introduce sponsorship across EIP-7702, Fusion, and native SCAs
* Help you choose the right flow for your app
* Walk you through enabling sponsorship
* Explain hosted vs self-hosted setups

## Sponsorship Basics

Biconomy's gas sponsorship abstracts the need for end-users to hold native gas. This is ideal for:

* Onboarding users unfamiliar with wallets
* Consumer apps where gas UX is a blocker
* Advanced orchestrations involving bridging or multicalls

Sponsorship is activated per-project via [dashboard.biconomy.io](https://dashboard.biconomy.io) and requires an `apiKey` in all requests.

## Choosing the Right Flow

<Table>
  <thead>
    <tr>
      <th>Wallet Type</th>
      <th>Flow</th>
      <th>Sponsorship Ready?</th>
      <th>Notes</th>
    </tr>
  </thead>

  <tbody>
    <tr>
      <td>Embedded Wallets</td>
      <td>EIP-7702</td>
      <td>Easy</td>
      <td>Best UX, full smart account delegation</td>
    </tr>

    <tr>
      <td>External EOAs</td>
      <td>Fusion</td>
      <td>Conditional</td>
      <td>Requires permit-supporting tokens or fallback gas</td>
    </tr>

    <tr>
      <td>Native SCAs</td>
      <td>SCA Orchestration</td>
      <td>Flexible</td>
      <td>Best for apps controlling deployment</td>
    </tr>
  </tbody>
</Table>

## EIP-7702 Sponsorship (Embedded Wallets)

EIP-7702 lets you install smart account logic **directly on EOAs**, enabling orchestration and sponsorship with zero user effort.

```ts
const quote = await meeClient.getQuote({
  sponsorship: true,
  instructions: [/* your calls here */],
  delegate: true,
  authorization // Required for 7702 accounts
});
```

<Note>
  **Full Support**: Supports all ERC-20s, multichain execution, and full transaction abstraction.
</Note>

<Info>
  **Best For**: Embedded wallets (Privy, Dynamic, Turnkey, ...)
</Info>

## Fusion Sponsorship (External Wallets)

Fusion enables orchestration from EOAs (e.g. MetaMask) via a **trigger + Companion Account** pattern. It supports sponsorship, but with caveats:

### Requirements

* Set `sponsorship: true`
* Trigger token **must support `permit()` (ERC-2612)** to be truly gasless
* Otherwise, user must have enough native gas to `approve()` token transfer

```ts
const quote = await meeClient.getFusionQuote({
  sponsorship: true,
  trigger: {
    amount: 1n,
    chainId: base.id,
    tokenAddress: usdcAddresses[base.id]
  },
  instructions: [/* your calls here */]
});
```

<Info>
  **Best For**: External Wallets - MetaMask, Trust, Rabby, Coinbase Wallet, Uniswap Wallet, ...
</Info>

## Native SCA Sponsorship (Deployed Accounts)

If you're orchestrating via **pre-deployed smart contract accounts**, you can sponsor transactions as long as the orchestrator account is set and you pass the `apiKey`.

```ts
const quote = await meeClient.getQuote({
  sponsorship: true,
  instructions: [instruction]
});
```

Works across any chain MEE supports. Best for dApps that deploy user accounts up front.

## Hosted vs Self-Hosted Sponsorship

<Tabs>
  <Tab title="Biconomy-Hosted">
    * No infra required
    * Uses Biconomy-managed gas tanks
    * Set up via dashboard
    * Supports post-paid modes with enterprise contracts or paying via credit card

    ```ts
    const meeClient = await createMeeClient({
      account: orchestrator,
      apiKey: "your_project_api_key"
    });
    ```
  </Tab>

  <Tab title="Self-Hosted">
    * Run your own sponsorship backend
    * Fully programmable: accept or reject transactions based on any custom logic
    * Define your own gas tank and token

    ```ts
    sponsorshipOptions: {
      url: "https://your-custom-backend",
      gasTank: {
        address: "0x...",
        token: "0x...",
        chainId: 84532
      }
    }
    ```

    Ideal for wallets, infra providers, or apps needing custom user-based policies.
  </Tab>
</Tabs>

## Testnet Setup

On testnets, you'll often want to use `sponsorshipOptions` to point to a testnet gas tank:

```ts
const quote = await meeClient.getQuote({
  sponsorship: true,
  sponsorshipOptions: {
    url: DEFAULT_PATHFINDER_URL,
    gasTank: {
      address: DEFAULT_MEE_TESTNET_SPONSORSHIP_PAYMASTER_ACCOUNT,
      token: DEFAULT_MEE_TESTNET_SPONSORSHIP_TOKEN_ADDRESS,
      chainId: DEFAULT_MEE_TESTNET_SPONSORSHIP_CHAIN_ID
    }
  },
  instructions: [instruction]
});
```

## Discover Available Gas Tanks

List available tanks using:

```http
GET https://network.biconomy.io/v1/sponsorship/info
```

Or point to your self-hosted sponsorship URL to list custom tanks.

## Summary

* **Use EIP-7702** for embedded wallets — simplest and most powerful
* **Use Fusion** for EOAs — ensure `permit()` or fallback gas is available
* **Use native SCAs** if deploying and managing accounts
* Start with **Biconomy-hosted sponsorship**; move to self-hosted as you scale
* Sponsorship unlocks full UX abstraction with **one gas tank** across **all chains**

<Info>
  Sponsorship is the easiest way to eliminate onboarding friction and scale user-friendly smart account experiences.
</Info>