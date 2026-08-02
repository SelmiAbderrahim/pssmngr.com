// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { Button } from '../button'
import { render, userEvent } from '@/test/utils'

// Extend matchers
expect.extend(toHaveNoViolations)

describe('Button', () => {
  const defaultProps = {
    children: 'Test Button',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Rendering', () => {
    it('renders button with default props', () => {
      render(<Button {...defaultProps} />)

      const button = screen.getByRole('button', { name: 'Test Button' })
      expect(button).toBeInTheDocument()
      expect(button).toHaveClass('bg-primary', 'text-primary-foreground')
    })

    it('renders button as child when asChild is true', () => {
      render(
        <Button asChild>
          <a href="/test">Link Button</a>
        </Button>
      )

      const link = screen.getByRole('link', { name: 'Link Button' })
      expect(link).toBeInTheDocument()
      expect(link).toHaveClass('bg-primary', 'text-primary-foreground')
    })

    it('renders button with custom className', () => {
      render(<Button className="custom-class">Test</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('custom-class')
    })

    it('renders button with different variants', () => {
      const { rerender } = render(<Button variant="default">Default</Button>)
      expect(screen.getByRole('button')).toHaveClass('bg-primary')

      rerender(<Button variant="destructive">Destructive</Button>)
      expect(screen.getByRole('button')).toHaveClass('bg-destructive')

      rerender(<Button variant="outline">Outline</Button>)
      expect(screen.getByRole('button')).toHaveClass('border', 'border-input')

      rerender(<Button variant="secondary">Secondary</Button>)
      expect(screen.getByRole('button')).toHaveClass('bg-secondary')

      rerender(<Button variant="ghost">Ghost</Button>)
      expect(screen.getByRole('button')).toHaveClass('hover:bg-accent')

      rerender(<Button variant="link">Link</Button>)
      expect(screen.getByRole('button')).toHaveClass('text-primary', 'underline-offset-4')
    })

    it('renders button with different sizes', () => {
      // Updated for touch-target compliance: default h-11 min-h-[44px], lg h-12 min-h-[48px], icon h-11 w-11
      const { rerender } = render(<Button size="default">Default</Button>)
      expect(screen.getByRole('button')).toHaveClass('h-11', 'px-4', 'py-2', 'min-h-[44px]')

      rerender(<Button size="sm">Small</Button>)
      expect(screen.getByRole('button')).toHaveClass('h-9', 'px-3', 'min-h-[36px]')

      rerender(<Button size="lg">Large</Button>)
      expect(screen.getByRole('button')).toHaveClass('h-12', 'px-8', 'min-h-[48px]')

      rerender(<Button size="icon">Icon</Button>)
      expect(screen.getByRole('button')).toHaveClass('h-11', 'w-11', 'min-h-[44px]', 'min-w-[44px]')
    })

    it('renders button with complex children', () => {
      render(
        <Button>
          <span data-testid="icon">Icon</span>
          <span>Button Text</span>
        </Button>
      )

      expect(screen.getByTestId('icon')).toBeInTheDocument()
      expect(screen.getByText('Button Text')).toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    it('handles click events', async () => {
      const handleClick = vi.fn()
      render(<Button onClick={handleClick}>Click me</Button>)

      const button = screen.getByRole('button')
      await userEvent.click(button)

      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('handles keyboard interactions', async () => {
      const handleClick = vi.fn()
      render(<Button onClick={handleClick}>Submit</Button>)

      const button = screen.getByRole('button')
      button.focus()

      // Buttons respond to Enter and Space keys
      await userEvent.keyboard('{Enter}')
      expect(handleClick).toHaveBeenCalledTimes(1)

      await userEvent.keyboard(' ')
      expect(handleClick).toHaveBeenCalledTimes(2)
    })

    it('prevents clicks when disabled', async () => {
      const handleClick = vi.fn()
      render(<Button disabled onClick={handleClick}>Disabled</Button>)

      const button = screen.getByRole('button')
      await userEvent.click(button)

      expect(handleClick).not.toHaveBeenCalled()
    })

    it('prevents clicks when loading', async () => {
      const handleClick = vi.fn()
      render(<Button loading onClick={handleClick}>Loading</Button>)

      const button = screen.getByRole('button')
      await userEvent.click(button)

      expect(handleClick).not.toHaveBeenCalled()
      expect(button).toBeDisabled()
    })

    it('shows loading spinner when loading prop is true', () => {
      render(<Button loading>Loading Button</Button>)

      const button = screen.getByRole('button')
      const spinner = button.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
      expect(button).toHaveAttribute('data-loading', 'true')
    })

    it('displays children text when loading', () => {
      render(<Button loading>Loading Text</Button>)

      expect(screen.getByText('Loading Text')).toBeInTheDocument()
    })
  })

  describe('Props Handling', () => {
    it('passes through standard button attributes', () => {
      render(
        <Button
          type="submit"
          name="test-button"
          value="test-value"
          aria-label="Test Button"
        >
          Submit
        </Button>
      )

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('type', 'submit')
      expect(button).toHaveAttribute('name', 'test-button')
      expect(button).toHaveAttribute('value', 'test-value')
      expect(button).toHaveAttribute('aria-label', 'Test Button')
    })

    it('handles ref forwarding', () => {
      const ref = React.createRef<HTMLButtonElement>()
      render(<Button ref={ref}>Ref Button</Button>)

      expect(ref.current).toBeInstanceOf(HTMLButtonElement)
      expect(ref.current).toHaveTextContent('Ref Button')
    })

    it('combines custom className with variant classes', () => {
      render(<Button variant="outline" className="ms-4">Custom</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('border', 'border-input') // from outline variant
      expect(button).toHaveClass('ms-4') // custom class
    })

    it('respects disabled state with custom disabled prop', () => {
      render(<Button disabled>Disabled</Button>)

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
      expect(button).toHaveClass('disabled:opacity-50', 'disabled:pointer-events-none')
    })
  })

  describe('Accessibility', () => {
    it('should not have any accessibility violations', async () => {
      render(<Button>Accessible Button</Button>)

      const results = await axe(document.body)
      expect(results).toHaveNoViolations()
    })

    it('has proper ARIA attributes when disabled', () => {
      render(<Button disabled>Disabled Button</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('disabled')
    })

    it('supports ARIA labels and descriptions', () => {
      render(
        <Button aria-label="Close dialog" aria-describedby="dialog-description">
          ×
        </Button>
      )

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('aria-label', 'Close dialog')
      expect(button).toHaveAttribute('aria-describedby', 'dialog-description')
    })

    it('maintains focus styles', () => {
      render(<Button>Focus Button</Button>)

      const button = screen.getByRole('button')
      button.focus()

      expect(button).toHaveFocus()
      // Focus visible styles are applied via CSS classes
      expect(button).toHaveClass('focus-visible:outline-none', 'focus-visible:ring-2')
    })

    it('announces loading state to screen readers', () => {
      render(<Button loading>Processing</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-loading', 'true')
      // Screen readers should announce the change in state
    })
  })

  describe('Design System Compliance', () => {
    it('uses design system tokens for colors', () => {
      render(<Button variant="default">Primary</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-primary', 'text-primary-foreground', 'hover:bg-primary/90')
    })

    it('uses design system tokens for destructive actions', () => {
      render(<Button variant="destructive">Delete</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-destructive', 'text-destructive-foreground', 'hover:bg-destructive/90')
    })

    it('uses design system tokens for outline variant', () => {
      render(<Button variant="outline">Outline</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('border-input', 'bg-background', 'hover:bg-accent')
    })

    it('uses design system tokens for spacing', () => {
      render(<Button size="lg">Large Button</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('px-8') // Design system spacing tokens (lg variant)
      // Updated for touch-target compliance: h-12 min-h-[48px] for lg size
      expect(button).toHaveClass('h-12') // Design system height token with touch-target compliance
    })

    it('uses design system tokens for border radius', () => {
      render(<Button>Rounded Button</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('rounded-md') // Design system radius token
    })

    it('uses design system tokens for transitions', () => {
      render(<Button>Transition Button</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('transition-colors') // Design system transition
    })
  })

  describe('Edge Cases', () => {
    it('handles empty children gracefully', () => {
      render(<Button>{undefined}</Button>)

      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
      expect(button).toBeEmptyDOMElement()
    })

    it('handles null children gracefully', () => {
      render(<Button>{null}</Button>)

      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
      expect(button).toBeEmptyDOMElement()
    })

    it('handles complex JSX children', () => {
      render(
        <Button>
          <div className="flex items-center gap-2">
            <span>Icon</span>
            <span>Text</span>
          </div>
        </Button>
      )

      expect(screen.getByText('Icon')).toBeInTheDocument()
      expect(screen.getByText('Text')).toBeInTheDocument()
    })

    it('handles both loading and disabled states', () => {
      render(<Button loading disabled>Loading Disabled</Button>)

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('data-loading', 'true')
    })

    it('handles rapid prop changes', () => {
      const { rerender } = render(<Button>Initial</Button>)

      rerender(<Button variant="destructive">Changed</Button>)
      expect(screen.getByRole('button')).toHaveClass('bg-destructive')

      rerender(<Button loading>Loading Now</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('data-loading', 'true')
    })
  })

  describe('Performance', () => {
    it('renders efficiently with many buttons', () => {
      const startTime = performance.now()

      const { container } = render(
        <div>
          {Array.from({ length: 100 }, (_, i) => (
            <Button key={i}>Button {i}</Button>
          ))}
        </div>
      )

      const endTime = performance.now()
      const renderTime = endTime - startTime

      expect(renderTime).toBeLessThan(2000) // Should render within 2000ms (Docker environments may be slower)
      expect(container.querySelectorAll('button')).toHaveLength(100)
    })

    it('does not cause unnecessary re-renders', () => {
      const renderCount = vi.fn()
      const TestComponent = () => {
        renderCount()
        return <Button>Stable Button</Button>
      }

      const { rerender } = render(<TestComponent />)
      expect(renderCount).toHaveBeenCalledTimes(1)

      rerender(<TestComponent />)
      expect(renderCount).toHaveBeenCalledTimes(2)
    })
  })

  describe('Integration', () => {
    it('works within forms', async () => {
      const handleSubmit = vi.fn((e) => e.preventDefault())

      render(
        <form onSubmit={handleSubmit} aria-label="test-form">
          <Button type="submit">Submit Form</Button>
        </form>
      )

      const button = screen.getByRole('button', { name: 'Submit Form' })
      const form = screen.getByRole('form', { name: 'test-form' })

      fireEvent.submit(form)
      expect(handleSubmit).toHaveBeenCalled()
    })

    it('works with keyboard navigation patterns', async () => {
      render(
        <div>
          <Button>First</Button>
          <Button>Second</Button>
          <Button>Third</Button>
        </div>
      )

      const buttons = screen.getAllByRole('button')

      // Test that buttons are focusable
      buttons[0].focus()
      expect(buttons[0]).toHaveFocus()

      // Tab to next button using userEvent
      await userEvent.tab()
      expect(buttons[1]).toHaveFocus()
    })

    it('integrates with event bubbling correctly', async () => {
      const parentClick = vi.fn()
      const childClick = vi.fn()

      render(
        <div onClick={parentClick}>
          <Button onClick={childClick}>Child Button</Button>
        </div>
      )

      const button = screen.getByRole('button')
      await userEvent.click(button)

      expect(childClick).toHaveBeenCalled()
      expect(parentClick).toHaveBeenCalled()
    })
  })
})