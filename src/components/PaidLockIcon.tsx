/** Small lock glyph for gated/paid controls (visible + greyed, not text badges). */

interface PaidLockIconProps {
  className?: string
  /** Accessible label; default “Betaalde functie”. */
  label?: string
  size?: number
}

export function PaidLockIcon({
  className = 'paid-lock-icon',
  label = 'Betaalde functie',
  size = 14,
}: PaidLockIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-label={label}
      role="img"
    >
      <path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9V6zm9 14H6V10h12v10zm-6-3a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
    </svg>
  )
}
