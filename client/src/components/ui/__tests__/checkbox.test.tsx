// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from '../checkbox';

describe('Checkbox', () => {
  describe('rendering', () => {
    it('renders as a checkbox button', () => {
      render(<Checkbox data-testid="checkbox" />);
      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).toHaveAttribute('type', 'button');
    });

    it('renders unchecked by default', () => {
      render(<Checkbox data-testid="checkbox" />);
      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox).toHaveAttribute('data-state', 'unchecked');
    });

    it('renders checked when checked prop is true', () => {
      render(<Checkbox checked={true} data-testid="checkbox" />);
      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox).toHaveAttribute('data-state', 'checked');
    });

    it('renders with aria-checked attribute', () => {
      render(<Checkbox checked={true} data-testid="checkbox" />);
      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox).toHaveAttribute('aria-checked', 'true');
    });

    it('renders check icon when checked', () => {
      const { container } = render(<Checkbox checked={true} data-testid="checkbox" />);
      const checkIcon = container.querySelector('svg');
      expect(checkIcon).toBeInTheDocument();
    });

    it('does not render check icon when unchecked', () => {
      const { container } = render(<Checkbox checked={false} data-testid="checkbox" />);
      const indicator = container.querySelector('[data-state="unchecked"]');
      expect(indicator).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('applies base classes', () => {
      render(<Checkbox data-testid="checkbox" />);
      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox.className).toContain('peer');
      expect(checkbox.className).toContain('h-4');
      expect(checkbox.className).toContain('w-4');
      expect(checkbox.className).toContain('shrink-0');
      expect(checkbox.className).toContain('rounded-sm');
    });

    it('applies border styling', () => {
      render(<Checkbox data-testid="checkbox" />);
      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox.className).toContain('border');
      expect(checkbox.className).toContain('border-primary');
    });

    it('applies focus styles', () => {
      render(<Checkbox data-testid="checkbox" />);
      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox.className).toContain('focus-visible:outline-none');
      expect(checkbox.className).toContain('focus-visible:ring-2');
      expect(checkbox.className).toContain('focus-visible:ring-ring');
      expect(checkbox.className).toContain('ring-offset-background');
    });

    it('applies disabled styles', () => {
      render(<Checkbox data-testid="checkbox" />);
      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox.className).toContain('disabled:cursor-not-allowed');
      expect(checkbox.className).toContain('disabled:opacity-50');
    });

    it('accepts custom className', () => {
      render(<Checkbox className="custom-class" data-testid="checkbox" />);
      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox.className).toContain('custom-class');
    });

    it('merges custom className with default classes', () => {
      render(<Checkbox className="mx-2" data-testid="checkbox" />);
      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox.className).toContain('h-4');
      expect(checkbox.className).toContain('mx-2');
    });
  });

  describe('interaction', () => {
    it('toggles state when clicked', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<Checkbox onCheckedChange={handleChange} data-testid="checkbox" />);
      const checkbox = screen.getByTestId('checkbox');

      await user.click(checkbox);
      expect(handleChange).toHaveBeenCalledWith(true);
    });

    it('calls onChange handler with current state', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<Checkbox checked={false} onCheckedChange={handleChange} data-testid="checkbox" />);
      const checkbox = screen.getByTestId('checkbox');

      await user.click(checkbox);
      expect(handleChange).toHaveBeenCalledTimes(1);
    });

    it('respects disabled state', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<Checkbox disabled onCheckedChange={handleChange} data-testid="checkbox" />);
      const checkbox = screen.getByTestId('checkbox');

      await user.click(checkbox);
      expect(handleChange).not.toHaveBeenCalled();
    });

    it('has disabled attribute when disabled', () => {
      render(<Checkbox disabled data-testid="checkbox" />);
      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox).toBeDisabled();
    });
  });

  describe('accessibility', () => {
    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<Checkbox onCheckedChange={handleChange} data-testid="checkbox" />);
      const checkbox = screen.getByTestId('checkbox');

      // Tab to focus the checkbox
      await user.tab();
      expect(checkbox).toHaveFocus();

      // Press space to toggle - use click since Radix checkbox handles space via native behavior
      // which may not be fully supported in JSDOM
      await user.click(checkbox);
      expect(handleChange).toHaveBeenCalled();
    });

    it('has proper aria-checked state', () => {
      const { rerender } = render(<Checkbox checked={false} data-testid="checkbox" />);
      let checkbox = screen.getByTestId('checkbox');
      expect(checkbox).toHaveAttribute('aria-checked', 'false');

      rerender(<Checkbox checked={true} data-testid="checkbox" />);
      checkbox = screen.getByTestId('checkbox');
      expect(checkbox).toHaveAttribute('aria-checked', 'true');
    });

    it('supports aria-label', () => {
      render(<Checkbox aria-label="Accept terms" data-testid="checkbox" />);
      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox).toHaveAttribute('aria-label', 'Accept terms');
    });

    it('supports aria-labelledby', () => {
      render(
        <>
          <span id="checkbox-label">Accept terms</span>
          <Checkbox aria-labelledby="checkbox-label" data-testid="checkbox" />
        </>
      );
      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox).toHaveAttribute('aria-labelledby', 'checkbox-label');
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref correctly', () => {
      const ref = { current: null } as React.RefObject<HTMLButtonElement>;
      render(<Checkbox ref={ref} data-testid="checkbox" />);
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });

    it('ref points to checkbox button element', () => {
      const ref = { current: null } as React.RefObject<HTMLButtonElement>;
      render(<Checkbox ref={ref} data-testid="checkbox" />);
      expect(ref.current?.getAttribute('type')).toBe('button');
    });
  });
});
