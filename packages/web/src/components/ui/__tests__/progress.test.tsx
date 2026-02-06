import { describe, it, expect } from 'vitest'
import { render } from '@/test/utils'
import { Progress } from '../progress'

describe('Progress', () => {
  it('renders progress bar', () => {
    const { container } = render(<Progress value={50} />)
    const progressBar = container.querySelector('[role="progressbar"]')
    expect(progressBar).toBeInTheDocument()
  })

  it('displays correct value', () => {
    const { container } = render(<Progress value={75} />)
    const progressBar = container.querySelector('[role="progressbar"]')
    expect(progressBar).toHaveAttribute('aria-valuenow', '75')
  })

  it('has correct min and max attributes', () => {
    const { container } = render(<Progress value={50} />)
    const progressBar = container.querySelector('[role="progressbar"]')
    expect(progressBar).toHaveAttribute('aria-valuemin', '0')
    expect(progressBar).toHaveAttribute('aria-valuemax', '100')
  })

  it('renders with 0 value', () => {
    const { container } = render(<Progress value={0} />)
    const progressBar = container.querySelector('[role="progressbar"]')
    expect(progressBar).toHaveAttribute('aria-valuenow', '0')
  })

  it('renders with 100 value', () => {
    const { container } = render(<Progress value={100} />)
    const progressBar = container.querySelector('[role="progressbar"]')
    expect(progressBar).toHaveAttribute('aria-valuenow', '100')
  })

  it('applies custom className', () => {
    const { container } = render(<Progress value={50} className="custom-class" />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveClass('custom-class')
  })

  it('renders indicator with correct width transform', () => {
    const { container } = render(<Progress value={60} />)
    const indicator = container.querySelector('[role="progressbar"] > div')
    expect(indicator).toHaveStyle({ transform: 'translateX(-40%)' })
  })

  it('handles null value gracefully', () => {
    const { container } = render(<Progress value={null as any} />)
    const progressBar = container.querySelector('[role="progressbar"]')
    expect(progressBar).toBeInTheDocument()
  })

  it('applies custom indicator className', () => {
    const { container } = render(
      <Progress value={50} indicatorClassName="custom-indicator" />
    )
    const indicator = container.querySelector('[role="progressbar"] > div')
    expect(indicator).toHaveClass('custom-indicator')
  })
})
