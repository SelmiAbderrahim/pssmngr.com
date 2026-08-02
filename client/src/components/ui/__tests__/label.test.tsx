// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Label } from '../label';

describe('Label', () => {
  describe('rendering', () => {
    it('renders as a label element', () => {
      render(<Label data-testid="label">Test Label</Label>);
      const label = screen.getByTestId('label');
      expect(label).toBeInTheDocument();
      expect(label.tagName).toBe('LABEL');
    });

    it('renders with children content', () => {
      render(<Label>Label Text</Label>);
      expect(screen.getByText('Label Text')).toBeInTheDocument();
    });

    it('renders with default variant', () => {
      render(<Label data-testid="label">Default</Label>);
      const label = screen.getByTestId('label');
      expect(label.className).toContain('text-foreground');
    });

    it('renders with secondary variant', () => {
      render(<Label variant="secondary" data-testid="label">Secondary</Label>);
      const label = screen.getByTestId('label');
      expect(label.className).toContain('text-muted-foreground');
    });

    it('renders with destructive variant', () => {
      render(<Label variant="destructive" data-testid="label">Destructive</Label>);
      const label = screen.getByTestId('label');
      expect(label.className).toContain('text-destructive');
    });
  });

  describe('styling', () => {
    it('applies base classes', () => {
      render(<Label data-testid="label">Test</Label>);
      const label = screen.getByTestId('label');
      expect(label.className).toContain('text-sm');
      expect(label.className).toContain('font-medium');
      expect(label.className).toContain('leading-none');
    });

    it('applies peer-disabled styles', () => {
      render(<Label data-testid="label">Test</Label>);
      const label = screen.getByTestId('label');
      expect(label.className).toContain('peer-disabled:cursor-not-allowed');
      expect(label.className).toContain('peer-disabled:opacity-70');
    });

    it('accepts custom className', () => {
      render(<Label className="custom-class" data-testid="label">Test</Label>);
      const label = screen.getByTestId('label');
      expect(label.className).toContain('custom-class');
    });

    it('merges custom className with variant classes', () => {
      render(<Label variant="secondary" className="mb-2" data-testid="label">Test</Label>);
      const label = screen.getByTestId('label');
      expect(label.className).toContain('text-muted-foreground');
      expect(label.className).toContain('mb-2');
    });

    it('merges custom className with base classes', () => {
      render(<Label className="font-bold" data-testid="label">Test</Label>);
      const label = screen.getByTestId('label');
      expect(label.className).toContain('text-sm');
      expect(label.className).toContain('font-bold');
    });
  });

  describe('form association', () => {
    it('associates with form control via htmlFor', () => {
      render(
        <>
          <Label htmlFor="input-id">Input Label</Label>
          <input id="input-id" />
        </>
      );
      const label = screen.getByText('Input Label');
      expect(label).toHaveAttribute('for', 'input-id');
    });

    it('clicking label focuses associated input', async () => {
      const user = userEvent.setup();
      render(
        <>
          <Label htmlFor="test-input">Test Input</Label>
          <input id="test-input" data-testid="input" />
        </>
      );
      const label = screen.getByText('Test Input');
      const input = screen.getByTestId('input');

      await user.click(label);
      expect(input).toHaveFocus();
    });

    it('works without htmlFor attribute', () => {
      render(<Label data-testid="label">Standalone Label</Label>);
      const label = screen.getByTestId('label');
      expect(label).not.toHaveAttribute('for');
    });
  });

  describe('accessibility', () => {
    it('supports required attribute on associated input', () => {
      render(
        <>
          <Label htmlFor="required-input">Required Field</Label>
          <input id="required-input" required data-testid="input" />
        </>
      );
      const input = screen.getByTestId('input');
      expect(input).toBeRequired();
    });

    it('can be used with aria-describedby', () => {
      render(
        <>
          <Label htmlFor="described-input" id="label-id">Field Label</Label>
          <span id="description">Help text</span>
          <input id="described-input" aria-describedby="description" data-testid="input" />
        </>
      );
      const input = screen.getByTestId('input');
      expect(input).toHaveAttribute('aria-describedby', 'description');
    });

    it('supports aria-invalid on associated input', () => {
      render(
        <>
          <Label htmlFor="invalid-input">Invalid Field</Label>
          <input id="invalid-input" aria-invalid="true" data-testid="input" />
        </>
      );
      const input = screen.getByTestId('input');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref correctly', () => {
      const ref = { current: null } as React.RefObject<HTMLLabelElement>;
      render(<Label ref={ref} data-testid="label">Test</Label>);
      expect(ref.current).toBeInstanceOf(HTMLLabelElement);
    });

    it('ref points to label element', () => {
      const ref = { current: null } as React.RefObject<HTMLLabelElement>;
      render(<Label ref={ref} data-testid="label">Test</Label>);
      expect(ref.current?.tagName).toBe('LABEL');
    });
  });

  describe('props forwarding', () => {
    it('forwards data attributes', () => {
      render(<Label data-testid="label" data-custom="value">Test</Label>);
      const label = screen.getByTestId('label');
      expect(label).toHaveAttribute('data-custom', 'value');
    });

    it('forwards id attribute', () => {
      render(<Label id="label-id" data-testid="label">Test</Label>);
      const label = screen.getByTestId('label');
      expect(label).toHaveAttribute('id', 'label-id');
    });

    it('forwards title attribute', () => {
      render(<Label title="Label tooltip" data-testid="label">Test</Label>);
      const label = screen.getByTestId('label');
      expect(label).toHaveAttribute('title', 'Label tooltip');
    });
  });
});
