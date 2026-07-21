import { useEffect, useState, type RefObject } from 'react'
import { useAuth } from '../../lib/auth/session'
import { navigate } from '../../lib/routing'
import { useAutoCloseOnIdle } from '../../hooks/useAutoCloseOnIdle'
import {
  defaultSubscriptionPlans,
  fetchActivePlans,
  planDisplayName,
  type SubscriptionPlan,
} from '../../lib/billing/plans'
import { EXPORT_PACK_LABEL } from '../../lib/billing/entitlements'
import { UserAvatar } from '../UserAvatar'
import { AuthModal } from './AuthModal'
import { DeleteAccountDialog } from './DeleteAccountDialog'

interface AccountMenuProps {
  /** Icon-only knop in smalle sidebar-rail. */
  compact?: boolean
}

export function AccountMenu({ compact = false }: AccountMenuProps) {
  const { user, profile, isPaid, loading, signOut, isLocalStub, refreshProfile, updateProfile } =
    useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [nameEdit, setNameEdit] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [plans, setPlans] = useState<SubscriptionPlan[]>(() => defaultSubscriptionPlans())
  const menuRef = useAutoCloseOnIdle(menuOpen, () => {
    setMenuOpen(false)
    setNameEdit(false)
  })

  useEffect(() => {
    if (!user) return
    let cancelled = false
    void fetchActivePlans().then((rows) => {
      if (!cancelled && rows.length) setPlans(rows)
    })
    return () => {
      cancelled = true
    }
  }, [user])

  if (loading) {
    return <span className="account-menu-loading muted">{compact ? '…' : 'Account…'}</span>
  }

  if (!user) {
    return (
      <>
        <button
          type="button"
          className={`account-btn${compact ? ' account-btn--compact' : ''}`}
          onClick={() => setAuthOpen(true)}
          title="Inloggen"
        >
          {compact ? '👤' : 'Inloggen'}
        </button>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      </>
    )
  }

  const label = profile?.display_name?.trim() || user.email || 'Account'
  const shortLabel = profile?.display_name?.trim() || user.email?.split('@')[0] || 'Account'
  const planBadge = isPaid
    ? planDisplayName(profile?.subscription_plan_slug?.trim() || 'paid_monthly', plans)
    : profile?.export_pack
      ? EXPORT_PACK_LABEL
      : null

  const saveName = async () => {
    setNameError(null)
    try {
      await updateProfile({ display_name: displayName })
      await refreshProfile()
      setNameEdit(false)
    } catch (e) {
      setNameError(e instanceof Error ? e.message : 'Opslaan mislukt')
    }
  }

  return (
    <div
      ref={menuRef as RefObject<HTMLDivElement>}
      className={`account-menu${compact ? ' account-menu--compact' : ''}`}
    >
      <button
        type="button"
        className={`account-btn${compact ? ' account-btn--compact' : ''}`}
        aria-expanded={menuOpen}
        title={label}
        onClick={() => setMenuOpen((o) => !o)}
      >
        <UserAvatar
          email={user.email}
          displayName={profile?.display_name || shortLabel}
          size={compact ? 28 : 22}
          className="account-btn-avatar"
        />
        {compact ? null : (
          <span>
            {shortLabel}
            {planBadge ? ` · ${planBadge}` : ''}
            {profile?.is_admin ? ' · Admin' : ''}
          </span>
        )}
      </button>
      {menuOpen && (
        <div className="account-menu-panel account-menu-panel--up">
          {isLocalStub && <p className="muted">Lokale demo (geen Supabase)</p>}
          <div className="account-menu-header">
            <UserAvatar
              email={user.email}
              displayName={profile?.display_name || shortLabel}
              size={40}
            />
            <p className="account-menu-email muted">{user.email}</p>
          </div>
          {nameEdit ? (
            <div className="account-name-edit">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Weergavenaam"
              />
              <button type="button" className="bom-action-btn" onClick={() => void saveName()}>
                Opslaan
              </button>
              {nameError && <p className="auth-modal-error">{nameError}</p>}
            </div>
          ) : (
            <button
              type="button"
              className="linkish"
              onClick={() => {
                setDisplayName(profile?.display_name ?? '')
                setNameEdit(true)
              }}
            >
              Weergavenaam wijzigen
            </button>
          )}
          {!isPaid && (
            <button
              type="button"
              className="bom-action-btn"
              onClick={() => {
                setMenuOpen(false)
                navigate({ name: 'upgrade' })
              }}
            >
              {profile?.export_pack
                ? `Naar ${planDisplayName('paid_monthly', plans)}`
                : 'Abonnement & aankopen'}
            </button>
          )}
          {(isPaid || profile?.export_pack) && (
            <button
              type="button"
              className="linkish"
              onClick={() => {
                setMenuOpen(false)
                navigate({ name: 'upgrade' })
              }}
            >
              {isPaid ? 'Abonnement beheren' : 'Toegang beheren'}
            </button>
          )}
          {profile?.is_admin && (
            <button
              type="button"
              className="linkish"
              onClick={() => {
                setMenuOpen(false)
                navigate({ name: 'admin' })
              }}
            >
              Beheer
            </button>
          )}
          <button
            type="button"
            className="linkish"
            onClick={() => {
              setMenuOpen(false)
              navigate({ name: 'favourites' })
            }}
          >
            Favorieten
          </button>
          <button
            type="button"
            className="linkish"
            onClick={() => {
              setMenuOpen(false)
              navigate({ name: 'feed' })
            }}
          >
            Volg-feed
          </button>
          <button
            type="button"
            className="linkish account-delete-link"
            onClick={() => {
              setMenuOpen(false)
              setDeleteOpen(true)
            }}
          >
            Account verwijderen
          </button>
          <button
            type="button"
            className="linkish"
            onClick={() => {
              setMenuOpen(false)
              void signOut()
            }}
          >
            Uitloggen
          </button>
        </div>
      )}
      <DeleteAccountDialog
        email={user.email}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={async () => {
          setDeleteOpen(false)
          await signOut()
        }}
      />
    </div>
  )
}
