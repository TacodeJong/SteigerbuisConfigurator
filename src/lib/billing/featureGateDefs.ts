/** Pure types/defaults for pay-per-use feature gates (no Supabase — safe for unit tests). */

/**
 * Admin-togglable **pay-per-use** actions (`app_settings.feature_gates`).
 * Subscription-only capabilities (cloud save, open disk, publish, fork) live on
 * `subscription_plans.features` — not here.
 *
 * Grant scope: always per cloud-model via `model_feature_grants`
 * (download_model may fall back to account grant when no model id).
 */
export type GatedFeatureId =
  | 'full_print'
  | 'copy_order_list'
  | 'bom_print'
  | 'viewport_print'
  | 'download_model'
  | 'full_pdf'

/**
 * `true` = requires payment (subscription covering feature OR durable grant OR
 * export_pack for print/copy).
 * `false` = free for everyone.
 */
export type FeatureGates = Record<GatedFeatureId, boolean>

export const GATED_FEATURE_IDS: readonly GatedFeatureId[] = [
  'full_print',
  'copy_order_list',
  'bom_print',
  'viewport_print',
  'download_model',
  'full_pdf',
] as const

/** Defaults: plattegrond + bestellijst + volledige PDF paid; stuklijst + 3D-weergave + download free. */
export const DEFAULT_FEATURE_GATES: FeatureGates = {
  full_print: true,
  copy_order_list: true,
  bom_print: false,
  viewport_print: false,
  download_model: false,
  full_pdf: true,
}

export const GATED_FEATURE_LABELS: Record<GatedFeatureId, string> = {
  full_print: 'Plattegrond / volledige bouwinstructie',
  copy_order_list: 'Bestellijst kopiëren naar klembord',
  bom_print: 'Stuklijst printen',
  viewport_print: '3D-weergave printen',
  download_model: 'Downloaden van modellen',
  full_pdf: 'Volledige PDF (3D + stuklijst + plattegrond)',
}

export const GATED_FEATURE_DESCRIPTIONS: Record<GatedFeatureId, string> = {
  full_print:
    'Volledige footprint-print en plattegrond in de bouwinstructie. Uit = gratis. Eenmalige unlock: per cloud-model.',
  copy_order_list:
    'Bestellijst naar klembord kopiëren (aantallen + namen). Uit = gratis. Eenmalige unlock: per cloud-model.',
  bom_print:
    'Stuklijst printen. Standaard gratis; aan = betaalpoort. Eenmalige unlock: per cloud-model.',
  viewport_print:
    'Huidige 3D-weergave printen (camerastand + omgeving). Standaard gratis; aan = betaalpoort. Eenmalige unlock: per cloud-model.',
  download_model:
    'Model als .steigerbuis.json downloaden (↓ en download bij opslaan). Standaard gratis; aan = abonnement of unlock per cloud-model.',
  full_pdf:
    'Eén printbaar document met 3D-weergave (huidige camerastand + omgeving), stuklijst (zonder art.nr.) en plattegrond. Standaard betaald. Eenmalige unlock: per cloud-model.',
}

export function defaultFeatureGates(): FeatureGates {
  return { ...DEFAULT_FEATURE_GATES }
}

export function isPaymentRequired(
  feature: GatedFeatureId,
  gates: FeatureGates | null | undefined,
): boolean {
  const g = gates ?? DEFAULT_FEATURE_GATES
  return Boolean(g[feature])
}

/** Default plan feature lists when resolving coverage without loading plans.ts. */
export const FALLBACK_PAID_FEATURES = [
  'cloud_save',
  'open_from_disk',
  'publish',
  'fork',
  'full_print',
  'copy_order_list',
  'download_model',
  'full_pdf',
] as const

/** Account-wide export_pack covers print/copy only. */
export const FALLBACK_EXPORT_ONCE_FEATURES = ['full_print', 'copy_order_list'] as const
