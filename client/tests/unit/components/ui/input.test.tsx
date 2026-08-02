import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from '@/components/ui/input'

describe('Input Component', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    vi.useFakeTimers()
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('should render input with default styles', () => {
    render(<Input placeholder="Enter text" />)
    const input = screen.getByPlaceholderText('Enter text')

    expect(input).toBeInTheDocument()
    expect(input).toHaveClass('flex')
    expect(input).toHaveClass('min-h-[44px]')  // WCAG 2.1 AA touch target compliant
    expect(input).toHaveClass('w-full')
    expect(input).toHaveClass('rounded-md')
    expect(input).toHaveClass('border')
    expect(input).toHaveClass('border-input')
    expect(input).toHaveClass('bg-background')
    expect(input).toHaveClass('px-3')
    expect(input).toHaveClass('py-2')
    expect(input).toHaveClass('text-sm')
    expect(input).toHaveClass('ring-offset-background')
    expect(input).toHaveClass('file:border-0')
    expect(input).toHaveClass('file:bg-transparent')
    expect(input).toHaveClass('file:text-sm')
    expect(input).toHaveClass('file:font-medium')
    expect(input).toHaveClass('placeholder:text-muted-foreground')
    expect(input).toHaveClass('focus-visible:outline-none')
    expect(input).toHaveClass('focus-visible:ring-2')
    expect(input).toHaveClass('focus-visible:ring-ring')
    expect(input).toHaveClass('focus-visible:ring-offset-2')
    expect(input).toHaveClass('disabled:cursor-not-allowed')
    expect(input).toHaveClass('disabled:opacity-50')
  })

  it('should handle value changes', async () => {
    const handleChange = vi.fn()

    // Use controlled component pattern to test value changes
    const TestComponent = () => {
      const [value, setValue] = React.useState('')
      return <Input value={value} onChange={(e) => {
        handleChange(e)
        setValue(e.target.value)
      }} placeholder="Test input" />
    }

    render(<TestComponent />)

    const input = screen.getByPlaceholderText('Test input')

    // Use fireEvent for faster, more direct event simulation
    fireEvent.change(input, { target: { value: 'Hello World' } })

    expect(handleChange).toHaveBeenCalledTimes(1)
    // Verify that the event was called with correct target value
    expect(handleChange.mock.calls[0][0]).toHaveProperty('target.value', 'Hello World')
  })

  it('should be disabled when disabled prop is true', () => {
    render(<Input disabled placeholder="Disabled input" />)
    const input = screen.getByPlaceholderText('Disabled input')

    expect(input).toBeDisabled()
  })

  it('should be required when required prop is true', () => {
    render(<Input required placeholder="Required input" />)
    const input = screen.getByPlaceholderText('Required input')

    expect(input).toBeRequired()
  })

  it('should apply custom className', () => {
    render(<Input className="custom-class" placeholder="Custom input" />)
    const input = screen.getByPlaceholderText('Custom input')

    expect(input).toHaveClass('custom-class')
  })

  it('should handle different input types', () => {
    const { rerender } = render(<Input type="text" />)
    let input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('type', 'text')

    rerender(<Input type="password" />)
    input = screen.getByDisplayValue('')
    expect(input).toHaveAttribute('type', 'password')

    rerender(<Input type="email" />)
    input = screen.getByDisplayValue('')
    expect(input).toHaveAttribute('type', 'email')

    rerender(<Input type="number" />)
    input = screen.getByDisplayValue('')
    expect(input).toHaveAttribute('type', 'number')
  })

  it('should handle focus and blur events', async () => {
    const handleFocus = vi.fn()
    const handleBlur = vi.fn()

    render(
      <Input
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="Focus test"
      />
    )

    const input = screen.getByPlaceholderText('Focus test')

    // Use fireEvent for direct and faster event simulation
    fireEvent.focus(input)
    expect(handleFocus).toHaveBeenCalledTimes(1)

    fireEvent.blur(input)
    expect(handleBlur).toHaveBeenCalledTimes(1)
  })

  it('should display value correctly', () => {
    render(<Input value="Initial value" readOnly />)
    const input = screen.getByDisplayValue('Initial value')

    expect(input).toBeInTheDocument()
    expect(input).toHaveValue('Initial value')
  })

  it('should forward ref correctly', () => {
    const ref = { current: null }
    render(<Input ref={ref} placeholder="Ref test" />)

    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it('should handle file input type', () => {
    const { container } = render(<Input type="file" />)
    const input = container.querySelector('input[type="file"]')

    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('type', 'file')
  })

  it('should apply custom props', () => {
    render(
      <Input
        data-testid="custom-input"
        aria-label="Custom Label"
        maxLength={10}
        placeholder="Props test"
      />
    )

    const input = screen.getByPlaceholderText('Props test')
    expect(input).toHaveAttribute('aria-label', 'Custom Label')
    expect(input).toHaveAttribute('maxLength', '10')
  })

  it('should handle key events', async () => {
    const handleKeyDown = vi.fn()
    const handleKeyUp = vi.fn()

    render(
      <Input
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        placeholder="Key events test"
      />
    )

    const input = screen.getByPlaceholderText('Key events test')

    // Focus the input first to ensure key events are captured
    input.focus()

    // Use fireEvent for direct keyboard event simulation
    fireEvent.keyDown(input, { key: 'a', code: 'KeyA' })
    fireEvent.keyUp(input, { key: 'a', code: 'KeyA' })

    // Check that handlers were called
    expect(handleKeyDown).toHaveBeenCalledTimes(1)
    expect(handleKeyUp).toHaveBeenCalledTimes(1)

    // Verify the key information
    expect(handleKeyDown.mock.calls[0][0].key).toBe('a')
    expect(handleKeyDown.mock.calls[0][0].code).toBe('KeyA')
  })

  it('should have proper accessibility attributes', () => {
    render(
      <Input
        placeholder="Accessible input"
        aria-describedby="description"
        aria-invalid="true"
      />
    )

    const input = screen.getByPlaceholderText('Accessible input')
    expect(input).toHaveAttribute('aria-describedby', 'description')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('should handle paste events', async () => {
    const handlePaste = vi.fn()

    render(
      <Input
        onPaste={handlePaste}
        placeholder="Paste test"
      />
    )

    const input = screen.getByPlaceholderText('Paste test')

    // Simulate paste event
    fireEvent.paste(input, {
      clipboardData: {
        getData: () => 'pasted text',
      },
    })

    expect(handlePaste).toHaveBeenCalled()
  })

  it('should handle input validation', () => {
    render(
      <Input
        type="email"
        placeholder="Email input"
        pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$"
        title="Please enter a valid email"
      />
    )

    const input = screen.getByPlaceholderText('Email input')
    expect(input).toHaveAttribute('pattern')
    expect(input).toHaveAttribute('title', 'Please enter a valid email')
  })

  it('should handle autocomplete attributes', () => {
    render(<Input autoComplete="email" placeholder="Email" />)
    const input = screen.getByPlaceholderText('Email')

    expect(input).toHaveAttribute('autoComplete', 'email')
  })

  it('should be readonly when readOnly prop is true', () => {
    render(<Input readOnly value="Readonly value" />)
    const input = screen.getByDisplayValue('Readonly value')

    expect(input).toHaveAttribute('readonly')
  })

  it('should have proper name attribute', () => {
    render(<Input name="username" placeholder="Username" />)
    const input = screen.getByPlaceholderText('Username')

    expect(input).toHaveAttribute('name', 'username')
  })

  it('should have proper id attribute', () => {
    render(<Input id="custom-id" placeholder="Custom ID" />)
    const input = screen.getByPlaceholderText('Custom ID')

    expect(input).toHaveAttribute('id', 'custom-id')
  })
})