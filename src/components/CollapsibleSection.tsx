import type { ReactNode } from 'react'

interface CollapsibleSectionProps {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  className?: string
  actions?: ReactNode
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  className = '',
  actions,
}: CollapsibleSectionProps) {
  return (
    <details className={`collapsible-section${className ? ` ${className}` : ''}`} open={defaultOpen}>
      <summary className="collapsible-summary">
        <span className="collapsible-title">{title}</span>
        {actions && (
          <span
            className="collapsible-actions"
            onClick={(e) => e.preventDefault()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {actions}
          </span>
        )}
        <span className="collapsible-chevron" aria-hidden />
      </summary>
      <div className="collapsible-body">{children}</div>
    </details>
  )
}
