// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TrustedDevices } from '../TrustedDevices'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockRemoveMutateAsync = vi.fn()
const mockToggleTrustMutateAsync = vi.fn()
const mockRevokeAllMutateAsync = vi.fn()

let mockIsLoading = false
let mockDevices: Device[] | undefined = []
let mockCurrentDeviceId = 'device-999' // a value that won't match test devices by default

interface Device {
  id: string
  deviceName: string
  deviceType: 'browser' | 'extension' | 'mobile'
  trusted: boolean
  lastIp: string | null
  lastSeen: string | null
  createdAt: string
}

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'device-1',
    deviceName: 'Chrome on Windows',
    deviceType: 'browser',
    trusted: true,
    lastIp: '192.168.0.1',
    lastSeen: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

// Mock @tanstack/react-query for inline hooks used by TrustedDevices
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return {
    ...actual,
    useQuery: ({ queryKey }: { queryKey: readonly string[] }) => {
      if (queryKey[0] === 'security' && queryKey[1] === 'devices') {
        return { data: mockDevices, isLoading: mockIsLoading }
      }
      return { data: undefined, isLoading: false }
    },
    useMutation: ({ mutationFn }: { mutationFn: (...args: unknown[]) => unknown }) => {
      // Distinguish the inline hooks by inspecting mutationFn string
      const fnStr = mutationFn.toString()
      if (fnStr.includes('revokeAllPersistentUnlocks')) {
        return { mutateAsync: mockRevokeAllMutateAsync, isPending: false }
      }
      if (fnStr.includes('remove')) {
        return { mutateAsync: mockRemoveMutateAsync, isPending: false }
      }
      return { mutateAsync: mockToggleTrustMutateAsync, isPending: false }
    },
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  }
})

// Mock @/lib/api/trpc
vi.mock('@/lib/api/trpc', () => ({
  trpcQuery: vi.fn(),
  trpcMutation: vi.fn(),
}))

// Mock @/lib/device-keys
vi.mock('@/lib/device-keys', () => ({
  getDeviceId: () => Promise.resolve(mockCurrentDeviceId),
}))

// Mock @/lib/persistent-unlock (local wrap cleared after revoke-all)
const mockClearPersistence = vi.fn(() => Promise.resolve())
vi.mock('@/lib/persistent-unlock', () => ({
  clearPersistence: () => mockClearPersistence(),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TrustedDevices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsLoading = false
    mockDevices = []
    mockCurrentDeviceId = 'device-999'
  })

  // ── Loading state ──────────────────────────────────────────────────────────

  describe('Loading state', () => {
    it('renders skeletons while loading', () => {
      mockIsLoading = true
      mockDevices = undefined
      render(<TrustedDevices />)
      const skeletons = document.querySelectorAll('[class*="animate-pulse"]')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  // ── Empty state ────────────────────────────────────────────────────────────

  describe('Empty state', () => {
    it('renders the empty state message when no devices exist', () => {
      mockDevices = []
      render(<TrustedDevices />)
      expect(
        screen.getByText('security.devices.none'),
      ).toBeInTheDocument()
    })

    it('renders the card title even when there are no devices', () => {
      mockDevices = []
      render(<TrustedDevices />)
      expect(
        screen.getByText('security.devices.title'),
      ).toBeInTheDocument()
    })
  })

  // ── Device list ────────────────────────────────────────────────────────────

  describe('Device list', () => {
    it('renders device names', () => {
      mockDevices = [
        makeDevice({ id: 'd1', deviceName: 'Firefox on macOS' }),
        makeDevice({ id: 'd2', deviceName: 'Mobile App' }),
      ]
      render(<TrustedDevices />)
      expect(screen.getByText('Firefox on macOS')).toBeInTheDocument()
      expect(screen.getByText('Mobile App')).toBeInTheDocument()
    })

    it('shows Trusted badge for trusted devices', () => {
      mockDevices = [makeDevice({ trusted: true })]
      render(<TrustedDevices />)
      expect(
        screen.getByText('security.devices.trustedBadge'),
      ).toBeInTheDocument()
    })

    it('shows Untrusted badge for untrusted devices', () => {
      mockDevices = [makeDevice({ trusted: false })]
      render(<TrustedDevices />)
      expect(
        screen.getByText('security.devices.untrustedBadge'),
      ).toBeInTheDocument()
    })

    it('displays last IP address', () => {
      mockDevices = [makeDevice({ lastIp: '10.0.0.5' })]
      render(<TrustedDevices />)
      expect(screen.getByText(/10.0.0.5/)).toBeInTheDocument()
    })

    it('shows "This device" badge for the current device', async () => {
      mockCurrentDeviceId = 'device-current'
      mockDevices = [makeDevice({ id: 'device-current', deviceName: 'My Device' })]
      render(<TrustedDevices />)
      await waitFor(() => {
        expect(
          screen.getByText('security.devices.current'),
        ).toBeInTheDocument()
      })
    })

    it('does not show trust/remove actions for the current device', async () => {
      mockCurrentDeviceId = 'device-current'
      mockDevices = [makeDevice({ id: 'device-current' })]
      render(<TrustedDevices />)
      await waitFor(() =>
        screen.getByText('security.devices.current'),
      )
      expect(
        screen.queryByText('security.devices.revokeTrust'),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /security.devices.remove/i }),
      ).not.toBeInTheDocument()
    })
  })

  // ── Trust toggle ───────────────────────────────────────────────────────────

  describe('Trust toggle', () => {
    it('shows "Revoke Trust" button for trusted non-current devices', () => {
      mockDevices = [makeDevice({ id: 'd1', trusted: true })]
      render(<TrustedDevices />)
      expect(
        screen.getByRole('button', {
          name: /security.devices.revokeTrust/i,
        }),
      ).toBeInTheDocument()
    })

    it('shows "Trust" button for untrusted non-current devices', () => {
      mockDevices = [makeDevice({ id: 'd1', trusted: false })]
      render(<TrustedDevices />)
      expect(
        screen.getByRole('button', { name: /^security.devices.trust$/i }),
      ).toBeInTheDocument()
    })

    it('calls toggleTrust with trust=false when Revoke Trust is clicked', async () => {
      mockToggleTrustMutateAsync.mockResolvedValue({})
      mockDevices = [makeDevice({ id: 'd1', trusted: true })]
      render(<TrustedDevices />)

      fireEvent.click(
        screen.getByRole('button', {
          name: /security.devices.revokeTrust/i,
        }),
      )

      await waitFor(() => {
        expect(mockToggleTrustMutateAsync).toHaveBeenCalledWith({
          deviceId: 'd1',
          trust: false,
        })
      })
    })

    it('calls toggleTrust with trust=true when Trust is clicked', async () => {
      mockToggleTrustMutateAsync.mockResolvedValue({})
      mockDevices = [makeDevice({ id: 'd1', trusted: false })]
      render(<TrustedDevices />)

      fireEvent.click(
        screen.getByRole('button', { name: /^security.devices.trust$/i }),
      )

      await waitFor(() => {
        expect(mockToggleTrustMutateAsync).toHaveBeenCalledWith({
          deviceId: 'd1',
          trust: true,
        })
      })
    })

    it('shows success toast after trusting a device', async () => {
      const { toast } = await import('sonner')
      mockToggleTrustMutateAsync.mockResolvedValue({})
      mockDevices = [makeDevice({ id: 'd1', trusted: false })]
      render(<TrustedDevices />)

      fireEvent.click(
        screen.getByRole('button', { name: /^security.devices.trust$/i }),
      )

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('security.devices.trusted')
      })
    })

    it('shows success toast after revoking trust', async () => {
      const { toast } = await import('sonner')
      mockToggleTrustMutateAsync.mockResolvedValue({})
      mockDevices = [makeDevice({ id: 'd1', trusted: true })]
      render(<TrustedDevices />)

      fireEvent.click(
        screen.getByRole('button', {
          name: /security.devices.revokeTrust/i,
        }),
      )

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('security.devices.untrusted')
      })
    })

    it('shows error toast when toggleTrust throws', async () => {
      const { toast } = await import('sonner')
      mockToggleTrustMutateAsync.mockRejectedValue(new Error('Network error'))
      mockDevices = [makeDevice({ id: 'd1', trusted: false })]
      render(<TrustedDevices />)

      fireEvent.click(
        screen.getByRole('button', { name: /^security.devices.trust$/i }),
      )

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('security.devices.trustError')
      })
    })
  })

  // ── Remove device ──────────────────────────────────────────────────────────

  describe('Remove device', () => {
    it('renders a remove (trash) button for non-current devices', () => {
      mockDevices = [makeDevice({ id: 'd1' })]
      render(<TrustedDevices />)
      expect(
        screen.getByRole('button', { name: /security.devices.remove/i }),
      ).toBeInTheDocument()
    })

    it('opens a confirmation dialog when Remove is clicked', async () => {
      mockDevices = [makeDevice({ id: 'd1' })]
      render(<TrustedDevices />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.devices.remove/i }),
      )
      await waitFor(() => {
        expect(
          screen.getByText('security.devices.removeConfirm.title'),
        ).toBeInTheDocument()
      })
    })

    it('calls removeDevice with the correct ID when confirmed', async () => {
      mockRemoveMutateAsync.mockResolvedValue({ success: true })
      mockDevices = [makeDevice({ id: 'd1' })]
      render(<TrustedDevices />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.devices.remove/i }),
      )
      await waitFor(() =>
        screen.getByText('security.devices.removeConfirm.title'),
      )

      fireEvent.click(
        screen.getByRole('button', {
          name: /^security.devices.remove$/i,
        }),
      )

      await waitFor(() => {
        expect(mockRemoveMutateAsync).toHaveBeenCalledWith('d1')
      })
    })

    it('shows success toast after device removal', async () => {
      const { toast } = await import('sonner')
      mockRemoveMutateAsync.mockResolvedValue({ success: true })
      mockDevices = [makeDevice({ id: 'd1' })]
      render(<TrustedDevices />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.devices.remove/i }),
      )
      await waitFor(() =>
        screen.getByText('security.devices.removeConfirm.title'),
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: /^security.devices.remove$/i,
        }),
      )
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('security.devices.removeSuccess')
      })
    })

    it('shows error toast when removeDevice throws', async () => {
      const { toast } = await import('sonner')
      mockRemoveMutateAsync.mockRejectedValue(new Error('Failed'))
      mockDevices = [makeDevice({ id: 'd1' })]
      render(<TrustedDevices />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.devices.remove/i }),
      )
      await waitFor(() =>
        screen.getByText('security.devices.removeConfirm.title'),
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: /^security.devices.remove$/i,
        }),
      )
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('security.devices.removeError')
      })
    })

    it('closes the dialog when Cancel is clicked', async () => {
      mockDevices = [makeDevice({ id: 'd1' })]
      render(<TrustedDevices />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.devices.remove/i }),
      )
      await waitFor(() =>
        screen.getByText('security.devices.removeConfirm.title'),
      )
      fireEvent.click(screen.getByText('common.cancel'))
      await waitFor(() =>
        expect(
          screen.queryByText('security.devices.removeConfirm.title'),
        ).not.toBeInTheDocument(),
      )
    })
  })

  // ── Revoke all persistent unlocks ──────────────────────────────────────────

  describe('Revoke all remembered unlocks', () => {
    it('renders the revoke-all button', () => {
      mockDevices = [makeDevice({ id: 'd1' })]
      render(<TrustedDevices />)
      expect(
        screen.getByRole('button', {
          name: /security.devices.revokeAllUnlocks.button/i,
        }),
      ).toBeInTheDocument()
    })

    it('asks for confirmation before revoking', async () => {
      mockDevices = [makeDevice({ id: 'd1' })]
      render(<TrustedDevices />)
      fireEvent.click(
        screen.getByRole('button', {
          name: /security.devices.revokeAllUnlocks.button/i,
        }),
      )
      await waitFor(() => {
        expect(
          screen.getByText('security.devices.revokeAllUnlocks.confirmTitle'),
        ).toBeInTheDocument()
      })
      expect(mockRevokeAllMutateAsync).not.toHaveBeenCalled()
    })

    it('revokes server-side AND clears the local wrap on confirm', async () => {
      const { toast } = await import('sonner')
      mockRevokeAllMutateAsync.mockResolvedValue({ success: true })
      mockDevices = [makeDevice({ id: 'd1' })]
      render(<TrustedDevices />)
      fireEvent.click(
        screen.getByRole('button', {
          name: /security.devices.revokeAllUnlocks.button/i,
        }),
      )
      await waitFor(() =>
        screen.getByText('security.devices.revokeAllUnlocks.confirmTitle'),
      )
      fireEvent.click(
        screen.getByText('security.devices.revokeAllUnlocks.confirm'),
      )
      await waitFor(() => {
        expect(mockRevokeAllMutateAsync).toHaveBeenCalled()
        expect(mockClearPersistence).toHaveBeenCalled()
        expect(toast.success).toHaveBeenCalledWith(
          'security.devices.revokeAllUnlocks.success',
        )
      })
    })

    it('shows an error toast and keeps local state when the mutation fails', async () => {
      const { toast } = await import('sonner')
      mockRevokeAllMutateAsync.mockRejectedValue(new Error('offline'))
      mockDevices = [makeDevice({ id: 'd1' })]
      render(<TrustedDevices />)
      fireEvent.click(
        screen.getByRole('button', {
          name: /security.devices.revokeAllUnlocks.button/i,
        }),
      )
      await waitFor(() =>
        screen.getByText('security.devices.revokeAllUnlocks.confirmTitle'),
      )
      fireEvent.click(
        screen.getByText('security.devices.revokeAllUnlocks.confirm'),
      )
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'security.devices.revokeAllUnlocks.error',
        )
      })
      // Server revoke failed → local wrap must NOT be cleared (still valid)
      expect(mockClearPersistence).not.toHaveBeenCalled()
    })
  })
})
