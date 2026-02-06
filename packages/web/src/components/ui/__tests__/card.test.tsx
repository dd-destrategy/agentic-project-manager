import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/utils'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../card'

describe('Card', () => {
  it('renders Card component', () => {
    const { container } = render(<Card>Card content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card).toBeInTheDocument()
    expect(card).toHaveClass('rounded-lg', 'border', 'bg-card')
  })

  it('renders CardHeader component', () => {
    render(<CardHeader>Header content</CardHeader>)
    expect(screen.getByText('Header content')).toBeInTheDocument()
  })

  it('renders CardTitle component', () => {
    render(<CardTitle>Title</CardTitle>)
    const title = screen.getByText('Title')
    expect(title).toBeInTheDocument()
    expect(title.tagName).toBe('H3')
    expect(title).toHaveClass('text-2xl', 'font-semibold')
  })

  it('renders CardDescription component', () => {
    render(<CardDescription>Description text</CardDescription>)
    const description = screen.getByText('Description text')
    expect(description).toBeInTheDocument()
    expect(description.tagName).toBe('P')
    expect(description).toHaveClass('text-sm', 'text-muted-foreground')
  })

  it('renders CardContent component', () => {
    render(<CardContent>Content</CardContent>)
    const content = screen.getByText('Content')
    expect(content).toBeInTheDocument()
    expect(content).toHaveClass('p-6', 'pt-0')
  })

  it('renders CardFooter component', () => {
    render(<CardFooter>Footer</CardFooter>)
    const footer = screen.getByText('Footer')
    expect(footer).toBeInTheDocument()
    expect(footer).toHaveClass('flex', 'items-center', 'p-6', 'pt-0')
  })

  it('renders complete card structure', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card description</CardDescription>
        </CardHeader>
        <CardContent>Card content goes here</CardContent>
        <CardFooter>Footer actions</CardFooter>
      </Card>
    )

    expect(screen.getByText('Card Title')).toBeInTheDocument()
    expect(screen.getByText('Card description')).toBeInTheDocument()
    expect(screen.getByText('Card content goes here')).toBeInTheDocument()
    expect(screen.getByText('Footer actions')).toBeInTheDocument()
  })

  it('applies custom className to Card', () => {
    const { container } = render(<Card className="custom-class">Content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card).toHaveClass('custom-class')
  })

  it('applies custom className to CardHeader', () => {
    const { container } = render(<CardHeader className="custom-header">Header</CardHeader>)
    const header = container.firstChild as HTMLElement
    expect(header).toHaveClass('custom-header')
  })

  it('forwards ref correctly', () => {
    const ref = { current: null }
    render(<Card ref={ref}>Content</Card>)
    expect(ref.current).toBeTruthy()
  })
})
