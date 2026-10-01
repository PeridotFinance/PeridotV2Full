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