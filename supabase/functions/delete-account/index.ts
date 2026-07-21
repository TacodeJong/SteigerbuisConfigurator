/**
 * Edge Function: delete-account
 * Authenticated user confirms with email or "VERWIJDER", then:
 * 1) anonymized audit row in deleted_accounts
 * 2) service-role wipe of auth.users (cascades profiles → models / social)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

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

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function redactDisplayName(name: string | null | undefined): string | null {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return null
  return `${trimmed.slice(0, 1)}***`
}

function isConfirmValid(confirm: string, email: string): boolean {
  const c = confirm.trim()
  if (c.toUpperCase() === 'VERWIJDER') return true
  return c.toLowerCase() === email.trim().toLowerCase()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed', message: 'Alleen POST.' })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json(401, { error: 'unauthorized', message: 'Geen Authorization-header.' })
    }

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

    const body = (await req.json().catch(() => ({}))) as {
      confirm_email?: string
      reason?: string | null
    }
    const confirmEmail = typeof body.confirm_email === 'string' ? body.confirm_email : ''
    const reason =
      typeof body.reason === 'string' && body.reason.trim()
        ? body.reason.trim().slice(0, 500)
        : null

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) {
      return json(401, {
        error: 'unauthorized',
        message: 'Sessie ongeldig. Log opnieuw in.',
      })
    }

    const user = userData.user
    const email = user.email ?? ''
    if (!email) {
      return json(400, { error: 'validation', message: 'Account heeft geen e-mailadres.' })
    }

    if (!isConfirmValid(confirmEmail, email)) {
      return json(400, {
        error: 'confirm_mismatch',
        message: 'Typ je e-mailadres of VERWIJDER om te bevestigen.',
      })
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, is_paid, paid_until')
      .eq('id', user.id)
      .maybeSingle()

    const paidUntil = profile?.paid_until ? new Date(profile.paid_until as string).getTime() : null
    const hadPaid =
      Boolean(profile?.is_paid) && (paidUntil == null || paidUntil > Date.now())

    const emailHash = await sha256Hex(email.trim().toLowerCase())

    const { error: auditErr } = await admin.from('deleted_accounts').insert({
      former_user_id: user.id,
      email_hash: emailHash,
      display_name_redacted: redactDisplayName(profile?.display_name as string | undefined),
      had_paid: hadPaid,
      reason,
    })

    if (auditErr) {
      console.error('deleted_accounts insert', auditErr.message)
      return json(500, {
        error: 'audit_failed',
        message: 'Auditlog schrijven mislukt; account niet verwijderd.',
      })
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
    if (delErr) {
      console.error('auth.admin.deleteUser', delErr.message)
      return json(500, {
        error: 'delete_failed',
        message: 'Account wissen mislukt. Neem contact op met support.',
      })
    }

    return json(200, { ok: true, message: 'Account verwijderd.' })
  } catch (e) {
    console.error('delete-account', e)
    return json(500, {
      error: 'internal',
      message: e instanceof Error ? e.message : 'Onbekende fout',
    })
  }
})
