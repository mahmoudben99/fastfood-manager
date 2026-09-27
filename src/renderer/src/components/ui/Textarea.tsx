import { TextareaHTMLAttributes, forwardRef, useId } from 'react'
import { Field, controlClass } from './Field'
import { cn } from './cn'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className = '', id, rows = 3, ...props }, ref) => {
    const autoId = useId()
    const fieldId = id ?? (label ? autoId : undefined)
    return (
      <Field label={label} error={error} helperText={helperText} htmlFor={fieldId}>
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          data-ui="textarea"
          aria-invalid={error ? true : undefined}
          className={controlClass({ error: Boolean(error), className: cn('py-2.5 leading-relaxed resize-y', className) })}
          {...props}
        />
      </Field>
    )
  }
)

Textarea.displayName = 'Textarea'
