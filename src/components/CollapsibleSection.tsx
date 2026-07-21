import { useState, type ReactNode } from 'react'

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
  defaultOpen = false,
  className = '',
  actions,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      className={`collapsible-section${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
    >
      <div className="collapsible-summary-row">
        <button
          type="button"
          className="collapsible-summary"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="collapsible-title">{title}</span>
          <span className="collapsible-chevron" aria-hidden />
        </button>
        {actions && <div className="collapsible-actions">{actions}</div>}
      </div>
      {open ? <div className="collapsible-body">{children}</div> : null}
    </div>
  )
}
