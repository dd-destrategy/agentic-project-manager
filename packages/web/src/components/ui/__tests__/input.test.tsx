import { describe, it, expect, vi } from 'vitest'
import { render, screen, userEvent } from '@/test/utils'
import { Input } from '../input'

describe('Input', () => {
  it('renders input element', () => {
    render(<Input placeholder="Enter text" />)
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument()
  })

  it('accepts user input', async () => {
    const user = userEvent.setup()
    render(<Input placeholder="Type here" />)

    const input = screen.getByPlaceholderText('Type here')
    await user.type(input, 'Hello World')

    expect(input).toHaveValue('Hello World')
  })

  it('can be disabled', () => {
    render(<Input disabled placeholder="Disabled input" />)
    expect(screen.getByPlaceholderText('Disabled input')).toBeDisabled()
  })

  it('applies custom className', () => {
    render(<Input className="custom-class" data-testid="custom-input" />)
    expect(screen.getByTestId('custom-input')).toHaveClass('custom-class')
  })

  it('handles different input types', () => {
    const { rerender } = render(<Input type="email" data-testid="input" />)
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'email')

    rerender(<Input type="password" data-testid="input" />)
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'password')

    rerender(<Input type="number" data-testid="input" />)
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'number')
  })

  it('forwards ref correctly', () => {
    const ref = vi.fn()
    render(<Input ref={ref} />)
    expect(ref).toHaveBeenCalled()
  })

  it('calls onChange handler', async () => {
    const handleChange = vi.fn()
    const user = userEvent.setup()
    render(<Input onChange={handleChange} />)

    const input = screen.getByRole('textbox')
    await user.type(input, 'test')

    expect(handleChange).toHaveBeenCalled()
  })

  it('supports required attribute', () => {
    render(<Input required data-testid="required-input" />)
    expect(screen.getByTestId('required-input')).toBeRequired()
  })

  it('supports maxLength attribute', () => {
    render(<Input maxLength={10} data-testid="limited-input" />)
    expect(screen.getByTestId('limited-input')).toHaveAttribute('maxLength', '10')
  })
})
