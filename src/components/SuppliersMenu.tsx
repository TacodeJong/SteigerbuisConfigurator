import { PRICED_SUPPLIERS } from '../data/supplierRegistry'

interface SuppliersMenuProps {
  /** Dropdown voor header/footer; lijst voor sidebar-secties. */
  variant?: 'dropdown' | 'list'
  className?: string
  /** Korte toelichting boven de leverancierslijst. */
  hint?: string
}

export function SuppliersMenu({
  variant = 'list',
  className = '',
  hint,
}: SuppliersMenuProps) {
  const rootClass =
    variant === 'dropdown'
      ? `suppliers-menu suppliers-menu-dropdown${className ? ` ${className}` : ''}`
      : `suppliers-menu suppliers-menu-list${className ? ` ${className}` : ''}`

  const panel = (
    <div className={variant === 'dropdown' ? 'suppliers-menu-panel' : undefined}>
      {hint && <p className="suppliers-menu-hint">{hint}</p>}
      <ul className="suppliers-menu-items">
        {PRICED_SUPPLIERS.map((supplier) => (
          <li key={supplier.id}>
            <a href={supplier.website} target="_blank" rel="noopener noreferrer">
              {supplier.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )

  if (variant === 'dropdown') {
    return (
      <details className={rootClass}>
        <summary>Leveranciers</summary>
        {panel}
      </details>
    )
  }

  return <div className={rootClass}>{panel}</div>
}
