// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ActiveSessions } from '../ActiveSessions'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockRevokeSessionMutateAsync = vi.fn()
const mockRevokeAllSessionsMutateAsync = vi.fn()

let mockIsLoading = false
let mockSessionsData: { sessions: Session[]; total: number } | undefined

// Minimal session type for tests
interface Session {
  id: string
  userAgent: string
  ipAddress: string
  createdAt: string
  lastActiveAt: string
  isCurrent: boolean
  device?: { type: string; browser?: string; os?: string }
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
    ipAddress: '192.168.1.1',
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    isCurrent: false,
    device: { type: 'desktop', browser: 'Chrome', os: 'Windows' },
    ...overrides,
  }
}

vi.mock('@/hooks/deployment/useSecurity', () => ({
  useSessions: () => ({
    data: mockSessionsData,
    isLoading: mockIsLoading,
  }),
  useRevokeSession: () => ({
    mutateAsync: mockRevokeSessionMutateAsync,
    isPending: false,
  }),
  useRevokeAllSessions: () => ({
    mutateAsync: mockRevokeAllSessionsMutateAsync,
    isPending: false,
  }),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActiveSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsLoading = false
    mockSessionsData = { sessions: [], total: 0 }
  })

  // ── Loading state ──────────────────────────────────────────────────────────

  describe('Loading state', () => {
    it('renders skeletons while loading', () => {
      mockIsLoading = true
      mockSessionsData = undefined
      render(<ActiveSessions />)
      // Skeleton elements are present (data-[slot=skeleton])
      const skeletons = document.querySelectorAll('[class*="animate-pulse"]')
      expect(skeletons.length).toBeGreaterThan(0)
    })

    it('does not render the sessions table while loading', () => {
      mockIsLoading = true
      mockSessionsData = undefined
      render(<ActiveSessions />)
      expect(
        screen.queryByText('security.sessions.title'),
      ).not.toBeInTheDocument()
    })
  })

  // ── Empty state ────────────────────────────────────────────────────────────

  describe('Empty / no other sessions', () => {
    it('shows the no-other-sessions message when only current session exists', () => {
      mockSessionsData = {
        sessions: [makeSession({ isCurrent: true })],
        total: 1,
      }
      render(<ActiveSessions />)
      expect(
        screen.getByText('security.sessions.noOther'),
      ).toBeInTheDocument()
    })

    it('does not render the Revoke All button when no other sessions exist', () => {
      mockSessionsData = {
        sessions: [makeSession({ isCurrent: true })],
        total: 1,
      }
      render(<ActiveSessions />)
      expect(
        screen.queryByText('security.sessions.revokeAll'),
      ).not.toBeInTheDocument()
    })
  })

  // ── Current session ────────────────────────────────────────────────────────

  describe('Current session', () => {
    it('renders the current session section with a badge', () => {
      mockSessionsData = {
        sessions: [makeSession({ id: 'current', isCurrent: true })],
        total: 1,
      }
      render(<ActiveSessions />)
      // "security.sessions.current" appears as both a section heading and a badge
      const matches = screen.getAllByText('security.sessions.current')
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })

    it('displays browser and OS info for the current session', () => {
      mockSessionsData = {
        sessions: [
          makeSession({
            id: 'current',
            isCurrent: true,
            device: { type: 'desktop', browser: 'Firefox', os: 'Linux' },
          }),
        ],
        total: 1,
      }
      render(<ActiveSessions />)
      expect(screen.getByText(/Firefox/)).toBeInTheDocument()
      expect(screen.getByText(/Linux/)).toBeInTheDocument()
    })

    it('displays the IP address of the current session', () => {
      mockSessionsData = {
        sessions: [
          makeSession({ isCurrent: true, ipAddress: '10.0.0.1' }),
        ],
        total: 1,
      }
      render(<ActiveSessions />)
      expect(screen.getByText('10.0.0.1')).toBeInTheDocument()
    })
  })

  // ── Other sessions list ────────────────────────────────────────────────────

  describe('Other sessions list', () => {
    beforeEach(() => {
      mockSessionsData = {
        sessions: [
          makeSession({ id: 'current', isCurrent: true }),
          makeSession({ id: 'other-1', isCurrent: false, ipAddress: '1.2.3.4' }),
          makeSession({ id: 'other-2', isCurrent: false, ipAddress: '5.6.7.8' }),
        ],
        total: 3,
      }
    })

    it('renders a row for each non-current session', () => {
      render(<ActiveSessions />)
      expect(screen.getByText('1.2.3.4')).toBeInTheDocument()
      expect(screen.getByText('5.6.7.8')).toBeInTheDocument()
    })

    it('renders the Revoke All button when other sessions exist', () => {
      render(<ActiveSessions />)
      expect(
        screen.getByRole('button', {
          name: /security.sessions.revokeAll/i,
        }),
      ).toBeInTheDocument()
    })

    it('renders individual revoke (trash) buttons for each other session', () => {
      render(<ActiveSessions />)
      const revokeButtons = screen.getAllByRole('button', {
        name: /security.sessions.revoke$/i,
      })
      expect(revokeButtons).toHaveLength(2)
    })
  })

  // ── Revoke individual session ──────────────────────────────────────────────

  describe('Revoke individual session', () => {
    beforeEach(() => {
      mockSessionsData = {
        sessions: [
          makeSession({ id: 'current', isCurrent: true }),
          makeSession({ id: 'other-1', isCurrent: false, ipAddress: '1.2.3.4' }),
        ],
        total: 2,
      }
    })

    it('opens a confirmation dialog when the trash icon is clicked', async () => {
      render(<ActiveSessions />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.sessions.revoke$/i }),
      )
      await waitFor(() => {
        expect(
          screen.getByText('security.sessions.revoke.confirm.title'),
        ).toBeInTheDocument()
      })
    })

    it('calls revokeSession with the correct ID when confirmed', async () => {
      mockRevokeSessionMutateAsync.mockResolvedValue({ success: true })
      render(<ActiveSessions />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.sessions.revoke$/i }),
      )
      await waitFor(() =>
        screen.getByText('security.sessions.revoke.confirm.title'),
      )

      fireEvent.click(
        screen.getByRole('button', {
          name: /security.sessions.revoke.confirm.button/i,
        }),
      )

      await waitFor(() => {
        expect(mockRevokeSessionMutateAsync).toHaveBeenCalledWith('other-1')
      })
    })

    it('shows success toast on successful revoke', async () => {
      const { toast } = await import('sonner')
      mockRevokeSessionMutateAsync.mockResolvedValue({ success: true })
      render(<ActiveSessions />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.sessions.revoke$/i }),
      )
      await waitFor(() =>
        screen.getByText('security.sessions.revoke.confirm.title'),
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: /security.sessions.revoke.confirm.button/i,
        }),
      )
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          'security.sessions.revoke.success',
        )
      })
    })

    it('shows error toast on failed revoke', async () => {
      const { toast } = await import('sonner')
      mockRevokeSessionMutateAsync.mockResolvedValue({
        success: false,
        error: 'Revoke failed',
      })
      render(<ActiveSessions />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.sessions.revoke$/i }),
      )
      await waitFor(() =>
        screen.getByText('security.sessions.revoke.confirm.title'),
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: /security.sessions.revoke.confirm.button/i,
        }),
      )
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Revoke failed')
      })
    })

    it('closes the dialog when Cancel is clicked', async () => {
      render(<ActiveSessions />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.sessions.revoke$/i }),
      )
      await waitFor(() =>
        screen.getByText('security.sessions.revoke.confirm.title'),
      )
      fireEvent.click(screen.getByText('common.cancel'))
      await waitFor(() =>
        expect(
          screen.queryByText('security.sessions.revoke.confirm.title'),
        ).not.toBeInTheDocument(),
      )
    })
  })

  // ── Revoke all sessions ────────────────────────────────────────────────────

  describe('Revoke all sessions', () => {
    beforeEach(() => {
      mockSessionsData = {
        sessions: [
          makeSession({ id: 'current', isCurrent: true }),
          makeSession({ id: 'other-1', isCurrent: false }),
        ],
        total: 2,
      }
    })

    it('opens the revoke-all confirmation dialog', async () => {
      render(<ActiveSessions />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.sessions.revokeAll/i }),
      )
      await waitFor(() => {
        expect(
          screen.getByText('security.sessions.revokeAll.confirm.title'),
        ).toBeInTheDocument()
      })
    })

    it('calls revokeAllSessions when confirmed', async () => {
      mockRevokeAllSessionsMutateAsync.mockResolvedValue({ success: true })
      render(<ActiveSessions />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.sessions.revokeAll/i }),
      )
      await waitFor(() =>
        screen.getByText('security.sessions.revokeAll.confirm.title'),
      )

      const confirmBtns = screen.getAllByRole('button', {
        name: /security.sessions.revokeAll/i,
      })
      // Last one is the action inside the dialog
      fireEvent.click(confirmBtns[confirmBtns.length - 1])

      await waitFor(() => {
        expect(mockRevokeAllSessionsMutateAsync).toHaveBeenCalledOnce()
      })
    })

    it('shows success toast after revoking all sessions', async () => {
      const { toast } = await import('sonner')
      mockRevokeAllSessionsMutateAsync.mockResolvedValue({ success: true })
      render(<ActiveSessions />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.sessions.revokeAll/i }),
      )
      await waitFor(() =>
        screen.getByText('security.sessions.revokeAll.confirm.title'),
      )
      const confirmBtns = screen.getAllByRole('button', {
        name: /security.sessions.revokeAll/i,
      })
      fireEvent.click(confirmBtns[confirmBtns.length - 1])

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          'security.sessions.revokeAll.success',
        )
      })
    })

    it('shows error toast when revokeAllSessions fails', async () => {
      const { toast } = await import('sonner')
      mockRevokeAllSessionsMutateAsync.mockResolvedValue({
        success: false,
        error: 'Server error',
      })
      render(<ActiveSessions />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.sessions.revokeAll/i }),
      )
      await waitFor(() =>
        screen.getByText('security.sessions.revokeAll.confirm.title'),
      )
      const confirmBtns = screen.getAllByRole('button', {
        name: /security.sessions.revokeAll/i,
      })
      fireEvent.click(confirmBtns[confirmBtns.length - 1])
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Server error')
      })
    })
  })
})
