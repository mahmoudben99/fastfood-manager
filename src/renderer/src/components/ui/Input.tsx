import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
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
      </div>
    )
  }
)

Input.displayName = 'Input'
