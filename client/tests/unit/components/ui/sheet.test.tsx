import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as React from 'react'

// Mock Portal so SheetContent renders inline in jsdom (no document.body portal)
vi.mock('@radix-ui/react-dialog', async () => {
  const actual = await vi.importActual<typeof import('@radix-ui/react-dialog')>(
    '@radix-ui/react-dialog'
  )
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="portal">{children}</div>
    ),
  }
})

import {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render a Sheet that is open by default with all sub-components inside. */
function renderOpenSheet(
  side?: 'top' | 'bottom' | 'left' | 'right',
  extraClassName?: string
) {
  render(
    <Sheet defaultOpen>
      <SheetContent
        side={side}
        className={extraClassName}
        data-testid="sheet-content"
      >
        <SheetHeader data-testid="sheet-header">
          <SheetTitle data-testid="sheet-title">Sheet Title</SheetTitle>
          <SheetDescription data-testid="sheet-desc">
            Sheet description
          </SheetDescription>
        </SheetHeader>
        <p>Sheet body</p>
        <SheetFooter data-testid="sheet-footer">
          <button>Save</button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

describe('Sheet exports', () => {
  it('Sheet is defined', () => { expect(Sheet).toBeDefined() })
  it('SheetTrigger is defined', () => { expect(SheetTrigger).toBeDefined() })
  it('SheetClose is defined', () => { expect(SheetClose).toBeDefined() })
  it('SheetPortal is defined', () => { expect(SheetPortal).toBeDefined() })
  it('SheetOverlay is defined', () => { expect(SheetOverlay).toBeDefined() })
  it('SheetContent is defined', () => { expect(SheetContent).toBeDefined() })
  it('SheetHeader is defined', () => { expect(SheetHeader).toBeDefined() })
  it('SheetFooter is defined', () => { expect(SheetFooter).toBeDefined() })
  it('SheetTitle is defined', () => { expect(SheetTitle).toBeDefined() })
  it('SheetDescription is defined', () => { expect(SheetDescription).toBeDefined() })
})

// ---------------------------------------------------------------------------
// Sheet open / close interaction
// ---------------------------------------------------------------------------

describe('Sheet open/close interaction', () => {
  it('content is hidden before trigger click', () => {
    render(
      <Sheet>
        <SheetTrigger data-testid="trigger">Open</SheetTrigger>
        <SheetContent><p>Hidden content</p></SheetContent>
      </Sheet>
    )
    expect(screen.queryByText('Hidden content')).toBeNull()
  })

  it('renders content after trigger click', () => {
    render(
      <Sheet>
        <SheetTrigger data-testid="trigger">Open</SheetTrigger>
        <SheetContent><p>Visible content</p></SheetContent>
      </Sheet>
    )
    fireEvent.click(screen.getByTestId('trigger'))
    expect(screen.getByText('Visible content')).toBeInTheDocument()
  })

  it('closes content when SheetClose is clicked', () => {
    render(
      <Sheet>
        <SheetTrigger data-testid="trigger">Open</SheetTrigger>
        <SheetContent>
          <SheetClose data-testid="close-btn">Close</SheetClose>
        </SheetContent>
      </Sheet>
    )
    fireEvent.click(screen.getByTestId('trigger'))
    expect(screen.getByTestId('close-btn')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('close-btn'))
    expect(screen.queryByTestId('close-btn')).toBeNull()
  })

  it('renders with defaultOpen=true immediately', () => {
    render(
      <Sheet defaultOpen>
        <SheetContent><p>Auto open</p></SheetContent>
      </Sheet>
    )
    expect(screen.getByText('Auto open')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// SheetContent — side variants
// ---------------------------------------------------------------------------

describe('SheetContent sides', () => {
  it('default (right) applies end-0 class', () => {
    renderOpenSheet()
    expect(screen.getByTestId('sheet-content').className).toContain('end-0')
  })

  it('side=right applies end-0 class', () => {
    renderOpenSheet('right')
    expect(screen.getByTestId('sheet-content').className).toContain('end-0')
  })

  it('side=left applies start-0 class', () => {
    renderOpenSheet('left')
    expect(screen.getByTestId('sheet-content').className).toContain('start-0')
  })

  it('side=top applies top-0 and border-b classes', () => {
    renderOpenSheet('top')
    const cls = screen.getByTestId('sheet-content').className
    expect(cls).toContain('top-0')
    expect(cls).toContain('border-b')
  })

  it('side=bottom applies bottom-0 and border-t classes', () => {
    renderOpenSheet('bottom')
    const cls = screen.getByTestId('sheet-content').className
    expect(cls).toContain('bottom-0')
    expect(cls).toContain('border-t')
  })
})

// ---------------------------------------------------------------------------
// SheetContent — misc
// ---------------------------------------------------------------------------

describe('SheetContent misc', () => {
  it('merges custom className', () => {
    renderOpenSheet('right', 'my-sheet-class')
    expect(screen.getByTestId('sheet-content').className).toContain('my-sheet-class')
  })

  it('renders children', () => {
    renderOpenSheet()
    expect(screen.getByText('Sheet body')).toBeInTheDocument()
  })

  it('renders built-in close button with sr-only "Close" text', () => {
    renderOpenSheet()
    expect(screen.getByText('Close', { selector: '.sr-only' })).toBeInTheDocument()
  })

  it('forwards ref to the content element', () => {
    const ref = vi.fn()
    render(
      <Sheet defaultOpen>
        <SheetContent ref={ref} data-testid="sc">content</SheetContent>
      </Sheet>
    )
    expect(ref).toHaveBeenCalled()
  })

  it('renders inside the Portal wrapper', () => {
    renderOpenSheet()
    expect(screen.getByTestId('portal')).toBeInTheDocument()
  })

  it('renders SheetOverlay inside portal', () => {
    renderOpenSheet()
    const portal = screen.getByTestId('portal')
    // Overlay has fixed + bg-black/80 classes
    const overlay = portal.querySelector('[class*="bg-black"]')
    expect(overlay).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// SheetOverlay standalone
// ---------------------------------------------------------------------------

describe('SheetOverlay', () => {
  it('applies custom className via forwardRef', () => {
    const { container } = render(
      <Sheet defaultOpen>
        <SheetOverlay className="custom-overlay" data-testid="overlay" />
      </Sheet>
    )
    const overlay = container.querySelector('[data-testid="overlay"]')
    expect(overlay?.className).toContain('custom-overlay')
  })

  it('has fixed inset-0 classes by default', () => {
    const { container } = render(
      <Sheet defaultOpen>
        <SheetOverlay data-testid="overlay" />
      </Sheet>
    )
    const overlay = container.querySelector('[data-testid="overlay"]')
    expect(overlay?.className).toContain('fixed')
    expect(overlay?.className).toContain('inset-0')
  })

  it('has displayName set', () => {
    // SheetOverlay.displayName comes from SheetPrimitive.Overlay.displayName
    expect(SheetOverlay.displayName).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// SheetHeader
// ---------------------------------------------------------------------------

describe('SheetHeader', () => {
  it('renders children', () => {
    render(<SheetHeader><span>Header child</span></SheetHeader>)
    expect(screen.getByText('Header child')).toBeInTheDocument()
  })

  it('has flex-col layout class', () => {
    const { container } = render(<SheetHeader>H</SheetHeader>)
    expect((container.firstChild as HTMLElement).className).toContain('flex-col')
  })

  it('has text-center class', () => {
    const { container } = render(<SheetHeader>H</SheetHeader>)
    expect((container.firstChild as HTMLElement).className).toContain('text-center')
  })

  it('merges custom className', () => {
    const { container } = render(<SheetHeader className="my-header">H</SheetHeader>)
    expect((container.firstChild as HTMLElement).className).toContain('my-header')
  })

  it('displayName is "SheetHeader"', () => {
    expect(SheetHeader.displayName).toBe('SheetHeader')
  })

  it('passes additional HTML div props', () => {
    render(<SheetHeader data-testid="hdr">H</SheetHeader>)
    expect(screen.getByTestId('hdr')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// SheetFooter
// ---------------------------------------------------------------------------

describe('SheetFooter', () => {
  it('renders children', () => {
    render(<SheetFooter><button>Save</button></SheetFooter>)
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('has flex-col-reverse class', () => {
    const { container } = render(<SheetFooter>F</SheetFooter>)
    expect((container.firstChild as HTMLElement).className).toContain('flex-col-reverse')
  })

  it('merges custom className', () => {
    const { container } = render(<SheetFooter className="my-footer">F</SheetFooter>)
    expect((container.firstChild as HTMLElement).className).toContain('my-footer')
  })

  it('displayName is "SheetFooter"', () => {
    expect(SheetFooter.displayName).toBe('SheetFooter')
  })

  it('passes additional HTML div props', () => {
    render(<SheetFooter data-testid="ftr">F</SheetFooter>)
    expect(screen.getByTestId('ftr')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// SheetTitle
// ---------------------------------------------------------------------------

describe('SheetTitle', () => {
  it('renders text content', () => {
    renderOpenSheet()
    expect(screen.getByText('Sheet Title')).toBeInTheDocument()
  })

  it('has font-semibold class', () => {
    renderOpenSheet()
    expect(screen.getByTestId('sheet-title').className).toContain('font-semibold')
  })

  it('has text-foreground class', () => {
    renderOpenSheet()
    expect(screen.getByTestId('sheet-title').className).toContain('text-foreground')
  })

  it('has text-lg class', () => {
    renderOpenSheet()
    expect(screen.getByTestId('sheet-title').className).toContain('text-lg')
  })

  it('merges custom className', () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle data-testid="title" className="my-title">T</SheetTitle>
        </SheetContent>
      </Sheet>
    )
    expect(screen.getByTestId('title').className).toContain('my-title')
  })

  it('forwards ref', () => {
    const ref = vi.fn()
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle ref={ref}>T</SheetTitle>
        </SheetContent>
      </Sheet>
    )
    expect(ref).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// SheetDescription
// ---------------------------------------------------------------------------

describe('SheetDescription', () => {
  it('renders text content', () => {
    renderOpenSheet()
    expect(screen.getByText('Sheet description')).toBeInTheDocument()
  })

  it('has text-sm class', () => {
    renderOpenSheet()
    expect(screen.getByTestId('sheet-desc').className).toContain('text-sm')
  })

  it('has text-muted-foreground class', () => {
    renderOpenSheet()
    expect(screen.getByTestId('sheet-desc').className).toContain('text-muted-foreground')
  })

  it('merges custom className', () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>T</SheetTitle>
          <SheetDescription data-testid="desc" className="my-desc">D</SheetDescription>
        </SheetContent>
      </Sheet>
    )
    expect(screen.getByTestId('desc').className).toContain('my-desc')
  })

  it('forwards ref', () => {
    const ref = vi.fn()
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>T</SheetTitle>
          <SheetDescription ref={ref}>D</SheetDescription>
        </SheetContent>
      </Sheet>
    )
    expect(ref).toHaveBeenCalled()
  })
})
