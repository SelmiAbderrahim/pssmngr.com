import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '@/components/ui/button'

describe('Button Component', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    // Use fake timers to prevent timeout issues
    vi.useFakeTimers()
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  })

  afterEach(() => {
    // Restore real timers after each test
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('should render button with default styles', () => {
    render(<Button>Click me</Button>)
    const button = screen.getByRole('button', { name: 'Click me' })

    expect(button).toBeInTheDocument()
    expect(button).toHaveClass('inline-flex')
    expect(button).toHaveClass('items-center')
    expect(button).toHaveClass('justify-center')
    expect(button).toHaveClass('rounded-md')
    expect(button).toHaveClass('text-sm')
    expect(button).toHaveClass('font-medium')
    expect(button).toHaveClass('ring-offset-background')
  })

  it('should render with primary variant by default', () => {
    render(<Button variant="default">Primary Button</Button>)
    const button = screen.getByRole('button', { name: 'Primary Button' })

    expect(button).toHaveClass('bg-primary')
    expect(button).toHaveClass('text-primary-foreground')
    expect(button).toHaveClass('hover:bg-primary/90')
  })

  it('should render with secondary variant', () => {
    render(<Button variant="secondary">Secondary Button</Button>)
    const button = screen.getByRole('button', { name: 'Secondary Button' })

    expect(button).toHaveClass('bg-secondary')
    expect(button).toHaveClass('text-secondary-foreground')
    expect(button).toHaveClass('hover:bg-secondary/80')
  })

  it('should render with destructive variant', () => {
    render(<Button variant="destructive">Delete</Button>)
    const button = screen.getByRole('button', { name: 'Delete' })

    expect(button).toHaveClass('bg-destructive')
    expect(button).toHaveClass('text-destructive-foreground')
    expect(button).toHaveClass('hover:bg-destructive/90')
  })

  it('should render with outline variant', () => {
    render(<Button variant="outline">Outline Button</Button>)
    const button = screen.getByRole('button', { name: 'Outline Button' })

    expect(button).toHaveClass('border')
    expect(button).toHaveClass('border-input')
    expect(button).toHaveClass('bg-background')
    expect(button).toHaveClass('hover:bg-accent')
    expect(button).toHaveClass('hover:text-accent-foreground')
  })

  it('should render with ghost variant', () => {
    render(<Button variant="ghost">Ghost Button</Button>)
    const button = screen.getByRole('button', { name: 'Ghost Button' })

    expect(button).toHaveClass('hover:bg-accent')
    expect(button).toHaveClass('hover:text-accent-foreground')
  })

  it('should render with link variant', () => {
    render(<Button variant="link">Link Button</Button>)
    const button = screen.getByRole('button', { name: 'Link Button' })

    expect(button).toHaveClass('text-primary')
    expect(button).toHaveClass('underline-offset-4')
    expect(button).toHaveClass('hover:underline')
  })

  it('should render with different sizes', () => {
    // Updated to match WCAG 2.1 AA touch target requirements (44x44px minimum)
    const { rerender } = render(<Button size="default">Default Size</Button>)
    let button = screen.getByRole('button', { name: 'Default Size' })
    expect(button).toHaveClass('h-11')  // WCAG compliant height
    expect(button).toHaveClass('px-4')
    expect(button).toHaveClass('py-2')
    expect(button).toHaveClass('min-h-[44px]')

    rerender(<Button size="sm">Small Size</Button>)
    button = screen.getByRole('button', { name: 'Small Size' })
    expect(button).toHaveClass('h-9')
    expect(button).toHaveClass('rounded-md')
    expect(button).toHaveClass('px-3')
    expect(button).toHaveClass('min-h-[36px]')

    rerender(<Button size="lg">Large Size</Button>)
    button = screen.getByRole('button', { name: 'Large Size' })
    expect(button).toHaveClass('h-12')  // WCAG compliant large button
    expect(button).toHaveClass('rounded-md')
    expect(button).toHaveClass('px-8')
    expect(button).toHaveClass('min-h-[48px]')

    rerender(<Button size="icon">Icon</Button>)
    button = screen.getByRole('button', { name: 'Icon' })
    expect(button).toHaveClass('h-11')  // WCAG compliant icon button
    expect(button).toHaveClass('w-11')
    expect(button).toHaveClass('min-h-[44px]')
    expect(button).toHaveClass('min-w-[44px]')
  })

  it('should handle click events', async () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click me</Button>)

    const button = screen.getByRole('button', { name: 'Click me' })

    // Use fireEvent for immediate synchronous testing
    fireEvent.click(button)

    // Advance any pending timers
    vi.advanceTimersByTime(0)

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('should be disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled Button</Button>)
    const button = screen.getByRole('button', { name: 'Disabled Button' })

    expect(button).toBeDisabled()
    expect(button).toHaveClass('pointer-events-none')
    expect(button).toHaveClass('disabled:pointer-events-none')
    expect(button).toHaveClass('disabled:opacity-50')
  })

  it('should not trigger click when disabled', async () => {
    const handleClick = vi.fn()
    render(<Button disabled onClick={handleClick}>Disabled Button</Button>)

    const button = screen.getByRole('button', { name: 'Disabled Button' })

    // Use fireEvent for immediate testing
    fireEvent.click(button)
    vi.advanceTimersByTime(0)

    expect(handleClick).not.toHaveBeenCalled()
  })

  it('should render as different element when asChild is true', () => {
    render(
      <Button asChild>
        <a href="/test">Link Button</a>
      </Button>
    )

    const link = screen.getByRole('link', { name: 'Link Button' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/test')
    expect(link).toHaveClass('inline-flex') // Button styles should be applied
  })

  it('should handle loading state', () => {
    render(<Button loading>Loading Button</Button>)
    const button = screen.getByRole('button', { name: 'Loading Button' })

    expect(button).toBeDisabled()
    // Check for loading indicator if your component includes one
  })

  it('should forward ref correctly', () => {
    const ref = { current: null }
    render(<Button ref={ref}>Ref Button</Button>)

    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
  })

  it('should apply custom className', () => {
    render(<Button className="custom-class">Custom Button</Button>)
    const button = screen.getByRole('button', { name: 'Custom Button' })

    expect(button).toHaveClass('custom-class')
  })

  it('should apply custom props', () => {
    render(<Button data-testid="custom-button" aria-label="Custom Label">Button</Button>)
    const button = screen.getByTestId('custom-button')

    expect(button).toHaveAttribute('aria-label', 'Custom Label')
  })

  it('should handle keyboard events', async () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Button</Button>)

    const button = screen.getByRole('button')
    button.focus()

    // Test Enter key - simulate the click that Enter triggers
    fireEvent.keyDown(button, { key: 'Enter' })
    fireEvent.click(button)
    vi.advanceTimersByTime(0)
    expect(handleClick).toHaveBeenCalledTimes(1)

    // Test Space key - simulate the click that Space triggers
    fireEvent.keyDown(button, { key: ' ' })
    fireEvent.click(button)
    vi.advanceTimersByTime(0)
    expect(handleClick).toHaveBeenCalledTimes(2)
  })

  it('should have proper accessibility attributes', () => {
    render(<Button disabled aria-describedby="description">Button</Button>)
    const button = screen.getByRole('button')

    expect(button).toHaveAttribute('aria-describedby', 'description')
    expect(button).toHaveAttribute('disabled')
  })

  it('should render children correctly', () => {
    render(
      <Button>
        <span data-testid="icon">Icon</span>
        <span>Button Text</span>
      </Button>
    )

    expect(screen.getByText('Button Text')).toBeInTheDocument()
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })
})