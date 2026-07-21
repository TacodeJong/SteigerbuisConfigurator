import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  fetchMollieModeFromSettings,
  resolveMollieApiKey,
} from '../_shared/mollieApiKey.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed', message: 'Alleen POST.' })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(401, { error: 'unauthorized', message: 'Geen Authorization-header.' })

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey =
      Deno.env.get('SUPABASE_ANON_KEY') ??
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
      ''
    const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json(500, {
        error: 'misconfigured',
        message: 'SUPABASE_URL / ANON / SERVICE_ROLE ontbreekt op de Edge Function.',
      })
    }

    const body = (await req.json().catch(() => ({}))) as { end_immediately?: boolean }
    const endImmediately = Boolean(body.end_immediately)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) {
      return json(401, { error: 'unauthorized', message: 'Sessie ongeldig. Log opnieuw in.' })
    }
    const userId = userData.user.id

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('id,is_paid,paid_until,mollie_customer_id,mollie_subscription_id,subscription_plan_slug')
      .eq('id', userId)
      .maybeSingle()
    if (profileErr || !profile) return json(404, { error: 'profile_not_found', message: 'Profiel niet gevonden.' })
    if (!profile.is_paid) {
      return json(400, { error: 'no_active_subscription', message: 'Geen actief abonnement om te annuleren.' })
    }

    let mollieCancelOk = false
    if (profile.mollie_customer_id && profile.mollie_subscription_id) {
      const mode = await fetchMollieModeFromSettings(admin)
      const resolved = resolveMollieApiKey(mode)
      if (resolved.ok) {
        const res = await fetch(
          `https://api.mollie.com/v2/customers/${profile.mollie_customer_id}/subscriptions/${profile.mollie_subscription_id}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${resolved.apiKey}` },
          },
        )
        mollieCancelOk = res.ok
      }
    }

    const now = new Date()
    const patch: Record<string, unknown> = {
      subscription_status: 'canceled',
      mollie_subscription_status: 'canceled',
      subscription_cancel_at: profile.paid_until || now.toISOString(),
      updated_at: now.toISOString(),
    }
    if (endImmediately) {
      patch.is_paid = false
      patch.paid_until = null
    }

    const { data: updated, error: updateErr } = await admin
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select('*')
      .single()
    if (updateErr) return json(500, { error: 'db', message: updateErr.message })

    return json(200, {
      ok: true,
      mollie_canceled: mollieCancelOk,
      profile: updated,
    })
  } catch (e) {
    return json(500, {
      error: 'internal',
      message: e instanceof Error ? e.message : 'Onbekende fout',
    })
  }
})
