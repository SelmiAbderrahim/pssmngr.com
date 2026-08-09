/**
 * React Query Test Wrapper
 *
 * Provides QueryClient wrapper for testing React Query hooks.
 */

import React, { ReactElement, ReactNode, createContext, useContext } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, RenderOptions } from '@testing-library/react'
import type { AuthContextValue } from '@/types/auth'

// Mock AuthContext for testing
const MockAuthContext = createContext<AuthContextValue | undefined>(undefined)

const mockAuthValue: AuthContextValue = {
  status: 'authenticated',
  user: {
    _id: 'test-user-id',
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    username: 'testuser',
    avatarUrl: undefined,
    emailVerificationTime: Date.now(),
    createdAt: Date.now(),
    authProvider: 'password',
    role: 'admin',
  },
  isLoading: false,
  onboardingStep: null,
  isPendingOnboarding: false,
  shouldRedirectToOnboarding: false,
  shouldRedirectToDashboard: true,
  setPendingOnboarding: () => {},
  refreshUser: () => {},
  _mutationTimestamp: null,
  _setMutationTimestamp: () => {},
}

function MockAuthProvider({ children }: { children: ReactNode }) {
  return (
    <MockAuthContext.Provider value={mockAuthValue}>
      {children}
    </MockAuthContext.Provider>
  )
}

/**
 * Create a QueryClient configured for testing
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

interface WrapperProps {
  children: ReactNode
}

/**
 * Create a wrapper component for React Query hooks
 */
export function createQueryWrapper() {
  const queryClient = createTestQueryClient()

  return function Wrapper({ children }: WrapperProps) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

/**
 * Create a wrapper component for React Query hooks with Auth context
 */
export function createQueryWrapperWithAuth() {
  const queryClient = createTestQueryClient()

  return function Wrapper({ children }: WrapperProps) {
    return (
      <MockAuthContext.Provider value={mockAuthValue}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </MockAuthContext.Provider>
    )
  }
}

export { MockAuthContext, mockAuthValue }

/**
 * Render with React Query provider
 */
export function renderWithQuery(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  const queryClient = createTestQueryClient()

  const Wrapper = ({ children }: WrapperProps) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient,
  }
}

/**
 * Create QueryClient and render, returning both
 */
export function setupQueryTest() {
  const queryClient = createTestQueryClient()
  const wrapper = createQueryWrapper()

  return { queryClient, wrapper }
}
