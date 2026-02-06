import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/utils'
import { Badge } from '../badge'

describe('Badge', () => {
  it('renders children correctly', () => {
    render(<Badge>Test Badge</Badge>)
    expect(screen.getByText('Test Badge')).toBeInTheDocument()
  })

  it('renders default variant', () => {
    const { container } = render(<Badge>Default</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge).toHaveClass('bg-primary')
  })

  it('renders different variants', () => {
    const { rerender, container } = render(<Badge variant="secondary">Secondary</Badge>)
    let badge = container.firstChild as HTMLElement
    expect(badge).toHaveClass('bg-secondary')

    rerender(<Badge variant="destructive">Destructive</Badge>)
    badge = container.firstChild as HTMLElement
    expect(badge).toHaveClass('bg-destructive')

    rerender(<Badge variant="outline">Outline</Badge>)
    badge = container.firstChild as HTMLElement
    expect(badge).toHaveClass('text-foreground')

    rerender(<Badge variant="success">Success</Badge>)
    badge = container.firstChild as HTMLElement
    expect(badge).toHaveClass('bg-green-100', 'text-green-800')

    rerender(<Badge variant="warning">Warning</Badge>)
    badge = container.firstChild as HTMLElement
    expect(badge).toHaveClass('bg-yellow-100', 'text-yellow-800')

    rerender(<Badge variant="error">Error</Badge>)
    badge = container.firstChild as HTMLElement
    expect(badge).toHaveClass('bg-red-100', 'text-red-800')
  })

  it('applies custom className', () => {
    const { container } = render(<Badge className="custom-class">Badge</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge).toHaveClass('custom-class')
  })

  it('has correct base styles', () => {
    const { container } = render(<Badge>Badge</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge).toHaveClass('inline-flex', 'items-center', 'rounded-full', 'border')
  })

  it('spreads additional props', () => {
    render(<Badge data-testid="custom-badge">Badge</Badge>)
    expect(screen.getByTestId('custom-badge')).toBeInTheDocument()
  })
})
