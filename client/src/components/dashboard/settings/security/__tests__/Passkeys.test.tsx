// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Passkeys } from '../Passkeys'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockRegisterMutateAsync = vi.fn()
const mockDeleteMutateAsync = vi.fn()

let mockIsLoading = false
let mockPasskeys: Passkey[] | undefined = []
let mockRegisterIsPending = false
let mockDeleteIsPending = false

interface Passkey {
  id: string
  name: string | null
  credentialID: string
  deviceType: string
  backedUp: boolean
  transports: string | null
  createdAt: string | null
}

function makePasskey(overrides: Partial<Passkey> = {}): Passkey {
  return {
    id: 'pk-1',
    name: 'Touch ID',
    credentialID: 'cred-abc123',
    deviceType: 'multiDevice',
    backedUp: false,
    transports: 'internal',
    createdAt: '2024-06-01T00:00:00Z',
    ...overrides,
  }
}

vi.mock('@/hooks/deployment/useSecurity', () => ({
  usePasskeys: () => ({
    data: mockPasskeys,
    isLoading: mockIsLoading,
  }),
  useRegisterPasskey: () => ({
    mutateAsync: mockRegisterMutateAsync,
    isPending: mockRegisterIsPending,
  }),
  useDeletePasskey: () => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: mockDeleteIsPending,
  }),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Passkeys', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsLoading = false
    mockPasskeys = []
    mockRegisterIsPending = false
    mockDeleteIsPending = false
  })

  // ── Loading state ──────────────────────────────────────────────────────────

  describe('Loading state', () => {
    it('renders skeleton loaders while loading', () => {
      mockIsLoading = true
      mockPasskeys = undefined
      render(<Passkeys />)
      const skeletons = document.querySelectorAll('[class*="animate-pulse"]')
      expect(skeletons.length).toBeGreaterThan(0)
    })

    it('does not render the passkey list while loading', () => {
      mockIsLoading = true
      mockPasskeys = undefined
      render(<Passkeys />)
      expect(screen.queryByText('Touch ID')).not.toBeInTheDocument()
    })
  })

  // ── Empty state ────────────────────────────────────────────────────────────

  describe('Empty state', () => {
    it('renders the empty state message when no passkeys exist', () => {
      mockPasskeys = []
      render(<Passkeys />)
      expect(
        screen.getByText('security.passkeys.none'),
      ).toBeInTheDocument()
    })

    it('still renders the Add Passkey button in the empty state', () => {
      mockPasskeys = []
      render(<Passkeys />)
      expect(
        screen.getByRole('button', { name: /security.passkeys.add/i }),
      ).toBeInTheDocument()
    })

    it('renders the card title', () => {
      mockPasskeys = []
      render(<Passkeys />)
      expect(
        screen.getByText('security.passkeys.title'),
      ).toBeInTheDocument()
    })
  })

  // ── Passkey list ───────────────────────────────────────────────────────────

  describe('Passkey list', () => {
    it('renders a passkey by name', () => {
      mockPasskeys = [makePasskey({ name: 'YubiKey 5' })]
      render(<Passkeys />)
      expect(screen.getByText('YubiKey 5')).toBeInTheDocument()
    })

    it('renders "Unnamed passkey" for passkeys with null name', () => {
      mockPasskeys = [makePasskey({ name: null })]
      render(<Passkeys />)
      expect(
        screen.getByText('security.passkeys.unnamed'),
      ).toBeInTheDocument()
    })

    it('shows "Backed up" badge for backed-up passkeys', () => {
      mockPasskeys = [makePasskey({ backedUp: true })]
      render(<Passkeys />)
      expect(
        screen.getByText('security.passkeys.backedUp'),
      ).toBeInTheDocument()
    })

    it('does not show "Backed up" badge when backedUp is false', () => {
      mockPasskeys = [makePasskey({ backedUp: false })]
      render(<Passkeys />)
      expect(
        screen.queryByText('security.passkeys.backedUp'),
      ).not.toBeInTheDocument()
    })

    it('renders the device type label', () => {
      mockPasskeys = [makePasskey({ deviceType: 'multiDevice' })]
      render(<Passkeys />)
      expect(screen.getByText(/Synced across devices/)).toBeInTheDocument()
    })

    it('renders the singleDevice label', () => {
      mockPasskeys = [makePasskey({ deviceType: 'singleDevice' })]
      render(<Passkeys />)
      expect(screen.getByText(/Single device/)).toBeInTheDocument()
    })

    it('renders the creation date', () => {
      mockPasskeys = [makePasskey({ createdAt: '2024-06-01T00:00:00Z' })]
      render(<Passkeys />)
      // Date is formatted, just check Created text is present
      expect(screen.getByText(/security.passkeys.created/i)).toBeInTheDocument()
    })

    it('renders multiple passkeys', () => {
      mockPasskeys = [
        makePasskey({ id: 'pk-1', name: 'Key One' }),
        makePasskey({ id: 'pk-2', name: 'Key Two' }),
      ]
      render(<Passkeys />)
      expect(screen.getByText('Key One')).toBeInTheDocument()
      expect(screen.getByText('Key Two')).toBeInTheDocument()
    })

    it('renders a delete button per passkey', () => {
      mockPasskeys = [
        makePasskey({ id: 'pk-1', name: 'Key One' }),
        makePasskey({ id: 'pk-2', name: 'Key Two' }),
      ]
      render(<Passkeys />)
      const deleteBtns = screen.getAllByRole('button', {
        name: /security.passkeys.delete/i,
      })
      expect(deleteBtns).toHaveLength(2)
    })
  })

  // ── Register dialog ────────────────────────────────────────────────────────

  describe('Register dialog', () => {
    it('opens the register dialog when Add Passkey is clicked', async () => {
      mockPasskeys = []
      render(<Passkeys />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.add/i }),
      )
      await waitFor(() => {
        expect(
          screen.getByText('security.passkeys.registerTitle'),
        ).toBeInTheDocument()
      })
    })

    it('renders the name input inside the dialog', async () => {
      mockPasskeys = []
      render(<Passkeys />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.add/i }),
      )
      await waitFor(() =>
        screen.getByText('security.passkeys.registerTitle'),
      )
      expect(
        screen.getByPlaceholderText('security.passkeys.namePlaceholder'),
      ).toBeInTheDocument()
    })

    it('closes the dialog when Cancel is clicked', async () => {
      mockPasskeys = []
      render(<Passkeys />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.add/i }),
      )
      await waitFor(() =>
        screen.getByText('security.passkeys.registerTitle'),
      )

      fireEvent.click(screen.getByRole('button', { name: /common.cancel/i }))
      await waitFor(() =>
        expect(
          screen.queryByText('security.passkeys.registerTitle'),
        ).not.toBeInTheDocument(),
      )
    })

    it('clears the name input when the dialog is cancelled', async () => {
      mockPasskeys = []
      render(<Passkeys />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.add/i }),
      )
      await waitFor(() =>
        screen.getByText('security.passkeys.registerTitle'),
      )

      const nameInput = screen.getByPlaceholderText('security.passkeys.namePlaceholder')
      fireEvent.change(nameInput, { target: { value: 'My Key' } })
      expect(nameInput).toHaveValue('My Key')

      fireEvent.click(screen.getByRole('button', { name: /common.cancel/i }))

      // Re-open and check it is empty
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.add/i }),
      )
      await waitFor(() =>
        screen.getByText('security.passkeys.registerTitle'),
      )
      expect(
        screen.getByPlaceholderText('security.passkeys.namePlaceholder'),
      ).toHaveValue('')
    })

    it('calls registerPasskey with the entered name on Register click', async () => {
      mockRegisterMutateAsync.mockResolvedValue(undefined)
      mockPasskeys = []
      render(<Passkeys />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.add/i }),
      )
      await waitFor(() =>
        screen.getByText('security.passkeys.registerTitle'),
      )

      fireEvent.change(
        screen.getByPlaceholderText('security.passkeys.namePlaceholder'),
        { target: { value: 'My YubiKey' } },
      )
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.register/i }),
      )

      await waitFor(() => {
        expect(mockRegisterMutateAsync).toHaveBeenCalledWith({
          name: 'My YubiKey',
        })
      })
    })

    it('calls registerPasskey with undefined name when input is empty', async () => {
      mockRegisterMutateAsync.mockResolvedValue(undefined)
      mockPasskeys = []
      render(<Passkeys />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.add/i }),
      )
      await waitFor(() =>
        screen.getByText('security.passkeys.registerTitle'),
      )

      // Leave name empty
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.register/i }),
      )

      await waitFor(() => {
        expect(mockRegisterMutateAsync).toHaveBeenCalledWith({
          name: undefined,
        })
      })
    })

    it('shows success toast after successful registration', async () => {
      const { toast } = await import('sonner')
      mockRegisterMutateAsync.mockResolvedValue(undefined)
      mockPasskeys = []
      render(<Passkeys />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.add/i }),
      )
      await waitFor(() =>
        screen.getByText('security.passkeys.registerTitle'),
      )
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.register/i }),
      )
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          'security.passkeys.registerSuccess',
        )
      })
    })

    it('shows error toast on registration failure', async () => {
      const { toast } = await import('sonner')
      mockRegisterMutateAsync.mockRejectedValue(new Error('Hardware error'))
      mockPasskeys = []
      render(<Passkeys />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.add/i }),
      )
      await waitFor(() =>
        screen.getByText('security.passkeys.registerTitle'),
      )
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.register/i }),
      )
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'security.passkeys.registerError',
        )
      })
    })

    it('does not show error toast when user cancels the browser prompt', async () => {
      const { toast } = await import('sonner')
      mockRegisterMutateAsync.mockRejectedValue(
        new Error('NotAllowedError: user cancelled'),
      )
      mockPasskeys = []
      render(<Passkeys />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.add/i }),
      )
      await waitFor(() =>
        screen.getByText('security.passkeys.registerTitle'),
      )
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.register/i }),
      )
      await waitFor(() => {
        expect(mockRegisterMutateAsync).toHaveBeenCalled()
      })
      expect(toast.error).not.toHaveBeenCalled()
    })

    it('submits on Enter key press in the name input', async () => {
      mockRegisterMutateAsync.mockResolvedValue(undefined)
      mockPasskeys = []
      render(<Passkeys />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.add/i }),
      )
      await waitFor(() =>
        screen.getByText('security.passkeys.registerTitle'),
      )

      const input = screen.getByPlaceholderText('security.passkeys.namePlaceholder')
      fireEvent.change(input, { target: { value: 'Enter Key' } })
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

      await waitFor(() => {
        expect(mockRegisterMutateAsync).toHaveBeenCalledWith({ name: 'Enter Key' })
      })
    })

    it('closes the dialog after successful registration', async () => {
      mockRegisterMutateAsync.mockResolvedValue(undefined)
      mockPasskeys = []
      render(<Passkeys />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.add/i }),
      )
      await waitFor(() =>
        screen.getByText('security.passkeys.registerTitle'),
      )
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.register/i }),
      )
      await waitFor(() =>
        expect(
          screen.queryByText('security.passkeys.registerTitle'),
        ).not.toBeInTheDocument(),
      )
    })
  })

  // ── Delete passkey ─────────────────────────────────────────────────────────

  describe('Delete passkey', () => {
    it('opens the delete confirmation dialog', async () => {
      mockPasskeys = [makePasskey({ id: 'pk-1', name: 'Touch ID' })]
      render(<Passkeys />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.delete/i }),
      )
      await waitFor(() => {
        expect(
          screen.getByText('security.passkeys.deleteConfirm.title'),
        ).toBeInTheDocument()
      })
    })

    it('calls deletePasskey with the correct ID when confirmed', async () => {
      mockDeleteMutateAsync.mockResolvedValue({ success: true })
      mockPasskeys = [makePasskey({ id: 'pk-abc', name: 'Touch ID' })]
      render(<Passkeys />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.delete/i }),
      )
      await waitFor(() =>
        screen.getByText('security.passkeys.deleteConfirm.title'),
      )

      // Find the confirm button inside the dialog
      const allDeleteBtns = screen.getAllByRole('button', {
        name: /security.passkeys.delete/i,
      })
      fireEvent.click(allDeleteBtns[allDeleteBtns.length - 1])

      await waitFor(() => {
        expect(mockDeleteMutateAsync).toHaveBeenCalledWith('pk-abc')
      })
    })

    it('shows success toast after deleting', async () => {
      const { toast } = await import('sonner')
      mockDeleteMutateAsync.mockResolvedValue({ success: true })
      mockPasskeys = [makePasskey({ id: 'pk-1' })]
      render(<Passkeys />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.delete/i }),
      )
      await waitFor(() =>
        screen.getByText('security.passkeys.deleteConfirm.title'),
      )
      const allDeleteBtns = screen.getAllByRole('button', {
        name: /security.passkeys.delete/i,
      })
      fireEvent.click(allDeleteBtns[allDeleteBtns.length - 1])

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          'security.passkeys.deleteSuccess',
        )
      })
    })

    it('shows error toast when delete throws', async () => {
      const { toast } = await import('sonner')
      mockDeleteMutateAsync.mockRejectedValue(new Error('Server error'))
      mockPasskeys = [makePasskey({ id: 'pk-1' })]
      render(<Passkeys />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.delete/i }),
      )
      await waitFor(() =>
        screen.getByText('security.passkeys.deleteConfirm.title'),
      )
      const allDeleteBtns = screen.getAllByRole('button', {
        name: /security.passkeys.delete/i,
      })
      fireEvent.click(allDeleteBtns[allDeleteBtns.length - 1])

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'security.passkeys.deleteError',
        )
      })
    })

    it('closes the delete dialog after successful deletion', async () => {
      mockDeleteMutateAsync.mockResolvedValue({ success: true })
      mockPasskeys = [makePasskey({ id: 'pk-1' })]
      render(<Passkeys />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.delete/i }),
      )
      await waitFor(() =>
        screen.getByText('security.passkeys.deleteConfirm.title'),
      )
      const allDeleteBtns = screen.getAllByRole('button', {
        name: /security.passkeys.delete/i,
      })
      fireEvent.click(allDeleteBtns[allDeleteBtns.length - 1])

      await waitFor(() =>
        expect(
          screen.queryByText('security.passkeys.deleteConfirm.title'),
        ).not.toBeInTheDocument(),
      )
    })

    it('closes the delete dialog when Cancel is clicked', async () => {
      mockPasskeys = [makePasskey({ id: 'pk-1' })]
      render(<Passkeys />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.delete/i }),
      )
      await waitFor(() =>
        screen.getByText('security.passkeys.deleteConfirm.title'),
      )
      fireEvent.click(screen.getByText('common.cancel'))
      await waitFor(() =>
        expect(
          screen.queryByText('security.passkeys.deleteConfirm.title'),
        ).not.toBeInTheDocument(),
      )
    })

    it('shows correct description inside the delete dialog', async () => {
      mockPasskeys = [makePasskey({ id: 'pk-1' })]
      render(<Passkeys />)
      fireEvent.click(
        screen.getByRole('button', { name: /security.passkeys.delete/i }),
      )
      await waitFor(() =>
        screen.getByText('security.passkeys.deleteConfirm.title'),
      )
      expect(
        screen.getByText('security.passkeys.deleteConfirm.description'),
      ).toBeInTheDocument()
    })
  })
})
