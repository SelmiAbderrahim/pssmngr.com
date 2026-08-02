// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../badge';

describe('Badge', () => {
  describe('rendering', () => {
    it('renders as a div element', () => {
      render(<Badge data-testid="badge">Test Badge</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge).toBeInTheDocument();
      expect(badge.tagName).toBe('DIV');
    });

    it('renders with children content', () => {
      render(<Badge>Badge Content</Badge>);
      expect(screen.getByText('Badge Content')).toBeInTheDocument();
    });

    it('renders with default variant', () => {
      render(<Badge data-testid="badge">Default</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('bg-primary');
      expect(badge.className).toContain('text-primary-foreground');
    });

    it('renders with secondary variant', () => {
      render(<Badge variant="secondary" data-testid="badge">Secondary</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('bg-secondary');
      expect(badge.className).toContain('text-secondary-foreground');
    });

    it('renders with destructive variant', () => {
      render(<Badge variant="destructive" data-testid="badge">Destructive</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('bg-destructive');
      expect(badge.className).toContain('text-destructive-foreground');
    });

    it('renders with outline variant', () => {
      render(<Badge variant="outline" data-testid="badge">Outline</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('text-foreground');
    });
  });

  describe('styling', () => {
    it('applies base classes', () => {
      render(<Badge data-testid="badge">Test</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('inline-flex');
      expect(badge.className).toContain('items-center');
      expect(badge.className).toContain('rounded-full');
      expect(badge.className).toContain('border');
    });

    it('applies size classes', () => {
      render(<Badge data-testid="badge">Test</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('px-2.5');
      expect(badge.className).toContain('py-0.5');
      expect(badge.className).toContain('text-xs');
    });

    it('applies font weight', () => {
      render(<Badge data-testid="badge">Test</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('font-semibold');
    });

    it('applies transition styles', () => {
      render(<Badge data-testid="badge">Test</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('transition-colors');
    });

    it('accepts custom className', () => {
      render(<Badge className="custom-class" data-testid="badge">Test</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('custom-class');
    });

    it('merges custom className with variant classes', () => {
      render(<Badge variant="secondary" className="my-2" data-testid="badge">Test</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('bg-secondary');
      expect(badge.className).toContain('my-2');
    });
  });

  describe('accessibility', () => {
    it('applies focus ring styles', () => {
      render(<Badge data-testid="badge">Test</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('focus:outline-none');
      expect(badge.className).toContain('focus:ring-2');
      expect(badge.className).toContain('focus:ring-ring');
    });

    it('applies focus ring offset', () => {
      render(<Badge data-testid="badge">Test</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('focus:ring-offset-2');
    });

    it('supports aria-label', () => {
      render(<Badge aria-label="Status badge" data-testid="badge">New</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveAttribute('aria-label', 'Status badge');
    });

    it('supports role attribute', () => {
      render(<Badge role="status" data-testid="badge">Active</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveAttribute('role', 'status');
    });
  });

  describe('props forwarding', () => {
    it('forwards onClick handler', () => {
      let clicked = false;
      render(
        <Badge onClick={() => { clicked = true; }} data-testid="badge">
          Clickable
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      badge.click();
      expect(clicked).toBe(true);
    });

    it('forwards data attributes', () => {
      render(<Badge data-testid="badge" data-value="test">Test</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveAttribute('data-value', 'test');
    });

    it('forwards id attribute', () => {
      render(<Badge id="badge-id" data-testid="badge">Test</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveAttribute('id', 'badge-id');
    });

    it('forwards title attribute', () => {
      render(<Badge title="Badge tooltip" data-testid="badge">Test</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveAttribute('title', 'Badge tooltip');
    });
  });
});
