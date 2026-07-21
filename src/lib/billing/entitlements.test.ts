import assert from 'node:assert/strict'
import {
  canAccessGatedFeature,
  canCopyOrderList,
  canPrintFullBuildInstructions,
  canPrintFullFootprint,
  hasActiveSubscriptionCovering,
  hasExportPack,
  isEntitledPaid,
} from './entitlements.ts'
import type { Profile } from '../auth/types.ts'
import { DEFAULT_FEATURE_GATES } from './featureGates.ts'

function profile(partial: Partial<Profile>): Profile {
  return {
    id: 'u1',
    display_name: 'Test',
    bio: null,
    is_paid: false,
    paid_until: null,
    export_pack: false,
    ...partial,
  }
}

assert.equal(isEntitledPaid(null), false)
assert.equal(isEntitledPaid(profile({ is_paid: false })), false)
assert.equal(isEntitledPaid(profile({ is_paid: true, paid_until: null })), true)
assert.equal(
  isEntitledPaid(profile({ is_paid: true, paid_until: new Date(Date.now() - 1000).toISOString() })),
  false,
)
assert.equal(
  isEntitledPaid(profile({ is_paid: true, paid_until: new Date(Date.now() + 60_000).toISOString() })),
  true,
)

const free = profile({ is_paid: false })
assert.equal(canPrintFullFootprint(free), false)
assert.equal(canPrintFullBuildInstructions(free), false)
assert.equal(canCopyOrderList(free), false)
assert.equal(hasExportPack(free), false)
assert.equal(hasActiveSubscriptionCovering('copy_order_list', free), false)

const exportOnly = profile({ export_pack: true })
assert.equal(hasExportPack(exportOnly), true)
assert.equal(isEntitledPaid(exportOnly), false)
assert.equal(canPrintFullFootprint(exportOnly), true)
assert.equal(canPrintFullBuildInstructions(exportOnly), true)
assert.equal(canCopyOrderList(exportOnly), true)

const paid = profile({ is_paid: true, subscription_plan_slug: 'paid_monthly' })
assert.equal(canPrintFullFootprint(paid), true)
assert.equal(canPrintFullBuildInstructions(paid), true)
assert.equal(canCopyOrderList(paid), true)

// Downgrade: subscription gone → gated again, unless durable model grant
const downgraded = profile({ is_paid: false, paid_until: null, export_pack: false })
assert.equal(canCopyOrderList(downgraded), false)
assert.equal(
  canAccessGatedFeature('copy_order_list', downgraded, DEFAULT_FEATURE_GATES, {
    hasModelGrant: true,
  }),
  true,
)
assert.equal(
  canAccessGatedFeature('full_print', downgraded, DEFAULT_FEATURE_GATES, {
    hasModelGrant: false,
  }),
  false,
)

// full_pdf: paid by default; model grant unlocks; export_pack does not cover
assert.equal(canAccessGatedFeature('full_pdf', free, DEFAULT_FEATURE_GATES), false)
assert.equal(canAccessGatedFeature('full_pdf', exportOnly, DEFAULT_FEATURE_GATES), false)
assert.equal(
  canAccessGatedFeature('full_pdf', paid, DEFAULT_FEATURE_GATES, {
    plans: [
      {
        slug: 'paid_monthly',
        features: [
          'cloud_save',
          'full_print',
          'copy_order_list',
          'download_model',
          'full_pdf',
        ],
      },
    ],
  }),
  true,
)
assert.equal(
  canAccessGatedFeature('full_pdf', downgraded, DEFAULT_FEATURE_GATES, {
    hasModelGrant: true,
  }),
  true,
)
assert.equal(
  canAccessGatedFeature('full_pdf', free, { ...DEFAULT_FEATURE_GATES, full_pdf: false }),
  true,
)

// Gate off → free for everyone
assert.equal(
  canCopyOrderList(free, { ...DEFAULT_FEATURE_GATES, copy_order_list: false }),
  true,
)

console.log('entitlements.test.ts: ok')
