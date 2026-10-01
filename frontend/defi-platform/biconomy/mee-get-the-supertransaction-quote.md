# Get the supertransaction quote

> Get the supertransaction quote for the instructions

## OpenAPI

````yaml supertransaction-api/openapi.yaml post /v1/mee/quote
paths:
  path: /v1/mee/quote
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
              mode:
                allOf:
                  - type: string
                    enum:
                      - smart-account
                      - eoa
                      - eoa-7702
              ownerAddress:
                allOf:
                  - description: >-
                      EOA wallet address which is used as owner of the
                      orchestrator account
                    type: string
                    example: '0x0a7C906832544293a6018bA25280c7f7b0Bbf120'
              authorizations:
                allOf:
                  - type: array
                    items:
                      description: >-
                        Object containing the EIP-7702 authorization signature
                        fields for delegation, including the signer address,
                        chain ID, nonce, and ECDSA signature components (r, s,
                        v/yParity). Used to prove delegation intent and
                        validity.
                      type: object
                      properties:
                        address:
                          description: >-
                            The EVM address of the delegation contract to which
                            your EOA (Externally Owned Account) is being
                            upgraded. Must be a valid checksummed Ethereum
                            address.
                          type: string
                          example: '0x00000069E0Fb590E092Dd0E36FF93ac28ff11a3a'
                        chainId:
                          description: >-
                            The chain ID for which this authorization is valid.
                            Use 0 for multichain or specify a supported chain
                            ID.
                          type: number
                          example: 8453
                        nonce:
                          description: Signature nonce
                          type: number
                          example: 38
                        r:
                          description: >-
                            The "r" value of the ECDSA signature, as a 32-byte
                            hex string prefixed with 0x.
                          type: string
                          example: >-
                            0x192a2503401595804c35cdc5b748fe35cceb77ef534bf5d670f7797376487ded
                        s:
                          description: >-
                            The "s" value of the ECDSA signature, as a 32-byte
                            hex string prefixed with 0x.
                          type: string
                          example: >-
                            0x1fd3c8acd0b7c5f64a8d72c35c39988544fca961b838277ab11750041cccc3d1
                        v:
                          example: '28'
                          description: >-
                            The "v" value of the ECDSA signature (recovery id),
                            as a string. Optional for EIP-2098 signatures.
                          type: string
                        yParity:
                          description: >-
                            The y-parity value (EIP-2098) for the signature.
                            Should be 0 or 1.
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
              fundingTokens:
                allOf:
                  - type: array
                    items:
                      description: >-
                        Object containing the funding token deposit for MEE
                        fusion execution.
                      type: object
                      properties:
                        tokenAddress:
                          description: >-
                            Contract address of the token that will be deposited
                            into the Nexus smart account.
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
              instructions:
                allOf:
                  - minItems: 1
                    type: array
                    items:
                      description: >-
                        Object representing a single MEE instruction, including
                        the set of contract calls to execute, the target chain
                        ID, and whether the instruction is composable with
                        others in the same batch.
                      type: object
                      properties:
                        calls:
                          type: array
                          items:
                            anyOf:
                              - type: object
                                properties:
                                  to:
                                    description: >-
                                      EVM address of the target smart contract
                                      to invoke for this call.
                                    type: string
                                    example: '0x1111111254EEB25477B68fb85Ed929f73A960582'
                                  value:
                                    description: >-
                                      Amount of native token (in wei) to send
                                      with the contract call. Must be a
                                      non-negative integer.
                                    type: string
                                    example: '0'
                                  functionSig:
                                    description: >-
                                      Function signature as a string, e.g.
                                      "transfer(address,uint256)". Must match
                                      the target contract ABI.
                                    type: string
                                    example: transfer(address,uint256)
                                  inputParams:
                                    example:
                                      - fetcherType: 0
                                        paramData: >-
                                          0x742d35C9a91B1D5b5D24Dc30e8F0dF8E84b5d1c4
                                        constraints: []
                                    type: array
                                    items:
                                      example:
                                        fetcherType: 0
                                        paramData: >-
                                          0x742d35C9a91B1D5b5D24Dc30e8F0dF8E84b5d1c4
                                        constraints:
                                          - constraintType: 1
                                            referenceData: '500'
                                      type: object
                                      properties:
                                        fetcherType:
                                          type: number
                                          enum:
                                            - 0
                                            - 1
                                        paramData:
                                          description: >-
                                            String representing the input parameter
                                            data, such as ABI-encoded bytes or a
                                            direct value.
                                          type: string
                                          example: example string
                                        constraints:
                                          type: array
                                          items:
                                            example:
                                              constraintType: 0
                                              referenceData: '1000'
                                            type: object
                                            properties:
                                              constraintType:
                                                type: number
                                                enum:
                                                  - 0
                                                  - 1
                                                  - 2
                                                  - 3
                                              referenceData:
                                                description: >-
                                                  String data used as the reference for
                                                  the constraint, such as a literal value
                                                  or ABI-encoded data.
                                                type: string
                                                example: example string
                                            required:
                                              - constraintType
                                              - referenceData
                                            additionalProperties: false
                                      required:
                                        - fetcherType
                                        - paramData
                                        - constraints
                                      additionalProperties: false
                                  outputParams:
                                    example:
                                      - fetcherType: 0
                                        paramData: 0x
                                    type: array
                                    items:
                                      example:
                                        fetcherType: 0
                                        paramData: 0x
                                      type: object
                                      properties:
                                        fetcherType:
                                          type: number
                                          enum:
                                            - 0
                                            - 1
                                        paramData:
                                          description: >-
                                            String representing the output parameter
                                            data, such as ABI-encoded bytes or a
                                            result value.
                                          type: string
                                          example: example string
                                      required:
                                        - fetcherType
                                        - paramData
                                      additionalProperties: false
                                required:
                                  - to
                                  - value
                                  - functionSig
                                  - inputParams
                                  - outputParams
                                additionalProperties: false
                        chainId:
                          description: >-
                            Chain ID on which this instruction should be
                            executed. Must be a supported EVM chain ID.
                          type: number
                          example: 1
                        isComposable:
                          description: >-
                            Indicates if this instruction is composable with
                            others in the same execution batch.
                          type: boolean
                          example: true
                      required:
                        - calls
                        - chainId
                        - isComposable
                      additionalProperties: false
              feeToken:
                allOf:
                  - description: >-
                      Optional fee token configuration. If not specified,
                      sponsorship will be used.
                    type: object
                    properties:
                      address:
                        description: >-
                          Contract address of the token used to pay MEE
                          execution fees
                        type: string
                        example: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
                      chainId:
                        description: >-
                          Chain ID where the fee token resides. Use a supported
                          chain ID.
                        type: number
                        example: 1
                    required:
                      - address
                      - chainId
                    additionalProperties: false
              lowerBoundTimestamp:
                allOf:
                  - description: The lower bound timestamp for the user operation.
                    type: number
                    example: 1710000000
              upperBoundTimestamp:
                allOf:
                  - description: The upper bound timestamp for the user operation.
                    type: number
                    example: 1710003600
            requiredProperties:
              - mode
              - ownerAddress
              - instructions
            additionalProperties: false
        examples:
          example:
            value:
              mode: smart-account
              ownerAddress: '0x0a7C906832544293a6018bA25280c7f7b0Bbf120'
              authorizations:
                - address: '0x00000069E0Fb590E092Dd0E36FF93ac28ff11a3a'
                  chainId: 8453
                  nonce: 38
                  r: >-
                    0x192a2503401595804c35cdc5b748fe35cceb77ef534bf5d670f7797376487ded
                  s: >-
                    0x1fd3c8acd0b7c5f64a8d72c35c39988544fca961b838277ab11750041cccc3d1
                  v: '28'
                  yParity: 1
              fundingTokens:
                - tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
                  chainId: 1
                  amount: '1000000000'
              instructions:
                - calls:
                    - to: '0x1111111254EEB25477B68fb85Ed929f73A960582'
                      value: '0'
                      functionSig: transfer(address,uint256)
                      inputParams:
                        - fetcherType: 0
                          paramData: '0x742d35C9a91B1D5b5D24Dc30e8F0dF8E84b5d1c4'
                          constraints: []
                      outputParams:
                        - fetcherType: 0
                          paramData: 0x
                  chainId: 1
                  isComposable: true
              feeToken:
                address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
                chainId: 1
              lowerBoundTimestamp: 1710000000
              upperBoundTimestamp: 1710003600
        description: Body
  response:
    '200':
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
                  - description: >-
                      Array of payloads to be signed, structure depends on the
                      quoteType.
                    minItems: 1
                    type: array
                    items:
                      anyOf:
                        - description: >-
                            Full EIP-712 permit signature data (payload and
                            metadata)
                          type: object
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
                          required:
                            - signablePayload
                            - metadata
                          additionalProperties: false
                        - description: On-chain signature data for direct contract calls
                          example:
                            to: '0x1111111254EEB25477B68fb85Ed929f73A960582'
                            data: 0xa9059cbb000000000000000000000000...
                            value: '0'
                            chainId: 1
                          type: object
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
                          required:
                            - to
                            - data
                            - value
                            - chainId
                          additionalProperties: false
                        - description: >-
                            Message with raw transaction hash to sign for simple
                            quote type
                          example:
                            message:
                              raw: >-
                                0xed96a92aa94b8b1927fc7c52ca3b3fcd0d706147dfbeda34a62dc232f6993029
                          type: object
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
                          required:
                            - message
                          additionalProperties: false
            description: >-
              Response schema for a MEE quote, including sender, fee, quote
              details, and payload to sign.
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
        description: >-
          Response schema for a MEE quote, including sender, fee, quote details,
          and payload to sign.
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
    '412':
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
              authorizations:
                allOf:
                  - type: array
                    items:
                      type: object
                      properties:
                        address:
                          description: 7702 delegation smart account address
                          type: string
                          example: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
                        chainId:
                          description: >-
                            7702 delegation chain Id, 0 for multichain and MEE
                            supported chain id if it is not multichain
                          type: number
                          example: 8453
                        nonce:
                          description: 7702 delegation nonce from EOA
                          type: number
                          example: '123456'
                      required:
                        - address
                        - chainId
                        - nonce
                      additionalProperties: false
            requiredProperties:
              - code
              - message
              - errors
              - authorizations
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
              authorizations:
                - address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
                  chainId: 8453
                  nonce: '123456'
        description: '412'
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