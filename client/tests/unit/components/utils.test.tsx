import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Test utility functions
import { cn } from '@/lib/utils'
import {
  formatDuration,
  formatFileSize,
  truncateText,
  debounce
} from '@/utils/misc'

describe('Utility Functions', () => {
  describe('cn utility function', () => {
    it('should merge class names correctly', () => {
      expect(cn('btn', 'btn-primary')).toBe('btn btn-primary')
      expect(cn('btn', null, undefined, 'btn-primary')).toBe('btn btn-primary')
      const shouldHide = false
      expect(cn('btn', shouldHide && 'hidden', 'btn-primary')).toBe('btn btn-primary')
    })

    it('should handle conditional classes', () => {
      const isActive = true
      const isDisabled = false

      expect(cn('btn', isActive && 'active', isDisabled && 'disabled'))
        .toBe('btn active')
    })

    it('should merge Tailwind classes correctly', () => {
      expect(cn('p-4', 'px-2')).toBe('p-4 px-2')
      expect(cn('text-sm', 'text-lg')).toBe('text-lg')
      expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500')
    })
  })

  describe('misc utilities', () => {
    it('should format duration correctly', () => {
      expect(formatDuration(90)).toBe('01:30')
      expect(formatDuration(3665)).toBe('61:05') // Note: simplified format, not HH:MM:SS
      expect(formatDuration(0)).toBe('00:00')
      expect(formatDuration(30)).toBe('00:30')
    })

    it('should format file sizes', () => {
      expect(formatFileSize(1024)).toBe('1 KB')
      expect(formatFileSize(1024 * 1024)).toBe('1 MB')
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB')
      expect(formatFileSize(500)).toBe('500 Bytes')
    })

    it('should truncate text correctly', () => {
      expect(truncateText('Hello world', 5)).toBe('He...')
      expect(truncateText('Short', 10)).toBe('Short')
      expect(truncateText('This is a very long text', 15, '...')).toBe('This is a ve...')
    })

    it('should debounce function calls', () => {
      vi.useFakeTimers()

      const mockFn = vi.fn()
      const debouncedFn = debounce(mockFn, 100)

      // Call multiple times quickly
      debouncedFn()
      debouncedFn()
      debouncedFn()

      // Should not have been called yet
      expect(mockFn).not.toHaveBeenCalled()

      // Wait for debounce timeout
      vi.advanceTimersByTime(100)

      // Should have been called once
      expect(mockFn).toHaveBeenCalledTimes(1)

      vi.useRealTimers()
    })
  })
})
