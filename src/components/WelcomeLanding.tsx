import { useState } from 'react'
import { AuthModal } from './auth/AuthModal'

interface WelcomeLandingProps {
  onStartDesigning: () => void
  onOpenGallery: () => void
}

/**
 * Rustige Material 3 landing: brand → headline → body → filled / tonal / text buttons.
 * Geen gradient-overlays of card-stacks (M3 button emphasis + typography hierarchy).
 */
export function WelcomeLanding({ onStartDesigning, onOpenGallery }: WelcomeLandingProps) {
  const [authOpen, setAuthOpen] = useState(false)

  return (
    <div className="md-welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="md-welcome-surface">
        <p className="md-welcome-brand">
          <img
            className="md-welcome-brand-logo"
            src="/favicon.svg"
            alt=""
            width={48}
            height={48}
            decoding="async"
          />
          Steigerbuis
        </p>
        <h1 id="welcome-title" className="md-welcome-headline">
          Ontwerp je constructie
        </h1>
        <p className="md-welcome-body">
          Bouw frames, rekken en meubels in 3D. Pas afmetingen aan, exporteer een stuklijst en bekijk
          ontwerpen in de galerij.
        </p>
        <div className="md-welcome-actions">
          <button type="button" className="md-btn md-btn--filled" onClick={onStartDesigning}>
            Start met ontwerpen
          </button>
          <button type="button" className="md-btn md-btn--tonal" onClick={onOpenGallery}>
            Bekijk galerij
          </button>
          <button type="button" className="md-btn md-btn--text" onClick={() => setAuthOpen(true)}>
            Inloggen / Registreren
          </button>
        </div>
      </div>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  )
}
