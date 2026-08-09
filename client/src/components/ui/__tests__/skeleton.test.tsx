// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton } from '../skeleton';

describe('Skeleton', () => {
  describe('rendering', () => {
    it('renders as a div element', () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toBeInTheDocument();
      expect(skeleton.tagName).toBe('DIV');
    });

    it('renders with children content', () => {
      render(<Skeleton>Loading...</Skeleton>);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('renders without children', () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toBeInTheDocument();
      expect(skeleton.textContent).toBe('');
    });
  });

  describe('styling', () => {
    it('applies base animation class', () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('animate-pulse');
    });

    it('applies background class', () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('bg-muted');
    });

    it('applies rounded corners', () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('rounded-md');
    });

    it('accepts custom className', () => {
      render(<Skeleton className="custom-class" data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('custom-class');
    });

    it('merges custom className with default classes', () => {
      render(<Skeleton className="h-4 w-full" data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('animate-pulse');
      expect(skeleton.className).toContain('h-4');
      expect(skeleton.className).toContain('w-full');
    });

    it('allows custom dimensions via className', () => {
      render(<Skeleton className="h-12 w-48" data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('h-12');
      expect(skeleton.className).toContain('w-48');
    });

    it('allows circular skeleton via className', () => {
      render(<Skeleton className="rounded-full h-12 w-12" data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('rounded-full');
    });
  });

  describe('props forwarding', () => {
    it('forwards data attributes', () => {
      render(<Skeleton data-testid="skeleton" data-loading="true" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveAttribute('data-loading', 'true');
    });

    it('forwards id attribute', () => {
      render(<Skeleton id="skeleton-id" data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveAttribute('id', 'skeleton-id');
    });

    it('forwards role attribute', () => {
      render(<Skeleton role="status" data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveAttribute('role', 'status');
    });

    it('forwards aria-label attribute', () => {
      render(<Skeleton aria-label="Loading content" data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveAttribute('aria-label', 'Loading content');
    });

    it('forwards aria-busy attribute', () => {
      render(<Skeleton aria-busy="true" data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveAttribute('aria-busy', 'true');
    });

    it('forwards title attribute', () => {
      render(<Skeleton title="Loading..." data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveAttribute('title', 'Loading...');
    });
  });

  describe('accessibility', () => {
    it('can be marked as loading indicator', () => {
      render(<Skeleton role="status" aria-label="Loading" data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveAttribute('role', 'status');
      expect(skeleton).toHaveAttribute('aria-label', 'Loading');
    });

    it('supports aria-live for screen readers', () => {
      render(<Skeleton aria-live="polite" data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveAttribute('aria-live', 'polite');
    });

    it('can include visually hidden loading text', () => {
      render(
        <Skeleton data-testid="skeleton">
          <span className="sr-only">Loading content...</span>
        </Skeleton>
      );
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.querySelector('.sr-only')).toHaveTextContent('Loading content...');
    });
  });

  describe('common use cases', () => {
    it('renders as text skeleton', () => {
      render(<Skeleton className="h-4 w-[250px]" data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('h-4');
      expect(skeleton.className).toContain('w-[250px]');
    });

    it('renders as avatar skeleton', () => {
      render(<Skeleton className="h-12 w-12 rounded-full" data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('h-12');
      expect(skeleton.className).toContain('w-12');
      expect(skeleton.className).toContain('rounded-full');
    });

    it('renders as button skeleton', () => {
      render(<Skeleton className="h-10 w-24 rounded-md" data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('h-10');
      expect(skeleton.className).toContain('w-24');
      expect(skeleton.className).toContain('rounded-md');
    });

    it('renders as card skeleton', () => {
      render(<Skeleton className="h-32 w-full rounded-lg" data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('h-32');
      expect(skeleton.className).toContain('w-full');
      expect(skeleton.className).toContain('rounded-lg');
    });

    it('can be used in complex layouts', () => {
      const { container } = render(
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      );
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons).toHaveLength(3);
    });
  });
});
