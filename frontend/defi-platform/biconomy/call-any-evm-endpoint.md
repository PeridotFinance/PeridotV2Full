# Call Any EVM Contract

> Build low-level custom instructions for your supertransaction

## Overview

The `/v1/instructions/build` endpoint enables direct control over contract interactions by specifying exact function calls. Users provide ABI signatures and arguments to generate MEE instructions for precise contract execution.

## How It Works

The build endpoint creates instructions by:

1. **Accepting function signatures** - ABI-formatted function definitions
2. **Processing arguments** - Supporting various data types and dynamic values
3. **Generating MEE instructions** - Creates composable instructions for execution

This is the direct approach where users specify exactly what contracts to call and how, rather than expressing high-level intents.

## Request Structure

```json
POST /v1/instructions/build
```

### Request Body

| Parameter           | Type   | Required | Description                                                                |
| ------------------- | ------ | -------- | -------------------------------------------------------------------------- |
| `functionSignature` | string | Yes      | Function signature (e.g., `function transfer(address to, uint256 amount)`) |
| `args`              | array  | Yes      | Function arguments array                                                   |
| `to`                | string | Yes      | Target contract address (checksummed)                                      |
| `chainId`           | number | Yes      | Chain ID where the transaction will be executed                            |
| `value`             | string | No       | Native token value in wei (default: "0")                                   |
| `gasLimit`          | string | No       | Gas limit for the transaction                                              |

### Example Requests

<CodeGroup>
  ```bash cURL
  curl -X POST https://api.biconomy.io/v1/instructions/build \
    -H "Content-Type: application/json" \
    -H "X-API-Key: YOUR_API_KEY" \
    -d '{
      "functionSignature": "function transfer(address to, uint256 amount)",
      "args": [
        "0x742d35cc6639cb8d4b5d1c5d7b8b5e2e7c0c7a8a",
        "1000000000000000000"
      ],
      "to": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      "chainId": 8453,
      "value": "0",
      "gasLimit": "50000"
    }'
  ```

  ```typescript TypeScript
  const response = await fetch('https://api.biconomy.io/v1/instructions/build', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'YOUR_API_KEY'
    },
    body: JSON.stringify({
      functionSignature: 'function transfer(address to, uint256 amount)',
      args: [
        '0x742d35cc6639cb8d4b5d1c5d7b8b5e2e7c0c7a8a',
        '1000000000000000000'
      ],
      to: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      chainId: 8453,
      value: '0',
      gasLimit: '50000'
    })
  });

  const data = await response.json();
  console.log(data);
  ```

  ```javascript JavaScript
  // Example with complex function call
  const complexCall = {
    functionSignature: "function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address recipient)",
    args: [
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // tokenIn
      "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", // tokenOut
      "1000000", // amountIn
      "950000",  // minAmountOut
      "0x742d35cc6639cb8d4b5d1c5d7b8b5e2e7c0c7a8a"  // recipient
    ],
    to: "0x1111111254EEB25477B68fb85Ed929f73A960582",
    chainId: 8453
  };
  ```
</CodeGroup>

## Response

Returns an array of MEE instructions ready for execution:

```json
{
  "instructions": [
    {
      "calls": [
        {
          "to": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
          "value": "0",
          "functionSig": "transfer(address,uint256)",
          "inputParams": [
            {
              "fetcherType": 0,
              "paramData": "0x742d35C9a91B1D5b5D24Dc30e8F0dF8E84b5d1c4",
              "constraints": []
            },
            {
              "fetcherType": 0,
              "paramData": "0x0000000000000000000000000000000000000000000000000de0b6b3a7640000",
              "constraints": []
            }
          ],
          "outputParams": [
            {
              "fetcherType": 0,
              "paramData": "0x"
            }
          ]
        }
      ],
      "chainId": 8453,
      "isComposable": true
    }
  ]
}
```

### Response Fields

| Field                                 | Type    | Description                                          |
| ------------------------------------- | ------- | ---------------------------------------------------- |
| `instructions`                        | array   | Array of MEE instruction objects                     |
| `instructions[].calls`                | array   | Array of contract calls within the instruction       |
| `instructions[].calls[].to`           | string  | Target contract address                              |
| `instructions[].calls[].value`        | string  | Native token value in wei                            |
| `instructions[].calls[].functionSig`  | string  | Function signature without "function" keyword        |
| `instructions[].calls[].inputParams`  | array   | Encoded input parameters                             |
| `instructions[].calls[].outputParams` | array   | Output parameter specifications                      |
| `instructions[].chainId`              | number  | Chain ID for execution                               |
| `instructions[].isComposable`         | boolean | Whether this instruction can be composed with others |

### Input Parameter Structure

Each input parameter contains:

| Field         | Type   | Description                                         |
| ------------- | ------ | --------------------------------------------------- |
| `fetcherType` | number | Type of parameter fetcher (0 = static, 1 = dynamic) |
| `paramData`   | string | Encoded parameter data                              |
| `constraints` | array  | Optional constraints for the parameter              |

## Supported Argument Types

The `args` array supports various JavaScript/TypeScript types:

* **Address**: Ethereum addresses (0x-prefixed, 40 hex characters)
  ```json
  "0x742d35cc6639cb8d4b5d1c5d7b8b5e2e7c0c7a8a"
  ```

* **Numbers**: Can be passed as strings or numbers
  ```json
  "1000000000000000000"  // As string (recommended for large numbers)
  1000000                 // As number
  ```

* **Boolean**: Standard boolean values
  ```json
  true
  false
  ```

* **Arrays**: Nested arrays of any supported type
  ```json
  ["0xAddress1", "0xAddress2", "0xAddress3"]
  ```

* **Bytes**: Hex-encoded byte arrays
  ```json
  "0x1234abcd"
  ```

## Common Use Cases

### ERC20 Token Transfer

```json
{
  "functionSignature": "function transfer(address to, uint256 amount)",
  "args": ["0xRecipient", "1000000000000000000"],
  "to": "0xTokenContract",
  "chainId": 1
}
```

### ERC20 Token Approval

```json
{
  "functionSignature": "function approve(address spender, uint256 amount)",
  "args": ["0xSpenderContract", "115792089237316195423570985008687907853269984665640564039457584007913129639935"],
  "to": "0xTokenContract",
  "chainId": 1
}
```

### Multi-Parameter Functions

```json
{
  "functionSignature": "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
  "args": [
    "1000000000000000000",
    "950000000000000000",
    ["0xToken1", "0xToken2"],
    "0xRecipient",
    "1700000000"
  ],
  "to": "0xRouterContract",
  "chainId": 1
}
```

## Authentication

All requests require an API key to be passed in the header:

```
X-API-Key: your_api_key_here
```

## Error Responses

### 400 Bad Request

Returned when the request is malformed or contains invalid parameters:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Invalid request parameters",
  "errors": [
    {
      "code": "INVALID_SIGNATURE",
      "path": ["functionSignature"],
      "message": "Invalid function signature format"
    }
  ]
}
```

### 500 Internal Server Error

Returned when the server encounters an unexpected error:

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

## Best Practices

1. **Use string format for large numbers**: To avoid JavaScript number precision issues, pass large numbers as strings
2. **Verify contract addresses**: Ensure all addresses are checksummed and valid
3. **Test on testnets first**: Always test your function calls on testnets before mainnet
4. **Set appropriate gas limits**: Include a `gasLimit` parameter for complex operations
5. **Check function signatures**: Ensure your function signature matches the target contract's ABI exactly