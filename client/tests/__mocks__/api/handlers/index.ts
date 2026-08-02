/**
 * MSW Handlers - Aggregated exports
 *
 * Better Auth handlers shared by client unit tests.
 */

import { authHandlers, mockSession, createMockSession } from './auth.handlers'

export const handlers = [...authHandlers]

export { authHandlers }

export {
  mockSession,
  createMockSession,
}
