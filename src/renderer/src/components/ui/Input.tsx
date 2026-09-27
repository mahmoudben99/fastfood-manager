import { InputHTMLAttributes, ReactNode, forwardRef, useId } from 'react'
import { Field, controlClass } from './Field'
import { cn } from './cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  /** Hint shown under the field. Callers already passed this; it used to be spread onto the
   *  DOM <input> as an unknown attribute, so the hint never rendered. */
  helperText?: string
  /** Icon/text inside the field at the start (search icon, currency…). */
  leading?: ReactNode
  /** Icon/button inside the field at the end. */
  trailing?: ReactNode
  /** md 44px (default) · lg 52px for POS/touch forms. */
  inputSize?: 'md' | 'lg'
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leading, trailing, inputSize = 'md', className = '', id, ...props }, ref) => {
    const autoId = useId()
    const inputId = id ?? (label ? autoId : undefined)
    return (
      <Field label={label} error={error} helperText={helperText} htmlFor={inputId}>
        <div className="relative">
          {leading && (
            <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-faint [&_svg]:h-5 [&_svg]:w-5">
              {leading}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            data-ui="input"
            aria-invalid={error ? true : undefined}
            className={controlClass({
              error: Boolean(error),
              size: inputSize,
              className: cn(leading ? 'ps-11' : undefined, trailing ? 'pe-11' : undefined, className)
            })}
            {...props}
          />
          {trailing && (
            <span className="absolute inset-y-0 end-0 flex items-center pe-2 text-muted">{trailing}</span>
          )}
        </div>
      </Field>
    )
  }
)

Input.displayName = 'Input'
