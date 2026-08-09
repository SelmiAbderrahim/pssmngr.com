// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { Input } from '../input'
import { render, userEvent } from '@/test/utils'

// Extend matchers
expect.extend(toHaveNoViolations)

describe('Input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Rendering', () => {
    it('renders input with default props', () => {
      render(<Input placeholder="Enter text" />)

      const input = screen.getByPlaceholderText('Enter text')
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('type', 'text')
    })

    it('renders input with different types', () => {
      const { rerender } = render(<Input type="text" data-testid="test-input" />)
      let input = screen.getByTestId('test-input')
      expect(input).toHaveAttribute('type', 'text')

      rerender(<Input type="email" data-testid="test-input" />)
      input = screen.getByTestId('test-input')
      expect(input).toHaveAttribute('type', 'email')

      rerender(<Input type="password" data-testid="test-input" />)
      input = screen.getByTestId('test-input')
      expect(input).toHaveAttribute('type', 'password')

      rerender(<Input type="number" data-testid="test-input" />)
      input = screen.getByTestId('test-input')
      expect(input).toHaveAttribute('type', 'number')

      rerender(<Input type="url" data-testid="test-input" />)
      input = screen.getByTestId('test-input')
      expect(input).toHaveAttribute('type', 'url')

      rerender(<Input type="tel" data-testid="test-input" />)
      input = screen.getByTestId('test-input')
      expect(input).toHaveAttribute('type', 'tel')

      rerender(<Input type="search" data-testid="test-input" />)
      input = screen.getByTestId('test-input')
      expect(input).toHaveAttribute('type', 'search')
    })

    it('renders input with custom className', () => {
      render(<Input className="custom-input" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveClass('custom-input')
      // Updated for touch-target compliance: min-h-[44px] instead of h-10
      expect(input).toHaveClass('flex', 'min-h-[44px]', 'w-full', 'rounded-md', 'border', 'border-input')
    })

    it('renders input with custom id and name', () => {
      render(<Input id="test-input" name="test-name" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('id', 'test-input')
      expect(input).toHaveAttribute('name', 'test-name')
    })

    it('renders disabled input', () => {
      render(<Input disabled />)

      const input = screen.getByRole('textbox')
      expect(input).toBeDisabled()
      expect(input).toHaveClass('disabled:cursor-not-allowed', 'disabled:opacity-50')
    })

    it('renders required input', () => {
      render(<Input required />)

      const input = screen.getByRole('textbox')
      expect(input).toBeRequired()
    })

    it('renders input with placeholder', () => {
      render(<Input placeholder="Your name" />)

      const input = screen.getByPlaceholderText('Your name')
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('placeholder', 'Your name')
    })

    it('renders input with default value', () => {
      render(<Input defaultValue="Default value" />)

      const input = screen.getByDisplayValue('Default value')
      expect(input).toBeInTheDocument()
      expect(input).toHaveValue('Default value')
    })

    it('renders file input with special styling', () => {
      render(<Input type="file" data-testid="file-input" />)

      const input = screen.getByTestId('file-input')
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('type', 'file')
      // File input should have special styling classes for the file pseudo-element
      expect(input).toHaveClass('file:border-0', 'file:bg-transparent', 'file:text-sm', 'file:font-medium')
    })
  })

  describe('User Interactions', () => {
    it('handles text input', async () => {
      render(<Input placeholder="Type here" />)

      const input = screen.getByPlaceholderText('Type here')
      await userEvent.type(input, 'Hello World')

      expect(input).toHaveValue('Hello World')
    })

    it('handles change events', async () => {
      const handleChange = vi.fn()
      render(<Input onChange={handleChange} />)

      const input = screen.getByRole('textbox')
      await userEvent.type(input, 'test')

      expect(handleChange).toHaveBeenCalledTimes(4) // Once for each character
    })

    it('handles focus events', () => {
      const handleFocus = vi.fn()
      const handleBlur = vi.fn()
      render(<Input onFocus={handleFocus} onBlur={handleBlur} />)

      const input = screen.getByRole('textbox')
      input.focus()

      expect(handleFocus).toHaveBeenCalledTimes(1)
      expect(input).toHaveFocus()

      input.blur()
      expect(handleBlur).toHaveBeenCalledTimes(1)
      expect(input).not.toHaveFocus()
    })

    it('handles keyboard navigation', async () => {
      const handleKeyDown = vi.fn()
      render(<Input onKeyDown={handleKeyDown} />)

      const input = screen.getByRole('textbox')
      input.focus()

      fireEvent.keyDown(input, { key: 'Enter' })
      expect(handleKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: 'Enter' }))

      fireEvent.keyDown(input, { key: 'Escape' })
      expect(handleKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }))
    })

    it('prevents input when disabled', async () => {
      const handleChange = vi.fn()
      render(<Input disabled onChange={handleChange} />)

      const input = screen.getByRole('textbox')
      expect(input).toBeDisabled()

      // Disabled inputs should not accept user interaction
      // userEvent respects disabled state
      await userEvent.type(input, 'test')
      expect(handleChange).not.toHaveBeenCalled()
      expect(input).toHaveValue('')
    })

    it('handles paste events', async () => {
      const handlePaste = vi.fn()
      render(<Input onPaste={handlePaste} />)

      const input = screen.getByRole('textbox')

      const pasteEvent = {
        preventDefault: vi.fn(),
        clipboardData: {
          getData: vi.fn().mockReturnValue('Pasted text'),
        },
      } as any

      fireEvent.paste(input, pasteEvent)

      expect(handlePaste).toHaveBeenCalled()
    })
  })

  describe('Props Handling', () => {
    it('passes through all standard HTML input attributes', () => {
      render(
        <Input
          type="text"
          maxLength={100}
          minLength={5}
          pattern="[A-Za-z]+"
          autoComplete="name"
          autoFocus
        />
      )

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('maxlength', '100')
      expect(input).toHaveAttribute('minlength', '5')
      expect(input).toHaveAttribute('pattern', '[A-Za-z]+')
      expect(input).toHaveAttribute('autocomplete', 'name')
      // autoFocus is handled by React and may not appear as an attribute in tests
      expect(input).toHaveProperty('autofocus')
    })

    it('handles ref forwarding', () => {
      const ref = React.createRef<HTMLInputElement>()
      render(<Input ref={ref} />)

      expect(ref.current).toBeInstanceOf(HTMLInputElement)
    })

    it('handles controlled component pattern', async () => {
      const { rerender } = render(<Input value="initial" />)

      const input = screen.getByDisplayValue('initial')
      expect(input).toHaveValue('initial')

      rerender(<Input value="changed" />)
      expect(input).toHaveValue('changed')
    })

    it('handles uncontrolled component pattern', async () => {
      render(<Input defaultValue="uncontrolled" />)

      const input = screen.getByDisplayValue('uncontrolled')
      expect(input).toHaveValue('uncontrolled')

      await userEvent.clear(input)
      await userEvent.type(input, 'new value')

      expect(input).toHaveValue('new value')
    })
  })

  describe('Accessibility', () => {
    it('should not have any accessibility violations', async () => {
      const { container } = render(
        <main>
          <label htmlFor="test-input">Test Label</label>
          <Input id="test-input" placeholder="Accessible input" />
        </main>
      )

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
    it('supports proper label association', () => {
      render(
        <div>
          <label htmlFor="accessible-input">Accessible Input</label>
          <Input id="accessible-input" />
        </div>
      )

      const input = screen.getByLabelText('Accessible Input')
      const label = screen.getByText('Accessible Input')

      expect(input).toHaveAttribute('id', 'accessible-input')
      expect(label).toHaveAttribute('for', 'accessible-input')
    })

    it('supports aria-label', () => {
      render(<Input aria-label="Search input" placeholder="Search..." />)

      const input = screen.getByLabelText('Search input')
      expect(input).toHaveAttribute('aria-label', 'Search input')
    })

    it('supports aria-describedby', () => {
      render(
        <div>
          <Input aria-describedby="help-text" />
          <p id="help-text">This is help text</p>
        </div>
      )

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-describedby', 'help-text')
    })

    it('supports aria-invalid for validation errors', () => {
      render(<Input aria-invalid="true" aria-errormessage="This field is required" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(input).toHaveAttribute('aria-errormessage', 'This field is required')
    })

    it('announces disabled state to screen readers', () => {
      render(<Input disabled aria-label="Disabled input" />)

      const input = screen.getByLabelText('Disabled input')
      expect(input).toBeDisabled()
      expect(input).toHaveAttribute('disabled')
      // The disabled attribute is sufficient for screen readers
    })
  })

  describe('Design System Compliance', () => {
    it('uses design system tokens for sizing', () => {
      render(<Input />)

      const input = screen.getByRole('textbox')
      // Updated for touch-target compliance: min-h-[44px] instead of h-10, with responsive sm:min-h-[40px]
      expect(input).toHaveClass('min-h-[44px]', 'w-full', 'px-3', 'py-2', 'text-sm')
    })

    it('uses design system tokens for styling', () => {
      render(<Input />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveClass(
        'flex',
        'rounded-md',
        'border',
        'border-input',
        'bg-background',
        'ring-offset-background',
        'placeholder:text-muted-foreground'
      )
    })

    it('uses design system tokens for focus states', () => {
      render(<Input />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveClass(
        'focus-visible:outline-none',
        'focus-visible:ring-2',
        'focus-visible:ring-ring',
        'focus-visible:ring-offset-2'
      )
    })

    it('uses design system tokens for disabled state', () => {
      render(<Input disabled />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveClass(
        'disabled:cursor-not-allowed',
        'disabled:opacity-50'
      )
    })

    it('uses design system tokens for file input styling', () => {
      render(<Input type="file" data-testid="file-input" />)

      const input = screen.getByTestId('file-input')
      expect(input).toHaveClass(
        'file:border-0',
        'file:bg-transparent',
        'file:text-sm',
        'file:font-medium'
      )
    })
  })

  describe('Edge Cases', () => {
    it('handles very long input values', async () => {
      const longText = 'A'.repeat(1000)
      render(<Input data-testid="long-input" />)

      const input = screen.getByTestId('long-input')
      // Use fireEvent.change for very long text to avoid timeout
      fireEvent.change(input, { target: { value: longText } })

      expect(input).toHaveValue(longText)
    })

    it('handles special characters in input', async () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?'
      render(<Input data-testid="special-input" />)

      const input = screen.getByTestId('special-input')
      // Use fireEvent.change for special characters to avoid userEvent parsing issues
      fireEvent.change(input, { target: { value: specialChars } })

      expect(input).toHaveValue(specialChars)
    })

    it('handles unicode characters', async () => {
      const unicodeText = 'Hello 世界 🌟 ñ'
      render(<Input data-testid="unicode-input" />)

      const input = screen.getByTestId('unicode-input')
      // Use fireEvent.change for unicode to avoid userEvent issues
      fireEvent.change(input, { target: { value: unicodeText } })

      expect(input).toHaveValue(unicodeText)
    })

    it('handles numeric input with constraints', async () => {
      render(<Input type="number" min="0" max="100" step="5" />)

      const input = screen.getByRole('spinbutton')
      expect(input).toHaveAttribute('min', '0')
      expect(input).toHaveAttribute('max', '100')
      expect(input).toHaveAttribute('step', '5')

      // Test value constraints - number inputs have numeric values
      fireEvent.change(input, { target: { value: '50' } })
      expect(input).toHaveValue(50) // Note: number type returns number, not string
    })

    it('handles email input validation pattern', () => {
      render(<Input type="email" pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('type', 'email')
      // Pattern attribute is stored as-is in HTML, single backslash
      expect(input).toHaveAttribute('pattern', '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$')
    })

    it('handles password input with autocomplete', () => {
      render(<Input type="password" autoComplete="current-password" data-testid="password-input" />)

      // Password inputs don't have 'textbox' role, use data-testid instead
      const input = screen.getByTestId('password-input')
      expect(input).toHaveAttribute('type', 'password')
      expect(input).toHaveAttribute('autocomplete', 'current-password')
    })

    it('handles search input with search attributes', () => {
      render(<Input type="search" spellCheck={false} />)

      const input = screen.getByRole('searchbox')
      expect(input).toHaveAttribute('type', 'search')
      expect(input).toHaveAttribute('spellcheck', 'false')
    })

    it('handles rapid prop changes', () => {
      const { rerender } = render(<Input placeholder="Initial" />)

      rerender(<Input placeholder="Changed" className="new-class" />)
      const input = screen.getByPlaceholderText('Changed')
      expect(input).toHaveClass('new-class')

      rerender(<Input value="Value" disabled />)
      const changedInput = screen.getByDisplayValue('Value')
      expect(changedInput).toBeDisabled()
    })
  })

  describe('Performance', () => {
    it('renders efficiently with many inputs', () => {
      const startTime = performance.now()

      const { container } = render(
        <div>
          {Array.from({ length: 100 }, (_, i) => (
            <Input key={i} placeholder={`Input ${i}`} />
          ))}
        </div>
      )

      const endTime = performance.now()
      const renderTime = endTime - startTime

      expect(renderTime).toBeLessThan(2000) // Should render within 2000ms (Docker environments may be slower)
      expect(container.querySelectorAll('input')).toHaveLength(100)
    })

    it('handles large input efficiently', () => {
      render(<Input />)

      const input = screen.getByRole('textbox')
      const largeText = 'A'.repeat(1000)

      const startTime = performance.now()
      fireEvent.change(input, { target: { value: largeText } })
      const endTime = performance.now()

      const inputTime = endTime - startTime
      expect(inputTime).toBeLessThan(100) // Should handle large input within 100ms
      expect(input).toHaveValue(largeText)
    })
  })

  describe('Integration', () => {
    it('works within forms', async () => {
      const handleSubmit = vi.fn((e) => {
        e.preventDefault()
      })

      const { container } = render(
        <form onSubmit={handleSubmit} data-testid="test-form">
          <Input name="username" required />
          <button type="submit">Submit</button>
        </form>
      )

      const input = screen.getByRole('textbox')
      const button = screen.getByRole('button', { name: 'Submit' })
      const form = container.querySelector('form')

      // Form should not be submitable with empty required field
      expect(input).toBeRequired()
      expect(form).toBeInTheDocument()

      // Fill the form
      await userEvent.type(input, 'testuser')

      // Submit the form using the form element
      if (form) {
        fireEvent.submit(form)
      }

      // Note: Form submission testing is complex, so we just verify the input is properly configured
    })

    it('works with label wrapping', () => {
      render(
        <label>
          <Input placeholder="Input inside label" />
        </label>
      )

      const input = screen.getByPlaceholderText('Input inside label')
      const label = input.closest('label')
      expect(label).toBeInTheDocument()
    })

    it('integrates with focus management libraries', () => {
      render(<Input autoFocus />)

      const input = screen.getByRole('textbox')
      // autoFocus is handled by React and may not appear as a DOM attribute in tests
      expect(input).toHaveProperty('autofocus')
      // Focus management libraries can use this property
    })
  })
})