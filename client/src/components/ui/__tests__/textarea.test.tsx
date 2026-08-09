// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from '../textarea';

describe('Textarea', () => {
  describe('rendering', () => {
    it('renders as a textarea element', () => {
      render(<Textarea data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toBeInTheDocument();
      expect(textarea.tagName).toBe('TEXTAREA');
    });

    it('renders with placeholder text', () => {
      render(<Textarea placeholder="Enter text..." data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveAttribute('placeholder', 'Enter text...');
    });

    it('renders with default value', () => {
      render(<Textarea defaultValue="Initial text" data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea') as HTMLTextAreaElement;
      expect(textarea.value).toBe('Initial text');
    });

    it('renders with controlled value', () => {
      render(<Textarea value="Controlled text" onChange={() => {}} data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea') as HTMLTextAreaElement;
      expect(textarea.value).toBe('Controlled text');
    });
  });

  describe('styling', () => {
    it('applies base layout classes', () => {
      render(<Textarea data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('flex');
      expect(textarea.className).toContain('w-full');
      expect(textarea.className).toContain('min-h-[80px]');
    });

    it('applies border and background classes', () => {
      render(<Textarea data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('rounded-md');
      expect(textarea.className).toContain('border');
      expect(textarea.className).toContain('border-input');
      expect(textarea.className).toContain('bg-background');
    });

    it('applies padding and text size', () => {
      render(<Textarea data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('px-3');
      expect(textarea.className).toContain('py-2');
      expect(textarea.className).toContain('text-sm');
    });

    it('applies focus styles', () => {
      render(<Textarea data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('focus-visible:outline-none');
      expect(textarea.className).toContain('focus-visible:ring-2');
      expect(textarea.className).toContain('focus-visible:ring-ring');
      expect(textarea.className).toContain('ring-offset-background');
    });

    it('applies placeholder styles', () => {
      render(<Textarea data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('placeholder:text-muted-foreground');
    });

    it('applies disabled styles', () => {
      render(<Textarea data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('disabled:cursor-not-allowed');
      expect(textarea.className).toContain('disabled:opacity-50');
    });

    it('accepts custom className', () => {
      render(<Textarea className="custom-class" data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('custom-class');
    });

    it('merges custom className with default classes', () => {
      render(<Textarea className="h-32 resize-none" data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.className).toContain('w-full');
      expect(textarea.className).toContain('h-32');
      expect(textarea.className).toContain('resize-none');
    });
  });

  describe('interaction', () => {
    it('accepts user input', async () => {
      const user = userEvent.setup();
      render(<Textarea data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea') as HTMLTextAreaElement;

      await user.type(textarea, 'Hello world');
      expect(textarea.value).toBe('Hello world');
    });

    it('calls onChange handler', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<Textarea onChange={handleChange} data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');

      await user.type(textarea, 'Test');
      expect(handleChange).toHaveBeenCalled();
    });

    it('respects maxLength attribute', () => {
      render(<Textarea maxLength={10} data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveAttribute('maxLength', '10');
    });

    it('respects disabled state', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<Textarea disabled onChange={handleChange} data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea') as HTMLTextAreaElement;

      await user.type(textarea, 'Test');
      expect(handleChange).not.toHaveBeenCalled();
      expect(textarea.value).toBe('');
    });

    it('respects readOnly state', async () => {
      const user = userEvent.setup();
      render(<Textarea readOnly defaultValue="Read only" data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea') as HTMLTextAreaElement;

      await user.type(textarea, 'Test');
      expect(textarea.value).toBe('Read only');
    });
  });

  describe('accessibility', () => {
    it('supports aria-label', () => {
      render(<Textarea aria-label="Comment box" data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveAttribute('aria-label', 'Comment box');
    });

    it('supports aria-labelledby', () => {
      render(
        <>
          <label id="textarea-label">Description</label>
          <Textarea aria-labelledby="textarea-label" data-testid="textarea" />
        </>
      );
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveAttribute('aria-labelledby', 'textarea-label');
    });

    it('supports aria-describedby', () => {
      render(
        <>
          <Textarea aria-describedby="textarea-help" data-testid="textarea" />
          <span id="textarea-help">Enter your description here</span>
        </>
      );
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveAttribute('aria-describedby', 'textarea-help');
    });

    it('supports aria-invalid for validation', () => {
      render(<Textarea aria-invalid="true" data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveAttribute('aria-invalid', 'true');
    });

    it('supports required attribute', () => {
      render(<Textarea required data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toBeRequired();
    });

    it('can be focused via keyboard', async () => {
      const user = userEvent.setup();
      render(<Textarea data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');

      await user.tab();
      expect(textarea).toHaveFocus();
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref correctly', () => {
      const ref = { current: null } as React.RefObject<HTMLTextAreaElement>;
      render(<Textarea ref={ref} data-testid="textarea" />);
      expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    });

    it('allows ref access to textarea methods', () => {
      const ref = { current: null } as React.RefObject<HTMLTextAreaElement>;
      render(<Textarea ref={ref} data-testid="textarea" />);

      expect(ref.current?.focus).toBeDefined();
      expect(ref.current?.blur).toBeDefined();
      expect(ref.current?.select).toBeDefined();
    });
  });

  describe('props forwarding', () => {
    it('forwards name attribute', () => {
      render(<Textarea name="description" data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveAttribute('name', 'description');
    });

    it('forwards id attribute', () => {
      render(<Textarea id="textarea-id" data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveAttribute('id', 'textarea-id');
    });

    it('forwards rows attribute', () => {
      render(<Textarea rows={5} data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveAttribute('rows', '5');
    });

    it('forwards cols attribute', () => {
      render(<Textarea cols={50} data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveAttribute('cols', '50');
    });

    it('forwards autoComplete attribute', () => {
      render(<Textarea autoComplete="off" data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveAttribute('autoComplete', 'off');
    });

    it('forwards autoFocus attribute', () => {
      render(<Textarea autoFocus data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      // In HTML, the attribute is lowercase 'autofocus', not 'autoFocus'
      // React's autoFocus prop gets converted to the HTML autofocus attribute
      expect(textarea).toHaveFocus();
    });
  });
});
