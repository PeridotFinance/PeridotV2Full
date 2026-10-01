# Prepare 7702 authorization

> Prepare 7702 authorization for supertransaction which delegates the EOA to smart account

## OpenAPI

````yaml supertransaction-api/openapi.yaml post /v1/mee/prepare7702
paths:
  path: /v1/mee/prepare7702
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
          - type: array
            items:
              allOf:
                - type: object
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
            description: >-
              Authorization to be signed by users to enable SCA delegation for
              supertransaction orchestration
        examples:
          example:
            value:
              - address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
                chainId: 8453
                nonce: '123456'
        description: >-
          Authorization to be signed by users to enable SCA delegation for
          supertransaction orchestration
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