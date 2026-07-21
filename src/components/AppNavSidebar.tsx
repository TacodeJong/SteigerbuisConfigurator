import { navigate } from '../lib/routing'
import { AccountMenu } from './auth/AccountMenu'
import { PaidLockIcon } from './PaidLockIcon'
import type { DiskImportGate, ModelsDialogFocus } from './editor/ModelStorePanel'

interface AppNavSidebarProps {
  collapsed: boolean
  onToggleCollapsed: () => void
  onNewModel: () => void
  onOpenModels: (focus?: ModelsDialogFocus) => void
  onOpenFromDisk: () => void
  /** Mobiel: opent de config/editor bottom sheet (geen formulier in de drawer). */
  onOpenSettings?: () => void
  /** Guest → login prompt; Free → Paid gate; Paid → file picker. */
  diskImportGate: DiskImportGate
  /** Actieve route-hint voor selected state. */
  activeDestination?: 'app' | 'gallery' | 'tutorials' | 'other'
}

/**
 * Permanent navigation drawer (Material 3).
 * Specs: max ~280dp, surfaceContainerLow, selected = secondaryContainer,
 * item insets 12dp, labelLarge — zie m3 Navigation Drawer / Android docs.
 * Altijd dezelfde nav-structuur op alle views (galerij wisselt alleen main content).
 */
export function AppNavSidebar({
  collapsed,
  onToggleCollapsed,
  onNewModel,
  onOpenModels,
  onOpenFromDisk,
  onOpenSettings,
  diskImportGate,
  activeDestination = 'app',
}: AppNavSidebarProps) {
  const goHome = () => navigate({ name: 'app' })
  const diskBlockedPaid = diskImportGate === 'paid'

  return (
    <aside
      className={`md-drawer${collapsed ? ' md-drawer--rail' : ''}`}
      aria-label="Hoofdnavigatie"
    >
      <div className="md-drawer-header">
        <button type="button" className="md-drawer-brand" onClick={goHome} title="Steigerbuis Configurator">
          <img
            className="md-drawer-brand-logo"
            src="/favicon.svg"
            alt=""
            width={40}
            height={40}
            decoding="async"
          />
          {!collapsed && (
            <span className="md-drawer-brand-text">
              <span className="md-drawer-brand-title">Steigerbuis</span>
              <span className="md-drawer-brand-sub">Configurator</span>
            </span>
          )}
        </button>
        <button
          type="button"
          className="md-icon-btn"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Navigatie uitklappen' : 'Navigatie inklappen'}
          title={collapsed ? 'Uitklappen' : 'Inklappen'}
        >
          {collapsed ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
          )}
        </button>
      </div>

      <nav className="md-drawer-nav">
        <div className="md-drawer-section" role="group" aria-label="Project">
          {!collapsed && <p className="md-drawer-section-label">Project</p>}
          <button
            type="button"
            className="md-nav-item"
            title="Nieuw model"
            onClick={onNewModel}
          >
            <span className="md-nav-item-icon" aria-hidden>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
            </span>
            {!collapsed && <span className="md-nav-item-label">Nieuw model</span>}
          </button>
          <button
            type="button"
            className="md-nav-item"
            title="Opgeslagen modellen"
            onClick={() => onOpenModels('browse')}
          >
            <span className="md-nav-item-icon" aria-hidden>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2z" />
              </svg>
            </span>
            {!collapsed && <span className="md-nav-item-label">Opgeslagen modellen</span>}
          </button>
          <button
            type="button"
            className="md-nav-item"
            title="Opslaan"
            onClick={() => onOpenModels('save')}
          >
            <span className="md-nav-item-icon" aria-hidden>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM6 8V5h9v3H6z" />
              </svg>
            </span>
            {!collapsed && <span className="md-nav-item-label">Opslaan</span>}
          </button>
          <button
            type="button"
            className={`md-nav-item${diskBlockedPaid ? ' md-nav-item--locked' : ''}`}
            title={
              diskImportGate === 'ok'
                ? 'Openen van schijf'
                : diskImportGate === 'login'
                  ? 'Log in om van schijf te openen'
                  : 'Abonnement vereist — tik voor abonnementen'
            }
            aria-disabled={diskBlockedPaid}
            onClick={() => onOpenFromDisk()}
          >
            <span className="md-nav-item-icon" aria-hidden>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zm0 12H4V8h16v10z" />
              </svg>
            </span>
            {!collapsed && (
              <span className="md-nav-item-label">
                Openen van schijf
                {diskBlockedPaid && (
                  <PaidLockIcon className="md-nav-item-lock" label="Abonnement vereist" />
                )}
              </span>
            )}
            {collapsed && diskBlockedPaid && (
              <PaidLockIcon
                className="md-nav-item-lock md-nav-item-lock--rail"
                label="Abonnement vereist"
              />
            )}
          </button>
          {onOpenSettings && (
            <button
              type="button"
              className="md-nav-item md-nav-item--settings-sheet"
              title="Instellingen"
              onClick={onOpenSettings}
            >
              <span className="md-nav-item-icon" aria-hidden>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.07 7.07 0 0 0-1.63-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54c-.6.22-1.14.54-1.63.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.4 1.04.72 1.63.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.6-.22 1.14-.54 1.63-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
                </svg>
              </span>
              {!collapsed && <span className="md-nav-item-label">Instellingen</span>}
            </button>
          )}
        </div>

        <div className="md-drawer-section" role="group" aria-label="Ontdekken">
          {!collapsed && <p className="md-drawer-section-label">Ontdekken</p>}
          <button
            type="button"
            className={`md-nav-item${activeDestination === 'gallery' ? ' md-nav-item--selected' : ''}`}
            title="Galerij"
            aria-current={activeDestination === 'gallery' ? 'page' : undefined}
            onClick={() => navigate({ name: 'gallery' })}
          >
            <span className="md-nav-item-icon" aria-hidden>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22 16V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2zm-11-4 2.03 2.71L16 11l4 5H8l3-4zM2 6v14a2 2 0 0 0 2 2h14v-2H4V6H2z" />
              </svg>
            </span>
            {!collapsed && <span className="md-nav-item-label">Galerij</span>}
          </button>
          <button
            type="button"
            className={`md-nav-item${activeDestination === 'tutorials' ? ' md-nav-item--selected' : ''}`}
            title="Uitleg"
            aria-current={activeDestination === 'tutorials' ? 'page' : undefined}
            onClick={() => navigate({ name: 'tutorials' })}
          >
            <span className="md-nav-item-icon" aria-hidden>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 10.5V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5l4 4v-11l-4 4z" />
              </svg>
            </span>
            {!collapsed && <span className="md-nav-item-label">Uitleg</span>}
          </button>
        </div>
      </nav>

      <div className="md-drawer-footer">
        <AccountMenu compact={collapsed} />
      </div>
    </aside>
  )
}
