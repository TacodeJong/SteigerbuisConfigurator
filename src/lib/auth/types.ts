import { isEntitledPaid } from '../billing/entitlements'

export type SubscriptionStatus =
  | 'active'
  | 'pending'
  | 'canceled'
  | 'expired'
  | 'suspended'
  | 'failed'

export interface Profile {
  id: string
  display_name: string
  bio: string | null
  is_paid: boolean
  paid_until: string | null
  /** One-time €5 export pack: footprint + BOM, no Paid save/publish. */
  export_pack?: boolean
  /** Checkout plan slug: paid_monthly | export_once. */
  subscription_plan_slug?: string | null
  /** active | canceled | expired — canceled keeps Paid until paid_until unless ended early. */
  subscription_status?: SubscriptionStatus | null
  /** When cancel was recorded (often equals period end). */
  subscription_cancel_at?: string | null
  /** Mollie recurring customer id for mandates/subscriptions. */
  mollie_customer_id?: string | null
  /** Mollie subscription id for recurring auto-incasso. */
  mollie_subscription_id?: string | null
  /** Last known Mollie subscription status. */
  mollie_subscription_status?: SubscriptionStatus | null
  /** Next expected recurring charge date from Mollie. */
  mollie_subscription_next_payment_at?: string | null
  /** Site admin — set only via SQL/service role, never by the client. */
  is_admin?: boolean
  created_at?: string
  updated_at?: string
}

export interface AuthUser {
  id: string
  email: string
}

export interface SessionState {
  user: AuthUser | null
  profile: Profile | null
  loading: boolean
  /** Local demo backend (no Supabase env). */
  isLocalStub: boolean
}

export function profileIsPaid(profile: Profile | null | undefined): boolean {
  return isEntitledPaid(profile)
}

export function profileIsAdmin(profile: Profile | null | undefined): boolean {
  return Boolean(profile?.is_admin)
}
