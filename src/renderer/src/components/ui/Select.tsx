import { SelectHTMLAttributes, useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { Field, controlClass } from './Field'
import { cn } from './cn'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  helperText?: string
  options: SelectOption[]
  placeholder?: string
  /** md 44px (default) · lg 52px */
  selectSize?: 'md' | 'lg'
}

export function Select({
  label,
  error,
  helperText,
  options,
  placeholder,
  selectSize = 'md',
  className = '',
  id,
  ...props
}: SelectProps) {
  const autoId = useId()
  const selectId = id ?? (label ? autoId : undefined)
  return (
    <Field label={label} error={error} helperText={helperText} htmlFor={selectId}>
      <div className="relative">
        <select
          id={selectId}
          data-ui="select"
          aria-invalid={error ? true : undefined}
          className={controlClass({
            error: Boolean(error),
            size: selectSize,
            className: cn('appearance-none pe-10 cursor-pointer', className)
          })}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
      </div>
    </Field>
  )
}
