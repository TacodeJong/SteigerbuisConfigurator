import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_CONFIG } from './data/presets'
import { calculateKlimrekBom } from './lib/bom'
import { resolveBomHighlightIds } from './lib/bomHighlight'
import { buildSceneFromConfig } from './lib/scene'
import { AdminStylePanel } from './components/AdminStylePanel'
import { AdminPage } from './components/admin/AdminPage'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { AppNavSidebar } from './components/AppNavSidebar'
import { ConfiguratorForm } from './components/ConfiguratorForm'
import { BomList } from './components/BomList'
import { BomSheetTrigger, ResponsiveBomSidebar } from './components/ResponsiveBomSidebar'
import { ConfigSheetTrigger, ResponsiveConfigSidebar } from './components/ResponsiveConfigSidebar'
import { SuppliersMenu } from './components/SuppliersMenu'
import { AuthModal } from './components/auth/AuthModal'
import { UpgradePanel } from './components/auth/UpgradePanel'
import { GalleryPage } from './components/gallery/GalleryPage'
import { PublicModelPage } from './components/gallery/PublicModelPage'
import { FavouritesPage } from './components/gallery/FavouritesPage'
import { FeedPage } from './components/gallery/FeedPage'
import { ProfilePage } from './components/gallery/ProfilePage'
import { PrivacyPage, TermsPage } from './components/legal/LegalPages'
import { TutorialsPage } from './components/tutorials/TutorialsPage'
import { WelcomeLanding } from './components/WelcomeLanding'
import { useAppTheme } from './hooks/useAppTheme'
import { useFeatureFlags } from './hooks/useFeatureFlags'
import { useMediaQuery } from './hooks/useMediaQuery'
import { usePageVisitTracker } from './hooks/usePageVisitTracker'
import { AuthProvider, useAuth } from './lib/auth/session'
import { canOpenFromDisk } from './lib/billing/entitlements'
import { fetchActivePlans, type SubscriptionPlan } from './lib/billing/plans'
import { parseRoute, navigate, type AppRoute } from './lib/routing'
import type { CloudModel } from './lib/models/cloudModels'
import type { DiskImportGate, ModelsDialogFocus } from './components/editor/ModelStorePanel'
import type { BomHighlight, KlimrekConfig, SceneModel, ViewMode } from './types'
import './App.css'

/** Lazy: R3F/Three.js niet in de hoofdchunk (zelfde chunk als PublicModelPage). */
const FramePreview3D = lazy(() =>
  import('./components/FramePreview3D').then((m) => ({ default: m.FramePreview3D })),
)
/** Lazy: editor + Three.js alleen bij 3D-editor-modus. */
const SceneEditor = lazy(() =>
  import('./components/SceneEditor').then((m) => ({ default: m.SceneEditor })),
)

const WELCOME_DISMISSED_KEY = 'steigerbuis.welcomeDismissed'
const SIDEBAR_COLLAPSED_KEY = 'steigerbuis.navCollapsed'
/** Matches App.css drawer overlay breakpoint. */
const NAV_MOBILE_MQ = '(max-width: 720px)'

function readInitialNavCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
  if (stored === '1') return true
  if (stored === '0') return false
  // Geen voorkeur: op smalle viewports standaard dicht (max ruimte voor 3D).
  return window.matchMedia(NAV_MOBILE_MQ).matches
}

function editorFingerprint(scene: SceneModel, cfg: KlimrekConfig): string {
  return JSON.stringify({ scene, config: cfg })
}

function AppShell() {
  const { theme, setTheme } = useAppTheme()
  const { planksEnabled, setPlanksEnabled } = useFeatureFlags()
  const { user, loading: authLoading, isAdmin, refreshProfile, profile } = useAuth()
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [config, setConfig] = useState<KlimrekConfig>(DEFAULT_CONFIG)
  const [viewMode, setViewMode] = useState<ViewMode>('configurator')
  const [editorScene, setEditorScene] = useState<SceneModel | null>(null)
  const [bomHighlight, setBomHighlight] = useState<BomHighlight | null>(null)
  const [bomSheetOpen, setBomSheetOpen] = useState(false)
  const [configSheetOpen, setConfigSheetOpen] = useState(false)
  const [route, setRoute] = useState<AppRoute>(() => parseRoute())
  /** Cloud-model dat bij Opslaan wordt bijgewerkt (na laden / fork / eerdere save). */
  const [activeCloudModelId, setActiveCloudModelId] = useState<string | null>(null)
  const [activeCloudModelName, setActiveCloudModelName] = useState<string | null>(null)
  const [openModelsTick, setOpenModelsTick] = useState(0)
  const [openModelsFocus, setOpenModelsFocus] = useState<ModelsDialogFocus>('browse')
  const [diskImportTick, setDiskImportTick] = useState(0)
  const [openConfigSheetTick, setOpenConfigSheetTick] = useState(0)
  const [authOpen, setAuthOpen] = useState(false)
  const [authReason, setAuthReason] = useState<string | null>(null)
  const [welcomeDismissed, setWelcomeDismissed] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(WELCOME_DISMISSED_KEY) === '1',
  )
  const [navCollapsed, setNavCollapsed] = useState(readInitialNavCollapsed)
  const isNavMobile = useMediaQuery(NAV_MOBILE_MQ)
  const [billingNotice, setBillingNotice] = useState<string | null>(null)
  const [editorDirty, setEditorDirty] = useState(false)
  const editorBaselineRef = useRef<string | null>(null)
  usePageVisitTracker(route)

  const markEditorBaseline = (scene: SceneModel, cfg: KlimrekConfig) => {
    editorBaselineRef.current = editorFingerprint(scene, cfg)
    setEditorDirty(false)
  }

  const diskImportOk = canOpenFromDisk(profile, plans)
  const diskImportGate: DiskImportGate = !user ? 'login' : diskImportOk ? 'ok' : 'paid'

  useEffect(() => {
    void fetchActivePlans().then(setPlans)
  }, [])

  const setActiveCloudModel = (id: string | null, name?: string | null) => {
    setActiveCloudModelId(id)
    setActiveCloudModelName(id ? (name ?? null) : null)
  }

  const requireLogin = (reason: string) => {
    setAuthReason(reason)
    setAuthOpen(true)
  }

  const ensureEditor = () => {
    if (viewMode !== 'editor') {
      if (!editorScene) {
        const next = buildSceneFromConfig(config)
        setEditorScene(next)
        markEditorBaseline(next, config)
      }
      setViewMode('editor')
    }
  }

  const requestOpenModels = (focus: ModelsDialogFocus = 'browse') => {
    // Opslaan vereist account; browsen mag ook als gast (recente lokale modellen).
    if (!user && focus === 'save') {
      requireLogin(
        'Log in om je ontwerp in de cloud op te slaan. Daarna kun je het ook als bestand downloaden.',
      )
      return
    }
    // Project-acties werken via SceneEditor; vanaf galerij e.d. eerst terug naar app.
    if (route.name !== 'app') navigate({ name: 'app' })
    dismissWelcome()
    ensureEditor()
    setOpenModelsFocus(focus)
    setOpenModelsTick((t) => t + 1)
    if (isNavMobile && !navCollapsed) setNavCollapsed(true)
  }

  const requestOpenFromDisk = () => {
    if (!user) {
      requireLogin('Log in om een bestand te importeren.')
      return
    }
    if (isNavMobile && !navCollapsed) setNavCollapsed(true)
    // Plan feature open_from_disk: locked → abonnementen, niet de cloud-bibliotheek.
    if (!diskImportOk) {
      navigate({ name: 'upgrade' })
      return
    }
    if (route.name !== 'app') navigate({ name: 'app' })
    ensureEditor()
    // Alleen file-picker (via SceneEditor); geen ModelStore “Opgeslagen modellen”.
    setDiskImportTick((t) => t + 1)
  }

  const dismissWelcome = () => {
    localStorage.setItem(WELCOME_DISMISSED_KEY, '1')
    setWelcomeDismissed(true)
  }

  /** Mobiel: open config/editor bottom sheet (geen inline form in de nav-drawer). */
  const requestOpenSettings = () => {
    if (route.name !== 'app') navigate({ name: 'app' })
    dismissWelcome()
    setBomSheetOpen(false)
    if (viewMode === 'configurator') {
      setConfigSheetOpen(true)
    } else {
      setOpenConfigSheetTick((t) => t + 1)
    }
    if (isNavMobile && !navCollapsed) setNavCollapsed(true)
  }

  /** Start een schoon project vanaf DEFAULT_CONFIG (minimale default-scene). */
  const requestNewModel = () => {
    const configChanged =
      config.width !== DEFAULT_CONFIG.width ||
      config.depth !== DEFAULT_CONFIG.depth ||
      config.height !== DEFAULT_CONFIG.height ||
      config.rungCount !== DEFAULT_CONFIG.rungCount ||
      config.diameter !== DEFAULT_CONFIG.diameter ||
      config.materialId !== DEFAULT_CONFIG.materialId ||
      config.includeRoof !== DEFAULT_CONFIG.includeRoof ||
      config.environment !== DEFAULT_CONFIG.environment ||
      config.dimensionMode !== DEFAULT_CONFIG.dimensionMode ||
      config.baseType !== DEFAULT_CONFIG.baseType ||
      config.anchorDepthMm !== DEFAULT_CONFIG.anchorDepthMm
    const hasExistingWork =
      editorScene !== null || activeCloudModelId !== null || configChanged

    if (
      hasExistingWork &&
      !window.confirm(
        'Huidige ontwerp wissen en een nieuw model starten? Niet-opgeslagen wijzigingen gaan verloren.',
      )
    ) {
      return
    }

    if (route.name !== 'app') navigate({ name: 'app' })
    dismissWelcome()
    setConfig(DEFAULT_CONFIG)
    const next = buildSceneFromConfig(DEFAULT_CONFIG)
    setEditorScene(next)
    markEditorBaseline(next, DEFAULT_CONFIG)
    setActiveCloudModel(null)
    setBomHighlight(null)
    setViewMode('editor')
  }

  const toggleNavCollapsed = () => {
    setNavCollapsed((c) => {
      const next = !c
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }

  useEffect(() => {
    const onNav = () => setRoute(parseRoute())
    window.addEventListener('popstate', onNav)
    return () => window.removeEventListener('popstate', onNav)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('billing') !== 'return') return

    params.delete('billing')
    const url = new URL(window.location.href)
    url.search = params.toString()
    window.history.replaceState({}, '', url.toString())

    setBillingNotice('Betaling ontvangen. Je rechten worden bijgewerkt…')
    void refreshProfile()
      .then(() => {
        setBillingNotice('Betaling ontvangen. Je abonnement en exportrechten zijn bijgewerkt.')
      })
      .catch(() => {
        setBillingNotice(
          'Betaling ontvangen. Vernieuw de pagina als je abonnement nog niet zichtbaar is.',
        )
      })
  }, [refreshProfile])

  useEffect(() => {
    if (!editorScene || editorBaselineRef.current === null) {
      setEditorDirty(false)
      return
    }
    setEditorDirty(editorFingerprint(editorScene, config) !== editorBaselineRef.current)
  }, [editorScene, config])

  useEffect(() => {
    if (!editorDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = 'Je hebt niet-opgeslagen wijzigingen in de editor. Weet je zeker dat je wilt vertrekken?'
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [editorDirty])

  // Ingelogde gebruikers: welkomst overslaan
  useEffect(() => {
    if (user && !welcomeDismissed) {
      localStorage.setItem(WELCOME_DISMISSED_KEY, '1')
      setWelcomeDismissed(true)
    }
  }, [user, welcomeDismissed])

  const previewScene = useMemo(() => buildSceneFromConfig(config), [config])
  const configBom = useMemo(() => calculateKlimrekBom(config), [config])
  const configHighlightIds = useMemo(
    () => resolveBomHighlightIds(previewScene, bomHighlight),
    [previewScene, bomHighlight],
  )

  const activeEditorScene = editorScene ?? previewScene

  const switchMode = (mode: ViewMode) => {
    if (mode === 'editor' && !editorScene) {
      const next = buildSceneFromConfig(config)
      setEditorScene(next)
      markEditorBaseline(next, config)
    }
    setViewMode(mode)
  }

  const buildEditorSceneFromConfig = (): SceneModel | null => {
    if (
      editorScene !== null &&
      !window.confirm('Huidige editor-scene overschrijven met het configurator-model?')
    ) {
      return null
    }
    return buildSceneFromConfig(config)
  }

  const loadConfigIntoEditor = (switchToEditor: boolean): boolean => {
    const next = buildEditorSceneFromConfig()
    if (!next) return false
    setEditorScene(next)
    markEditorBaseline(next, config)
    setActiveCloudModel(null)
    if (switchToEditor) setViewMode('editor')
    return true
  }

  const resetEditorFromConfig = (): SceneModel | null => {
    const next = buildEditorSceneFromConfig()
    if (next) {
      setActiveCloudModel(null)
      markEditorBaseline(next, config)
    }
    return next
  }
  const openConfigInEditor = () => {
    loadConfigIntoEditor(true)
  }

  const handleForkLoaded = (model: CloudModel) => {
    setConfig(model.config)
    setEditorScene(model.scene)
    markEditorBaseline(model.scene, model.config)
    setActiveCloudModel(model.id, model.name)
    setViewMode('editor')
    dismissWelcome()
  }

  const showConfiguratorChrome = route.name === 'app'
  /** Model-detail: maximale ruimte voor de interactieve 3D-viewer. */
  const modelDetailOpen = route.name === 'model'
  const showWelcome =
    route.name === 'app' && !authLoading && !user && !welcomeDismissed

  return (
    <div
      className={`app app-shell${modelDetailOpen ? ' app-model-detail' : ''}${navCollapsed ? ' app-shell--nav-collapsed' : ''}`}
    >
      <AppNavSidebar
        collapsed={navCollapsed}
        onToggleCollapsed={toggleNavCollapsed}
        onNewModel={requestNewModel}
        onOpenModels={requestOpenModels}
        onOpenFromDisk={requestOpenFromDisk}
        onOpenSettings={requestOpenSettings}
        diskImportGate={diskImportGate}
        activeDestination={
          route.name === 'gallery'
            ? 'gallery'
            : route.name === 'tutorials'
              ? 'tutorials'
              : route.name === 'app'
                ? 'app'
                : 'other'
        }
      />

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} reason={authReason} />

      <div className="app-shell-main">
        <header className="app-header app-header--thin">
          <div className="header-row">
            <div className="header-copy">
              {isNavMobile && navCollapsed && (
                <button
                  type="button"
                  className="md-icon-btn header-nav-open"
                  onClick={toggleNavCollapsed}
                  aria-label="Navigatie openen"
                  title="Navigatie"
                >
                  <span aria-hidden>☰</span>
                </button>
              )}
              <h1 className="header-title-compact">
                {modelDetailOpen
                  ? 'Galerij · 3D bekijken'
                  : route.name === 'gallery'
                    ? 'Galerij'
                    : route.name === 'tutorials'
                      ? 'Uitleg'
                      : route.name === 'upgrade'
                        ? 'Abonnement & aankopen'
                        : route.name === 'admin'
                          ? 'Beheer'
                          : route.name === 'favourites'
                            ? 'Favorieten'
                            : route.name === 'feed'
                              ? 'Volg-feed'
                              : route.name === 'privacy'
                                ? 'Privacyverklaring'
                                : route.name === 'terms'
                                  ? 'Voorwaarden'
                                  : 'Ontwerp'}
              </h1>
            </div>
            <div className="header-actions">
              {isAdmin && <AdminStylePanel />}
              <SuppliersMenu
                variant="dropdown"
                hint="Open de webshop van een steigerbuisleverancier om zelf te bestellen."
              />
              {showConfiguratorChrome && (
                <nav className="view-tabs" aria-label="Weergavemodus">
                  <button
                    type="button"
                    className={viewMode === 'configurator' ? 'active' : ''}
                    onClick={() => switchMode('configurator')}
                  >
                    Configurator
                  </button>
                  <button
                    type="button"
                    className={viewMode === 'editor' ? 'active' : ''}
                    onClick={() => switchMode('editor')}
                  >
                    3D Editor
                  </button>
                </nav>
              )}
            </div>
          </div>
        </header>

        {billingNotice && (
          <div className="billing-return-banner" role="status">
            <p>{billingNotice}</p>
            <button
              type="button"
              className="billing-return-dismiss"
              onClick={() => setBillingNotice(null)}
              aria-label="Melding sluiten"
            >
              ✕
            </button>
          </div>
        )}

        {route.name === 'gallery' && <GalleryPage />}
        {route.name === 'tutorials' && <TutorialsPage />}
        {route.name === 'favourites' && <FavouritesPage />}
        {route.name === 'feed' && <FeedPage />}
        {route.name === 'upgrade' && <UpgradePanel />}
        {route.name === 'privacy' && <PrivacyPage />}
        {route.name === 'terms' && <TermsPage />}
        {route.name === 'admin' && (
          <AdminPage
            theme={theme}
            onThemeChange={setTheme}
            planksEnabled={planksEnabled}
            onPlanksEnabledChange={setPlanksEnabled}
          />
        )}
        {route.name === 'model' && (
          <PublicModelPage modelId={route.id} onForkLoaded={handleForkLoaded} />
        )}
        {route.name === 'profile' && <ProfilePage profileId={route.id} />}

        {route.name === 'app' &&
          (viewMode === 'configurator' ? (
            <main className="app-main">
              <ResponsiveConfigSidebar
                open={configSheetOpen}
                onOpenChange={setConfigSheetOpen}
                title="Aanpassen"
              >
                <ConfiguratorForm config={config} onChange={setConfig} />
              </ResponsiveConfigSidebar>
              <div className="main-center">
                <div className="preview-panel preview-panel-fill">
                  <div className="preview-panel-header">
                    <h2>3D voorbeeld</h2>
                    <div className="preview-panel-actions">
                      <ConfigSheetTrigger
                        onClick={() => {
                          setBomSheetOpen(false)
                          setConfigSheetOpen(true)
                        }}
                      />
                      <BomSheetTrigger
                        onClick={() => {
                          setConfigSheetOpen(false)
                          setBomSheetOpen(true)
                        }}
                      />
                      <button
                        type="button"
                        className="bom-action-btn"
                        onClick={openConfigInEditor}
                        title="Laad dit configurator-model in de 3D-editor"
                      >
                        Openen in 3D-editor
                      </button>
                    </div>
                  </div>
                  <Suspense fallback={<div className="canvas-loader">3D laden…</div>}>
                    <FramePreview3D
                      scene={previewScene}
                      config={config}
                      highlightedIds={configHighlightIds}
                    />
                  </Suspense>
                </div>
              </div>
              <ResponsiveBomSidebar
                open={bomSheetOpen}
                onOpenChange={setBomSheetOpen}
              >
                <BomList
                  bom={configBom}
                  config={config}
                  scene={previewScene}
                  highlight={bomHighlight}
                  onHighlightChange={setBomHighlight}
                  cloudModelId={activeCloudModelId}
                />
              </ResponsiveBomSidebar>
            </main>
          ) : (
            <Suspense fallback={<div className="canvas-loader">3D-editor laden…</div>}>
              <SceneEditor
                config={config}
                scene={activeEditorScene}
                onSceneChange={setEditorScene}
                onConfigChange={setConfig}
                onResetFromConfig={resetEditorFromConfig}
                activeCloudModelId={activeCloudModelId}
                activeCloudModelName={activeCloudModelName}
                onActiveCloudModelIdChange={(id, name) => setActiveCloudModel(id, name)}
                openModelsTick={openModelsTick}
                openModelsFocus={openModelsFocus}
                diskImportTick={diskImportTick}
                openConfigSheetTick={openConfigSheetTick}
                planksEnabled={planksEnabled}
                onEditorBaseline={markEditorBaseline}
              />
            </Suspense>
          ))}

        {!modelDetailOpen && (
          <footer className="app-footer">
            <p>
              Bestel onderdelen bij een steigerbuisleverancier. Veel leveranciers zagen buizen gratis op
              maat — handig voor klimrekken, meubels, schuttingen en meer. De prijsindicatie in de
              stuklijst is geen offerte.
            </p>
            <nav className="app-footer-links" aria-label="Juridisch">
              <button type="button" className="linkish" onClick={() => navigate({ name: 'privacy' })}>
                Privacyverklaring
              </button>
              <span aria-hidden="true">·</span>
              <button type="button" className="linkish" onClick={() => navigate({ name: 'terms' })}>
                Voorwaarden
              </button>
            </nav>
          </footer>
        )}
      </div>

      {showWelcome && (
        <WelcomeLanding
          onStartDesigning={dismissWelcome}
          onOpenGallery={() => {
            dismissWelcome()
            navigate({ name: 'gallery' })
          }}
        />
      )}
    </div>
  )
}

function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </AppErrorBoundary>
  )
}

export default App
