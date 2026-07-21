import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { KlimrekConfig, SceneModel } from '../../types'
import {
  deleteModel,
  exportModelToFile,
  importModelFromFile,
  listSavedModels,
  upsertModel,
  type SavedModel,
} from '../../lib/modelStorage'
import { useAuth } from '../../lib/auth/session'
import {
  deleteCloudModel,
  FREE_PRIVATE_MODEL_LIMIT,
  listMyModels,
  publishModel,
  saveCloudModel,
  unpublishModel,
} from '../../lib/models/cloudModels'
import type { CloudModel } from '../../lib/models/types'
import { ApiError } from '../../lib/apiErrors'
import {
  canDownloadModel,
  canOpenFromDisk,
  canPublishModel,
  resolvePrivateModelLimit,
} from '../../lib/billing/entitlements'
import {
  defaultFeatureGates,
  fetchFeatureGates,
  type FeatureGates,
  type GatedFeatureId,
} from '../../lib/billing/featureGates'
import {
  defaultFeaturePrices,
  fetchFeaturePrices,
  resolveFeaturePriceCents,
  type FeaturePrices,
} from '../../lib/billing/featurePrices'
import {
  defaultPlanPrices,
  fetchPlanPrices,
  formatEuroFromCents,
  type PlanPrices,
} from '../../lib/billing/appPricing'
import {
  fetchAccountFeatureGrants,
  hasAccountFeatureGrant,
} from '../../lib/billing/accountFeatureGrants'
import {
  fetchModelFeatureGrants,
  hasModelFeatureGrant,
} from '../../lib/billing/modelFeatureGrants'
import { startCheckout } from '../../lib/billing/checkout'
import { fetchActivePlans, type SubscriptionPlan } from '../../lib/billing/plans'
import { AuthModal } from '../auth/AuthModal'
import { PaidLockIcon } from '../PaidLockIcon'
import { navigate, modelShareUrl } from '../../lib/routing'
import { normalizeConfig } from '../../lib/environment'
import { useModalA11y } from '../../hooks/useModalA11y'

export type ModelsDialogFocus = 'browse' | 'save'

/** Sidebar / dialog gate for “Openen van schijf…”. Login first, then Paid. */
export type DiskImportGate = 'ok' | 'login' | 'paid'

interface ModelStoreDialogProps {
  open: boolean
  onClose: () => void
  /** Bij openen: focus op bibliotheek of opslaan. */
  initialFocus?: ModelsDialogFocus
  scene: SceneModel
  config: KlimrekConfig
  onLoad: (model: SavedModel) => void
  /** Na succesvol cloud-opslaan (baseline voor unsaved-waarschuwing). */
  onSaved?: () => void
  /** Actief cloud-model dat bij Opslaan wordt bijgewerkt (na laden/fork/eerste save). */
  activeCloudModelId: string | null
  /** Optionele naam-hint (bijv. net na fork, voordat de cloud-lijst ververst is). */
  activeCloudModelName?: string | null
  onActiveCloudModelIdChange: (id: string | null, name?: string | null) => void
}

function formatDate(ts: number | string): string {
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts)
  return d.toLocaleString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function cloudToSaved(m: CloudModel): SavedModel {
  return {
    id: m.id,
    name: m.name,
    savedAt: new Date(m.updated_at).getTime(),
    scene: m.scene,
    config: normalizeConfig(m.config),
  }
}

export function ModelStoreDialog({
  open,
  onClose,
  initialFocus = 'browse',
  scene,
  config,
  onLoad,
  onSaved,
  activeCloudModelId,
  activeCloudModelName = null,
  onActiveCloudModelIdChange,
}: ModelStoreDialogProps) {
  const { user, profile } = useAuth()
  const [cloudModels, setCloudModels] = useState<CloudModel[]>([])
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [gates, setGates] = useState<FeatureGates>(defaultFeatureGates())
  const [featurePrices, setFeaturePrices] = useState<FeaturePrices>(defaultFeaturePrices())
  const [prices, setPrices] = useState<PlanPrices>(defaultPlanPrices())
  const [accountGrants, setAccountGrants] = useState<Set<GatedFeatureId>>(new Set())
  const [modelGrantsById, setModelGrantsById] = useState<Record<string, Set<GatedFeatureId>>>({})
  const [localRecent, setLocalRecent] = useState<SavedModel[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [gateMsg, setGateMsg] = useState<string | null>(null)
  const [lockedFeatureForCta, setLockedFeatureForCta] = useState<GatedFeatureId | null>(null)
  const [payBusy, setPayBusy] = useState<GatedFeatureId | null>(null)
  const [pendingCheckoutModelId, setPendingCheckoutModelId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authReason, setAuthReason] = useState<string | null>(null)
  const [migrateOffer, setMigrateOffer] = useState(false)
  /** After a successful cloud save — nudge user to publish (or upgrade). */
  const [publishOfferId, setPublishOfferId] = useState<string | null>(null)
  const [publishOk, setPublishOk] = useState(false)
  const [justUpdated, setJustUpdated] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const dialogBodyRef = useRef<HTMLDivElement>(null)
  const deleteDialogRef = useRef<HTMLDivElement>(null)
  const seededFromActiveRef = useRef<string | null>(null)
  const [cloudLoading, setCloudLoading] = useState(false)

  useEffect(() => {
    void fetchFeatureGates().then(setGates)
    void fetchFeaturePrices().then(setFeaturePrices)
    void fetchPlanPrices().then(setPrices)
  }, [])

  useEffect(() => {
    if (!user) {
      setAccountGrants(new Set())
      return
    }
    void fetchAccountFeatureGrants().then(setAccountGrants)
  }, [user])

  const refreshLocal = () => setLocalRecent(listSavedModels())

  const accessOpts = (feature: GatedFeatureId, modelId?: string | null) => ({
    hasAccountGrant: hasAccountFeatureGrant(accountGrants, feature),
    hasModelGrant: modelId
      ? hasModelFeatureGrant(modelGrantsById[modelId], feature)
      : false,
    plans,
  })

  /** Plan feature (Abonnementen) — geen pay-per-use. */
  const openFromDiskOk = canOpenFromDisk(profile, plans)
  const publishOkEntitled = canPublishModel(profile, plans)
  const downloadOkFor = (modelId: string | null | undefined) =>
    canDownloadModel(profile, gates, accessOpts('download_model', modelId))

  const featurePriceLabel = (feature: GatedFeatureId) =>
    formatEuroFromCents(resolveFeaturePriceCents(feature, featurePrices, prices.exportOnceCents))

  const paywallHint = (feature: GatedFeatureId) =>
    `eenmalig ${featurePriceLabel(feature)} (blijvend) of een abonnement (${formatEuroFromCents(prices.paidMonthlyCents)}/maand)`

  const showSubscriptionRequired = (detail: string) => {
    setError(null)
    setLockedFeatureForCta(null)
    setGateMsg(
      `${detail} Dit zit in je abonnement. Neem of wissel naar een plan met deze functie.`,
    )
  }

  const showFeaturePaywall = (feature: GatedFeatureId, detail: string) => {
    setError(null)
    setLockedFeatureForCta(feature)
    setGateMsg(`${detail} Vereist ${paywallHint(feature)}.`)
  }

  const ensureModelGrants = async (modelId: string) => {
    if (modelGrantsById[modelId]) return modelGrantsById[modelId]
    const grants = await fetchModelFeatureGrants(modelId)
    setModelGrantsById((prev) => ({ ...prev, [modelId]: grants }))
    return grants
  }

  const handlePayForFeature = async (feature: GatedFeatureId, modelId?: string | null) => {
    setGateMsg(null)
    if (!user) {
      requireLogin('Log in om deze functie te ontgrendelen.')
      return
    }
    setPayBusy(feature)
    try {
      const result = await startCheckout('export_once', {
        feature,
        modelId: modelId ?? undefined,
      })
      if (result.stubActivated) {
        if (result.account_feature_grant) {
          const next = await fetchAccountFeatureGrants()
          setAccountGrants(next)
        }
        if (result.feature_grant?.model_id) {
          const grants = await fetchModelFeatureGrants(result.feature_grant.model_id)
          setModelGrantsById((prev) => ({
            ...prev,
            [result.feature_grant!.model_id]: grants,
          }))
        }
        setGateMsg('Functie ontgrendeld (blijvend).')
        setLockedFeatureForCta(null)
        return
      }
      const url = result.checkoutUrl || result.url
      if (url) {
        window.location.href = url
        return
      }
      setGateMsg(result.message || 'Checkout gestart.')
    } catch (e) {
      setGateMsg(e instanceof Error ? e.message : 'Betaling starten mislukt.')
    } finally {
      setPayBusy(null)
    }
  }

  const refreshCloud = useCallback(async () => {
    if (!user) {
      setCloudModels([])
      setCloudLoading(false)
      return
    }
    setCloudLoading(true)
    try {
      const list = await listMyModels()
      setCloudModels(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kon bibliotheek niet laden')
    } finally {
      setCloudLoading(false)
    }
  }, [user])

  useEffect(() => {
    void fetchActivePlans()
      .then(setPlans)
      .catch(() => setPlans([]))
  }, [])

  useEffect(() => {
    if (!open) return
    refreshLocal()
    void refreshCloud()
    // Browse: lijst bovenaan; scroll body terug zodat cloud/recent zichtbaar is.
    requestAnimationFrame(() => {
      if (dialogBodyRef.current) dialogBodyRef.current.scrollTop = 0
    })
  }, [open, refreshCloud, initialFocus])

  useEffect(() => {
    if (!open || !user) {
      setMigrateOffer(false)
      return
    }
    if (listSavedModels().length > 0) {
      const key = `steigerbuis.migrated.${user.id}`
      if (!localStorage.getItem(key)) setMigrateOffer(true)
    } else {
      setMigrateOffer(false)
    }
  }, [open, user])

  // Na fork of laden: vul naam één keer vanuit actief cloud-model.
  useEffect(() => {
    if (!activeCloudModelId) {
      seededFromActiveRef.current = null
      return
    }
    if (seededFromActiveRef.current === activeCloudModelId) return
    const match = cloudModels.find((m) => m.id === activeCloudModelId)
    if (match) {
      setName(match.name)
      seededFromActiveRef.current = activeCloudModelId
    } else if (activeCloudModelName) {
      setName(activeCloudModelName)
      seededFromActiveRef.current = activeCloudModelId
    }
  }, [activeCloudModelId, activeCloudModelName, cloudModels])

  useEffect(() => {
    if (!user) {
      onActiveCloudModelIdChange(null)
      seededFromActiveRef.current = null
    }
  }, [user, onActiveCloudModelIdChange])

  useModalA11y({
    open: open && !authOpen && !deleteConfirm,
    onClose,
    containerRef: dialogRef,
    initialFocusRef: initialFocus === 'save' ? nameInputRef : undefined,
    closeOnEscape: open && !authOpen && !deleteConfirm,
  })

  useModalA11y({
    open: Boolean(deleteConfirm),
    onClose: () => {
      if (!deleteBusy) setDeleteConfirm(null)
    },
    containerRef: deleteDialogRef,
    closeOnEscape: Boolean(deleteConfirm) && !deleteBusy,
  })

  const requireLogin = (reason: string) => {
    setAuthReason(reason)
    setAuthOpen(true)
  }

  const diskImportGate: DiskImportGate = !user ? 'login' : openFromDiskOk ? 'ok' : 'paid'

  const loadIntoEditor = (model: SavedModel, cloudId: string | null) => {
    onActiveCloudModelIdChange(cloudId, cloudId ? model.name : null)
    seededFromActiveRef.current = cloudId
    setName(model.name)
    setPublishOfferId(null)
    setPublishOk(false)
    setJustUpdated(false)
    setError(null)
    onLoad(model)
    onClose()
  }

  const handleSave = async (asNew: boolean) => {
    setError(null)
    setPublishOk(false)
    setJustUpdated(false)
    if (!user) {
      requireLogin('Log in om je ontwerp in de cloud op te slaan. Daarna kun je het ook als bestand downloaden.')
      return
    }
    const updateId = !asNew && activeCloudModelId ? activeCloudModelId : undefined
    setBusy(true)
    try {
      const saved = await saveCloudModel({
        id: updateId,
        name,
        scene,
        config,
      })
      // Secondary: file download when entitled (or gate off)
      const asSaved = cloudToSaved(saved)
      upsertModel(asSaved)
      if (downloadOkFor(saved.id)) {
        exportModelToFile(asSaved)
      }
      onActiveCloudModelIdChange(saved.id, saved.name)
      seededFromActiveRef.current = saved.id
      setName(saved.name)
      refreshLocal()
      await refreshCloud()
      if (updateId) {
        setJustUpdated(true)
        setPublishOfferId(null)
      } else if (saved.visibility !== 'published') {
        setPublishOfferId(saved.id)
      } else {
        setPublishOfferId(null)
      }
      onSaved?.()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'save_limit') {
        setError(e.message)
      } else {
        setError(e instanceof Error ? e.message : 'Opslaan mislukt')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleOpenFile = async (file: File) => {
    setError(null)
    setGateMsg(null)
    if (!user) {
      requireLogin('Log in om een bestand te importeren.')
      return
    }
    if (!openFromDiskOk) {
      showSubscriptionRequired('Openen van schijf.')
      return
    }
    try {
      const model = await importModelFromFile(file)
      const saved = await saveCloudModel({
        name: model.name,
        scene: model.scene,
        config: model.config,
      })
      const asSaved = cloudToSaved(saved)
      upsertModel(asSaved)
      refreshLocal()
      await refreshCloud()
      loadIntoEditor(asSaved, saved.id)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'save_limit') {
        setError(e.message)
      } else {
        setError(e instanceof Error ? e.message : 'Kon bestand niet laden')
      }
    }
  }

  const handleDownload = async (model: SavedModel, cloudId: string | null) => {
    setGateMsg(null)
    setError(null)
    let modelGrant = false
    if (cloudId) {
      const grants = await ensureModelGrants(cloudId)
      modelGrant = hasModelFeatureGrant(grants, 'download_model')
    }
    const ok = canDownloadModel(profile, gates, {
      hasAccountGrant: hasAccountFeatureGrant(accountGrants, 'download_model'),
      hasModelGrant: modelGrant,
      plans,
    })
    if (!ok) {
      setPendingCheckoutModelId(cloudId)
      showFeaturePaywall('download_model', 'Downloaden van modellen.')
      return
    }
    exportModelToFile(model)
  }

  const handleDeleteCloud = async (id: string) => {
    setError(null)
    setDeleteBusy(true)
    try {
      await deleteCloudModel(id)
      if (activeCloudModelId === id) {
        onActiveCloudModelIdChange(null)
        seededFromActiveRef.current = null
      }
      setDeleteConfirm(null)
      await refreshCloud()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verwijderen mislukt')
    } finally {
      setDeleteBusy(false)
    }
  }

  const handlePublish = async (id: string) => {
    setError(null)
    setGateMsg(null)
    setPublishOk(false)
    if (!publishOkEntitled) {
      showSubscriptionRequired('Publiceren naar de galerij.')
      return
    }
    if (!profile?.display_name?.trim()) {
      setError('Stel eerst een weergavenaam in via het accountmenu.')
      return
    }
    setBusy(true)
    try {
      await publishModel(id)
      setPublishOfferId(null)
      setPublishOk(true)
      await refreshCloud()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'paid_required') {
        showSubscriptionRequired('Publiceren naar de galerij.')
      } else {
        setError(e instanceof Error ? e.message : 'Publiceren mislukt')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleUnpublish = async (id: string) => {
    setError(null)
    setPublishOk(false)
    try {
      await unpublishModel(id)
      await refreshCloud()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Depubliceren mislukt')
    }
  }

  const migrateLocal = async () => {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      const locals = listSavedModels()
      for (const m of locals) {
        try {
          await saveCloudModel({ name: m.name, scene: m.scene, config: m.config })
        } catch (e) {
          if (e instanceof ApiError && e.code === 'save_limit') {
            setError('Limiet bereikt tijdens migratie. Neem een maandabonnement of verwijder cloud-modellen.')
            break
          }
        }
      }
      localStorage.setItem(`steigerbuis.migrated.${user.id}`, '1')
      setMigrateOffer(false)
      await refreshCloud()
    } finally {
      setBusy(false)
    }
  }

  const privateCount = cloudModels.filter((m) => m.visibility === 'private').length
  const privateLimit = resolvePrivateModelLimit(profile, plans, FREE_PRIVATE_MODEL_LIMIT)
  const limitHint = user
    ? privateLimit == null
      ? 'Onbeperkt privé cloud-modellen'
      : `${privateCount}/${privateLimit} privé cloud-modellen`
    : null

  const offerModel = publishOfferId
    ? cloudModels.find((m) => m.id === publishOfferId) ?? null
    : null
  const activeCloudModel = activeCloudModelId
    ? cloudModels.find((m) => m.id === activeCloudModelId) ?? null
    : null
  const isUpdating = Boolean(activeCloudModelId)
  const browseFirst = initialFocus !== 'save'

  const saveSection = (
    <section className="model-store-section" aria-labelledby="model-save-heading">
      <h3 id="model-save-heading" className="model-section-title">
        Opslaan
      </h3>
      {user ? (
        <>
          <div className="model-save-row">
            <input
              ref={nameInputRef}
              type="text"
              placeholder="Modelnaam…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave(false)
              }}
            />
            <button
              type="button"
              className="model-save-btn"
              disabled={busy}
              onClick={() => void handleSave(false)}
              title={
                isUpdating
                  ? 'Bestaand cloud-model bijwerken (+ download)'
                  : 'Nieuw opslaan in cloud (+ download)'
              }
            >
              Opslaan
            </button>
          </div>
          {isUpdating && (
            <div className="model-save-as-new">
              <button
                type="button"
                className="model-save-as-new-btn"
                disabled={busy}
                onClick={() => void handleSave(true)}
                title="Nieuw model in je bibliotheek (telt mee voor de gratis limiet)"
              >
                Opslaan als nieuw
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="model-save-row">
          <button
            type="button"
            className="model-save-btn"
            onClick={() =>
              requireLogin(
                'Log in om je ontwerp in de cloud op te slaan. Daarna kun je het ook als bestand downloaden.',
              )
            }
            title="Inloggen vereist"
          >
            Inloggen om op te slaan
          </button>
        </div>
      )}
    </section>
  )

  const librarySections = (
    <>
      <section className="model-store-section" aria-labelledby="model-cloud-heading">
        <h3 id="model-cloud-heading" className="model-section-title">
          Cloud
        </h3>
        {!user ? (
          <p className="model-empty">
            <button
              type="button"
              className="linkish"
              onClick={() => requireLogin('Log in om je opgeslagen modellen (cloud) te bekijken.')}
            >
              Log in
            </button>{' '}
            om je cloud-bibliotheek te zien.
          </p>
        ) : cloudLoading && cloudModels.length === 0 ? (
          <p className="model-empty">Cloud-modellen laden…</p>
        ) : cloudModels.length === 0 ? (
          <p className="model-empty">Nog geen cloud-modellen.</p>
        ) : (
          <ul className="model-list model-list--dialog">
            {cloudModels.map((m) => (
              <li key={m.id} className="model-item">
                <div className="model-item-info">
                  <span className="model-item-name">{m.name}</span>
                  <span className="model-item-meta">
                    {m.scene.pipes.length} buizen · {formatDate(m.updated_at)}
                    {m.visibility === 'published' ? ' · gepubliceerd' : ''}
                    {m.attribution_name ? ` · Gebaseerd op ${m.attribution_name}` : ''}
                  </span>
                </div>
                <div className="model-item-actions">
                  <button type="button" onClick={() => loadIntoEditor(cloudToSaved(m), m.id)}>
                    Laden
                  </button>
                  <button
                    type="button"
                    className={downloadOkFor(m.id) ? undefined : 'model-action-locked'}
                    title={
                      downloadOkFor(m.id)
                        ? 'Download'
                        : 'Downloaden — betaalde functie'
                    }
                    onClick={() => void handleDownload(cloudToSaved(m), m.id)}
                  >
                    ↓
                    {!downloadOkFor(m.id) && <PaidLockIcon size={12} />}
                  </button>
                  {m.visibility === 'published' ? (
                    <>
                      <button
                        type="button"
                        title="Deel-link"
                        onClick={() => void navigator.clipboard.writeText(modelShareUrl(m.id))}
                      >
                        Link
                      </button>
                      <button type="button" onClick={() => void handleUnpublish(m.id)}>
                        Uit galerij
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={`model-publish-btn${publishOkEntitled ? '' : ' model-action-locked'}`}
                      title={
                        publishOkEntitled
                          ? 'Publiceren naar de openbare galerij'
                          : 'Publiceren — abonnement vereist'
                      }
                      onClick={() => void handlePublish(m.id)}
                    >
                      Naar galerij
                      {!publishOkEntitled && (
                        <PaidLockIcon size={12} label="Abonnement vereist" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    className="model-delete"
                    onClick={() => setDeleteConfirm({ id: m.id, name: m.name })}
                    aria-label={`Verwijder ${m.name}`}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="model-store-section" aria-labelledby="model-recent-heading">
        <h3 id="model-recent-heading" className="model-section-title">
          Recent in deze browser
        </h3>
        {localRecent.length === 0 ? (
          <p className="model-empty">Nog geen recente modellen in deze browser.</p>
        ) : (
          <ul className="model-list model-list--dialog">
            {localRecent.map((m) => (
              <li key={m.id} className="model-item">
                <div className="model-item-info">
                  <span className="model-item-name">{m.name}</span>
                  <span className="model-item-meta">
                    {m.scene.pipes.length} buizen · {formatDate(m.savedAt)}
                  </span>
                </div>
                <div className="model-item-actions">
                  <button
                    type="button"
                    onClick={() => {
                      const inCloud = cloudModels.some((c) => c.id === m.id)
                      loadIntoEditor(m, inCloud ? m.id : null)
                    }}
                  >
                    Laden
                  </button>
                  <button
                    type="button"
                    className={downloadOkFor(null) ? undefined : 'model-action-locked'}
                    title={
                      downloadOkFor(null) ? 'Download' : 'Downloaden — betaalde functie'
                    }
                    onClick={() => void handleDownload(m, null)}
                  >
                    ↓
                    {!downloadOkFor(null) && <PaidLockIcon size={12} />}
                  </button>
                  <button
                    type="button"
                    className="model-delete"
                    onClick={() => {
                      deleteModel(m.id)
                      refreshLocal()
                    }}
                    aria-label={`Verwijder ${m.name}`}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )

  const dialog =
    open &&
    createPortal(
      <div
        className="auth-modal-backdrop model-store-backdrop"
        role="presentation"
        onClick={onClose}
      >
        <div
          ref={dialogRef}
          className="auth-modal model-store-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="model-store-title"
          tabIndex={-1}
          onClick={(ev) => ev.stopPropagation()}
        >
          <header className="auth-modal-header">
            <h2 id="model-store-title">Opgeslagen modellen</h2>
            <button
              type="button"
              className="auth-modal-close"
              onClick={onClose}
              aria-label="Sluiten"
              data-modal-initial-skip
            >
              ✕
            </button>
          </header>

          <div ref={dialogBodyRef} className="model-store model-store-dialog-body">
            <p className="model-store-intro">
              {user
                ? publishOkEntitled
                  ? 'Opslaan gaat naar je cloud-bibliotheek. Daarna kun je publiceren naar de openbare galerij.'
                  : 'Opslaan gaat naar je cloud-bibliotheek. Publiceren kan een betaalde functie zijn (slotje).'
                : 'Om op te slaan of te importeren moet je inloggen. Ontwerpen en printen van de stuklijst kan zonder account.'}
            </p>
            {limitHint && <p className="model-limit-hint muted">{limitHint}</p>}
            {user && isUpdating && (
              <p className="model-editing-hint muted">
                Je bewerkt{' '}
                <strong>
                  {activeCloudModel?.name ?? activeCloudModelName ?? (name.trim() || 'een opgeslagen model')}
                </strong>
                . Opslaan overschrijft dit model (telt niet mee voor de limiet).
              </p>
            )}

            {migrateOffer && (
              <div className="model-migrate">
                <p>Er staan nog lokale modellen in deze browser. Uploaden naar je cloud-bibliotheek?</p>
                <button type="button" className="bom-action-btn" disabled={busy} onClick={() => void migrateLocal()}>
                  Migreren
                </button>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => {
                    if (user) localStorage.setItem(`steigerbuis.migrated.${user.id}`, '1')
                    setMigrateOffer(false)
                  }}
                >
                  Overslaan
                </button>
              </div>
            )}

            {browseFirst ? librarySections : saveSection}

            {justUpdated && (
              <div className="model-publish-offer model-publish-offer--ok" role="status">
                <p>
                  <strong>Bijgewerkt.</strong> Je bestaande cloud-model is overschreven.
                </p>
                <div className="model-publish-offer-actions">
                  <button type="button" className="linkish" onClick={() => setJustUpdated(false)}>
                    Sluiten
                  </button>
                </div>
              </div>
            )}

            {publishOfferId && offerModel?.visibility !== 'published' && (
              <div className="model-publish-offer" role="status">
                <p>
                  <strong>Opgeslagen.</strong>{' '}
                  {publishOkEntitled
                    ? 'Wil je dit model publiceren naar de galerij?'
                    : 'Publiceren naar de galerij is een betaalde functie.'}
                </p>
                <div className="model-publish-offer-actions">
                  <button
                    type="button"
                    className={`bom-action-btn${publishOkEntitled ? '' : ' bom-action-locked'}`}
                    disabled={busy}
                    onClick={() => void handlePublish(publishOfferId)}
                  >
                    Publiceren naar galerij
                    {!publishOkEntitled && (
                      <PaidLockIcon label="Abonnement vereist" />
                    )}
                  </button>
                  <button type="button" className="linkish" onClick={() => setPublishOfferId(null)}>
                    Later
                  </button>
                </div>
              </div>
            )}

            {publishOk && (
              <div className="model-publish-offer model-publish-offer--ok" role="status">
                <p>
                  <strong>Gepubliceerd.</strong> Je model staat in de galerij.
                </p>
                <div className="model-publish-offer-actions">
                  <button type="button" className="bom-action-btn" onClick={() => navigate({ name: 'gallery' })}>
                    Open galerij
                  </button>
                  <button type="button" className="linkish" onClick={() => setPublishOk(false)}>
                    Sluiten
                  </button>
                </div>
              </div>
            )}

            {!browseFirst ? null : saveSection}
            {browseFirst ? null : librarySections}

            <div className="model-file-actions">
              <button
                type="button"
                className={`model-open-btn${diskImportGate === 'paid' ? ' model-action-locked' : ''}`}
                title={
                  diskImportGate === 'ok'
                    ? 'Importeer een .steigerbuis.json of .json-bestand'
                    : diskImportGate === 'login'
                      ? 'Log in om een bestand te importeren'
                      : 'Abonnement vereist — tik voor abonnementen'
                }
                aria-disabled={diskImportGate === 'paid'}
                onClick={() => {
                  if (diskImportGate === 'login') {
                    requireLogin('Log in om een bestand te importeren.')
                    return
                  }
                  if (diskImportGate === 'paid') {
                    showSubscriptionRequired('Openen van schijf.')
                    return
                  }
                  fileInputRef.current?.click()
                }}
              >
                Openen van schijf…
                {diskImportGate === 'paid' && (
                  <PaidLockIcon label="Abonnement vereist" />
                )}
              </button>
            </div>

            {gateMsg && (
              <p className="bom-gate-msg model-gate-msg">
                {gateMsg}{' '}
                {lockedFeatureForCta ? (
                  <>
                    {payBusy === lockedFeatureForCta ? (
                      <span>Bezig…</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="linkish"
                          disabled={payBusy != null}
                          onClick={() =>
                            void handlePayForFeature(
                              lockedFeatureForCta,
                              lockedFeatureForCta === 'download_model'
                                ? pendingCheckoutModelId
                                : null,
                            )
                          }
                        >
                          {`Betaal ${featurePriceLabel(lockedFeatureForCta)} voor deze functie`}
                        </button>
                        {' of neem een '}
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => navigate({ name: 'upgrade' })}
                        >
                          abonnement
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <button type="button" className="linkish" onClick={() => navigate({ name: 'upgrade' })}>
                    Bekijk abonnementen
                  </button>
                )}
              </p>
            )}

            {error && (
              <p className="model-import-error">
                {error}{' '}
                {error.toLowerCase().includes('maximum') ||
                error.toLowerCase().includes('limiet') ? (
                  <button type="button" className="linkish" onClick={() => navigate({ name: 'upgrade' })}>
                    Abonnement & aankopen
                  </button>
                ) : null}
              </p>
            )}
          </div>
        </div>
      </div>,
      document.body,
    )

  const deleteConfirmDialog =
    deleteConfirm &&
    createPortal(
      <div
        className="auth-modal-backdrop model-delete-confirm-backdrop"
        role="presentation"
        onClick={() => {
          if (!deleteBusy) setDeleteConfirm(null)
        }}
      >
        <div
          ref={deleteDialogRef}
          className="auth-modal model-delete-confirm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="model-delete-title"
          tabIndex={-1}
          onClick={(ev) => ev.stopPropagation()}
        >
          <header className="auth-modal-header">
            <h2 id="model-delete-title">Model verwijderen?</h2>
            <button
              type="button"
              className="auth-modal-close"
              onClick={() => setDeleteConfirm(null)}
              disabled={deleteBusy}
              aria-label="Sluiten"
              data-modal-initial-skip
            >
              ✕
            </button>
          </header>
          <p className="auth-modal-reason delete-account-warn">
            Je staat op het punt om <strong>{deleteConfirm.name}</strong> permanent te verwijderen.
            Dit kan niet ongedaan worden gemaakt.
          </p>
          <div className="auth-modal-actions">
            <button
              type="button"
              className="bom-action-btn secondary"
              disabled={deleteBusy}
              onClick={() => setDeleteConfirm(null)}
            >
              Annuleren
            </button>
            <button
              type="button"
              className="bom-action-btn delete-account-confirm-btn"
              disabled={deleteBusy}
              onClick={() => void handleDeleteCloud(deleteConfirm.id)}
            >
              {deleteBusy ? 'Bezig…' : 'Definitief verwijderen'}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.steigerbuis.json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleOpenFile(file)
          e.target.value = ''
        }}
      />
      {dialog}
      {deleteConfirmDialog}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} reason={authReason} />
    </>
  )
}

/** @deprecated Gebruik ModelStoreDialog */
export const ModelStorePanel = ModelStoreDialog
