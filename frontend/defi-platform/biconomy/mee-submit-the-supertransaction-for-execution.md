# Submit the supertransaction for execution

> Submit the signed supertransaction quote for the execution where multichain composable and async execution happens via MEE nodes

## OpenAPI

````yaml supertransaction-api/openapi.yaml post /v1/mee/execute
paths:
  path: /v1/mee/execute
  method: post
  servers:
    - url: https://api.biconomy.io
      description: Production server
    - url: https://api-staging.biconomy.io
      description: Staging server
  request:
    security:
      - title: X API Key
        parameters:
          query: {}
          header:
            X-API-Key:
              type: apiKey
              description: >-
                API Key required to access Supertransaction API. Example:
                YOUR_API_KEY
          cookie: {}
    parameters:
      path: {}
      query: {}
      header: {}
      cookie: {}
    body:
      application/json:
        schemaArray:
          - type: object
            properties:
              ownerAddress:
                allOf:
                  - description: >-
                      Owner wallet address which will be used as a owner of
                      orchestrator account
                    type: string
                    example: '0x1234567890abcdef1234567890abcdef12345678'
              fee:
                allOf:
                  - description: 'Fee details: amount, token address, and chain ID.'
                    type: object
                    properties:
                      amount:
                        description: Fee amount for the quote in wei.
                        type: string
                        example: '10000000000000000'
                      token:
                        description: >-
                          EVM address of the fee token (zero address for native
                          ETH).
                        type: string
                        example: '0x0000000000000000000000000000000000000000'
                      chainId:
                        description: Chain ID where the fee token resides.
                        type: number
                        example: 8453
                    required:
                      - amount
                      - token
                      - chainId
                    additionalProperties: false
              quoteType:
                allOf:
                  - description: 'Type of MEE signature: permit, onchain, or simple.'
                    example: permit
                    type: string
                    enum:
                      - permit
                      - onchain
                      - simple
              quote:
                allOf:
                  - description: MEE network compatible quote information
                    type: object
                    properties:
                      hash:
                        description: Supertransaction hash of the quote.
                        type: string
                        example: >-
                          0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef
                      node:
                        description: EVM address of the node providing the quote.
                        type: string
                        example: '0x9876543210abcdef9876543210abcdef98765432'
                      commitment:
                        description: >-
                          Node's commitment hash for the supertransaction quote
                          (hex string, 0x-prefixed).
                        type: string
                        example: >-
                          0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef
                      paymentInfo:
                        type: object
                        properties:
                          sender:
                            description: Sender EVM address (optional)
                            type: string
                            example: '0x742d35C9a91B1D5b5D24Dc30e8F0dF8E84b5d1c4'
                          initCode:
                            default: 0x
                            description: Init code as hex string (optional)
                            type: string
                            example: '0x1234abcd'
                          nonce:
                            description: Nonce as string (optional)
                            type: string
                            example: '0'
                          token:
                            description: Payment token address
                            type: string
                            example: '0x00000069E0Fb590E092Dd0E36FF93ac28ff11a3a'
                          chainId:
                            description: Chain ID of the payment token
                            type: number
                            example: 1
                          verificationGasLimit:
                            example: '21000'
                            description: Verification gas limit as string (optional)
                            type: string
                          eoa:
                            example: '0x00000069E0Fb590E092Dd0E36FF93ac28ff11a3a'
                            description: EOA address (optional)
                            type: string
                          eip7702Auth:
                            description: >-
                              Object containing the EIP-7702 authorization
                              signature fields for delegation, including the
                              signer address, chain ID, nonce, and ECDSA
                              signature components (r, s, v/yParity). Used to
                              prove delegation intent and validity.
                            type: object
                            properties:
                              address:
                                description: >-
                                  The EVM address of the delegation contract to
                                  which your EOA (Externally Owned Account) is
                                  being upgraded. Must be a valid checksummed
                                  Ethereum address.
                                type: string
                                example: '0x00000069E0Fb590E092Dd0E36FF93ac28ff11a3a'
                              chainId:
                                description: >-
                                  The chain ID for which this authorization is
                                  valid. Use 0 for multichain or specify a
                                  supported chain ID.
                                type: number
                                example: 8453
                              nonce:
                                description: Signature nonce
                                type: number
                                example: 38
                              r:
                                description: >-
                                  The "r" value of the ECDSA signature, as a
                                  32-byte hex string prefixed with 0x.
                                type: string
                                example: >-
                                  0x192a2503401595804c35cdc5b748fe35cceb77ef534bf5d670f7797376487ded
                              s:
                                description: >-
                                  The "s" value of the ECDSA signature, as a
                                  32-byte hex string prefixed with 0x.
                                type: string
                                example: >-
                                  0x1fd3c8acd0b7c5f64a8d72c35c39988544fca961b838277ab11750041cccc3d1
                              v:
                                example: '28'
                                description: >-
                                  The "v" value of the ECDSA signature (recovery
                                  id), as a string. Optional for EIP-2098
                                  signatures.
                                type: string
                              yParity:
                                description: >-
                                  The y-parity value (EIP-2098) for the
                                  signature. Should be 0 or 1.
                                type: number
                                example: 1
                            required:
                              - address
                              - chainId
                              - nonce
                              - r
                              - s
                              - yParity
                            additionalProperties: false
                          shortEncoding:
                            example: false
                            default: false
                            description: 'Short encoding flag (default: false)'
                            type: boolean
                          callGasLimit:
                            example: '50000'
                            description: Call gas limit as string (optional)
                            type: string
                          sponsored:
                            example: true
                            description: Sponsored flag (optional)
                            type: boolean
                          sponsorshipUrl:
                            example: https://sponsorship.abc.org
                            description: Sponsored ulr (optional)
                            type: string
                          tokenAmount:
                            example: 1000 (1000 USDC), 1 (1 ether)
                            description: Token amount as string (optional)
                            type: string
                          tokenValue:
                            description: Token value as string in USD
                            type: string
                            example: >-
                              1000 (for 1000 USDC), 250000 (for 1 WBTC very
                              soon)
                          tokenWeiAmount:
                            description: Token wei amount as string (optional)
                            type: string
                            example: >-
                              1000000000000000000000 (1000 ether), 250000 (0.25
                              USDC)
                          gasFee:
                            example: '21000000000000000'
                            description: Gas fee as string (optional)
                            type: string
                          orchestrationFee:
                            example: '1000000000000000'
                            description: Orchestration fee as string (optional)
                            type: string
                        required:
                          - sender
                          - initCode
                          - nonce
                          - token
                          - chainId
                          - shortEncoding
                          - tokenValue
                          - tokenWeiAmount
                        additionalProperties: false
                      userOps:
                        description: Array of MEE UserOperation objects for the quote.
                        type: array
                        items:
                          description: >-
                            Object containing the fields of a MEE UserOperation
                            which is a Wrapper for userops supported by MEE
                            nodes
                          type: object
                          properties:
                            userOp:
                              description: >-
                                Object containing the fields of a UserOperation,
                                including sender, nonce, calldata, gas limits,
                                and signature.
                              type: object
                              properties:
                                sender:
                                  description: >-
                                    The address of the account initiating the
                                    user operation.
                                  type: string
                                  example: '0x00000069E0Fb590E092Dd0E36FF93ac28ff11a3a'
                                nonce:
                                  description: >-
                                    The nonce of the sender account, as a
                                    bigint.
                                  type: string
                                  example: '0'
                                initCode:
                                  description: >-
                                    The initCode for contract creation, as a hex
                                    string. Optional.
                                  type: string
                                  example: '0x1234abcd'
                                callData:
                                  description: >-
                                    The calldata for the user operation, as a
                                    hex string.
                                  type: string
                                  example: '0x1234abcd'
                                callGasLimit:
                                  description: The gas limit for the call, as a bigint.
                                  type: string
                                  example: '21000'
                                verificationGasLimit:
                                  description: The gas limit for verification, as a bigint.
                                  type: string
                                  example: '100000'
                                preVerificationGas:
                                  description: >-
                                    The gas used before verification, as a
                                    bigint.
                                  type: string
                                  example: '21000'
                                maxFeePerGas:
                                  description: The maximum fee per gas, as a bigint.
                                  type: string
                                  example: '1000000000'
                                maxPriorityFeePerGas:
                                  description: >-
                                    The maximum priority fee per gas, as a
                                    bigint.
                                  type: string
                                  example: '100000000'
                                paymasterAndData:
                                  example: 0x
                                  description: >-
                                    The paymaster and data field, as a hex
                                    string. Optional.
                                  type: string
                                signature:
                                  example: '0xabcdef123456'
                                  description: >-
                                    The signature for the user operation, as a
                                    hex string. Optional.
                                  type: string
                              required:
                                - sender
                                - nonce
                                - callData
                                - callGasLimit
                                - verificationGasLimit
                                - preVerificationGas
                                - maxFeePerGas
                                - maxPriorityFeePerGas
                              additionalProperties: false
                            userOpHash:
                              description: The hash of the user operation.
                              type: string
                              example: '0x1234abcd5678ef90'
                            meeUserOpHash:
                              description: The MEE-specific hash of the user operation.
                              type: string
                              example: '0xabcdef1234567890'
                            lowerBoundTimestamp:
                              description: >-
                                The lower bound timestamp for the user
                                operation.
                              type: number
                              example: 1710000000
                            upperBoundTimestamp:
                              description: >-
                                The upper bound timestamp for the user
                                operation.
                              type: number
                              example: 1710003600
                            maxGasLimit:
                              description: The maximum gas limit for the user operation.
                              type: string
                              example: '1000000'
                            maxFeePerGas:
                              description: The maximum fee per gas for the user operation.
                              type: string
                              example: '1000000000'
                            chainId:
                              description: The chain ID for the user operation.
                              type: number
                              example: 8453
                            eip7702Auth:
                              description: >-
                                Object containing the EIP-7702 authorization
                                signature fields for delegation, including the
                                signer address, chain ID, nonce, and ECDSA
                                signature components (r, s, v/yParity). Used to
                                prove delegation intent and validity.
                              type: object
                              properties:
                                address:
                                  description: >-
                                    The EVM address of the delegation contract
                                    to which your EOA (Externally Owned Account)
                                    is being upgraded. Must be a valid
                                    checksummed Ethereum address.
                                  type: string
                                  example: '0x00000069E0Fb590E092Dd0E36FF93ac28ff11a3a'
                                chainId:
                                  description: >-
                                    The chain ID for which this authorization is
                                    valid. Use 0 for multichain or specify a
                                    supported chain ID.
                                  type: number
                                  example: 8453
                                nonce:
                                  description: Signature nonce
                                  type: number
                                  example: 38
                                r:
                                  description: >-
                                    The "r" value of the ECDSA signature, as a
                                    32-byte hex string prefixed with 0x.
                                  type: string
                                  example: >-
                                    0x192a2503401595804c35cdc5b748fe35cceb77ef534bf5d670f7797376487ded
                                s:
                                  description: >-
                                    The "s" value of the ECDSA signature, as a
                                    32-byte hex string prefixed with 0x.
                                  type: string
                                  example: >-
                                    0x1fd3c8acd0b7c5f64a8d72c35c39988544fca961b838277ab11750041cccc3d1
                                v:
                                  example: '28'
                                  description: >-
                                    The "v" value of the ECDSA signature
                                    (recovery id), as a string. Optional for
                                    EIP-2098 signatures.
                                  type: string
                                yParity:
                                  description: >-
                                    The y-parity value (EIP-2098) for the
                                    signature. Should be 0 or 1.
                                  type: number
                                  example: 1
                              required:
                                - address
                                - chainId
                                - nonce
                                - r
                                - s
                                - yParity
                              additionalProperties: false
                            isCleanUpUserOp:
                              example: false
                              description: Whether this is a clean-up user operation.
                              type: boolean
                            shortEncoding:
                              example: true
                              description: Whether the user operation uses short encoding.
                              type: boolean
                          required:
                            - userOp
                            - userOpHash
                            - meeUserOpHash
                            - lowerBoundTimestamp
                            - upperBoundTimestamp
                            - maxGasLimit
                            - maxFeePerGas
                            - chainId
                          additionalProperties: false
                      fundingTokens:
                        description: >-
                          Optional array of funding tokens for token pull
                          execution.
                        type: array
                        items:
                          description: >-
                            Object containing the funding token deposit for MEE
                            fusion execution.
                          type: object
                          properties:
                            tokenAddress:
                              description: >-
                                Contract address of the token that will be
                                deposited into the Nexus smart account.
                              type: string
                              example: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
                            chainId:
                              description: >-
                                Chain ID where the funding token resides. Use a
                                supported chain ID.
                              type: number
                              example: 1
                            amount:
                              description: >-
                                Amount of funding token in wei/smallest unit to
                                deposit.
                              type: string
                              example: '1000000000'
                          required:
                            - tokenAddress
                            - chainId
                            - amount
                          additionalProperties: false
                    required:
                      - hash
                      - node
                      - commitment
                      - paymentInfo
                      - userOps
                    additionalProperties: false
              payloadToSign:
                allOf:
                  - description: Array of payloads with signatures for execution.
                    minItems: 1
                    type: array
                    items:
                      anyOf:
                        - type: object
                          properties:
                            signablePayload:
                              description: Payload to be signed for EIP-712 permit
                              type: object
                              properties:
                                domain:
                                  description: EIP-712 domain object
                                  type: object
                                  properties:
                                    name:
                                      example: USD Coin
                                      description: Token or contract name (e.g. 'USD Coin')
                                      type: string
                                    version:
                                      example: '2'
                                      description: Contract version (e.g. '1')
                                      type: string
                                    chainId:
                                      example: 1
                                      description: >-
                                        EVM chain ID (e.g. 1 for Ethereum
                                        mainnet)
                                      type: number
                                    verifyingContract:
                                      example: >-
                                        0xA0b86a33E6441c1a7C4FB1e50Fc5F5ED69DC3D2B
                                      description: Address of the contract being verified
                                      type: string
                                    salt:
                                      example: >-
                                        0x0000000000000000000000000000000000000000000000000000000000000000
                                      description: Optional domain salt (hex string)
                                      type: string
                                  additionalProperties: false
                                types:
                                  type: object
                                  propertyNames:
                                    description: Name of the EIP-712 struct (e.g. 'Permit')
                                    type: string
                                    example: Permit
                                  additionalProperties:
                                    description: List of fields for this struct
                                    example:
                                      - name: owner
                                        type: address
                                      - name: spender
                                        type: address
                                      - name: value
                                        type: uint256
                                      - name: nonce
                                        type: uint256
                                      - name: deadline
                                        type: uint256
                                    type: array
                                    items:
                                      type: object
                                      properties:
                                        name:
                                          description: A string value.
                                          type: string
                                          example: owner
                                        type:
                                          description: A string value.
                                          type: string
                                          example: address
                                      required:
                                        - name
                                        - type
                                      additionalProperties: false
                                message:
                                  description: Key-value pairs for the EIP-712 message
                                  example:
                                    owner: '0x742d35C9a91B1D5b5D24Dc30e8F0dF8E84b5d1c4'
                                    spender: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
                                    value: '1000000000000000000000'
                                    nonce: '0'
                                    deadline: '1647857449'
                                  type: object
                                  propertyNames:
                                    description: A string value.
                                    type: string
                                    example: owner
                                  additionalProperties: {}
                                primaryType:
                                  description: >-
                                    Name of the main EIP-712 struct to sign
                                    (e.g. 'Permit')
                                  type: string
                                  example: Permit
                              required:
                                - types
                                - message
                                - primaryType
                              additionalProperties: false
                            metadata:
                              description: Extra metadata for the permit signature
                              type: object
                              properties:
                                nonce:
                                  description: Permit nonce (as string)
                                  type: string
                                  example: '0'
                                name:
                                  description: Token or contract name
                                  type: string
                                  example: USD Coin
                                version:
                                  description: Contract version
                                  type: string
                                  example: '2'
                                domainSeparator:
                                  description: EIP-712 domain separator (hex string)
                                  type: string
                                  example: >-
                                    0x06c37168a7db5138defc7866392bb87a741f9b3d104deb5094588ce041cae335
                                owner:
                                  description: Address of the permit owner
                                  type: string
                                  example: '0x742d35C9a91B1D5b5D24Dc30e8F0dF8E84b5d1c4'
                                spender:
                                  description: Address of the spender
                                  type: string
                                  example: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
                                amount:
                                  description: Permit amount in wei (as string)
                                  type: string
                                  example: '1000000000000000000000'
                              required:
                                - nonce
                                - name
                                - version
                                - domainSeparator
                                - owner
                                - spender
                                - amount
                              additionalProperties: false
                            signature:
                              description: >-
                                Hex-encoded signature of the quote payload,
                                produced by the user's private key. Must be a
                                valid ECDSA signature in hexadecimal format.
                              type: string
                              example: >-
                                0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b
                          required:
                            - signablePayload
                            - metadata
                            - signature
                          additionalProperties: false
                        - type: object
                          properties:
                            to:
                              description: Target contract address for the on-chain call
                              type: string
                              example: '0x1111111254EEB25477B68fb85Ed929f73A960582'
                            data:
                              description: >-
                                Calldata for the on-chain transaction (hex
                                string)
                              type: string
                              example: 0xa9059cbb000000000000000000000000...
                            value:
                              description: >-
                                ETH value to send with the transaction (in wei,
                                as string)
                              type: string
                              example: '0'
                            chainId:
                              description: Chain ID for the on-chain transaction
                              type: number
                              example: 1
                            signature:
                              description: >-
                                Hex-encoded signature of the quote payload,
                                produced by the user's private key. Must be a
                                valid ECDSA signature in hexadecimal format.
                              type: string
                              example: >-
                                0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b
                          required:
                            - to
                            - data
                            - value
                            - chainId
                            - signature
                          additionalProperties: false
                        - type: object
                          properties:
                            message:
                              type: object
                              properties:
                                raw:
                                  description: Raw transaction hash to sign (hex string)
                                  type: string
                                  example: >-
                                    0xed96a92aa94b8b1927fc7c52ca3b3fcd0d706147dfbeda34a62dc232f6993029
                              required:
                                - raw
                              additionalProperties: false
                            signature:
                              description: >-
                                Hex-encoded signature of the quote payload,
                                produced by the user's private key. Must be a
                                valid ECDSA signature in hexadecimal format.
                              type: string
                              example: >-
                                0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b
                          required:
                            - message
                            - signature
                          additionalProperties: false
            description: MEE execution request with signed quote payloads
            requiredProperties:
              - ownerAddress
              - fee
              - quoteType
              - quote
              - payloadToSign
            additionalProperties: false
        examples:
          example:
            value:
              ownerAddress: '0x1234567890abcdef1234567890abcdef12345678'
              fee:
                amount: '10000000000000000'
                token: '0x0000000000000000000000000000000000000000'
                chainId: 8453
              quoteType: permit
              quote:
                hash: >-
                  0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef
                node: '0x9876543210abcdef9876543210abcdef98765432'
                commitment: >-
                  0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef
                paymentInfo:
                  sender: '0x742d35C9a91B1D5b5D24Dc30e8F0dF8E84b5d1c4'
                  initCode: '0x1234abcd'
                  nonce: '0'
                  token: '0x00000069E0Fb590E092Dd0E36FF93ac28ff11a3a'
                  chainId: 1
                  verificationGasLimit: '21000'
                  eoa: '0x00000069E0Fb590E092Dd0E36FF93ac28ff11a3a'
                  eip7702Auth:
                    address: '0x00000069E0Fb590E092Dd0E36FF93ac28ff11a3a'
                    chainId: 8453
                    nonce: 38
                    r: >-
                      0x192a2503401595804c35cdc5b748fe35cceb77ef534bf5d670f7797376487ded
                    s: >-
                      0x1fd3c8acd0b7c5f64a8d72c35c39988544fca961b838277ab11750041cccc3d1
                    v: '28'
                    yParity: 1
                  shortEncoding: false
                  callGasLimit: '50000'
                  sponsored: true
                  sponsorshipUrl: https://sponsorship.abc.org
                  tokenAmount: 1000 (1000 USDC), 1 (1 ether)
                  tokenValue: 1000 (for 1000 USDC), 250000 (for 1 WBTC very soon)
                  tokenWeiAmount: 1000000000000000000000 (1000 ether), 250000 (0.25 USDC)
                  gasFee: '21000000000000000'
                  orchestrationFee: '1000000000000000'
                userOps:
                  - userOp:
                      sender: '0x00000069E0Fb590E092Dd0E36FF93ac28ff11a3a'
                      nonce: '0'
                      initCode: '0x1234abcd'
                      callData: '0x1234abcd'
                      callGasLimit: '21000'
                      verificationGasLimit: '100000'
                      preVerificationGas: '21000'
                      maxFeePerGas: '1000000000'
                      maxPriorityFeePerGas: '100000000'
                      paymasterAndData: 0x
                      signature: '0xabcdef123456'
                    userOpHash: '0x1234abcd5678ef90'
                    meeUserOpHash: '0xabcdef1234567890'
                    lowerBoundTimestamp: 1710000000
                    upperBoundTimestamp: 1710003600
                    maxGasLimit: '1000000'
                    maxFeePerGas: '1000000000'
                    chainId: 8453
                    eip7702Auth:
                      address: '0x00000069E0Fb590E092Dd0E36FF93ac28ff11a3a'
                      chainId: 8453
                      nonce: 38
                      r: >-
                        0x192a2503401595804c35cdc5b748fe35cceb77ef534bf5d670f7797376487ded
                      s: >-
                        0x1fd3c8acd0b7c5f64a8d72c35c39988544fca961b838277ab11750041cccc3d1
                      v: '28'
                      yParity: 1
                    isCleanUpUserOp: false
                    shortEncoding: true
                fundingTokens:
                  - tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
                    chainId: 1
                    amount: '1000000000'
              payloadToSign:
                - signablePayload:
                    domain:
                      name: USD Coin
                      version: '2'
                      chainId: 1
                      verifyingContract: '0xA0b86a33E6441c1a7C4FB1e50Fc5F5ED69DC3D2B'
                      salt: >-
                        0x0000000000000000000000000000000000000000000000000000000000000000
                    types: {}
                    message:
                      owner: '0x742d35C9a91B1D5b5D24Dc30e8F0dF8E84b5d1c4'
                      spender: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
                      value: '1000000000000000000000'
                      nonce: '0'
                      deadline: '1647857449'
                    primaryType: Permit
                  metadata:
                    nonce: '0'
                    name: USD Coin
                    version: '2'
                    domainSeparator: >-
                      0x06c37168a7db5138defc7866392bb87a741f9b3d104deb5094588ce041cae335
                    owner: '0x742d35C9a91B1D5b5D24Dc30e8F0dF8E84b5d1c4'
                    spender: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
                    amount: '1000000000000000000000'
                  signature: >-
                    0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b
        description: Body
  response:
    '200':
      application/json:
        schemaArray:
          - type: object
            properties:
              success:
                allOf:
                  - description: >-
                      Indicates if the supertransaction execution was
                      successful.
                    type: boolean
                    example: true
              supertxHash:
                allOf:
                  - example: >-
                      0x9a72f87a93c55d8f88e3f8c2a7b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
                    anyOf:
                      - description: >-
                          The transaction hash of the executed supertransaction,
                          or null if not available.
                        type: string
                        example: example string
                      - type: 'null'
              error:
                allOf:
                  - example: null
                    anyOf:
                      - description: >-
                          Error message if the execution failed, or null if
                          successful.
                        type: string
                        example: example string
                      - type: 'null'
            description: MEE execution response
            requiredProperties:
              - success
              - supertxHash
              - error
            additionalProperties: false
        examples:
          example:
            value:
              success: true
              supertxHash: >-
                0x9a72f87a93c55d8f88e3f8c2a7b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
              error: null
        description: MEE execution response
    '400':
      application/json:
        schemaArray:
          - type: object
            properties:
              code:
                allOf:
                  - type: string
              message:
                allOf:
                  - type: string
              errors:
                allOf:
                  - type: array
                    items:
                      type: object
                      properties:
                        code:
                          type: string
                        path:
                          type: array
                          items:
                            type: string
                        message:
                          type: string
                      required:
                        - code
                        - path
                        - message
                      additionalProperties: false
            requiredProperties:
              - code
              - message
              - errors
            additionalProperties: false
        examples:
          example:
            value:
              code: <string>
              message: <string>
              errors:
                - code: <string>
                  path:
                    - <string>
                  message: <string>
        description: '400'
    '500':
      application/json:
        schemaArray:
          - type: object
            properties:
              code:
                allOf:
                  - type: string
              message:
                allOf:
                  - type: string
              errors:
                allOf:
                  - type: array
                    items:
                      type: object
                      properties:
                        code:
                          type: string
                        path:
                          type: array
                          items:
                            type: string
                        message:
                          type: string
                      required:
                        - code
                        - path
                        - message
                      additionalProperties: false
            requiredProperties:
              - code
              - message
              - errors
            additionalProperties: false
        examples:
          example:
            value:
              code: <string>
              message: <string>
              errors:
                - code: <string>
                  path:
                    - <string>
                  message: <string>
        description: '500'
  deprecated: false
  type: path
components:
  schemas: {}

````