import { ReactNode } from 'react'

interface CardProps {
  title?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  padding?: boolean
}

export function Card({ title, actions, children, className = '', padding = true }: CardProps) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          {title && <h3 className="font-semibold text-gray-900">{title}</h3>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padding ? 'p-5' : ''}>{children}</div>
    </div>
  )
}
