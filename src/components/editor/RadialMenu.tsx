export interface RadialMenuItem {
  id: string
  label: string
  icon?: string
  variant?: 'default' | 'danger'
  onClick: () => void
}

interface RadialMenuProps {
  items: RadialMenuItem[]
  radius?: number
}

export function RadialMenu({ items, radius = 72 }: RadialMenuProps) {
  if (items.length === 0) return null

  return (
    <div className="radial-menu" role="menu">
      <div className="radial-menu-center" aria-hidden />
      {items.map((item, i) => {
        const t = items.length === 1 ? 0.5 : i / (items.length - 1)
        const angle = t * Math.PI
        const x = -Math.cos(angle) * radius
        const y = -Math.sin(angle) * radius

        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`radial-menu-item${item.variant === 'danger' ? ' danger' : ''}`}
            style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}
            onClick={(e) => {
              e.stopPropagation()
              item.onClick()
            }}
          >
            {item.icon && <span className="radial-icon">{item.icon}</span>}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
