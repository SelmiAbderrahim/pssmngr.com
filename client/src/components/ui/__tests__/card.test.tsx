// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from '../card'
import { render, userEvent } from '@/test/utils'

// Extend matchers
expect.extend(toHaveNoViolations)

describe('Card Components', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Card', () => {
    it('renders card with default props', () => {
      render(<Card data-testid="test-card">Card content</Card>)

      const card = screen.getByTestId('test-card')
      expect(card).toBeInTheDocument()
      expect(card).toHaveClass('rounded-lg', 'border', 'bg-card', 'text-card-foreground', 'shadow-sm')
    })

    it('renders card with outline variant', () => {
      render(<Card variant="outline" data-testid="test-card">Outline Card</Card>)

      const card = screen.getByTestId('test-card')
      expect(card).toHaveClass('border-2')
    })

    it('renders card with custom className', () => {
      render(<Card className="custom-class" data-testid="test-card">Custom Card</Card>)

      const card = screen.getByTestId('test-card')
      expect(card).toHaveClass('custom-class')
      expect(card).toHaveClass('rounded-lg', 'border', 'bg-card') // Should also have default classes
    })

    it('passes through HTML attributes', () => {
      render(
        <Card data-testid="test-card" role="article" aria-label="Test Card">
          Card with attributes
        </Card>
      )

      const card = screen.getByTestId('test-card')
      expect(card).toHaveAttribute('role', 'article')
      expect(card).toHaveAttribute('aria-label', 'Test Card')
    })

    it('handles ref forwarding', () => {
      const ref = React.createRef<HTMLDivElement>()
      render(<Card ref={ref}>Ref Card</Card>)

      expect(ref.current).toBeInstanceOf(HTMLDivElement)
      expect(ref.current).toHaveTextContent('Ref Card')
    })

    it('handles click events', async () => {
      const handleClick = vi.fn()
      render(<Card onClick={handleClick} data-testid="test-card">Clickable Card</Card>)

      const card = screen.getByTestId('test-card')
      await userEvent.click(card)

      expect(handleClick).toHaveBeenCalledTimes(1)
    })
  })

  describe('CardHeader', () => {
    it('renders header with default styling', () => {
      render(
        <CardHeader>
          <CardTitle>Header Title</CardTitle>
        </CardHeader>
      )

      const header = screen.getByText('Header Title').parentElement
      // Updated for RTL compliance: gap-1.5 instead of space-y-1.5, responsive padding p-4 sm:p-6
      expect(header).toHaveClass('flex', 'flex-col', 'gap-1.5', 'p-4')
    })

    it('renders header with custom className', () => {
      render(
        <CardHeader className="custom-header">
          <div>Header Content</div>
        </CardHeader>
      )

      const header = screen.getByText('Header Content').parentElement
      // Updated for RTL compliance: gap-1.5 instead of space-y-1.5, responsive padding p-4 sm:p-6
      expect(header).toHaveClass('custom-header', 'flex', 'flex-col', 'gap-1.5', 'p-4')
    })

    it('handles ref forwarding', () => {
      const ref = React.createRef<HTMLDivElement>()
      render(
        <CardHeader ref={ref}>
          <div>Header with ref</div>
        </CardHeader>
      )

      expect(ref.current).toBeInstanceOf(HTMLDivElement)
    })
  })

  describe('CardTitle', () => {
    it('renders title as h3 element by default', () => {
      render(<CardTitle>Card Title</CardTitle>)

      const title = screen.getByRole('heading', { name: 'Card Title' })
      expect(title).toBeInTheDocument()
      expect(title.tagName).toBe('H3')
    })

    it('applies default styling classes', () => {
      render(<CardTitle>Styled Title</CardTitle>)

      const title = screen.getByRole('heading', { name: 'Styled Title' })
      expect(title).toHaveClass('text-2xl', 'font-semibold', 'leading-none', 'tracking-tight')
    })

    it('renders with custom className', () => {
      render(<CardTitle className="custom-title">Custom Title</CardTitle>)

      const title = screen.getByRole('heading', { name: 'Custom Title' })
      expect(title).toHaveClass('custom-title', 'text-2xl', 'font-semibold')
    })

    it('handles ref forwarding', () => {
      const ref = React.createRef<HTMLHeadingElement>()
      render(<CardTitle ref={ref}>Ref Title</CardTitle>)

      expect(ref.current).toBeInstanceOf(HTMLHeadingElement)
    })

    it('passes through HTML attributes', () => {
      render(<CardTitle id="title-id">Title with ID</CardTitle>)

      const title = screen.getByRole('heading', { name: 'Title with ID' })
      expect(title).toHaveAttribute('id', 'title-id')
    })
  })

  describe('CardDescription', () => {
    it('renders description as paragraph element', () => {
      render(<CardDescription>Card Description</CardDescription>)

      const description = screen.getByText('Card Description')
      expect(description).toBeInTheDocument()
      expect(description.tagName).toBe('P')
    })

    it('applies default styling classes', () => {
      render(<CardDescription>Description Text</CardDescription>)

      const description = screen.getByText('Description Text')
      expect(description).toHaveClass('text-sm', 'text-muted-foreground')
    })

    it('renders with custom className', () => {
      render(<CardDescription className="custom-desc">Custom Description</CardDescription>)

      const description = screen.getByText('Custom Description')
      expect(description).toHaveClass('custom-desc', 'text-sm', 'text-muted-foreground')
    })

    it('handles ref forwarding', () => {
      const ref = React.createRef<HTMLParagraphElement>()
      render(<CardDescription ref={ref}>Ref Description</CardDescription>)

      expect(ref.current).toBeInstanceOf(HTMLParagraphElement)
    })

    it('passes through HTML attributes', () => {
      render(<CardDescription data-testid="desc-id">Description with data</CardDescription>)

      const description = screen.getByTestId('desc-id')
      expect(description).toBeInTheDocument()
    })
  })

  describe('CardContent', () => {
    it('renders content with default padding', () => {
      render(
        <CardContent>
          <p>Card content goes here</p>
        </CardContent>
      )

      const content = screen.getByText('Card content goes here').parentElement
      // Updated for responsive design: p-4 pt-0 sm:p-6 sm:pt-0
      expect(content).toHaveClass('p-4', 'pt-0')
    })

    it('renders content with custom className', () => {
      render(
        <CardContent className="custom-content">
          <div>Custom content</div>
        </CardContent>
      )

      const content = screen.getByText('Custom content').parentElement
      // Updated for responsive design: p-4 pt-0 sm:p-6 sm:pt-0
      expect(content).toHaveClass('custom-content', 'p-4', 'pt-0')
    })

    it('handles ref forwarding', () => {
      const ref = React.createRef<HTMLDivElement>()
      render(
        <CardContent ref={ref}>
          <div>Content with ref</div>
        </CardContent>
      )

      expect(ref.current).toBeInstanceOf(HTMLDivElement)
    })
  })

  describe('CardFooter', () => {
    it('renders footer with flex layout', () => {
      render(
        <CardFooter>
          <button>Footer Button</button>
        </CardFooter>
      )

      const footer = screen.getByRole('button').parentElement
      // Updated for RTL compliance: gap-2 added, responsive padding p-4 pt-0 sm:p-6 sm:pt-0
      expect(footer).toHaveClass('flex', 'items-center', 'gap-2', 'p-4', 'pt-0')
    })

    it('renders footer with custom className', () => {
      render(
        <CardFooter className="custom-footer justify-between">
          <span>Left content</span>
          <span>Right content</span>
        </CardFooter>
      )

      const footer = screen.getByText('Left content').parentElement
      // Updated for RTL compliance: gap-2 added, responsive padding p-4 pt-0 sm:p-6 sm:pt-0
      expect(footer).toHaveClass('custom-footer', 'flex', 'items-center', 'justify-between', 'gap-2', 'p-4', 'pt-0')
    })

    it('handles ref forwarding', () => {
      const ref = React.createRef<HTMLDivElement>()
      render(
        <CardFooter ref={ref}>
          <div>Footer with ref</div>
        </CardFooter>
      )

      expect(ref.current).toBeInstanceOf(HTMLDivElement)
    })
  })

  describe('Complete Card Integration', () => {
    it('renders complete card with all components', () => {
      render(
        <Card data-testid="complete-card">
          <CardHeader>
            <CardTitle>Complete Card Title</CardTitle>
            <CardDescription>This is a complete card description</CardDescription>
          </CardHeader>
          <CardContent>
            <p>This is the main content of the card.</p>
          </CardContent>
          <CardFooter>
            <button>Cancel</button>
            <button>Submit</button>
          </CardFooter>
        </Card>
      )

      expect(screen.getByRole('heading', { name: 'Complete Card Title' })).toBeInTheDocument()
      expect(screen.getByText('This is a complete card description')).toBeInTheDocument()
      expect(screen.getByText('This is the main content of the card.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument()
    })

    it('applies proper spacing between components', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Title</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Content</p>
          </CardContent>
          <CardFooter>
            <button>Footer Button</button>
          </CardFooter>
        </Card>
      )

      const header = screen.getByText('Title').parentElement
      const content = screen.getByText('Content').parentElement
      const footer = screen.getByText('Footer Button').parentElement

      // Updated for responsive design: p-4 sm:p-6
      expect(header).toHaveClass('p-4')
      expect(content).toHaveClass('p-4', 'pt-0') // No top padding to connect with header
      expect(footer).toHaveClass('p-4', 'pt-0') // No top padding to connect with content
    })

    it('handles interactive elements within card', async () => {
      const handleButtonClick = vi.fn()
      render(
        <Card>
          <CardContent>
            <button onClick={handleButtonClick}>Interactive Button</button>
          </CardContent>
        </Card>
      )

      const button = screen.getByRole('button', { name: 'Interactive Button' })
      await userEvent.click(button)

      expect(handleButtonClick).toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    it('should not have any accessibility violations', async () => {
      const { container } = render(
        <main>
          <Card>
            <CardHeader>
              <CardTitle>Accessible Title</CardTitle>
              <CardDescription>Accessible Description</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Accessible content</p>
            </CardContent>
          </Card>
        </main>
      )

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has proper heading hierarchy', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Main Heading</CardTitle>
          </CardHeader>
          <CardContent>
            <h4>Subheading</h4>
            <p>Content text</p>
          </CardContent>
        </Card>
      )

      const mainHeading = screen.getByRole('heading', { name: 'Main Heading', level: 3 })
      expect(mainHeading.tagName).toBe('H3')

      const subHeading = screen.getByRole('heading', { name: 'Subheading', level: 4 })
      expect(subHeading.tagName).toBe('H4')
    })

    it('supports ARIA attributes', () => {
      render(
        <Card role="article" aria-labelledby="card-title">
          <CardHeader>
            <CardTitle id="card-title">Aria Title</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Content</p>
          </CardContent>
        </Card>
      )

      const card = screen.getByRole('article')
      expect(card).toHaveAttribute('aria-labelledby', 'card-title')
    })
  })

  describe('Design System Compliance', () => {
    it('uses design system tokens for card styling', () => {
      render(<Card data-testid="test-card">Design System Card</Card>)

      const card = screen.getByTestId('test-card')
      expect(card).toHaveClass('bg-card', 'text-card-foreground', 'border', 'shadow-sm')
    })

    it('uses design system tokens for border radius', () => {
      render(<Card variant="outline" data-testid="test-card">Rounded Card</Card>)

      const card = screen.getByTestId('test-card')
      expect(card).toHaveClass('rounded-lg')
    })

    it('uses design system tokens for text colors', () => {
      render(
        <Card>
          <CardHeader>
            <CardDescription>Muted Text</CardDescription>
          </CardHeader>
        </Card>
      )

      const description = screen.getByText('Muted Text')
      expect(description).toHaveClass('text-muted-foreground')
    })

    it('uses design system tokens for spacing', () => {
      render(
        <CardHeader className="custom-spacing">
          <div>Header content</div>
        </CardHeader>
      )

      const header = screen.getByText('Header content').parentElement
      // Updated for RTL compliance: gap-1.5 instead of space-y-1.5
      expect(header).toHaveClass('gap-1.5') // Design system spacing token (RTL-safe)
    })
  })

  describe('Edge Cases', () => {
    it('handles empty components gracefully', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle></CardTitle>
            <CardDescription></CardDescription>
          </CardHeader>
          <CardContent></CardContent>
          <CardFooter></CardFooter>
        </Card>
      )

      // Components should render without crashing
      expect(screen.getByRole('heading')).toBeInTheDocument()
    })

    it('handles long text content', () => {
      const longText = 'A'.repeat(1000)
      render(
        <Card>
          <CardContent>
            <p>{longText}</p>
          </CardContent>
        </Card>
      )

      expect(screen.getByText(longText)).toBeInTheDocument()
    })

    it('handles nested card components', () => {
      render(
        <Card>
          <CardContent>
            <Card>
              <CardContent>
                <p>Nested content</p>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      )

      expect(screen.getByText('Nested content')).toBeInTheDocument()
      expect(screen.getAllByText('Nested content')).toHaveLength(1)
    })

    it('handles rapid prop changes', () => {
      const { rerender } = render(<Card data-testid="test-card">Initial</Card>)

      rerender(<Card variant="outline" data-testid="test-card">Changed</Card>)
      const card = screen.getByTestId('test-card')
      expect(card).toHaveClass('border-2')

      rerender(<Card className="new-class" data-testid="test-card">Final</Card>)
      expect(screen.getByTestId('test-card')).toHaveClass('new-class')
    })
  })

  describe('Performance', () => {
    it('renders efficiently with many cards', () => {
      const startTime = performance.now()

      const { container } = render(
        <div>
          {Array.from({ length: 50 }, (_, i) => (
            <Card key={i}>
              <CardHeader>
                <CardTitle>Card {i}</CardTitle>
              </CardHeader>
              <CardContent>
                <p>Content for card {i}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )

      const endTime = performance.now()
      const renderTime = endTime - startTime

      expect(renderTime).toBeLessThan(1000) // Should render within 1000ms (CI tolerance)
      expect(container.querySelectorAll('.rounded-lg')).toHaveLength(50)
    })

    it('does not cause unnecessary re-renders', () => {
      const renderCount = vi.fn()
      const TestComponent = ({ children }: { children: React.ReactNode }) => {
        renderCount()
        return <Card>{children}</Card>
      }

      const { rerender } = render(<TestComponent>Initial</TestComponent>)
      expect(renderCount).toHaveBeenCalledTimes(1)

      rerender(<TestComponent>Changed</TestComponent>)
      expect(renderCount).toHaveBeenCalledTimes(2)
    })
  })
})
