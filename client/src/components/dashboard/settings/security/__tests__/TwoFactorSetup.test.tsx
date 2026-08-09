// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TwoFactorSetup } from '../TwoFactorSetup'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockEnable2FAMutateAsync = vi.fn()
const mockVerify2FAMutateAsync = vi.fn()

vi.mock('@/hooks/deployment/useSecurity', () => ({
  useEnable2FA: () => ({
    mutateAsync: mockEnable2FAMutateAsync,
    isPending: false,
  }),
  useVerify2FA: () => ({
    mutateAsync: mockVerify2FAMutateAsync,
    isPending: false,
  }),
}))

// QRCodeSVG renders an <svg> - mock it to keep tests simple
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <svg data-testid="qr-code" aria-label={value} />
  ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderComponent(props: Partial<React.ComponentProps<typeof TwoFactorSetup>> = {}) {
  const onComplete = vi.fn()
  const onCancel = vi.fn()
  const result = render(
    <TwoFactorSetup onComplete={onComplete} onCancel={onCancel} {...props} />,
  )
  return { ...result, onComplete, onCancel }
}

const SETUP_DATA = {
  secret: 'otpauth://totp/Test?secret=ABCDEFGH&issuer=Test',
  qrCodeUrl: 'otpauth://totp/Test?secret=ABCDEFGH&issuer=Test',
  backupCodes: ['code-01', 'code-02', 'code-03', 'code-04'],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TwoFactorSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Intro step ─────────────────────────────────────────────────────────────

  describe('Intro step', () => {
    it('renders the intro step by default', () => {
      renderComponent()
      expect(
        screen.getByText('security.twoFactor.setupTitle'),
      ).toBeInTheDocument()
      expect(
        screen.getByText('security.twoFactor.setup.step1.title'),
      ).toBeInTheDocument()
    })

    it('renders the cancel button when onCancel is provided', () => {
      renderComponent()
      expect(screen.getByText('common.cancel')).toBeInTheDocument()
    })

    it('does not render the cancel button when onCancel is omitted', () => {
      render(<TwoFactorSetup />)
      expect(screen.queryByText('common.cancel')).not.toBeInTheDocument()
    })

    it('does not request the master password', () => {
      renderComponent()
      expect(
        screen.queryByLabelText(/security.twoFactor.confirmPassword/i),
      ).not.toBeInTheDocument()
    })

    it('enables the continue button while the mutation is idle', () => {
      renderComponent()
      const continueBtn = screen.getByRole('button', {
        name: /security.twoFactor.continue/i,
      })
      expect(continueBtn).not.toBeDisabled()
    })

    it('starts setup without passing a plaintext credential', async () => {
      mockEnable2FAMutateAsync.mockResolvedValue({
        success: false,
        error: 'Setup failed',
      })
      renderComponent()
      fireEvent.click(
        screen.getByRole('button', { name: /security.twoFactor.continue/i }),
      )
      await waitFor(() => expect(mockEnable2FAMutateAsync).toHaveBeenCalledWith())
    })

    it('calls onCancel when Cancel is clicked', () => {
      const { onCancel } = renderComponent()
      fireEvent.click(screen.getByText('common.cancel'))
      expect(onCancel).toHaveBeenCalledOnce()
    })

    it('transitions to scan step after successful enable', async () => {
      mockEnable2FAMutateAsync.mockResolvedValue({
        success: true,
        setup: SETUP_DATA,
      })
      renderComponent()

      fireEvent.click(
        screen.getByRole('button', { name: /security.twoFactor.continue/i }),
      )

      await waitFor(() => {
        expect(
          screen.getByText('security.twoFactor.setup.step2.title'),
        ).toBeInTheDocument()
      })
    })

    it('shows error toast when enable2FA returns failure', async () => {
      const { toast } = await import('sonner')
      mockEnable2FAMutateAsync.mockResolvedValue({
        success: false,
        error: 'Invalid password',
      })
      renderComponent()

      fireEvent.click(
        screen.getByRole('button', { name: /security.twoFactor.continue/i }),
      )

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Invalid password')
      })
    })
  })

  // ── Scan step ──────────────────────────────────────────────────────────────

  describe('Scan step', () => {
    async function goToScanStep() {
      mockEnable2FAMutateAsync.mockResolvedValue({ success: true, setup: SETUP_DATA })
      const utils = renderComponent()

      fireEvent.click(
        screen.getByRole('button', { name: /security.twoFactor.continue/i }),
      )
      await waitFor(() =>
        screen.getByText('security.twoFactor.setup.step2.title'),
      )
      return utils
    }

    it('renders QR code on the scan step', async () => {
      await goToScanStep()
      expect(screen.getByTestId('qr-code')).toBeInTheDocument()
    })

    it('renders the manual entry secret key', async () => {
      await goToScanStep()
      // extractSecretFromUri extracts 'ABCDEFGH' from the TOTP URI
      expect(screen.getByText('ABCDEFGH')).toBeInTheDocument()
    })

    it('copies the secret key to clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      })
      await goToScanStep()

      fireEvent.click(screen.getByLabelText('security.twoFactor.copySecretAriaLabel'))
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('ABCDEFGH')
      })
    })

    it('navigates back to intro step when Back is clicked', async () => {
      await goToScanStep()
      fireEvent.click(screen.getByText('common.back'))
      expect(
        screen.getByText('security.twoFactor.setupTitle'),
      ).toBeInTheDocument()
    })

    it('transitions to verify step when Continue is clicked', async () => {
      await goToScanStep()
      fireEvent.click(
        screen.getByRole('button', { name: /security.twoFactor.continue/i }),
      )
      expect(
        screen.getByText('security.twoFactor.setup.step3.title'),
      ).toBeInTheDocument()
    })
  })

  // ── Verify step ────────────────────────────────────────────────────────────

  describe('Verify step', () => {
    async function goToVerifyStep() {
      mockEnable2FAMutateAsync.mockResolvedValue({ success: true, setup: SETUP_DATA })
      const utils = renderComponent()

      fireEvent.click(
        screen.getByRole('button', { name: /security.twoFactor.continue/i }),
      )
      await waitFor(() =>
        screen.getByText('security.twoFactor.setup.step2.title'),
      )
      fireEvent.click(
        screen.getByRole('button', { name: /security.twoFactor.continue/i }),
      )
      expect(
        screen.getByText('security.twoFactor.setup.step3.title'),
      ).toBeInTheDocument()
      return utils
    }

    it('renders the verification code input', async () => {
      await goToVerifyStep()
      expect(screen.getByPlaceholderText('000000')).toBeInTheDocument()
    })

    it('disables verify button when code is less than 6 digits', async () => {
      await goToVerifyStep()
      fireEvent.change(screen.getByPlaceholderText('000000'), {
        target: { value: '12345' },
      })
      expect(
        screen.getByRole('button', { name: /security.twoFactor.verify/i }),
      ).toBeDisabled()
    })

    it('enables verify button when exactly 6 digits are entered', async () => {
      await goToVerifyStep()
      fireEvent.change(screen.getByPlaceholderText('000000'), {
        target: { value: '123456' },
      })
      expect(
        screen.getByRole('button', { name: /security.twoFactor.verify/i }),
      ).not.toBeDisabled()
    })

    it('strips non-numeric characters from the code input', async () => {
      await goToVerifyStep()
      const input = screen.getByPlaceholderText('000000')
      fireEvent.change(input, { target: { value: 'abc123def456' } })
      expect(input).toHaveValue('123456')
    })

    it('navigates back to scan step when Back is clicked', async () => {
      await goToVerifyStep()
      fireEvent.click(screen.getByText('common.back'))
      expect(
        screen.getByText('security.twoFactor.setup.step2.title'),
      ).toBeInTheDocument()
    })

    it('transitions to complete step on successful verification', async () => {
      mockVerify2FAMutateAsync.mockResolvedValue({
        success: true,
        backupCodes: ['bk-01', 'bk-02'],
      })
      await goToVerifyStep()
      fireEvent.change(screen.getByPlaceholderText('000000'), {
        target: { value: '123456' },
      })
      fireEvent.click(
        screen.getByRole('button', { name: /security.twoFactor.verify/i }),
      )
      await waitFor(() => {
        expect(
          screen.getByText('security.twoFactor.backupCodesTitle'),
        ).toBeInTheDocument()
      })
    })

    it('shows error toast on failed verification', async () => {
      const { toast } = await import('sonner')
      mockVerify2FAMutateAsync.mockResolvedValue({
        success: false,
        error: 'Wrong code',
      })
      await goToVerifyStep()
      fireEvent.change(screen.getByPlaceholderText('000000'), {
        target: { value: '999999' },
      })
      fireEvent.click(
        screen.getByRole('button', { name: /security.twoFactor.verify/i }),
      )
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Wrong code')
      })
    })
  })

  // ── Complete step ──────────────────────────────────────────────────────────

  describe('Complete step', () => {
    async function goToCompleteStep(backupCodes = ['bk-01', 'bk-02', 'bk-03']) {
      mockEnable2FAMutateAsync.mockResolvedValue({ success: true, setup: SETUP_DATA })
      mockVerify2FAMutateAsync.mockResolvedValue({ success: true, backupCodes })
      const utils = renderComponent()

      // intro → scan
      fireEvent.click(
        screen.getByRole('button', { name: /security.twoFactor.continue/i }),
      )
      await waitFor(() => screen.getByText('security.twoFactor.setup.step2.title'))

      // scan → verify
      fireEvent.click(
        screen.getByRole('button', { name: /security.twoFactor.continue/i }),
      )

      // verify → complete
      fireEvent.change(screen.getByPlaceholderText('000000'), {
        target: { value: '123456' },
      })
      fireEvent.click(
        screen.getByRole('button', { name: /security.twoFactor.verify/i }),
      )
      await waitFor(() =>
        screen.getByText('security.twoFactor.backupCodesTitle'),
      )
      return utils
    }

    it('displays all backup codes', async () => {
      await goToCompleteStep(['bk-01', 'bk-02', 'bk-03'])
      expect(screen.getByText('bk-01')).toBeInTheDocument()
      expect(screen.getByText('bk-02')).toBeInTheDocument()
      expect(screen.getByText('bk-03')).toBeInTheDocument()
    })

    it('copies all backup codes to clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      })
      await goToCompleteStep(['bk-01', 'bk-02'])

      fireEvent.click(
        screen.getByRole('button', { name: /security.twoFactor.copyAllCodes/i }),
      )
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('bk-01\nbk-02')
      })
    })

    it('calls onComplete with backup codes when Done is clicked', async () => {
      const { onComplete } = await goToCompleteStep(['bk-01', 'bk-02'])
      fireEvent.click(screen.getByText('security.twoFactor.done'))
      expect(onComplete).toHaveBeenCalledWith(['bk-01', 'bk-02'])
    })

    it('shows warning about saving backup codes', async () => {
      await goToCompleteStep()
      expect(
        screen.getByText(/security.twoFactor.backupCodes.warning/i),
      ).toBeInTheDocument()
    })
  })
})
