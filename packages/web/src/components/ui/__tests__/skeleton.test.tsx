import { describe, it, expect } from 'vitest'
import { render } from '@/test/utils'
import { Skeleton } from '../skeleton'

describe('Skeleton', () => {
  it('renders with correct base classes', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />)
    const skeleton = container.firstChild as HTMLElement
    expect(skeleton).toHaveClass('animate-pulse', 'rounded-md', 'bg-muted', 'h-4', 'w-20')
  })

  it('has aria-hidden attribute for accessibility', () => {
    const { container } = render(<Skeleton />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('applies custom className', () => {
    const { container } = render(<Skeleton className="h-8 w-full" />)
    const skeleton = container.firstChild as HTMLElement
    expect(skeleton).toHaveClass('h-8', 'w-full')
  })

  it('spreads additional props', () => {
    const { container } = render(<Skeleton data-testid="loading-skeleton" />)
    const skeleton = container.firstChild as HTMLElement
    expect(skeleton).toHaveAttribute('data-testid', 'loading-skeleton')
  })

  it('renders multiple skeletons for loading state', () => {
    const { container } = render(
      <div>
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    )
    const skeletons = container.querySelectorAll('[aria-hidden="true"]')
    expect(skeletons).toHaveLength(3)
  })
})
