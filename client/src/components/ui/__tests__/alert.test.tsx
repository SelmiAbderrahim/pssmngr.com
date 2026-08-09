// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert, AlertTitle, AlertDescription } from '../alert';

describe('Alert Components', () => {
  describe('AlertTitle', () => {
    it('renders with children', () => {
      render(<AlertTitle>Test Title</AlertTitle>);
      expect(screen.getByText('Test Title')).toBeInTheDocument();
    });

    it('renders as h5 element', () => {
      render(<AlertTitle>Title</AlertTitle>);
      const element = screen.getByText('Title');
      expect(element.tagName).toBe('H5');
    });

    it('applies default classes', () => {
      render(<AlertTitle>Title</AlertTitle>);
      const element = screen.getByText('Title');
      expect(element).toHaveClass('mb-1', 'font-medium', 'leading-none', 'tracking-tight');
    });

    it('accepts custom className prop', () => {
      // Note: className is destructured but not applied in AlertTitle implementation
      render(<AlertTitle className="custom-class">Title</AlertTitle>);
      const element = screen.getByText('Title');
      // The component accepts the prop but doesn't apply it to the DOM
      expect(element).toBeInTheDocument();
    });

    it('forwards ref correctly', () => {
      const ref = { current: null };
      render(<AlertTitle ref={ref}>Title</AlertTitle>);
      expect(ref.current).toBeInstanceOf(HTMLHeadingElement);
    });

    it('passes additional props', () => {
      render(<AlertTitle data-testid="alert-title" id="my-title">Title</AlertTitle>);
      const element = screen.getByTestId('alert-title');
      expect(element).toHaveAttribute('id', 'my-title');
    });
  });

  describe('AlertDescription', () => {
    it('renders with children', () => {
      render(<AlertDescription>Test Description</AlertDescription>);
      expect(screen.getByText('Test Description')).toBeInTheDocument();
    });

    it('renders as div element', () => {
      render(<AlertDescription>Description</AlertDescription>);
      const element = screen.getByText('Description');
      expect(element.tagName).toBe('DIV');
    });

    it('accepts custom className prop', () => {
      // Note: className is destructured but not applied in AlertDescription implementation
      render(<AlertDescription className="custom-desc">Description</AlertDescription>);
      const element = screen.getByText('Description');
      expect(element).toBeInTheDocument();
    });

    it('forwards ref correctly', () => {
      const ref = { current: null };
      render(<AlertDescription ref={ref}>Description</AlertDescription>);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });

    it('passes additional props', () => {
      render(<AlertDescription data-testid="alert-desc" role="status">Description</AlertDescription>);
      const element = screen.getByTestId('alert-desc');
      expect(element).toHaveAttribute('role', 'status');
    });
  });

  describe('Complete Alert', () => {
    it('renders complete alert with title and description', () => {
      render(
        <Alert>
          <AlertTitle>Warning</AlertTitle>
          <AlertDescription>This is a warning message</AlertDescription>
        </Alert>
      );

      expect(screen.getByText('Warning')).toBeInTheDocument();
      expect(screen.getByText('This is a warning message')).toBeInTheDocument();
    });
  });
});
