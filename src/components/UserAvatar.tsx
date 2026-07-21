import { gravatarUrl, displayInitials } from '../lib/gravatar'

export interface UserAvatarProps {
  /** When known (own session), used for Gravatar. Never required for other users. */
  email?: string | null
  displayName?: string | null
  size?: number
  className?: string
  /** Accessible label; defaults to display name or "Avatar". */
  alt?: string
}

/**
 * Profile avatar: Gravatar when email is known, otherwise initials from display name.
 * Does not render the email itself — only a hashed Gravatar URL when applicable.
 */
export function UserAvatar({
  email,
  displayName,
  size = 32,
  className = '',
  alt,
}: UserAvatarProps) {
  const label = alt ?? (displayName?.trim() || 'Avatar')
  const trimmedEmail = email?.trim()
  const cls = `user-avatar${className ? ` ${className}` : ''}`

  if (trimmedEmail) {
    return (
      <img
        className={cls}
        src={gravatarUrl(trimmedEmail, size * 2)}
        alt={label}
        width={size}
        height={size}
        decoding="async"
        referrerPolicy="no-referrer"
      />
    )
  }

  return (
    <span
      className={`${cls} user-avatar--initials`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
      role="img"
      aria-label={label}
    >
      {displayInitials(displayName)}
    </span>
  )
}
