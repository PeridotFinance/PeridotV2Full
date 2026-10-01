import { QueryClient } from '@tanstack/react-query'

// Global QueryClient instance
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reduce refetch frequency for better UX
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // Cache for 5 minutes by default
      staleTime: 5 * 60 * 1000,
    },
  },
})

