# 1. Set Account Type

> Choose the execution mode that matches your wallet infrastructure.

<Tabs>
  <Tab title="EOA">
    ## Standard EOA Mode

    Use this mode for standard Ethereum external wallet accounts from wallets like MetaMask, Rabby, or Trust Wallet or when using WalletConnect.

    **Key requirements:**

    * Requires `fundingTokens` parameter
    * One signature per funding token (1 token = 1 signature, 2 tokens = 2 signatures)

    <CodeGroup>
      ```typescript TypeScript
      const quoteRequest = {
        mode: "eoa",
        ownerAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        fundingTokens: [
          {
            tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            chainId: 1,
            amount: "1000000000"
          }
        ],
        instructions: [...],
        // other parameters
      };

      const response = await fetch('https://api.biconomy.io/v1/mee/quote', {
        method: 'POST',
        headers: {
          'X-API-Key': 'YOUR_API_KEY',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(quoteRequest)
      });
      ```

      ```bash cURL
      curl -X POST https://api.biconomy.io/v1/mee/quote \
        -H "X-API-Key: YOUR_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
          "mode": "eoa",
          "ownerAddress": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
          "fundingTokens": [
            {
              "tokenAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
              "chainId": 1,
              "amount": "1000000000"
            }
          ],
          "instructions": [...]
        }'
      ```
    </CodeGroup>
  </Tab>

  <Tab title="EOA-7702">
    ## EIP-7702 Delegated Mode

    Use this mode if you have access to EIP-7702 delegation, typically available through embedded wallet providers like Privy, Dynamic, or Trust, or
    if you have direct access to the private key (e.g. on the backend).

    **When to use:**

    * Your users have embedded wallets that support EIP-7702
    * You want to leverage delegation features

    <CodeGroup>
      ```typescript TypeScript
      const quoteRequest = {
        mode: "eoa-7702",
        ownerAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        authorizations: [
          {
            address: "0x00000069E0Fb590E092Dd0E36FF93ac28ff11a3a",
            chainId: 8453,
            nonce: 38,
            r: "0x192a2503401595804c35cdc5b748fe35cceb77ef534bf5d670f7797376487ded",
            s: "0x1fd3c8acd0b7c5f64a8d72c35c39988544fca961b838277ab11750041cccc3d1",
            yParity: 1
          }
        ],
        instructions: [...],
        // other parameters
      };

      const response = await fetch('https://api.biconomy.io/v1/mee/quote', {
        method: 'POST',
        headers: {
          'X-API-Key': 'YOUR_API_KEY',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(quoteRequest)
      });
      ```

      ```bash cURL
      curl -X POST https://api.biconomy.io/v1/mee/quote \
        -H "X-API-Key: YOUR_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
          "mode": "eoa-7702",
          "ownerAddress": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
          "authorizations": [
            {
              "address": "0x00000069E0Fb590E092Dd0E36FF93ac28ff11a3a",
              "chainId": 8453,
              "nonce": 38,
              "r": "0x192a2503401595804c35cdc5b748fe35cceb77ef534bf5d670f7797376487ded",
              "s": "0x1fd3c8acd0b7c5f64a8d72c35c39988544fca961b838277ab11750041cccc3d1",
              "yParity": 1
            }
          ],
          "instructions": [...]
        }'
      ```
    </CodeGroup>

    ### Getting EIP-7702 Authorization

    If you don't have the authorization yet, you can use the `/v1/mee/prepare7702` endpoint to get the required authorization parameters:

    ```typescript
    const prepareResponse = await fetch('https://api.biconomy.io/v1/mee/prepare7702', {
      method: 'POST',
      headers: {
        'X-API-Key': 'YOUR_API_KEY',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        mode: "eoa-7702",
        ownerAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        instructions: [...]
      })
    });

    const authorizationParams = await prepareResponse.json();
    // Returns array of authorization objects to be signed
    ```
  </Tab>

  <Tab title="Smart Account">
    ## Smart Account Mode

    Use this mode if your application is built on native ERC-7579 smart accounts, such as Biconomy Nexus accounts.

    **When to use:**

    * You've deployed Biconomy Nexus accounts for your users
    * Your app uses ERC-7579 compatible smart accounts

    <CodeGroup>
      ```typescript TypeScript
      const quoteRequest = {
        mode: "smart-account",
        ownerAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        instructions: [...],
        // other parameters
      };

      const response = await fetch('https://api.biconomy.io/v1/mee/quote', {
        method: 'POST',
        headers: {
          'X-API-Key': 'YOUR_API_KEY',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(quoteRequest)
      });
      ```

      ```bash cURL
      curl -X POST https://api.biconomy.io/v1/mee/quote \
        -H "X-API-Key: YOUR_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
          "mode": "smart-account",
          "ownerAddress": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
          "instructions": [...]
        }'
      ```
    </CodeGroup>
  </Tab>
</Tabs>


# 2. Get Execution Quote

> Get the supertransaction quote for instructions

## Overview

The `/v1/mee/quote` endpoint takes instructions generated from other endpoints (`intent`, `intent-simple`, `build`, or `compose`) and returns a quote with fee details and payloads to sign. Users can optionally specify a fee token to pay for gas in any of 10,000+ supported ERC-20 tokens.

## How It Works

The quote endpoint:

1. **Accepts instructions** - Takes the instruction array from previous endpoint responses
2. **Calculates fees** - Determines gas costs and orchestration fees
3. **Supports fee tokens** - Optional `feeToken` parameter enables gas payment in 10,000+ ERC-20 tokens
4. **Returns signable payloads** - Provides the data that needs to be signed for execution

## Request Structure

```json
POST /v1/mee/quote
```

### Request Body

| Parameter             | Type   | Required | Description                                                        |
| --------------------- | ------ | -------- | ------------------------------------------------------------------ |
| `mode`                | string | Yes      | Execution mode: `smart-account`, `eoa`, or `eoa-7702`              |
| `ownerAddress`        | string | Yes      | EOA wallet address (owner of the orchestrator account)             |
| `instructions`        | array  | Yes      | Instructions array from previous endpoints (min 1 item)            |
| `feeToken`            | object | No       | Token for gas payment (if not specified, sponsorship will be used) |
| `fundingTokens`       | array  | No       | Tokens to deposit for MEE fusion execution                         |
| `authorizations`      | array  | No       | EIP-7702 authorization signatures for delegation                   |
| `lowerBoundTimestamp` | number | No       | Lower bound timestamp for user operation                           |
| `upperBoundTimestamp` | number | No       | Upper bound timestamp for user operation                           |

### Fee Token Configuration

The `feeToken` parameter allows gas payment in ERC-20 tokens:

```json
"feeToken": {
  "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "chainId": 1
}
```

### Funding Tokens

Optional array for token deposits:

```json
"fundingTokens": [
  {
    "tokenAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "chainId": 1,
    "amount": "1000000000"
  }
]
```

### EIP-7702 Authorization

For EOA delegation:

```json
"authorizations": [
  {
    "address": "0x00000069E0Fb590E092Dd0E36FF93ac28ff11a3a",
    "chainId": 8453,
    "nonce": 38,
    "r": "0x192a2503401595804c35cdc5b748fe35cceb77ef534bf5d670f7797376487ded",
    "s": "0x1fd3c8acd0b7c5f64a8d72c35c39988544fca961b838277ab11750041cccc3d1",
    "yParity": 1
  }
]
```

### Example Request

<CodeGroup>
  ```bash cURL
  curl -X POST https://api.biconomy.io/v1/mee/quote \
    -H "Content-Type: application/json" \
    -H "X-API-Key: YOUR_API_KEY" \
    -d '{
      "mode": "smart-account",
      "ownerAddress": "0x0a7C906832544293a6018bA25280c7f7b0Bbf120",
      "instructions": [
        {
          "calls": [
            {
              "to": "0x1111111254EEB25477B68fb85Ed929f73A960582",
              "value": "0",
              "functionSig": "transfer(address,uint256)",
              "inputParams": [...],
              "outputParams": [...]
            }
          ],
          "chainId": 1,
          "isComposable": true
        }
      ],
      "feeToken": {
        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "chainId": 1
      }
    }'
  ```

  ```typescript TypeScript
  const response = await fetch('https://api.biconomy.io/v1/mee/quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'YOUR_API_KEY'
    },
    body: JSON.stringify({
      mode: 'smart-account',
      ownerAddress: '0x0a7C906832544293a6018bA25280c7f7b0Bbf120',
      instructions: [
        {
          calls: [
            {
              to: '0x1111111254EEB25477B68fb85Ed929f73A960582',
              value: '0',
              functionSig: 'transfer(address,uint256)',
              inputParams: [...],
              outputParams: [...]
            }
          ],
          chainId: 1,
          isComposable: true
        }
      ],
      feeToken: {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        chainId: 1
      }
    })
  });

  const data = await response.json();
  console.log(data);
  ```
</CodeGroup>

## Response

Returns a quote with fee details and payloads to sign:

```json
{
  "ownerAddress": "0x1234567890abcdef1234567890abcdef12345678",
  "fee": {
    "amount": "10000000000000000",
    "token": "0x0000000000000000000000000000000000000000",
    "chainId": 8453
  },
  "quoteType": "permit",
  "quote": {
    "hash": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef",
    "node": "0x9876543210abcdef9876543210abcdef98765432",
    "commitment": "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    "paymentInfo": {
      "sender": "0x742d35C9a91B1D5b5D24Dc30e8F0dF8E84b5d1c4",
      "initCode": "0x",
      "nonce": "0",
      "token": "0x00000069E0Fb590E092Dd0E36FF93ac28ff11a3a",
      "chainId": 1,
      "shortEncoding": false,
      "tokenValue": "1000",
      "tokenWeiAmount": "1000000000"
    },
    "userOps": [...],
    "fundingTokens": [...]
  },
  "payloadToSign": [
    {
      "signablePayload": {...},
      "metadata": {...}
    }
  ]
}
```

### Response Fields

| Field               | Type   | Description                                                  |
| ------------------- | ------ | ------------------------------------------------------------ |
| `ownerAddress`      | string | Owner wallet address                                         |
| `fee`               | object | Fee details including amount, token, and chain               |
| `quoteType`         | string | Type of signature required: `permit`, `onchain`, or `simple` |
| `quote`             | object | MEE network compatible quote information                     |
| `quote.hash`        | string | Supertransaction hash                                        |
| `quote.node`        | string | EVM address of the node providing the quote                  |
| `quote.commitment`  | string | Node's commitment hash                                       |
| `quote.paymentInfo` | object | Payment details for the transaction                          |
| `quote.userOps`     | array  | Array of MEE UserOperation objects                           |
| `payloadToSign`     | array  | Payloads that need to be signed                              |


# 3. Sign Payload(s)

> Once you've received the payloads from the API, you need to sign them to approve execution.

## Quick Start: Copy-Paste Utilities

**For TypeScript users:** Copy the utilities below directly into your project.\
**Not using TypeScript?** Implement your own version following the same logic shown in the code.

<Expandable title="Click to view signing utilities code">
  ```typescript
  import {
    Address,
    createWalletClient,
    Hex,
    http,
    OneOf,
    publicActions,
    SignTypedDataParameters,
  } from "viem";
  import { privateKeyToAccount } from "viem/accounts";
  import { base } from "viem/chains";

  /**
   * Types for different signable payloads.
   */

  // Payload for EIP-712 permit signature (excluding the account field)
  type SignablePermitPayload = Omit<SignTypedDataParameters, "account">;

  // Payload for simple message signing (raw hex message)
  type SignableSimplePayload = {
    message: {
      raw: Hex;
    };
  };

  // Payload for on-chain transaction signing
  type SignableOnChainPayload =
    | {
        data: Hex;
        to: Address;
        chainId: number;
        value: string;
      }
    | {
        data: Hex;
        to: Address;
        chainId: number;
        value?: string | undefined;
      };

  /**
   * Example EOA account and wallet client setup.
   * Replace the private key with a real one for production use.
   */
  const eoaAccount = privateKeyToAccount("0x"); // ⚠️ Replace with your private key

  const walletClient = createWalletClient({
    account: eoaAccount,
    chain: base,
    transport: http(), // ⚠️ Use private paid RPC for production
  }).extend(publicActions);

  /**
   * Signs a simple quote payload (raw message).
   *
   * @param signablePayload - The payload containing the raw message to sign.
   * @returns The signature as a Hex string.
   *
   * @example
   * const signature = await signSimpleQuoteSignablePayload({
   *   message: { raw: "0x68656c6c6f" }
   * });
   */
  const signSimpleQuoteSignablePayload = async (
    signablePayload: SignableSimplePayload
  ): Promise<Hex> => {
    const signature = await eoaAccount.signMessage(signablePayload);
    return signature;
  };

  /**
   * Signs a permit quote payload (EIP-712 typed data).
   *
   * @param signablePayload - The EIP-712 payload to sign.
   * @returns The signature as a Hex string.
   *
   * @example
   * const signature = await signPermitQuoteSignablePayload({
   *   domain: { ... },
   *   types: { ... },
   *   primaryType: "Permit",
   *   message: { ... }
   * });
   */
  const signPermitQuoteSignablePayload = async (
    signablePayload: SignablePermitPayload
  ): Promise<Hex> => {
    const signature = await walletClient.signTypedData({
      ...signablePayload,
      account: eoaAccount,
    });
    return signature;
  };

  /**
   * Signs an on-chain quote payload (transaction).
   *
   * @param signablePayload - The transaction payload to send.
   * @returns The transaction hash as a Hex string.
   *
   * @example
   * const txHash = await signOnChainQuoteSignablePayload({
   *   to: "0x...",
   *   data: "0x...",
   *   value: "0",
   *   chainId: 1
   * });
   */
  const signOnChainQuoteSignablePayload = async (
    signablePayload: SignableOnChainPayload
  ): Promise<Hex> => {
    const hash = await walletClient.sendTransaction({
      to: signablePayload.to,
      data: signablePayload.data,
      value: BigInt(signablePayload.value || "0")
    });
    // Wait for 5 confirmations before returning the hash
    await walletClient.waitForTransactionReceipt({ hash, confirmations: 5 });
    return hash;
  };

  /**
   * Union type for all supported payloads to sign.
   */
  type PayloadToSign = OneOf<
    | {
        signablePayload: SignableSimplePayload;
        metadata?: any;
      }
    | {
        signablePayload: SignablePermitPayload;
        metadata: {
          nonce: string;
          name: string;
          version: string;
          domainSeparator: string;
          owner: string;
          spender: string;
          amount: string;
        };
      }
    | SignableOnChainPayload
  >;

  /**
   * Signs a quote payload based on its type.
   *
   * @param quoteType - The type of quote from the API response.
   * @param payloadToSign - The payload to sign.
   * @returns The signature or transaction hash as a Hex string.
   *
   * @example
   * // Simple message
   * const sig = await signQuoteSignablePayload("simple", {
   *   signablePayload: { message: { raw: "0x68656c6c6f" } }
   * });
   *
   * // Permit (EIP-712)
   * const sig = await signQuoteSignablePayload("permit", {
   *   signablePayload: { domain: {...}, types: {...}, primaryType: "...", message: {...} },
   *   metadata: { ... }
   * });
   *
   * // On-chain transaction
   * const txHash = await signQuoteSignablePayload("onchain", {
   *   to: "0x...", 
   *   data: "0x...", 
   *   value: "0",
   *   chainId: 1
   * });
   */
  const signQuoteSignablePayload = async (
    quoteType: string,
    payloadToSign: PayloadToSign
  ): Promise<Hex> => {
    let signature: Hex = "0x";

    switch (quoteType) {
      case "simple":
        if ('signablePayload' in payloadToSign && 'message' in payloadToSign.signablePayload) {
          signature = await signSimpleQuoteSignablePayload(payloadToSign.signablePayload);
        }
        break;
      case "permit":
        if ('signablePayload' in payloadToSign && 'metadata' in payloadToSign) {
          signature = await signPermitQuoteSignablePayload(payloadToSign.signablePayload);
        }
        break;
      case "onchain":
        if ('to' in payloadToSign && 'data' in payloadToSign) {
          signature = await signOnChainQuoteSignablePayload(payloadToSign);
        }
        break;
      default:
        throw new Error("Unsupported quote type, can't sign the payload");
    }

    return signature;
  };
  ```
</Expandable>

## How It Works: Three Signature Types

* The API returns an array of payloads to sign.
* In most cases this array has just one item.
* Each item in the payload is one of three signature types (simple, permit, onchain) depending on your execution mode and token support

<Tabs>
  <Tab title="Simple">
    ### Simple (Off-chain Message)

    **What**: Signs a raw hex message\
    **When**: Smart accounts and EIP-7702 delegated EOAs\
    **Result**: Off-chain signature

    ```javascript
    // Example payload from API
    {
      message: {
        raw: "0xed96a92aa94b8b1927fc7c52ca3b3fcd0d706147dfbeda34a62dc232f6993029"
      }
    }
    ```
  </Tab>

  <Tab title="Permit">
    ### Permit (EIP-712 Typed Data)

    **What**: Signs structured EIP-712 data for ERC20 Permit\
    **When**: EOAs with tokens that support ERC20Permit\
    **Result**: Off-chain signature\
    **Special**: API embeds supertx hash in `deadline` field

    ```javascript
    // Example payload from API
    {
      signablePayload: {
        domain: {
          name: "USD Coin",
          version: "2",
          chainId: 1,
          verifyingContract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
        },
        types: {
          Permit: [/* ... */]
        },
        primaryType: "Permit",
        message: {
          owner: "0x...",
          spender: "0x...",
          value: "1000000000",
          nonce: 0,
          deadline: "0xabcdef..." // ← Supertx hash here!
        }
      },
      metadata: {
        nonce: "0",
        name: "USD Coin",
        version: "2",
        domainSeparator: "0x06c37168a7db5138defc7866392bb87a741f9b3d104deb5094588ce041cae335",
        owner: "0x742d35C9a91B1D5b5D24Dc30e8F0dF8E84b5d1c4",
        spender: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
        amount: "1000000000000000000000"
      }
    }
    ```
  </Tab>

  <Tab title="Onchain">
    ### Onchain (Transaction)

    **What**: Sends an actual blockchain transaction\
    **When**: EOAs with tokens that don't support ERC20Permit\
    **Result**: Transaction hash (after 5 confirmations)\
    **Special**: API appends supertx hash to calldata

    ```javascript
    // Example payload from API
    {
      to: "0x1111111254EEB25477B68fb85Ed929f73A960582",
      data: "0xa9059cbb...abcdef1234567890", // ← Supertx hash appended!
      value: "0",
      chainId: 1
    }
    ```
  </Tab>
</Tabs>

## The Magic: Supertx Hash Embedding

For EOA mode, the API cleverly embeds the supertransaction hash into your signatures. This creates a cryptographic link between funding and execution, enabling single-signature cross-chain operations.

**For Permit**: The supertx hash replaces the `deadline` field

```javascript
// Before: deadline = 1700000000
// After:  deadline = "0xabcdef1234567890..." (supertx hash)
```

**For Onchain**: The supertx hash is appended to calldata

```javascript
// Before: 0xa9059cbb000000000000000000000000...
// After:  0xa9059cbb000000000000000000000000...abcdef1234567890
```

## Usage by Execution Mode

<Tabs>
  <Tab title="EOA">
    **Signature Requirements:**

    * One signature per funding token
    * Type depends on token support (permit or onchain)

    ```typescript
    // 1. Get quote
    const quoteResponse = await fetch('/v1/mee/quote', {
      method: 'POST',
      headers: { 'X-API-Key': 'YOUR_API_KEY' },
      body: JSON.stringify({
        mode: "eoa",
        ownerAddress: "0x...",
        fundingTokens: [{
          tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          chainId: 1,
          amount: "1000000000"
        }],
        instructions: [...]
      })
    });

    const { payloadToSign, quote, fee, quoteType, ownerAddress } = await quoteResponse.json();

    // 2. Sign each payload (one per funding token)
    for (let i = 0; i < payloadToSign.length; i++) {
      const payload = payloadToSign[i];
      
      // Use the utility function - it handles all types
      const signature = await signQuoteSignablePayload(quoteType, payload);
      
      // Add signature back to payload
      payloadToSign[i].signature = signature;
    }

    // 3. Execute with signed payloads
    await fetch('/v1/mee/execute', {
      method: 'POST',
      body: JSON.stringify({
        ownerAddress,
        fee,
        quoteType,
        quote,
        payloadToSign
      })
    });
    ```
  </Tab>

  <Tab title="EOA-7702">
    **Signature Requirements:**

    * Authorization signature (if not already delegated)
    * One simple signature for execution

    ```typescript
    // 1. Get quote (may need authorization first)
    let quoteResponse = await fetch('/v1/mee/quote', {
      method: 'POST',
      headers: { 'X-API-Key': 'YOUR_API_KEY' },
      body: JSON.stringify({
        mode: "eoa-7702",
        ownerAddress: "0x...",
        instructions: [...]
      })
    });

    // 2. Handle authorization if needed
    if (quoteResponse.status === 412) {
      const error = await quoteResponse.json();
      const auth = error.authorizations[0];
      
      // Sign authorization (wallet-specific method)
      const authSig = await wallet.signAuthorization({
        contractAddress: auth.address,
        chainId: auth.chainId,
        nonce: auth.nonce
      });
      
      // Retry with authorization
      quoteResponse = await fetch('/v1/mee/quote', {
        method: 'POST',
        body: JSON.stringify({
          mode: "eoa-7702",
          ownerAddress: "0x...",
          authorizations: [authSig],
          instructions: [...]
        })
      });
    }

    const { payloadToSign, quote, fee, quoteType, ownerAddress } = await quoteResponse.json();

    // 3. Sign execution (always simple type)
    const signature = await signQuoteSignablePayload(quoteType, payloadToSign[0]);
    payloadToSign[0].signature = signature;

    // 4. Execute
    await fetch('/v1/mee/execute', {
      method: 'POST',
      body: JSON.stringify({
        ownerAddress,
        fee,
        quoteType,
        quote,
        payloadToSign
      })
    });
    ```
  </Tab>

  <Tab title="Smart Account">
    **Signature Requirements:**

    * Always exactly one simple signature

    ```typescript
    // 1. Get quote
    const quoteResponse = await fetch('/v1/mee/quote', {
      method: 'POST',
      headers: { 'X-API-Key': 'YOUR_API_KEY' },
      body: JSON.stringify({
        mode: "smart-account",
        ownerAddress: "0x...",
        instructions: [...]
      })
    });

    const { payloadToSign, quote, fee, quoteType, ownerAddress } = await quoteResponse.json();

    // 2. Sign (always simple type)
    const signature = await signQuoteSignablePayload(quoteType, payloadToSign[0]);
    payloadToSign[0].signature = signature;

    // 3. Execute
    await fetch('/v1/mee/execute', {
      method: 'POST',
      body: JSON.stringify({
        ownerAddress,
        fee,
        quoteType,
        quote,
        payloadToSign
      })
    });
    ```
  </Tab>
</Tabs>

## Summary

1. **Copy the utilities** - They handle all signature types automatically
2. **Get a quote** - The API returns the appropriate payload type
3. **Sign with utilities** - `signQuoteSignablePayload()` routes to the right method
4. **Execute** - Send signed payloads back to complete the supertransaction

The utilities abstract away the complexity while the API's clever hash embedding enables powerful single-signature cross-chain operations.

# 4. Execute Workflow

> Submit the signed supertransaction quote for execution

## Overview

The `/v1/mee/execute` endpoint submits signed quotes for execution. It takes the quote response from the quote endpoint along with user signatures to execute multichain composable transactions asynchronously via MEE nodes.

## How It Works

The execute endpoint:

1. **Accepts signed quotes** - Takes the quote data with user signatures
2. **Submits to MEE network** - Routes to MEE nodes for orchestration
3. **Handles execution** - Manages multichain composable and async execution
4. **Returns transaction hash** - Provides the supertransaction hash for tracking

## Request Structure

```json
POST /v1/mee/execute
```

### Request Body

| Parameter       | Type   | Required | Description                                       |
| --------------- | ------ | -------- | ------------------------------------------------- |
| `ownerAddress`  | string | Yes      | Owner wallet address (from quote response)        |
| `fee`           | object | Yes      | Fee details from quote response                   |
| `quoteType`     | string | Yes      | Type from quote: `permit`, `onchain`, or `simple` |
| `quote`         | object | Yes      | Complete quote object from quote response         |
| `payloadToSign` | array  | Yes      | Signed payloads with signatures added             |

### Signed Payload Structure

Each payload in `payloadToSign` must include the signature based on the `quoteType`:

#### For Permit Type

```json
{
  "signablePayload": {...},  // From quote response
  "metadata": {...},          // From quote response
  "signature": "0x1234..."    // User's signature (added)
}
```

#### For OnChain Type

```json
{
  "to": "0x1111111254EEB25477B68fb85Ed929f73A960582",
  "data": "0xa9059cbb...",
  "value": "0",
  "chainId": 1,
  "signature": "0x1234..."    // Transaction hash (added)
}
```

#### For Simple Type

```json
{
  "message": {
    "raw": "0xed96a92aa94b8b1927fc7c52ca3b3fcd0d706147dfbeda34a62dc232f6993029"
  },
  "signature": "0x1234..."    // User's signature (added)
}
```

### Example Request

<CodeGroup>
  ```bash cURL
  curl -X POST https://api.biconomy.io/v1/mee/execute \
    -H "Content-Type: application/json" \
    -H "X-API-Key: YOUR_API_KEY" \
    -d '{
      "ownerAddress": "0x1234567890abcdef1234567890abcdef12345678",
      "fee": {
        "amount": "10000000000000000",
        "token": "0x0000000000000000000000000000000000000000",
        "chainId": 8453
      },
      "quoteType": "permit",
      "quote": {
        "hash": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef",
        "node": "0x9876543210abcdef9876543210abcdef98765432",
        "commitment": "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        "paymentInfo": {...},
        "userOps": [...],
        "fundingTokens": [...]
      },
      "payloadToSign": [
        {
          "signablePayload": {
            "domain": {...},
            "types": {...},
            "message": {...},
            "primaryType": "Permit"
          },
          "metadata": {
            "nonce": "0",
            "name": "USD Coin",
            "version": "2",
            "domainSeparator": "0x06c37168a7db5138defc7866392bb87a741f9b3d104deb5094588ce041cae335",
            "owner": "0x742d35C9a91B1D5b5D24Dc30e8F0dF8E84b5d1c4",
            "spender": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
            "amount": "1000000000000000000000"
          },
          "signature": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b"
        }
      ]
    }'
  ```

  ```typescript TypeScript
  const response = await fetch('https://api.biconomy.io/v1/mee/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'YOUR_API_KEY'
    },
    body: JSON.stringify({
      ownerAddress: '0x1234567890abcdef1234567890abcdef12345678',
      fee: {
        amount: '10000000000000000',
        token: '0x0000000000000000000000000000000000000000',
        chainId: 8453
      },
      quoteType: 'permit',
      quote: {
        hash: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
        node: '0x9876543210abcdef9876543210abcdef98765432',
        commitment: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        paymentInfo: {...},
        userOps: [...],
        fundingTokens: [...]
      },
      payloadToSign: [
        {
          signablePayload: {
            domain: {...},
            types: {...},
            message: {...},
            primaryType: 'Permit'
          },
          metadata: {
            nonce: '0',
            name: 'USD Coin',
            version: '2',
            domainSeparator: '0x06c37168a7db5138defc7866392bb87a741f9b3d104deb5094588ce041cae335',
            owner: '0x742d35C9a91B1D5b5D24Dc30e8F0dF8E84b5d1c4',
            spender: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
            amount: '1000000000000000000000'
          },
          signature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b'
        }
      ]
    })
  });

  const data = await response.json();
  console.log(data);
  ```
</CodeGroup>

## Response

Returns execution status and transaction hash:

```json
{
  "success": true,
  "supertxHash": "0x9a72f87a93c55d8f88e3f8c2a7b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
  "error": null
}
```

### Response Fields

| Field         | Type        | Description                                       |
| ------------- | ----------- | ------------------------------------------------- |
| `success`     | boolean     | Indicates if execution was successful             |
| `supertxHash` | string/null | Transaction hash of the executed supertransaction |
| `error`       | string/null | Error message if execution failed                 |

## Complete Workflow

1. **Build instructions** using `intent`, `intent-simple`, `build`, or `compose`
2. **Get quote** from the quote endpoint with instructions
3. **Sign payloads** based on `quoteType`:
   * `permit`: Sign EIP-712 typed data
   * `onchain`: Send transaction and get hash
   * `simple`: Sign raw message hash
4. **Execute** by submitting signed quote to this endpoint
5. **Track execution** using the returned `supertxHash`

## Authentication

All requests require an API key to be passed in the header:

```
X-API-Key: your_api_key_here
```

## Error Handling

The endpoint returns appropriate HTTP status codes:

### 200 Success

```json
{
  "success": true,
  "supertxHash": "0x9a72f87a93c55d8f88e3f8c2a7b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
  "error": null
}
```

### 400 Bad Request

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Invalid request parameters",
  "errors": [
    {
      "code": "INVALID_SIGNATURE",
      "path": ["payloadToSign", "0", "signature"],
      "message": "Invalid signature format"
    }
  ]
}
```

### 500 Internal Server Error

```json
{
  "code": "INTERNAL_ERROR",
  "message": "An unexpected error occurred",
  "errors": [
    {
      "code": "SERVER_ERROR",
      "path": [],
      "message": "Internal server error"
    }
  ]
}
```

Check the `success` field and `error` message for execution status.