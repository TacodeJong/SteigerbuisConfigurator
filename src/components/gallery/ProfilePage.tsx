import { useEffect, useState } from 'react'
import { getPublicProfile, isFollowing, setFollow, type PublicProfile } from '../../lib/social/social'
import { listGallery } from '../../lib/models/cloudModels'
import type { CloudModel } from '../../lib/models/cloudModels'
import { useAuth } from '../../lib/auth/session'
import { navigate } from '../../lib/routing'
import { AuthModal } from '../auth/AuthModal'
import { GalleryModelCard } from './GalleryModelCard'
import { UserAvatar } from '../UserAvatar'

interface ProfilePageProps {
  profileId: string
}

export function ProfilePage({ profileId }: ProfilePageProps) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [models, setModels] = useState<CloudModel[]>([])
  const [following, setFollowing] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)

  useEffect(() => {
    void getPublicProfile(profileId).then(setProfile)
    void listGallery().then((all) => setModels(all.filter((m) => m.owner_id === profileId)))
  }, [profileId])

  useEffect(() => {
    if (user) void isFollowing(profileId).then(setFollowing)
  }, [user, profileId])

  const toggleFollow = async () => {
    if (!user) {
      setAuthOpen(true)
      return
    }
    const next = !following
    await setFollow(profileId, next)
    setFollowing(next)
  }

  const displayName = profile?.display_name || 'Profiel'
  // Gravatar only for own profile (email from session); others get initials.
  const avatarEmail = user?.id === profileId ? user.email : null

  return (
    <main className="app-page">
      <button type="button" className="linkish" onClick={() => navigate({ name: 'gallery' })}>
        ← Galerij
      </button>
      <header className="profile-header">
        <UserAvatar email={avatarEmail} displayName={displayName} size={64} />
        <div>
          <h1>{displayName}</h1>
          {profile?.bio && <p>{profile.bio}</p>}
        </div>
      </header>
      {user?.id !== profileId && (
        <button type="button" className="bom-action-btn secondary" onClick={() => void toggleFollow()}>
          {following ? 'Ontvolgen' : 'Volgen'}
        </button>
      )}
      <h2>Gepubliceerde modellen</h2>
      {models.length === 0 && <p className="muted">Nog geen gepubliceerde modellen.</p>}
      <ul className="gallery-list">
        {models.map((m) => (
          <GalleryModelCard key={m.id} model={m} />
        ))}
      </ul>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} reason="Log in om te volgen." />
    </main>
  )
}
