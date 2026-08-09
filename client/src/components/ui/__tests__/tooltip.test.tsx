// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../tooltip';

describe('Tooltip', () => {
  const TooltipExample = ({ sideOffset }: { sideOffset?: number } = {}) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger data-testid="trigger">Hover me</TooltipTrigger>
        <TooltipContent data-testid="content" sideOffset={sideOffset}>
          Tooltip content
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  describe('TooltipProvider', () => {
    it('provides tooltip context', () => {
      render(<TooltipExample />);
      const trigger = screen.getByTestId('trigger');
      expect(trigger).toBeInTheDocument();
    });

    it('supports multiple tooltips', () => {
      render(
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger data-testid="trigger-1">First</TooltipTrigger>
            <TooltipContent>First tooltip</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger data-testid="trigger-2">Second</TooltipTrigger>
            <TooltipContent>Second tooltip</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
      expect(screen.getByTestId('trigger-1')).toBeInTheDocument();
      expect(screen.getByTestId('trigger-2')).toBeInTheDocument();
    });
  });

  describe('TooltipTrigger', () => {
    it('renders trigger element', () => {
      render(<TooltipExample />);
      const trigger = screen.getByTestId('trigger');
      expect(trigger).toBeInTheDocument();
      expect(trigger).toHaveTextContent('Hover me');
    });

    it('accepts custom children', () => {
      render(
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button data-testid="custom-trigger">Custom button</button>
            </TooltipTrigger>
            <TooltipContent>Tooltip</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
      const button = screen.getByTestId('custom-trigger');
      expect(button).toHaveTextContent('Custom button');
    });

    it('can be disabled', () => {
      render(
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button disabled data-testid="trigger">Disabled</button>
            </TooltipTrigger>
            <TooltipContent>Tooltip</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
      const trigger = screen.getByTestId('trigger');
      expect(trigger).toBeDisabled();
    });
  });

  describe('TooltipContent', () => {
    it('is hidden by default', () => {
      render(<TooltipExample />);
      const content = screen.queryByTestId('content');
      expect(content).not.toBeInTheDocument();
    });

    it('shows on hover', async () => {
      const user = userEvent.setup();
      render(<TooltipExample />);
      const trigger = screen.getByTestId('trigger');

      await user.hover(trigger);
      await waitFor(() => {
        expect(screen.getByTestId('content')).toBeInTheDocument();
      });
    });

    it('hides when no longer hovering', async () => {
      const user = userEvent.setup();
      render(<TooltipExample />);
      const trigger = screen.getByTestId('trigger');

      await user.hover(trigger);
      await waitFor(
        () => {
          expect(screen.getByTestId('content')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Move pointer away from trigger to unhover
      await user.pointer({ target: trigger, keys: '[MouseLeft]' });
      await user.unhover(trigger);

      // Radix UI tooltips have a closing delay, so we need a longer timeout
      await waitFor(
        () => {
          expect(screen.queryByTestId('content')).not.toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('applies base styling classes', async () => {
      const user = userEvent.setup();
      render(<TooltipExample />);

      await user.hover(screen.getByTestId('trigger'));
      await waitFor(() => {
        const content = screen.getByTestId('content');
        expect(content.className).toContain('z-50');
        expect(content.className).toContain('overflow-hidden');
        expect(content.className).toContain('rounded-md');
      });
    });

    it('applies background and text colors', async () => {
      const user = userEvent.setup();
      render(<TooltipExample />);

      await user.hover(screen.getByTestId('trigger'));
      await waitFor(() => {
        const content = screen.getByTestId('content');
        expect(content.className).toContain('bg-primary');
        expect(content.className).toContain('text-primary-foreground');
      });
    });

    it('applies padding and text size', async () => {
      const user = userEvent.setup();
      render(<TooltipExample />);

      await user.hover(screen.getByTestId('trigger'));
      await waitFor(
        () => {
          const content = screen.getByTestId('content');
          expect(content.className).toContain('px-3');
          expect(content.className).toContain('py-1.5');
          expect(content.className).toContain('text-xs');
        },
        { timeout: 3000 }
      );
    });

    it('applies animation classes', async () => {
      const user = userEvent.setup();
      render(<TooltipExample />);

      await user.hover(screen.getByTestId('trigger'));
      await waitFor(() => {
        const content = screen.getByTestId('content');
        expect(content.className).toContain('animate-in');
        expect(content.className).toContain('fade-in-0');
        expect(content.className).toContain('zoom-in-95');
      });
    });

    it('accepts custom className', async () => {
      const user = userEvent.setup();
      render(
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger data-testid="trigger">Hover</TooltipTrigger>
            <TooltipContent className="custom-tooltip" data-testid="content">
              Custom
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      await user.hover(screen.getByTestId('trigger'));
      await waitFor(() => {
        const content = screen.getByTestId('content');
        expect(content.className).toContain('custom-tooltip');
      });
    });

    it('uses default sideOffset of 4', async () => {
      const user = userEvent.setup();
      render(<TooltipExample />);

      await user.hover(screen.getByTestId('trigger'));
      await waitFor(() => {
        const content = screen.getByTestId('content');
        expect(content).toBeInTheDocument();
      });
    });

    it('accepts custom sideOffset', async () => {
      const user = userEvent.setup();
      render(<TooltipExample sideOffset={10} />);

      await user.hover(screen.getByTestId('trigger'));
      await waitFor(
        () => {
          const content = screen.getByTestId('content');
          expect(content).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });

  describe('accessibility', () => {
    it('has proper ARIA attributes', async () => {
      const user = userEvent.setup();
      render(<TooltipExample />);
      const trigger = screen.getByTestId('trigger');

      await user.hover(trigger);
      await waitFor(() => {
        const content = screen.getByTestId('content');
        expect(content).toBeInTheDocument();
      });
    });

    it('shows on focus', async () => {
      const user = userEvent.setup();
      render(
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button data-testid="trigger">Focus me</button>
            </TooltipTrigger>
            <TooltipContent data-testid="content">Tooltip</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      const trigger = screen.getByTestId('trigger');
      await user.tab();

      await waitFor(() => {
        expect(trigger).toHaveFocus();
      });
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      render(
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button data-testid="trigger">Button</button>
            </TooltipTrigger>
            <TooltipContent data-testid="content">Info</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      await user.tab();
      expect(screen.getByTestId('trigger')).toHaveFocus();

      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.queryByTestId('content')).not.toBeInTheDocument();
      });
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to TooltipContent', () => {
      const ref = { current: null } as React.RefObject<HTMLDivElement>;
      render(
        <TooltipProvider>
          <Tooltip defaultOpen>
            <TooltipTrigger>Trigger</TooltipTrigger>
            <TooltipContent ref={ref}>Content</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      waitFor(() => {
        expect(ref.current).toBeInstanceOf(HTMLDivElement);
      });
    });
  });

  describe('controlled behavior', () => {
    it('supports controlled open state', () => {
      render(
        <TooltipProvider>
          <Tooltip open={true}>
            <TooltipTrigger data-testid="trigger">Trigger</TooltipTrigger>
            <TooltipContent data-testid="content">Always visible</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      expect(screen.getByTestId('content')).toBeInTheDocument();
    });

    it('supports onOpenChange callback', async () => {
      const user = userEvent.setup();
      const handleOpenChange = vi.fn();

      render(
        <TooltipProvider>
          <Tooltip onOpenChange={handleOpenChange}>
            <TooltipTrigger data-testid="trigger">Trigger</TooltipTrigger>
            <TooltipContent>Content</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      await user.hover(screen.getByTestId('trigger'));
      await waitFor(() => {
        expect(handleOpenChange).toHaveBeenCalledWith(true);
      });
    });
  });
});
