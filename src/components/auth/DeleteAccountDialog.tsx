import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { deleteMyAccount } from '../../lib/auth/deleteAccount'
import { navigate } from '../../lib/routing'
import { useModalA11y } from '../../hooks/useModalA11y'

interface DeleteAccountDialogProps {
  email: string
  open: boolean
  onClose: () => void
  onDeleted: () => void | Promise<void>
}

export function DeleteAccountDialog({
  email,
  open,
  onClose,
  onDeleted,
}: DeleteAccountDialogProps) {
  const [confirm, setConfirm] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmInputRef = useRef<HTMLInputElement>(null)

  useModalA11y({
    open,
    onClose: () => {
      if (!busy) onClose()
    },
    containerRef: dialogRef,
    initialFocusRef: confirmInputRef,
    closeOnEscape: open && !busy,
  })

  if (!open) return null

  const confirmOk =
    confirm.trim().toUpperCase() === 'VERWIJDER' ||
    confirm.trim().toLowerCase() === email.trim().toLowerCase()

  const submit = async () => {
    setError(null)
    if (!confirmOk) {
      setError('Typ je e-mailadres of VERWIJDER om te bevestigen.')
      return
    }
    setBusy(true)
    try {
      await deleteMyAccount({ confirmEmail: confirm, reason: reason.trim() || null })
      await onDeleted()
      navigate({ name: 'app' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verwijderen mislukt')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="auth-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="auth-modal delete-account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="auth-modal-header">
          <h2 id="delete-account-title">Account verwijderen</h2>
          <button
            type="button"
            className="auth-modal-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Sluiten"
            data-modal-initial-skip
          >
            ✕
          </button>
        </header>

        <p className="auth-modal-reason delete-account-warn">
          Dit wist definitief je profiel, modellen, favorieten en volg-relaties. Dit kan niet
          ongedaan worden gemaakt. Beheerders zien alleen dat er een account is verwijderd (zonder
          e-mail of inhoud).
        </p>

        <label>
          Typ je e-mail (<strong>{email}</strong>) of <strong>VERWIJDER</strong>
          <input
            ref={confirmInputRef}
            type="text"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={email || 'VERWIJDER'}
            disabled={busy}
          />
        </label>

        <label>
          Reden (optioneel)
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optioneel"
            disabled={busy}
            maxLength={500}
          />
        </label>

        {error && <p className="auth-modal-error">{error}</p>}

        <div className="auth-modal-actions">
          <button type="button" className="bom-action-btn secondary" disabled={busy} onClick={onClose}>
            Annuleren
          </button>
          <button
            type="button"
            className="bom-action-btn delete-account-confirm-btn"
            disabled={busy || !confirmOk}
            onClick={() => void submit()}
          >
            {busy ? 'Bezig…' : 'Definitief verwijderen'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
