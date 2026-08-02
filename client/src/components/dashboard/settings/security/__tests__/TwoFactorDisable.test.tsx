// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TwoFactorDisable } from '../TwoFactorDisable'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockDisable2FAMutateAsync = vi.fn()
let mockIsPending = false

vi.mock('@/hooks/deployment/useSecurity', () => ({
  useDisable2FA: () => ({
    mutateAsync: mockDisable2FAMutateAsync,
    isPending: mockIsPending,
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderComponent(
  props: Partial<React.ComponentProps<typeof TwoFactorDisable>> = {},
) {
  const onDisabled = vi.fn()
  const result = render(<TwoFactorDisable onDisabled={onDisabled} {...props} />)
  return { ...result, onDisabled }
}

async function openDialog() {
  const utils = renderComponent()
  // The default trigger is the "Disable 2FA" button
  fireEvent.click(screen.getByRole('button', { name: /security.twoFactor.disable/i }))
  // Wait for dialog to be present
  await waitFor(() => {
    expect(screen.getByText('security.twoFactor.disableTitle')).toBeInTheDocument()
  })
  return utils
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TwoFactorDisable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsPending = false
  })

  // ── Rendering ──────────────────────────────────────────────────────────────

  describe('Rendering', () => {
    it('renders the default destructive trigger button', () => {
      renderComponent()
      expect(
        screen.getByRole('button', { name: /security.twoFactor.disable/i }),
      ).toBeInTheDocument()
    })

    it('renders a custom trigger element when provided', () => {
      render(
        <TwoFactorDisable trigger={<button>Custom Trigger</button>} />,
      )
      expect(screen.getByRole('button', { name: 'Custom Trigger' })).toBeInTheDocument()
    })

    it('dialog is not visible before trigger is clicked', () => {
      renderComponent()
      expect(
        screen.queryByText('security.twoFactor.disableTitle'),
      ).not.toBeInTheDocument()
    })
  })

  // ── Dialog open / close ────────────────────────────────────────────────────

  describe('Dialog open/close', () => {
    it('opens the dialog when the trigger is clicked', async () => {
      await openDialog()
      expect(
        screen.getByText('security.twoFactor.disableDescription'),
      ).toBeInTheDocument()
    })

    it('shows the warning message inside the dialog', async () => {
      await openDialog()
      expect(
        screen.getByText(/security.twoFactor.disable.warning/i),
      ).toBeInTheDocument()
    })

    it('renders the verification code input inside the dialog', async () => {
      await openDialog()
      expect(
        screen.getByRole('textbox', { name: /security.twoFactor.enterCode/i }),
      ).toBeInTheDocument()
    })

    it('shows the code hint text', async () => {
      await openDialog()
      expect(
        screen.getByText(/security.twoFactor.disable.codeHint/i),
      ).toBeInTheDocument()
    })

    it('closes the dialog when Cancel is clicked', async () => {
      await openDialog()
      fireEvent.click(screen.getByText('common.cancel'))
      await waitFor(() => {
        expect(
          screen.queryByText('security.twoFactor.disableTitle'),
        ).not.toBeInTheDocument()
      })
    })

    it('clears the verification code when dialog is closed', async () => {
      await openDialog()
      const input = screen.getByRole('textbox', {
        name: /security.twoFactor.enterCode/i,
      })
      fireEvent.change(input, { target: { value: '123456' } })
      expect(input).toHaveValue('123456')

      fireEvent.click(screen.getByText('common.cancel'))
      await waitFor(() =>
        expect(
          screen.queryByText('security.twoFactor.disableTitle'),
        ).not.toBeInTheDocument(),
      )

      // Re-open and confirm code is reset
      fireEvent.click(
        screen.getByRole('button', { name: /security.twoFactor.disable/i }),
      )
      await waitFor(() =>
        screen.getByText('security.twoFactor.disableTitle'),
      )
      expect(
        screen.getByRole('textbox', { name: /security.twoFactor.enterCode/i }),
      ).toHaveValue('')
    })
  })

  // ── Code input ─────────────────────────────────────────────────────────────

  describe('Code input', () => {
    it('only accepts numeric characters', async () => {
      await openDialog()
      const input = screen.getByRole('textbox', {
        name: /security.twoFactor.enterCode/i,
      })
      fireEvent.change(input, { target: { value: 'abc123def456' } })
      expect(input).toHaveValue('123456')
    })

    it('limits input to 6 digits', async () => {
      await openDialog()
      const input = screen.getByRole('textbox', {
        name: /security.twoFactor.enterCode/i,
      })
      fireEvent.change(input, { target: { value: '1234567890' } })
      expect(input).toHaveValue('123456')
    })

    it('disables the disable button when code has fewer than 6 digits', async () => {
      await openDialog()
      fireEvent.change(
        screen.getByRole('textbox', { name: /security.twoFactor.enterCode/i }),
        { target: { value: '12345' } },
      )
      // The AlertDialogAction for the disable action
      const disableBtn = screen.getAllByRole('button').find((btn) =>
        btn.textContent?.includes('security.twoFactor.disable'),
      )
      expect(disableBtn).toBeDisabled()
    })

    it('enables the disable button when exactly 6 digits are entered', async () => {
      await openDialog()
      fireEvent.change(
        screen.getByRole('textbox', { name: /security.twoFactor.enterCode/i }),
        { target: { value: '123456' } },
      )
      const buttons = screen.getAllByRole('button')
      const disableBtn = buttons.find((btn) =>
        btn.textContent?.includes('security.twoFactor.disable'),
      )
      expect(disableBtn).not.toBeDisabled()
    })
  })

  // ── Disable flow ───────────────────────────────────────────────────────────

  describe('Disable flow', () => {
    it('calls disable2FA with the entered code on submit', async () => {
      mockDisable2FAMutateAsync.mockResolvedValue({ success: true })
      const { onDisabled } = await openDialog()

      fireEvent.change(
        screen.getByRole('textbox', { name: /security.twoFactor.enterCode/i }),
        { target: { value: '654321' } },
      )

      const buttons = screen.getAllByRole('button')
      const disableBtn = buttons.find((btn) =>
        btn.textContent?.includes('security.twoFactor.disable'),
      )!
      fireEvent.click(disableBtn)

      await waitFor(() => {
        expect(mockDisable2FAMutateAsync).toHaveBeenCalledWith('654321')
        expect(onDisabled).toHaveBeenCalledOnce()
      })
    })

    it('shows success toast on successful disable', async () => {
      const { toast } = await import('sonner')
      mockDisable2FAMutateAsync.mockResolvedValue({ success: true })
      await openDialog()

      fireEvent.change(
        screen.getByRole('textbox', { name: /security.twoFactor.enterCode/i }),
        { target: { value: '654321' } },
      )
      const buttons = screen.getAllByRole('button')
      const disableBtn = buttons.find((btn) =>
        btn.textContent?.includes('security.twoFactor.disable'),
      )!
      fireEvent.click(disableBtn)

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          'security.twoFactor.disabledSuccess',
        )
      })
    })

    it('closes the dialog after successful disable', async () => {
      mockDisable2FAMutateAsync.mockResolvedValue({ success: true })
      await openDialog()

      fireEvent.change(
        screen.getByRole('textbox', { name: /security.twoFactor.enterCode/i }),
        { target: { value: '654321' } },
      )
      const buttons = screen.getAllByRole('button')
      const disableBtn = buttons.find((btn) =>
        btn.textContent?.includes('security.twoFactor.disable'),
      )!
      fireEvent.click(disableBtn)

      await waitFor(() => {
        expect(
          screen.queryByText('security.twoFactor.disableTitle'),
        ).not.toBeInTheDocument()
      })
    })

    it('shows error toast when disable2FA returns failure', async () => {
      const { toast } = await import('sonner')
      mockDisable2FAMutateAsync.mockResolvedValue({
        success: false,
        error: 'Invalid verification code',
      })
      await openDialog()

      fireEvent.change(
        screen.getByRole('textbox', { name: /security.twoFactor.enterCode/i }),
        { target: { value: '000000' } },
      )
      const buttons = screen.getAllByRole('button')
      const disableBtn = buttons.find((btn) =>
        btn.textContent?.includes('security.twoFactor.disable'),
      )!
      fireEvent.click(disableBtn)

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Invalid verification code')
      })
    })

    it('does not call onDisabled when disable2FA returns failure', async () => {
      mockDisable2FAMutateAsync.mockResolvedValue({ success: false })
      const { onDisabled } = await openDialog()

      fireEvent.change(
        screen.getByRole('textbox', { name: /security.twoFactor.enterCode/i }),
        { target: { value: '000000' } },
      )
      const buttons = screen.getAllByRole('button')
      const disableBtn = buttons.find((btn) =>
        btn.textContent?.includes('security.twoFactor.disable'),
      )!
      fireEvent.click(disableBtn)

      await waitFor(() => {
        expect(mockDisable2FAMutateAsync).toHaveBeenCalled()
      })
      expect(onDisabled).not.toHaveBeenCalled()
    })
  })
})
