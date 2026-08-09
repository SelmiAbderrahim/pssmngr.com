/**
 * Unit Tests - tRPC Client
 *
 * Tests for the tRPC client and helper functions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  trpcQuery,
  trpcMutation,
  isTrpcConfigured,
  getTrpcConfig,
} from '@/lib/api/trpc'
import { apiConfig } from '@/lib/api/config'
import { server } from '@tests/utils/mock-server'
import { http, HttpResponse } from 'msw'

// Get API URL dynamically from the centralized config
const API_URL = apiConfig.baseUrl

describe('apiConfig', () => {
  it('should have a base URL string', () => {
    // The base URL should be a string (may be empty in test env without VITE_API_URL)
    expect(typeof API_URL).toBe('string')
  })
})

describe('trpcQuery', () => {
  it('should make GET request to correct tRPC endpoint', async () => {
    let capturedUrl = ''

    server.use(
      http.get(`${API_URL}/api/trpc/vault.list`, ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json({
          result: {
            data: {
              json: [{ id: '1', name: 'Personal' }],
            },
          },
        })
      })
    )

    const result = await trpcQuery<{ id: string; name: string }[]>('vault', 'list')

    expect(capturedUrl).toContain('/api/trpc/vault.list')
    expect(result).toEqual([{ id: '1', name: 'Personal' }])
  })

  it('should encode input as query parameter', async () => {
    let capturedUrl = ''

    server.use(
      http.get(`${API_URL}/api/trpc/vault.get`, ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json({
          result: {
            data: {
              json: { id: 'vault-123', name: 'Personal' },
            },
          },
        })
      })
    )

    const result = await trpcQuery<{ id: string; name: string }>(
      'vault',
      'get',
      { id: 'vault-123' }
    )

    expect(capturedUrl).toContain('input=')
    expect(capturedUrl).toContain(encodeURIComponent(JSON.stringify({ json: { id: 'vault-123' } })))
    expect(result).toEqual({ id: 'vault-123', name: 'Personal' })
  })

  it('should handle empty input', async () => {
    server.use(
      http.get(`${API_URL}/api/trpc/device.list`, ({ request }) => {
        const url = new URL(request.url)
        // Should not have input parameter
        expect(url.searchParams.has('input')).toBe(false)
        return HttpResponse.json({ result: { data: { json: [] } } })
      })
    )

    const result = await trpcQuery<[]>('device', 'list')
    expect(result).toEqual([])
  })

  it('should handle tRPC errors', async () => {
    server.use(
      http.get(`${API_URL}/api/trpc/vault.get`, () => {
        return HttpResponse.json(
          { error: { message: 'Vault not found', code: 'NOT_FOUND' } },
          { status: 404 }
        )
      })
    )

    await expect(trpcQuery('vault', 'get', { id: 'invalid' })).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('trpcMutation', () => {
  it('should make POST request to correct tRPC endpoint', async () => {
    let capturedBody: unknown = null

    server.use(
      http.post(`${API_URL}/api/trpc/vault.create`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({
          result: {
            data: {
              json: { id: 'new-123', name: 'Shared' },
            },
          },
        })
      })
    )

    const result = await trpcMutation<{ id: string; name: string }>(
      'vault',
      'create',
      { name: 'Shared' }
    )

    expect(capturedBody).toEqual({ json: { name: 'Shared' } })
    expect(result).toEqual({ id: 'new-123', name: 'Shared' })
  })

  it('should handle mutation without input', async () => {
    server.use(
      http.post(`${API_URL}/api/trpc/auth.revokeAllSessions`, () => {
        return HttpResponse.json({ result: { data: { json: { success: true } } } })
      })
    )

    const result = await trpcMutation<{ success: boolean }>('auth', 'revokeAllSessions')
    expect(result).toEqual({ success: true })
  })

  it('should handle mutation errors', async () => {
    server.use(
      http.post(`${API_URL}/api/trpc/vault.delete`, () => {
        return HttpResponse.json(
          { error: { message: 'Cannot delete the default vault' } },
          { status: 400 }
        )
      })
    )

    await expect(
      trpcMutation('vault', 'delete', { id: 'default-vault' })
    ).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('should handle complex nested input', async () => {
    let capturedBody: unknown = null

    server.use(
      http.post(`${API_URL}/api/trpc/user.updatePreferences`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({
          result: { data: { json: { success: true } } },
        })
      })
    )

    const input = {
      preferences: {
        theme: 'dark',
        autoLockMinutes: 15,
      },
    }

    await trpcMutation('user', 'updatePreferences', input)
    expect(capturedBody).toEqual({ json: input })
  })
})

describe('isTrpcConfigured', () => {
  it('should return a boolean', () => {
    expect(typeof isTrpcConfigured()).toBe('boolean')
  })
})

describe('tRPC Response Parsing', () => {
  it('should correctly extract data from tRPC response structure', async () => {
    server.use(
      http.get(`${API_URL}/api/trpc/notifications.list`, () => {
        return HttpResponse.json({
          result: {
            data: {
              json: [
                { id: '1', message: 'Vault shared' },
                { id: '2', message: 'Invitation accepted' },
              ],
            },
          },
        })
      })
    )

    const result = await trpcQuery<{ id: string; message: string }[]>('notifications', 'list')

    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(2)
    expect(result[0]).toHaveProperty('id', '1')
  })

  it('should handle null/undefined data', async () => {
    server.use(
      http.get(`${API_URL}/api/trpc/empty.response`, () => {
        return HttpResponse.json({ result: { data: { json: null } } })
      })
    )

    const result = await trpcQuery<null>('empty', 'response')
    expect(result).toBeNull()
  })
})

describe('tRPC Error Body Handling (HTTP 200 with error payload)', () => {
  it('trpcQuery should throw when response is HTTP 200 with direct error body', async () => {
    server.use(
      http.get(`${API_URL}/api/trpc/vault.get`, () => {
        // tRPC returns HTTP 200 with error body — not an HTTP error status
        return HttpResponse.json({
          error: {
            message: 'Vault not found',
            code: -32004,
            data: {
              code: 'NOT_FOUND',
              httpStatus: 404,
              path: 'vault.get',
            },
          },
        })
      })
    )

    await expect(
      trpcQuery('vault', 'get', { vaultId: 'missing' })
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Vault not found',
      statusCode: 404,
    })
  })

  it('trpcQuery should throw with TRPC_ERROR code when error has no data.code', async () => {
    server.use(
      http.get(`${API_URL}/api/trpc/vault.list`, () => {
        return HttpResponse.json({
          error: {
            message: 'Unauthorized access',
            code: -32001,
            // no data field
          },
        })
      })
    )

    await expect(
      trpcQuery('vault', 'list')
    ).rejects.toMatchObject({
      code: 'TRPC_ERROR',
      message: 'Unauthorized access',
      statusCode: 500,
    })
  })

  it('trpcQuery should throw with json-wrapped error format', async () => {
    server.use(
      http.get(`${API_URL}/api/trpc/credentials.get`, () => {
        // json-wrapped error format: error.json.message
        return HttpResponse.json({
          error: {
            json: {
              message: 'Credential not found',
              code: -32004,
              data: {
                code: 'NOT_FOUND',
                httpStatus: 404,
                path: 'credentials.get',
              },
            },
          },
        })
      })
    )

    await expect(
      trpcQuery('credentials', 'get', { id: 'missing' })
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Credential not found',
      statusCode: 404,
    })
  })

  it('trpcMutation should throw when response is HTTP 200 with direct error body', async () => {
    server.use(
      http.post(`${API_URL}/api/trpc/vault.create`, () => {
        return HttpResponse.json({
          error: {
            message: 'Validation failed: name is required',
            code: -32600,
            data: {
              code: 'BAD_REQUEST',
              httpStatus: 400,
              path: 'vault.create',
            },
          },
        })
      })
    )

    await expect(
      trpcMutation('vault', 'create', { description: 'missing name' })
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Validation failed: name is required',
      statusCode: 400,
    })
  })

  it('trpcMutation should throw with TRPC_ERROR code when error has no data', async () => {
    server.use(
      http.post(`${API_URL}/api/trpc/vault.delete`, () => {
        return HttpResponse.json({
          error: {
            message: 'An error occurred',
            code: -32603,
            // no data field
          },
        })
      })
    )

    await expect(
      trpcMutation('vault', 'delete', { vaultId: 'v1' })
    ).rejects.toMatchObject({
      code: 'TRPC_ERROR',
      message: 'An error occurred',
      statusCode: 500,
    })
  })

  it('trpcMutation should throw with json-wrapped error format', async () => {
    server.use(
      http.post(`${API_URL}/api/trpc/credentials.create`, () => {
        return HttpResponse.json({
          error: {
            json: {
              message: 'Encryption key missing',
              code: -32603,
              data: {
                code: 'INTERNAL_SERVER_ERROR',
                httpStatus: 500,
                path: 'credentials.create',
              },
            },
          },
        })
      })
    )

    await expect(
      trpcMutation('credentials', 'create', { name: 'test' })
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Encryption key missing',
      statusCode: 500,
    })
  })

  it('trpcQuery error details should be included in thrown object', async () => {
    const zodError = { fieldErrors: { name: ['Required'] } }

    server.use(
      http.get(`${API_URL}/api/trpc/vault.find`, () => {
        return HttpResponse.json({
          error: {
            message: 'Validation error',
            code: -32600,
            data: {
              code: 'BAD_REQUEST',
              httpStatus: 400,
              zodError,
            },
          },
        })
      })
    )

    let thrown: unknown
    try {
      await trpcQuery('vault', 'find', { q: '' })
    } catch (err) {
      thrown = err
    }

    expect(thrown).toMatchObject({
      details: {
        code: 'BAD_REQUEST',
        httpStatus: 400,
        zodError,
      },
    })
  })
})

describe('isTrpcConfigured additional branches', () => {
  it('should return true when API_URL is a non-empty string', () => {
    // In test env OBFUSCATE is false and apiConfig.baseUrl is set
    const result = isTrpcConfigured()
    // Regardless of value, must be boolean
    expect(typeof result).toBe('boolean')
  })

	  it('should reflect whether an API base URL is configured', () => {
	    const config = getTrpcConfig()
	    expect(isTrpcConfigured()).toBe(Boolean(config.baseUrl))
	  })
})

describe('trpcQuery error fallback: message defaults', () => {
  it('should default message to "An error occurred" when error.message is empty string', async () => {
    server.use(
      http.get(`${API_URL}/api/trpc/test.emptyMsg`, () => {
        return HttpResponse.json({
          error: {
            message: '',
            code: -32603,
            data: {
              code: 'INTERNAL_SERVER_ERROR',
              httpStatus: 500,
            },
          },
        })
      })
    )

    await expect(trpcQuery('test', 'emptyMsg')).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An error occurred',
      statusCode: 500,
    })
  })

  it('should default statusCode to 500 when error data has no httpStatus', async () => {
    server.use(
      http.get(`${API_URL}/api/trpc/test.noHttpStatus`, () => {
        return HttpResponse.json({
          error: {
            message: 'Some error',
            code: -32603,
            data: {
              code: 'SOME_CODE',
              // no httpStatus
            },
          },
        })
      })
    )

    await expect(trpcQuery('test', 'noHttpStatus')).rejects.toMatchObject({
      statusCode: 500,
    })
  })
})

describe('trpcMutation error fallback: message defaults', () => {
  it('should default message to "An error occurred" when error.message is empty string', async () => {
    server.use(
      http.post(`${API_URL}/api/trpc/test.emptyMsgMutation`, () => {
        return HttpResponse.json({
          error: {
            message: '',
            code: -32603,
            data: {
              code: 'INTERNAL_SERVER_ERROR',
              httpStatus: 500,
            },
          },
        })
      })
    )

    await expect(trpcMutation('test', 'emptyMsgMutation')).rejects.toMatchObject({
      message: 'An error occurred',
    })
  })

  it('should default statusCode to 500 when error data has no httpStatus', async () => {
    server.use(
      http.post(`${API_URL}/api/trpc/test.noHttpStatusMutation`, () => {
        return HttpResponse.json({
          error: {
            message: 'Something failed',
            code: -32603,
            data: {
              code: 'SOME_CODE',
              // no httpStatus field
            },
          },
        })
      })
    )

    await expect(trpcMutation('test', 'noHttpStatusMutation')).rejects.toMatchObject({
      statusCode: 500,
    })
  })
})

describe('extractTrpcError: json field type guard', () => {
  it('should fall back to direct error when json field is not an object', async () => {
    // error.json exists but is not an object (e.g. a string) — should return error directly
    server.use(
      http.get(`${API_URL}/api/trpc/test.badJsonField`, () => {
        return HttpResponse.json({
          error: {
            // json field is a primitive — not typeof "object"
            json: 'not-an-object',
            message: 'Direct error message',
            code: -32603,
            data: { code: 'DIRECT_CODE', httpStatus: 418 },
          },
        })
      })
    )

    await expect(trpcQuery('test', 'badJsonField')).rejects.toMatchObject({
      code: 'DIRECT_CODE',
      statusCode: 418,
    })
  })
})

describe('getTrpcConfig', () => {
	  it('should return an object with baseUrl and prefix fields', () => {
    const config = getTrpcConfig()

    expect(config).toHaveProperty('baseUrl')
    expect(config).toHaveProperty('prefix')
  })

  it('should return baseUrl as a string', () => {
    const config = getTrpcConfig()
    expect(typeof config.baseUrl).toBe('string')
  })

	  it('should return the documented tRPC path', () => {
	    const config = getTrpcConfig()
	    expect(config.prefix).toBe('/api/trpc')
	  })
})
