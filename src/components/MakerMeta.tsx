import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth/session'
import { navigate } from '../lib/routing'
import { UserAvatar } from './UserAvatar'

interface MakerMetaProps {
  ownerId: string
  displayName?: string | null
  /** Extra text after the maker name (date, pipe count, …). */
  suffix?: ReactNode
  /** Show as a profile link button. Default true. */
  linkToProfile?: boolean
  size?: number
}

/**
 * Maker row for gallery / model pages.
 * Gravatar only when this is the signed-in user (email from session).
 * Other makers get initials from display_name — profiles have no public email.
 */
export function MakerMeta({
  ownerId,
  displayName,
  suffix,
  linkToProfile = true,
  size = 22,
}: MakerMetaProps) {
  const { user } = useAuth()
  const name = displayName?.trim() || 'Ontwerper'
  const email = user?.id === ownerId ? user.email : null

  const nameEl = linkToProfile ? (
    <button
      type="button"
      className="linkish"
      onClick={() => navigate({ name: 'profile', id: ownerId })}
    >
      {name}
    </button>
  ) : (
    <span>{name}</span>
  )

  return (
    <span className="maker-meta">
      <UserAvatar email={email} displayName={name} size={size} className="maker-meta-avatar" />
      <span className="maker-meta-text">
        {nameEl}
        {suffix}
      </span>
    </span>
  )
}
