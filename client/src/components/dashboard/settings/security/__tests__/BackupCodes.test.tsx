// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BackupCodes } from '../BackupCodes'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockRegenerateMutateAsync = vi.fn()

const defaultBackupCodesData = {
  codes: ['aaaa-1111', 'bbbb-2222', 'cccc-3333'],
  generatedAt: '2024-01-01T00:00:00Z',
  usedCount: 1,
  totalCount: 3,
}

let mockIsLoading = false
let mockBackupCodesData: typeof defaultBackupCodesData | null = defaultBackupCodesData
let mockRegenerateIsPending = false

vi.mock('@/hooks/deployment/useSecurity', () => ({
  useBackupCodes: () => ({
    data: mockBackupCodesData,
    isLoading: mockIsLoading,
  }),
  useRegenerateBackupCodes: () => ({
    mutateAsync: mockRegenerateMutateAsync,
    isPending: mockRegenerateIsPending,
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderComponent(props: { className?: string } = {}) {
  return render(<BackupCodes {...props} />)
}

async function revealCodes() {
  // Click the show/hide toggle to reveal codes
  const toggleBtn = screen.getByRole('button', {
    name: /common.show/i,
  })
  fireEvent.click(toggleBtn)
  await waitFor(() =>
    expect(screen.getByText('aaaa-1111')).toBeInTheDocument(),
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BackupCodes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsLoading = false
    mockBackupCodesData = defaultBackupCodesData
    mockRegenerateIsPending = false
  })

  // ── Loading state ──────────────────────────────────────────────────────────

  describe('Loading state', () => {
    it('renders a loading spinner when data is loading', () => {
      mockIsLoading = true
      mockBackupCodesData = null
      renderComponent()
      // Loader2 renders with animate-spin class
      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })

    it('does not render the codes grid while loading', () => {
      mockIsLoading = true
      mockBackupCodesData = null
      renderComponent()
      expect(screen.queryByText('aaaa-1111')).not.toBeInTheDocument()
    })
  })

  // ── Empty state ────────────────────────────────────────────────────────────

  describe('Empty state', () => {
    it('renders empty state message when no codes exist', () => {
      mockBackupCodesData = null
      renderComponent()
      expect(
        screen.getByText('security.twoFactor.noBackupCodes'),
      ).toBeInTheDocument()
    })

    it('renders empty state when codes array is empty', () => {
      mockBackupCodesData = {
        codes: [],
        generatedAt: '2024-01-01T00:00:00Z',
        usedCount: 0,
        totalCount: 0,
      }
      renderComponent()
      expect(
        screen.getByText('security.twoFactor.noBackupCodes'),
      ).toBeInTheDocument()
    })
  })

  // ── Rendering with codes ───────────────────────────────────────────────────

  describe('Rendering with codes', () => {
    it('renders the backup codes title', () => {
      renderComponent()
      expect(
        screen.getByText('security.twoFactor.backupCodesTitle'),
      ).toBeInTheDocument()
    })

    it('renders the remaining codes count', () => {
      renderComponent()
      // remaining = totalCount(3) - usedCount(1) = 2
      expect(
        screen.getByText(/security.twoFactor.backupCodes.remaining/i),
      ).toBeInTheDocument()
    })

    it('hides codes by default and shows a placeholder', () => {
      renderComponent()
      expect(
        screen.getByText(/security.twoFactor.backupCodes.hidden/i),
      ).toBeInTheDocument()
      expect(screen.queryByText('aaaa-1111')).not.toBeInTheDocument()
    })

    it('reveals codes when Show is clicked', async () => {
      renderComponent()
      await revealCodes()
      expect(screen.getByText('aaaa-1111')).toBeInTheDocument()
      expect(screen.getByText('bbbb-2222')).toBeInTheDocument()
      expect(screen.getByText('cccc-3333')).toBeInTheDocument()
    })

    it('hides codes again when Hide is clicked', async () => {
      renderComponent()
      await revealCodes()

      fireEvent.click(screen.getByRole('button', { name: /common.hide/i }))
      await waitFor(() =>
        expect(screen.queryByText('aaaa-1111')).not.toBeInTheDocument(),
      )
      expect(
        screen.getByText(/security.twoFactor.backupCodes.hidden/i),
      ).toBeInTheDocument()
    })
  })

  // ── Copy action ────────────────────────────────────────────────────────────

  describe('Copy action', () => {
    it('copy button is disabled when codes are hidden', () => {
      renderComponent()
      const copyBtn = screen.getByRole('button', {
        name: /security.twoFactor.backupCodes.copy/i,
      })
      expect(copyBtn).toBeDisabled()
    })

    it('copy button is enabled when codes are visible', async () => {
      renderComponent()
      await revealCodes()
      const copyBtn = screen.getByRole('button', {
        name: /security.twoFactor.backupCodes.copy/i,
      })
      expect(copyBtn).not.toBeDisabled()
    })

    it('copies all codes to clipboard when copy is clicked', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      })
      renderComponent()
      await revealCodes()

      fireEvent.click(
        screen.getByRole('button', {
          name: /security.twoFactor.backupCodes.copy/i,
        }),
      )

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(
          'aaaa-1111\nbbbb-2222\ncccc-3333',
        )
      })
    })

    it('shows success toast after copying', async () => {
      const { toast } = await import('sonner')
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
      })
      renderComponent()
      await revealCodes()

      fireEvent.click(
        screen.getByRole('button', {
          name: /security.twoFactor.backupCodes.copy/i,
        }),
      )

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          'security.twoFactor.codesCopied',
        )
      })
    })
  })

  // ── Download action ────────────────────────────────────────────────────────

  describe('Download action', () => {
    it('download button is disabled when codes are hidden', () => {
      renderComponent()
      const downloadBtn = screen.getByRole('button', {
        name: /security.twoFactor.backupCodes.download/i,
      })
      expect(downloadBtn).toBeDisabled()
    })

    it('download button is enabled when codes are visible', async () => {
      renderComponent()
      await revealCodes()
      const downloadBtn = screen.getByRole('button', {
        name: /security.twoFactor.backupCodes.download/i,
      })
      expect(downloadBtn).not.toBeDisabled()
    })

    it('triggers a file download when download is clicked', async () => {
      // Mock URL methods
      const mockCreateObjectURL = vi.fn(() => 'blob:mock-url')
      const mockRevokeObjectURL = vi.fn()
      global.URL.createObjectURL = mockCreateObjectURL
      global.URL.revokeObjectURL = mockRevokeObjectURL

      // Render and reveal codes BEFORE installing the createElement spy so that
      // React's createRoot / mounting never sees a spy-wrapped createElement.
      renderComponent()
      await revealCodes()

      // Install the spy only after the component is fully mounted.
      const mockClick = vi.fn()
      const mockAnchor = { href: '', download: '', click: mockClick }
      const originalCreateElement = document.createElement.bind(document)
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') return mockAnchor as unknown as HTMLElement
        return originalCreateElement(tag)
      })
      const mockAppendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(() => ({} as Node))
      const mockRemoveChild = vi.spyOn(document.body, 'removeChild').mockImplementation(() => ({} as Node))

      fireEvent.click(
        screen.getByRole('button', {
          name: /security.twoFactor.backupCodes.download/i,
        }),
      )

      expect(mockCreateObjectURL).toHaveBeenCalled()
      expect(mockClick).toHaveBeenCalled()
      expect(mockAnchor.download).toBe('backup-codes.txt')

      createElementSpy.mockRestore()
      mockAppendChild.mockRestore()
      mockRemoveChild.mockRestore()
    })

    it('shows success toast after download', async () => {
      const { toast } = await import('sonner')
      global.URL.createObjectURL = vi.fn(() => 'blob:mock')
      global.URL.revokeObjectURL = vi.fn()

      // Render and reveal codes BEFORE installing the createElement spy so that
      // React's createRoot / mounting never sees a spy-wrapped createElement.
      renderComponent()
      await revealCodes()

      // Install the spy only after the component is fully mounted.
      const originalCreateElement = document.createElement.bind(document)
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') return { href: '', download: '', click: vi.fn() } as unknown as HTMLElement
        return originalCreateElement(tag)
      })
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => ({} as Node))
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => ({} as Node))

      fireEvent.click(
        screen.getByRole('button', {
          name: /security.twoFactor.backupCodes.download/i,
        }),
      )

      expect(toast.success).toHaveBeenCalledWith(
        'security.twoFactor.backupCodes.downloaded',
      )

      createElementSpy.mockRestore()
      appendChildSpy.mockRestore()
      removeChildSpy.mockRestore()
    })
  })

  // ── Regenerate dialog ──────────────────────────────────────────────────────

  describe('Regenerate dialog', () => {
    it('renders the regenerate button', () => {
      renderComponent()
      expect(
        screen.getByRole('button', {
          name: /security.twoFactor.backupCodes.regenerate/i,
        }),
      ).toBeInTheDocument()
    })

    it('opens the regenerate dialog when Regenerate is clicked', async () => {
      renderComponent()
      fireEvent.click(
        screen.getByRole('button', {
          name: /security.twoFactor.backupCodes.regenerate/i,
        }),
      )
      await waitFor(() => {
        expect(
          screen.getByText(
            'security.twoFactor.backupCodes.regenerate.title',
          ),
        ).toBeInTheDocument()
      })
    })

    it('shows a warning inside the regenerate dialog', async () => {
      renderComponent()
      fireEvent.click(
        screen.getByRole('button', {
          name: /security.twoFactor.backupCodes.regenerate/i,
        }),
      )
      await waitFor(() =>
        screen.getByText('security.twoFactor.backupCodes.regenerate.title'),
      )
      expect(
        screen.getByText(
          /security.twoFactor.backupCodes.regenerate.warningDetail/i,
        ),
      ).toBeInTheDocument()
    })

    it('disables the confirm button until 6 digits are entered', async () => {
      renderComponent()
      fireEvent.click(
        screen.getByRole('button', {
          name: /security.twoFactor.backupCodes.regenerate/i,
        }),
      )
      await waitFor(() =>
        screen.getByText('security.twoFactor.backupCodes.regenerate.title'),
      )
      fireEvent.change(screen.getByPlaceholderText('000000'), {
        target: { value: '12345' },
      })

      const confirmBtn = screen.getByRole('button', {
        name: /security.twoFactor.backupCodes.regenerate.confirm/i,
      })
      expect(confirmBtn).toBeDisabled()
    })

    it('calls regenerateBackupCodes with the entered code', async () => {
      mockRegenerateMutateAsync.mockResolvedValue(['new-01', 'new-02'])
      renderComponent()
      fireEvent.click(
        screen.getByRole('button', {
          name: /security.twoFactor.backupCodes.regenerate/i,
        }),
      )
      await waitFor(() =>
        screen.getByText('security.twoFactor.backupCodes.regenerate.title'),
      )

      fireEvent.change(screen.getByPlaceholderText('000000'), {
        target: { value: '112233' },
      })
      fireEvent.click(
        screen.getByRole('button', {
          name: /security.twoFactor.backupCodes.regenerate.confirm/i,
        }),
      )

      await waitFor(() => {
        expect(mockRegenerateMutateAsync).toHaveBeenCalledWith('112233')
      })
    })

    it('shows success toast and closes dialog on successful regeneration', async () => {
      const { toast } = await import('sonner')
      mockRegenerateMutateAsync.mockResolvedValue(['new-01', 'new-02'])
      renderComponent()
      fireEvent.click(
        screen.getByRole('button', {
          name: /security.twoFactor.backupCodes.regenerate/i,
        }),
      )
      await waitFor(() =>
        screen.getByText('security.twoFactor.backupCodes.regenerate.title'),
      )

      fireEvent.change(screen.getByPlaceholderText('000000'), {
        target: { value: '112233' },
      })
      fireEvent.click(
        screen.getByRole('button', {
          name: /security.twoFactor.backupCodes.regenerate.confirm/i,
        }),
      )

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          'security.twoFactor.backupCodes.regenerated',
        )
      })
    })

    it('shows error toast when regeneration fails (returns null)', async () => {
      const { toast } = await import('sonner')
      mockRegenerateMutateAsync.mockResolvedValue(null)
      renderComponent()
      fireEvent.click(
        screen.getByRole('button', {
          name: /security.twoFactor.backupCodes.regenerate/i,
        }),
      )
      await waitFor(() =>
        screen.getByText('security.twoFactor.backupCodes.regenerate.title'),
      )

      fireEvent.change(screen.getByPlaceholderText('000000'), {
        target: { value: '000000' },
      })
      fireEvent.click(
        screen.getByRole('button', {
          name: /security.twoFactor.backupCodes.regenerate.confirm/i,
        }),
      )

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'security.twoFactor.backupCodes.regenerateFailed',
        )
      })
    })

    it('closes the regenerate dialog when Cancel is clicked', async () => {
      renderComponent()
      fireEvent.click(
        screen.getByRole('button', {
          name: /security.twoFactor.backupCodes.regenerate/i,
        }),
      )
      await waitFor(() =>
        screen.getByText('security.twoFactor.backupCodes.regenerate.title'),
      )

      fireEvent.click(screen.getByText('common.cancel'))
      await waitFor(() =>
        expect(
          screen.queryByText(
            'security.twoFactor.backupCodes.regenerate.title',
          ),
        ).not.toBeInTheDocument(),
      )
    })
  })
})
