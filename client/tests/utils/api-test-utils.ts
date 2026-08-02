/**
 * API Test Utilities
 *
 * Helper functions for testing API integrations.
 */

import { http, HttpResponse } from 'msw'
import { server } from './mock-server'

// Hardcoded to match vitest.config.ts define → import.meta.env.VITE_API_URL
const API_URL = 'http://localhost:39291'

/**
 * Override a handler to return an error response
 */
export function mockApiError(
  method: 'get' | 'post' | 'patch' | 'delete' | 'put',
  endpoint: string,
  statusCode: number,
  errorMessage: string
) {
  const fullUrl = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`

  const handler = http[method](fullUrl, () => {
    return HttpResponse.json(
      { error: { code: `HTTP_${statusCode}`, message: errorMessage } },
      { status: statusCode }
    )
  })

  server.use(handler)
}

/**
 * Mock a network timeout
 */
export function mockNetworkTimeout(endpoint: string) {
  const fullUrl = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`

  server.use(
    http.get(fullUrl, async () => {
      // Delay longer than timeout
      await new Promise(resolve => setTimeout(resolve, 35000))
      return HttpResponse.error()
    })
  )
}

/**
 * Mock a network failure
 */
export function mockNetworkFailure(endpoint: string) {
  const fullUrl = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`

  server.use(http.get(fullUrl, () => HttpResponse.error()))
}

/**
 * Mock a tRPC query response
 * Response format: { result: { data: { json: T } } }
 */
export function mockTrpcQuery<T>(
  router: string,
  procedure: string,
  data: T
) {
  const endpoint = `${API_URL}/api/trpc/${router}.${procedure}`

  server.use(
    http.get(endpoint, () => {
      return HttpResponse.json({ result: { data: { json: data } } })
    })
  )
}

/**
 * Mock a tRPC mutation response
 * Response format: { result: { data: { json: T } } }
 */
export function mockTrpcMutation<T>(
  router: string,
  procedure: string,
  data: T
) {
  const endpoint = `${API_URL}/api/trpc/${router}.${procedure}`

  server.use(
    http.post(endpoint, () => {
      return HttpResponse.json({ result: { data: { json: data } } })
    })
  )
}

/**
 * Mock a tRPC error
 * ApiClient extracts: code from errorData.code, message from errorData.message
 */
export function mockTrpcError(
  router: string,
  procedure: string,
  statusCode: number,
  message: string
) {
  const endpoint = `${API_URL}/api/trpc/${router}.${procedure}`

  // ApiClient looks for top-level code and message
  const errorResponse = {
    code: `HTTP_${statusCode}`,
    message,
  }

  server.use(
    http.get(endpoint, () => {
      return HttpResponse.json(errorResponse, { status: statusCode })
    }),
    http.post(endpoint, () => {
      return HttpResponse.json(errorResponse, { status: statusCode })
    })
  )
}

/**
 * Create a spy for API calls to track what was sent
 */
export function createApiSpy(method: 'get' | 'post', endpoint: string) {
  const fullUrl = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`
  const calls: { url: string; body?: unknown }[] = []

  server.use(
    http[method](fullUrl, async ({ request }) => {
      const body = method === 'post' ? await request.json().catch(() => null) : null
      calls.push({ url: request.url, body })
      // Let the request continue to the next handler
      return undefined as unknown as HttpResponse
    })
  )

  return {
    getCalls: () => calls,
    getLastCall: () => calls[calls.length - 1],
    wasCalledWith: (expected: { url?: string; body?: unknown }) => {
      return calls.some(call => {
        const urlMatch = !expected.url || call.url.includes(expected.url)
        const bodyMatch = !expected.body || JSON.stringify(call.body) === JSON.stringify(expected.body)
        return urlMatch && bodyMatch
      })
    },
  }
}

/**
 * Wait for all pending requests to complete
 */
export async function waitForRequests(ms = 100) {
  await new Promise(resolve => setTimeout(resolve, ms))
}
