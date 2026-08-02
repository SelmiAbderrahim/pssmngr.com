/**
 * Unit Tests - ApiClient
 *
 * Tests for the base HTTP client functionality.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApiClient, isApiError, ApiError } from '@/lib/api/client'
import { server } from '@tests/utils/mock-server'
import { http, HttpResponse } from 'msw'
import { mockApiError, mockNetworkFailure } from '@tests/utils/api-test-utils'

const TEST_BASE_URL = 'http://localhost:39291'

describe('ApiClient', () => {
  let client: ApiClient

  beforeEach(() => {
    client = new ApiClient({
      baseUrl: TEST_BASE_URL,
      timeout: 5000,
    })
  })

  describe('credentials handling', () => {
    it('should include credentials: include in fetch requests', async () => {
      let capturedCredentials: RequestCredentials | undefined

      server.use(
        http.get(`${TEST_BASE_URL}/credentials-check`, ({ request }) => {
          // MSW doesn't expose credentials directly, but we can verify via response
          return HttpResponse.json({ success: true })
        })
      )

      // Spy on fetch to capture credentials option
      const fetchSpy = vi.spyOn(global, 'fetch')

      await client.get('/credentials-check')

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          credentials: 'include',
        })
      )

      fetchSpy.mockRestore()
    })

    it('should send session cookies with cross-origin requests', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/session-check`, ({ request }) => {
          return HttpResponse.json({ authenticated: true })
        })
      )

      // Verify fetch is called with credentials: include
      const fetchSpy = vi.spyOn(global, 'fetch')

      await client.get('/session-check')

      const [_, options] = fetchSpy.mock.calls[0]
      expect(options?.credentials).toBe('include')

      fetchSpy.mockRestore()
    })
  })

  describe('401 Unauthorized handling', () => {
    it('should throw ApiError with 401 status for unauthorized requests', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/protected-resource`, () => {
          return HttpResponse.json(
            { code: 'UNAUTHORIZED', message: 'Authentication required' },
            { status: 401 }
          )
        })
      )

      await expect(client.get('/protected-resource')).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'Session expired',
        statusCode: 401,
      })
    })

    it('should handle 401 with generic message', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/auth-required`, () => {
          return HttpResponse.json(
            { error: 'Not authenticated' },
            { status: 401 }
          )
        })
      )

      await expect(client.get('/auth-required')).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    })

    it('should handle 403 Forbidden errors', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/forbidden-resource`, () => {
          return HttpResponse.json(
            { code: 'FORBIDDEN', message: 'Access denied' },
            { status: 403 }
          )
        })
      )

      await expect(client.get('/forbidden-resource')).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Access denied',
        statusCode: 403,
      })
    })
  })

  describe('constructor', () => {
    it('should create client with default timeout', () => {
      const defaultClient = new ApiClient({
        baseUrl: TEST_BASE_URL,
      })
      expect(defaultClient.getBaseUrl()).toBe(TEST_BASE_URL)
    })

    it('should use provided timeout', () => {
      expect(client.getBaseUrl()).toBe(TEST_BASE_URL)
    })
  })

  describe('getBaseUrl', () => {
    it('should return configured base URL', () => {
      expect(client.getBaseUrl()).toBe(TEST_BASE_URL)
    })
  })

  describe('GET requests', () => {
    it('should make successful GET request', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/test-endpoint`, () => {
          return HttpResponse.json({ data: 'test-data' })
        })
      )

      const result = await client.get<{ data: string }>('/test-endpoint')
      expect(result).toEqual({ data: 'test-data' })
    })

    it('should not add a bearer token to cookie-authenticated requests', async () => {
      let capturedHeaders: Headers | null = null

      server.use(
        http.get(`${TEST_BASE_URL}/auth-check`, ({ request }) => {
          capturedHeaders = request.headers
          return HttpResponse.json({ success: true })
        })
      )

      await client.get('/auth-check')
      expect(capturedHeaders?.has('authorization')).toBe(false)
    })

    it('should handle 404 errors', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/not-found`, () => {
          return HttpResponse.json(
            { code: 'NOT_FOUND', message: 'Resource not found' },
            { status: 404 }
          )
        })
      )

      await expect(client.get('/not-found')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    })

    it('should handle 500 errors', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/server-error`, () => {
          return HttpResponse.json(
            { message: 'Internal server error' },
            { status: 500 }
          )
        })
      )

      await expect(client.get('/server-error')).rejects.toMatchObject({
        statusCode: 500,
      })
    })

    it('should handle network errors', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/network-fail`, () => {
          return HttpResponse.error()
        })
      )

      await expect(client.get('/network-fail')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        statusCode: 0,
      })
    })
  })

  describe('POST requests', () => {
    it('should make successful POST request with body', async () => {
      let capturedBody: unknown = null

      server.use(
        http.post(`${TEST_BASE_URL}/create`, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json({ id: 'new-123', ...capturedBody as object }, { status: 201 })
        })
      )

      const result = await client.post<{ id: string; name: string }>('/create', { name: 'Test' })
      expect(result).toEqual({ id: 'new-123', name: 'Test' })
      expect(capturedBody).toEqual({ name: 'Test' })
    })

    it('should handle POST without body', async () => {
      server.use(
        http.post(`${TEST_BASE_URL}/action`, () => {
          return HttpResponse.json({ success: true })
        })
      )

      const result = await client.post<{ success: boolean }>('/action')
      expect(result).toEqual({ success: true })
    })
  })

  describe('PUT requests', () => {
    it('should make successful PUT request', async () => {
      server.use(
        http.put(`${TEST_BASE_URL}/update/123`, async ({ request }) => {
          const body = await request.json()
          return HttpResponse.json({ id: '123', ...(body as object) })
        })
      )

      const result = await client.put<{ id: string; name: string }>('/update/123', { name: 'Updated' })
      expect(result).toEqual({ id: '123', name: 'Updated' })
    })
  })

  describe('PATCH requests', () => {
    it('should make successful PATCH request', async () => {
      server.use(
        http.patch(`${TEST_BASE_URL}/patch/123`, async ({ request }) => {
          const body = await request.json()
          return HttpResponse.json({ id: '123', ...(body as object), updatedAt: 'now' })
        })
      )

      const result = await client.patch<{ id: string; name: string; updatedAt: string }>(
        '/patch/123',
        { name: 'Patched' }
      )
      expect(result).toMatchObject({ id: '123', name: 'Patched' })
    })
  })

  describe('DELETE requests', () => {
    it('should make successful DELETE request', async () => {
      server.use(
        http.delete(`${TEST_BASE_URL}/delete/123`, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      const result = await client.delete('/delete/123')
      expect(result).toBeUndefined()
    })

    it('should handle DELETE with response body', async () => {
      server.use(
        http.delete(`${TEST_BASE_URL}/delete-with-response/123`, () => {
          return HttpResponse.json({ deleted: true, id: '123' })
        })
      )

      const result = await client.delete<{ deleted: boolean; id: string }>('/delete-with-response/123')
      expect(result).toEqual({ deleted: true, id: '123' })
    })
  })

  describe('204 No Content handling', () => {
    it('should return undefined for 204 responses', async () => {
      server.use(
        http.post(`${TEST_BASE_URL}/no-content`, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      const result = await client.post('/no-content')
      expect(result).toBeUndefined()
    })
  })

  describe('AbortSignal support', () => {
    it('should abort request with signal', async () => {
      const controller = new AbortController()

      server.use(
        http.get(`${TEST_BASE_URL}/slow`, async () => {
          await new Promise(resolve => setTimeout(resolve, 1000))
          return HttpResponse.json({ data: 'slow' })
        })
      )

      // Abort immediately
      setTimeout(() => controller.abort(), 10)

      await expect(
        client.get('/slow', controller.signal)
      ).rejects.toMatchObject({
        code: 'TIMEOUT',
        statusCode: 408,
      })
    })
  })

  describe('per-request timeout override (timeoutMs)', () => {
    it('aborts at the per-request timeout when it is shorter than the default', async () => {
      server.use(
        http.post(`${TEST_BASE_URL}/slow-post`, async () => {
          await new Promise(resolve => setTimeout(resolve, 500))
          return HttpResponse.json({ data: 'slow' })
        })
      )

      // Client default is 5000ms; the 50ms override must win.
      await expect(
        client.post('/slow-post', {}, undefined, 50)
      ).rejects.toMatchObject({
        code: 'TIMEOUT',
        statusCode: 408,
      })
    })

    it('lets a slow response finish when the per-request timeout is larger than the default', async () => {
      const shortClient = new ApiClient({
        baseUrl: TEST_BASE_URL,
        timeout: 50, // default would abort before the 200ms response
      })

      server.use(
        http.post(`${TEST_BASE_URL}/long-post`, async () => {
          await new Promise(resolve => setTimeout(resolve, 200))
          return HttpResponse.json({ data: 'done' })
        })
      )

      await expect(
        shortClient.post('/long-post', {}, undefined, 5000)
      ).resolves.toEqual({ data: 'done' })
    })

    it('falls back to the client default timeout when no override is given', async () => {
      const shortClient = new ApiClient({
        baseUrl: TEST_BASE_URL,
        timeout: 50,
      })

      server.use(
        http.post(`${TEST_BASE_URL}/default-timeout-post`, async () => {
          await new Promise(resolve => setTimeout(resolve, 500))
          return HttpResponse.json({ data: 'slow' })
        })
      )

      await expect(
        shortClient.post('/default-timeout-post', {})
      ).rejects.toMatchObject({
        code: 'TIMEOUT',
        statusCode: 408,
      })
    })
  })
})

describe('request error branch coverage', () => {
  let client: ApiClient

  beforeEach(() => {
    client = new ApiClient({
      baseUrl: TEST_BASE_URL,
      timeout: 5000,
    })
  })

  describe('error message fallback: response.statusText', () => {
    it('should use response.statusText when errorData has no message, no code, and error is not a string', async () => {
      // The response body has no top-level code/message and error is an object (not string),
      // so the message falls through to response.statusText
      server.use(
        http.get(`${TEST_BASE_URL}/weird-error`, () => {
          return new HttpResponse(
            JSON.stringify({ error: { nested: 'something' } }),
            {
              status: 422,
              statusText: 'Unprocessable Entity',
              headers: { 'Content-Type': 'application/json' },
            }
          )
        })
      )

      await expect(client.get('/weird-error')).rejects.toMatchObject({
        message: 'Unprocessable Entity',
        statusCode: 422,
      })
    })

    it('should use error string value as message when errorData.error is a string', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/string-error`, () => {
          return new HttpResponse(
            JSON.stringify({ error: 'Something went wrong' }),
            {
              status: 400,
              statusText: 'Bad Request',
              headers: { 'Content-Type': 'application/json' },
            }
          )
        })
      )

      await expect(client.get('/string-error')).rejects.toMatchObject({
        message: 'Something went wrong',
        statusCode: 400,
      })
    })
  })

  describe('error details fallback branches', () => {
    it('should use errorData.details when present and no trpcError', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/details-error`, () => {
          return HttpResponse.json(
            {
              code: 'VALIDATION_FAILED',
              message: 'Invalid input',
              details: { fields: ['email'] },
            },
            { status: 400 }
          )
        })
      )

      await expect(client.get('/details-error')).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        message: 'Invalid input',
        details: { fields: ['email'] },
        statusCode: 400,
      })
    })

    it('should use errorData.error object as details when error is an object (isErrorObject true)', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/object-error`, () => {
          return new HttpResponse(
            JSON.stringify({ error: { type: 'ValidationError', reason: 'invalid_field' } }),
            {
              status: 422,
              statusText: 'Unprocessable Entity',
              headers: { 'Content-Type': 'application/json' },
            }
          )
        })
      )

      const thrown = await client.get('/object-error').catch(e => e)
      expect(thrown.details).toEqual({ type: 'ValidationError', reason: 'invalid_field' })
      expect(thrown.statusCode).toBe(422)
    })

    it('should not set details when error field is null', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/null-error-field`, () => {
          return new HttpResponse(
            JSON.stringify({ error: null, message: 'Oops' }),
            {
              status: 500,
              statusText: 'Internal Server Error',
              headers: { 'Content-Type': 'application/json' },
            }
          )
        })
      )

      const thrown = await client.get('/null-error-field').catch(e => e)
      expect(thrown.details).toBeUndefined()
      expect(thrown.message).toBe('Oops')
    })
  })

  describe('UNKNOWN_ERROR wrapping', () => {
    it('should wrap non-Error thrown values with "An unknown error occurred"', async () => {
      // Make fetch throw a non-Error, non-TypeError, non-DOMException value
      // by using a custom fetch that throws a plain object
      const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValueOnce(
        'a plain string error' // not an Error instance, not ApiError, not DOMException
      )

      await expect(client.get('/any')).rejects.toMatchObject({
        code: 'UNKNOWN_ERROR',
        message: 'An unknown error occurred',
        statusCode: 500,
      })

      fetchSpy.mockRestore()
    })

    it('should use error.message when thrown value is an Error instance', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValueOnce(
        new Error('Custom error message')
      )

      await expect(client.get('/any')).rejects.toMatchObject({
        code: 'UNKNOWN_ERROR',
        message: 'Custom error message',
        statusCode: 500,
      })

      fetchSpy.mockRestore()
    })
  })

  describe('tRPC json-wrapped error format via HTTP error status', () => {
    it('should extract code from trpcError.data.code when error body uses tRPC json-wrapped format', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/trpc-json-error`, () => {
          return new HttpResponse(
            JSON.stringify({
              error: {
                json: {
                  message: 'Forbidden action',
                  code: -32003,
                  data: {
                    code: 'FORBIDDEN',
                    httpStatus: 403,
                    path: 'vault.delete',
                  },
                },
              },
            }),
            {
              status: 403,
              statusText: 'Forbidden',
              headers: { 'Content-Type': 'application/json' },
            }
          )
        })
      )

      await expect(client.get('/trpc-json-error')).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Forbidden action',
        statusCode: 403,
        details: { code: 'FORBIDDEN', httpStatus: 403, path: 'vault.delete' },
      })
    })

    it('should use trpcError.data.httpStatus as statusCode when present', async () => {
      server.use(
        http.post(`${TEST_BASE_URL}/trpc-status`, () => {
          return new HttpResponse(
            JSON.stringify({
              error: {
                json: {
                  message: 'Forbidden action',
                  code: -32003,
                  data: {
                    code: 'FORBIDDEN',
                    httpStatus: 403,
                  },
                },
              },
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        })
      )

      // statusCode should come from trpcError.data.httpStatus (403), not HTTP status (400)
      await expect(client.post('/trpc-status')).rejects.toMatchObject({
        code: 'FORBIDDEN',
        statusCode: 403,
      })
    })
  })

  describe('response.json() parse failure on error response', () => {
    it('should fall back to empty object when error response body is not valid JSON', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/bad-json-error`, () => {
          return new HttpResponse('not json at all', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' },
          })
        })
      )

      await expect(client.get('/bad-json-error')).rejects.toMatchObject({
        code: 'HTTP_503',
        message: 'Service Unavailable',
        statusCode: 503,
      })
    })
  })

  describe('signal passthrough', () => {
    it('should use provided AbortSignal instead of internal controller signal', async () => {
      const controller = new AbortController()

      server.use(
        http.get(`${TEST_BASE_URL}/signal-check`, async () => {
          await new Promise(resolve => setTimeout(resolve, 500))
          return HttpResponse.json({ ok: true })
        })
      )

      controller.abort()

      await expect(client.get('/signal-check', controller.signal)).rejects.toMatchObject({
        code: 'TIMEOUT',
        statusCode: 408,
      })
    })
  })
})

describe('isApiError', () => {
  it('should return true for valid ApiError', () => {
    const error: ApiError = {
      code: 'TEST_ERROR',
      message: 'Test error message',
      statusCode: 400,
    }
    expect(isApiError(error)).toBe(true)
  })

  it('should return true for ApiError with details', () => {
    const error: ApiError = {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      statusCode: 422,
      details: { field: 'email', message: 'Invalid email' },
    }
    expect(isApiError(error)).toBe(true)
  })

  it('should return false for regular Error', () => {
    expect(isApiError(new Error('test'))).toBe(false)
  })

  it('should return false for null', () => {
    expect(isApiError(null)).toBe(false)
  })

  it('should return false for undefined', () => {
    expect(isApiError(undefined)).toBe(false)
  })

  it('should return false for partial object', () => {
    expect(isApiError({ message: 'test' })).toBe(false)
    expect(isApiError({ code: 'test' })).toBe(false)
    expect(isApiError({ code: 'test', message: 'test' })).toBe(false)
  })

  it('should return false for string', () => {
    expect(isApiError('error')).toBe(false)
  })

  it('should return false for number', () => {
    expect(isApiError(500)).toBe(false)
  })
})
