// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Progress } from '../progress';

describe('Progress', () => {
  it('renders with a value', () => {
    render(<Progress value={50} />);
    const progress = screen.getByRole('progressbar');
    expect(progress).toBeInTheDocument();
  });

  it('renders without a value (uses default 0)', () => {
    render(<Progress />);
    const progress = screen.getByRole('progressbar');
    expect(progress).toBeInTheDocument();
  });

  it('applies transform based on value', () => {
    const { container } = render(<Progress value={75} />);
    const indicator = container.querySelector('[class*="bg-primary"]');
    expect(indicator).toBeInTheDocument();
    expect(indicator?.getAttribute('style')).toContain('translateX(-25%)');
  });

  it('applies transform with zero value', () => {
    const { container } = render(<Progress value={0} />);
    const indicator = container.querySelector('[class*="bg-primary"]');
    expect(indicator).toBeInTheDocument();
    expect(indicator?.getAttribute('style')).toContain('translateX(-100%)');
  });

  it('applies transform with undefined value (branch coverage)', () => {
    const { container } = render(<Progress value={undefined} />);
    const indicator = container.querySelector('[class*="bg-primary"]');
    // When value is undefined, it defaults to 0, so translateX(-100%)
    expect(indicator).toBeInTheDocument();
    // Check that the style attribute contains the expected transform
    expect(indicator?.getAttribute('style')).toContain('translateX(-100%)');
  });

  it('applies transform with null value (branch coverage)', () => {
    // @ts-expect-error - Testing null value for branch coverage
    const { container } = render(<Progress value={null} />);
    const indicator = container.querySelector('[class*="bg-primary"]');
    expect(indicator).toBeInTheDocument();
    expect(indicator?.getAttribute('style')).toContain('translateX(-100%)');
  });

  it('applies custom className', () => {
    render(<Progress className="custom-progress" />);
    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveClass('custom-progress');
  });

  it('forwards ref correctly', () => {
    const ref = { current: null };
    render(<Progress ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('passes additional props', () => {
    render(<Progress data-testid="my-progress" aria-label="Loading" />);
    const progress = screen.getByTestId('my-progress');
    expect(progress).toHaveAttribute('aria-label', 'Loading');
  });
});
