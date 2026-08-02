// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Separator } from '../separator';

describe('Separator', () => {
  describe('rendering', () => {
    it('renders as a separator element', () => {
      render(<Separator data-testid="separator" />);
      const separator = screen.getByTestId('separator');
      expect(separator).toBeInTheDocument();
    });

    it('renders with horizontal orientation by default', () => {
      render(<Separator data-testid="separator" />);
      const separator = screen.getByTestId('separator');
      expect(separator).toHaveAttribute('data-orientation', 'horizontal');
    });

    it('renders with vertical orientation when specified', () => {
      render(<Separator orientation="vertical" data-testid="separator" />);
      const separator = screen.getByTestId('separator');
      expect(separator).toHaveAttribute('data-orientation', 'vertical');
    });

    it('is decorative by default', () => {
      render(<Separator data-testid="separator" />);
      const separator = screen.getByTestId('separator');
      expect(separator).toHaveAttribute('role', 'none');
    });

    it('has separator role when not decorative', () => {
      render(<Separator decorative={false} data-testid="separator" />);
      const separator = screen.getByTestId('separator');
      expect(separator).toHaveAttribute('role', 'separator');
    });
  });

  describe('styling', () => {
    it('applies horizontal styles for horizontal orientation', () => {
      render(<Separator data-testid="separator" />);
      const separator = screen.getByTestId('separator');
      expect(separator.className).toContain('h-[1px]');
      expect(separator.className).toContain('w-full');
    });

    it('applies vertical styles for vertical orientation', () => {
      render(<Separator orientation="vertical" data-testid="separator" />);
      const separator = screen.getByTestId('separator');
      expect(separator.className).toContain('h-full');
      expect(separator.className).toContain('w-[1px]');
    });

    it('applies base classes', () => {
      render(<Separator data-testid="separator" />);
      const separator = screen.getByTestId('separator');
      expect(separator.className).toContain('shrink-0');
      expect(separator.className).toContain('bg-border');
    });

    it('accepts custom className', () => {
      render(<Separator className="custom-class" data-testid="separator" />);
      const separator = screen.getByTestId('separator');
      expect(separator.className).toContain('custom-class');
    });

    it('merges custom className with default classes', () => {
      render(<Separator className="my-4" data-testid="separator" />);
      const separator = screen.getByTestId('separator');
      expect(separator.className).toContain('shrink-0');
      expect(separator.className).toContain('my-4');
    });
  });

  describe('props forwarding', () => {
    it('forwards ref correctly', () => {
      const ref = { current: null } as React.RefObject<HTMLDivElement>;
      render(<Separator ref={ref} data-testid="separator" />);
      expect(ref.current).toBeInstanceOf(HTMLElement);
    });

    it('passes additional props to the underlying element', () => {
      render(<Separator data-testid="separator" aria-label="Section divider" />);
      const separator = screen.getByTestId('separator');
      expect(separator).toHaveAttribute('aria-label', 'Section divider');
    });
  });

  describe('accessibility', () => {
    it('renders with proper aria attributes when not decorative', () => {
      render(<Separator decorative={false} data-testid="separator" />);
      const separator = screen.getByTestId('separator');
      expect(separator).toHaveAttribute('role', 'separator');
    });

    it('hides decorative separators from screen readers', () => {
      render(<Separator data-testid="separator" />);
      const separator = screen.getByTestId('separator');
      expect(separator).toHaveAttribute('role', 'none');
    });

    it('supports aria-labelledby for non-decorative separators', () => {
      render(
        <>
          <span id="section-label">Section</span>
          <Separator decorative={false} aria-labelledby="section-label" data-testid="separator" />
        </>
      );
      const separator = screen.getByTestId('separator');
      expect(separator).toHaveAttribute('aria-labelledby', 'section-label');
    });
  });
});
