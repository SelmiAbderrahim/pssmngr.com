// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../tabs';

describe('Tabs', () => {
  const TabsExample = () => (
    <Tabs defaultValue="tab1" data-testid="tabs">
      <TabsList data-testid="tabs-list">
        <TabsTrigger value="tab1" data-testid="trigger-1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2" data-testid="trigger-2">Tab 2</TabsTrigger>
        <TabsTrigger value="tab3" data-testid="trigger-3">Tab 3</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1" data-testid="content-1">Content 1</TabsContent>
      <TabsContent value="tab2" data-testid="content-2">Content 2</TabsContent>
      <TabsContent value="tab3" data-testid="content-3">Content 3</TabsContent>
    </Tabs>
  );

  describe('Tabs root component', () => {
    it('renders Tabs component', () => {
      render(<Tabs data-testid="tabs"><div>Content</div></Tabs>);
      const tabs = screen.getByTestId('tabs');
      expect(tabs).toBeInTheDocument();
    });

    it('renders with default value', () => {
      render(<TabsExample />);
      expect(screen.getByText('Content 1')).toBeInTheDocument();
    });

    it('supports controlled value', () => {
      render(
        <Tabs value="tab2" data-testid="tabs">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2" data-testid="content-2">Content 2</TabsContent>
        </Tabs>
      );
      expect(screen.getByTestId('content-2')).toBeInTheDocument();
    });
  });

  describe('TabsList component', () => {
    it('renders TabsList component', () => {
      render(<TabsExample />);
      const tabsList = screen.getByTestId('tabs-list');
      expect(tabsList).toBeInTheDocument();
    });

    it('applies base styling classes', () => {
      render(<TabsExample />);
      const tabsList = screen.getByTestId('tabs-list');
      expect(tabsList.className).toContain('inline-flex');
      expect(tabsList.className).toContain('h-11');
      expect(tabsList.className).toContain('items-center');
      expect(tabsList.className).toContain('justify-start');
    });

    it('applies background and padding classes', () => {
      render(<TabsExample />);
      const tabsList = screen.getByTestId('tabs-list');
      expect(tabsList.className).toContain('rounded-md');
      expect(tabsList.className).toContain('bg-muted');
      expect(tabsList.className).toContain('p-1');
    });

    it('accepts custom className', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList className="custom-list" data-testid="tabs-list">
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
        </Tabs>
      );
      const tabsList = screen.getByTestId('tabs-list');
      expect(tabsList.className).toContain('custom-list');
    });

    it('forwards ref correctly', () => {
      const ref = { current: null } as React.RefObject<HTMLDivElement>;
      render(
        <Tabs defaultValue="tab1">
          <TabsList ref={ref} data-testid="tabs-list">
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
        </Tabs>
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('TabsTrigger component', () => {
    it('renders TabsTrigger component', () => {
      render(<TabsExample />);
      const trigger = screen.getByTestId('trigger-1');
      expect(trigger).toBeInTheDocument();
    });

    it('applies base styling classes', () => {
      render(<TabsExample />);
      const trigger = screen.getByTestId('trigger-1');
      expect(trigger.className).toContain('inline-flex');
      expect(trigger.className).toContain('items-center');
      expect(trigger.className).toContain('justify-center');
      expect(trigger.className).toContain('whitespace-nowrap');
    });

    it('applies size and spacing classes', () => {
      render(<TabsExample />);
      const trigger = screen.getByTestId('trigger-1');
      expect(trigger.className).toContain('rounded-sm');
      expect(trigger.className).toContain('px-3');
      expect(trigger.className).toContain('py-2');
      expect(trigger.className).toContain('text-sm');
    });

    it('applies focus and disabled styles', () => {
      render(<TabsExample />);
      const trigger = screen.getByTestId('trigger-1');
      expect(trigger.className).toContain('focus-visible:outline-none');
      expect(trigger.className).toContain('focus-visible:ring-2');
      expect(trigger.className).toContain('disabled:pointer-events-none');
      expect(trigger.className).toContain('disabled:opacity-50');
    });

    it('switches tabs when clicked', async () => {
      const user = userEvent.setup();
      render(<TabsExample />);

      expect(screen.getByText('Content 1')).toBeInTheDocument();

      await user.click(screen.getByTestId('trigger-2'));
      expect(screen.getByText('Content 2')).toBeInTheDocument();
    });

    it('accepts custom className', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1" className="custom-trigger" data-testid="trigger">
              Tab 1
            </TabsTrigger>
          </TabsList>
        </Tabs>
      );
      const trigger = screen.getByTestId('trigger');
      expect(trigger.className).toContain('custom-trigger');
    });

    it('forwards ref correctly', () => {
      const ref = { current: null } as React.RefObject<HTMLButtonElement>;
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger ref={ref} value="tab1" data-testid="trigger">
              Tab 1
            </TabsTrigger>
          </TabsList>
        </Tabs>
      );
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
  });

  describe('TabsContent component', () => {
    it('renders TabsContent when active', () => {
      render(<TabsExample />);
      const content = screen.getByTestId('content-1');
      expect(content).toBeInTheDocument();
    });

    it('applies base styling classes', () => {
      render(<TabsExample />);
      const content = screen.getByTestId('content-1');
      expect(content.className).toContain('mt-2');
      expect(content.className).toContain('ring-offset-background');
    });

    it('applies focus styles', () => {
      render(<TabsExample />);
      const content = screen.getByTestId('content-1');
      expect(content.className).toContain('focus-visible:outline-none');
      expect(content.className).toContain('focus-visible:ring-2');
      expect(content.className).toContain('focus-visible:ring-ring');
    });

    it('shows correct content for active tab', async () => {
      const user = userEvent.setup();
      render(<TabsExample />);

      expect(screen.getByText('Content 1')).toBeInTheDocument();

      await user.click(screen.getByTestId('trigger-3'));
      expect(screen.getByText('Content 3')).toBeInTheDocument();
    });

    it('accepts custom className', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1" className="custom-content" data-testid="content">
            Content
          </TabsContent>
        </Tabs>
      );
      const content = screen.getByTestId('content');
      expect(content.className).toContain('custom-content');
    });

    it('forwards ref correctly', () => {
      const ref = { current: null } as React.RefObject<HTMLDivElement>;
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
          <TabsContent ref={ref} value="tab1" data-testid="content">
            Content
          </TabsContent>
        </Tabs>
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('accessibility', () => {
    it('has proper ARIA roles', () => {
      render(<TabsExample />);
      const tabs = screen.getByTestId('tabs');
      expect(tabs).toHaveAttribute('data-orientation', 'horizontal');
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<TabsExample />);

      const trigger1 = screen.getByTestId('trigger-1');
      trigger1.focus();

      await user.keyboard('{ArrowRight}');
      expect(screen.getByTestId('trigger-2')).toHaveFocus();
    });

    it('marks active tab trigger appropriately', () => {
      render(<TabsExample />);
      const trigger1 = screen.getByTestId('trigger-1');
      expect(trigger1).toHaveAttribute('data-state', 'active');
    });
  });
});
