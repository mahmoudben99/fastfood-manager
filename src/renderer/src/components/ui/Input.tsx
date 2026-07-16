import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  /** Hint shown under the field. Callers already passed this; it used to be spread onto the
   *  DOM <input> as an unknown attribute, so the hint never rendered. */
  helperText?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        )}
        <input
          ref={ref}
          className={`w-full rounded-lg border px-3 py-2 text-sm transition-colors
            placeholder:text-gray-400
            focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500
            ${error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'}
            ${className}`}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        {!error && helperText && <p className="mt-1 text-xs text-gray-400">{helperText}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
