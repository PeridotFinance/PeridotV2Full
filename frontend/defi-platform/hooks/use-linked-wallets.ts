"use client"

import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { usePrivy } from "@privy-io/react-auth"

export type LinkedChainNamespace = "evm" | "stellar"

export interface LinkedWallet {
  id: number
  accountId: number
  chainNamespace: LinkedChainNamespace
  chainReference: string | null
  address: string
  normalizedAddress: string
  label: string | null
  isPrimary: boolean
  verificationStatus: "pending" | "verified" | "rejected"
  verificationMethod: string | null
  verifiedAt: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface WalletLinksResponse {
  success: boolean
  data?: {
    accountId: number | null
    links: LinkedWallet[]
  }
  error?: string
}

interface CreateWalletLinkInput {
  chainNamespace: LinkedChainNamespace
  address: string
  chainReference?: string
  label?: string
  setPrimary?: boolean
  metadata?: Record<string, unknown>
}

interface UpdateWalletLinkInput {
  id: number
  setPrimary?: boolean
  label?: string
  metadata?: Record<string, unknown>
}

interface LinkChallengeInput {
  chainNamespace: LinkedChainNamespace
  address: string
  chainReference?: string
  label?: string
  metadata?: Record<string, unknown>
}

interface LinkChallengeResponse {
  success: boolean
  data?: {
    challengeId: number
    nonce: string
    message: string
    expiresAt: string
    walletLink: LinkedWallet
  }
  error?: string
}

interface VerifyWalletLinkInput {
  chainNamespace: LinkedChainNamespace
  address: string
  signature: string
  nonce?: string
}

interface VerifyWalletLinkResponse {
  success: boolean
  data?: {
    walletLink: LinkedWallet
    verifiedWithChallengeId: number
  }
  error?: string
}

const QUERY_KEY = ["linked-wallets"] as const

export function useLinkedWallets() {
  const { authenticated, getAccessToken, ready } = usePrivy()
  const queryClient = useQueryClient()

  const enabled = ready && authenticated

  const authHeaders = async (): Promise<HeadersInit> => {
    const token = await getAccessToken()
    if (!token) {
      throw new Error("Missing Privy access token")
    }
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }
  }

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled,
    queryFn: async (): Promise<{ accountId: number | null; links: LinkedWallet[] }> => {
      const headers = await authHeaders()
      const response = await fetch("/api/account/wallet-links", { headers, method: "GET" })
      const payload = (await response.json()) as WalletLinksResponse

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || "Failed to fetch linked wallets")
      }
      return payload.data
    },
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  })

  const refetchLinks = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const createLinkMutation = useMutation({
    mutationFn: async (input: CreateWalletLinkInput): Promise<LinkedWallet> => {
      const headers = await authHeaders()
      const response = await fetch("/api/account/wallet-links", {
        method: "POST",
        headers,
        body: JSON.stringify(input),
      })
      const payload = (await response.json()) as { success: boolean; data?: LinkedWallet; error?: string }
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || "Failed to create wallet link")
      }
      return payload.data
    },
    onSuccess: refetchLinks,
  })

  const updateLinkMutation = useMutation({
    mutationFn: async (input: UpdateWalletLinkInput): Promise<LinkedWallet> => {
      const headers = await authHeaders()
      const response = await fetch(`/api/account/wallet-links/${input.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          setPrimary: input.setPrimary,
          label: input.label,
          metadata: input.metadata,
        }),
      })
      const payload = (await response.json()) as { success: boolean; data?: LinkedWallet; error?: string }
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || "Failed to update wallet link")
      }
      return payload.data
    },
    onSuccess: refetchLinks,
  })

  const deleteLinkMutation = useMutation({
    mutationFn: async (id: number): Promise<void> => {
      const headers = await authHeaders()
      const response = await fetch(`/api/account/wallet-links/${id}`, {
        method: "DELETE",
        headers,
      })
      const payload = (await response.json()) as { success: boolean; error?: string }
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to delete wallet link")
      }
    },
    onSuccess: refetchLinks,
  })

  const createChallengeMutation = useMutation({
    mutationFn: async (input: LinkChallengeInput): Promise<LinkChallengeResponse["data"]> => {
      const headers = await authHeaders()
      const response = await fetch("/api/account/wallet-links/challenge", {
        method: "POST",
        headers,
        body: JSON.stringify(input),
      })
      const payload = (await response.json()) as LinkChallengeResponse
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || "Failed to create wallet link challenge")
      }
      return payload.data
    },
    onSuccess: refetchLinks,
  })

  const verifyLinkMutation = useMutation({
    mutationFn: async (input: VerifyWalletLinkInput): Promise<VerifyWalletLinkResponse["data"]> => {
      const headers = await authHeaders()
      const response = await fetch("/api/account/wallet-links/verify", {
        method: "POST",
        headers,
        body: JSON.stringify(input),
      })
      const payload = (await response.json()) as VerifyWalletLinkResponse
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || "Failed to verify wallet link")
      }
      return payload.data
    },
    onSuccess: refetchLinks,
  })

  const groupedLinks = useMemo(() => {
    const links = query.data?.links || []
    return {
      evm: links.filter((link) => link.chainNamespace === "evm"),
      stellar: links.filter((link) => link.chainNamespace === "stellar"),
    }
  }, [query.data?.links])

  return {
    accountId: query.data?.accountId ?? null,
    links: query.data?.links || [],
    groupedLinks,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,

    createLink: createLinkMutation.mutateAsync,
    updateLink: updateLinkMutation.mutateAsync,
    deleteLink: deleteLinkMutation.mutateAsync,
    createChallenge: createChallengeMutation.mutateAsync,
    verifyLink: verifyLinkMutation.mutateAsync,

    isMutating:
      createLinkMutation.isPending ||
      updateLinkMutation.isPending ||
      deleteLinkMutation.isPending ||
      createChallengeMutation.isPending ||
      verifyLinkMutation.isPending,
  }
}
