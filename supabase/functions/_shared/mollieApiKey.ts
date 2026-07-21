/**
 * Resolve Mollie API key from Edge secrets + app_settings.mollie_mode.
 * Never store or return keys to clients — Edge-only.
 *
 * Secrets (priority per mode):
 * - test → MOLLIE_API_KEY_TEST, else MOLLIE_API_KEY only if it starts with test_
 * - live → MOLLIE_API_KEY_LIVE, else MOLLIE_API_KEY only if it starts with live_
 * - Explicit mode NEVER silently uses the wrong-mode key (no test payments in live).
 * - setting ontbreekt → alleen MOLLIE_API_KEY (legacy gedrag)
 */

export type MollieMode = 'test' | 'live'

export const MOLLIE_MODE_SETTING_KEY = 'mollie_mode'

type SettingsClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        maybeSingle: () => Promise<{ data: { value: unknown } | null; error: unknown }>
      }
    }
  }
}

export function parseMollieMode(value: unknown): MollieMode | null {
  if (value === 'test' || value === 'live') return value
  if (typeof value === 'string') {
    const t = value.trim().replace(/^"|"$/g, '')
    if (t === 'test' || t === 'live') return t
  }
  return null
}

export async function fetchMollieModeFromSettings(
  client: SettingsClient,
): Promise<MollieMode | null> {
  const { data, error } = await client
    .from('app_settings')
    .select('value')
    .eq('key', MOLLIE_MODE_SETTING_KEY)
    .maybeSingle()
  if (error) {
    console.warn('mollie_mode fetch', error)
    return null
  }
  return parseMollieMode(data?.value)
}

export type MollieKeyOk = { ok: true; mode: MollieMode; apiKey: string }
export type MollieKeyErr = { ok: false; mode: MollieMode | null; message: string }
export type MollieKeyResult = MollieKeyOk | MollieKeyErr

function envTrim(name: string): string {
  return (Deno.env.get(name) ?? '').trim()
}

/** Infer test/live from key prefix; default test when unknown. */
export function inferModeFromApiKey(apiKey: string): MollieMode {
  if (apiKey.startsWith('live_')) return 'live'
  return 'test'
}

/**
 * @param mode - from app_settings or payment metadata; null = legacy MOLLIE_API_KEY only
 */
export function resolveMollieApiKey(mode: MollieMode | null): MollieKeyResult {
  const testKey = envTrim('MOLLIE_API_KEY_TEST')
  const liveKey = envTrim('MOLLIE_API_KEY_LIVE')
  const legacyKey = envTrim('MOLLIE_API_KEY')

  if (mode === 'test') {
    if (testKey) {
      if (!testKey.startsWith('test_')) {
        return {
          ok: false,
          mode: 'test',
          message:
            'MOLLIE_API_KEY_TEST moet met test_ beginnen. Controleer het Edge Function secret.',
        }
      }
      return { ok: true, mode: 'test', apiKey: testKey }
    }
    if (legacyKey.startsWith('test_')) {
      return { ok: true, mode: 'test', apiKey: legacyKey }
    }
    if (legacyKey) {
      return {
        ok: false,
        mode: 'test',
        message:
          'Mollie-modus is test, maar MOLLIE_API_KEY_TEST ontbreekt. Legacy MOLLIE_API_KEY is geen test-sleutel (moet met test_ beginnen).',
      }
    }
    return {
      ok: false,
      mode: 'test',
      message:
        'Mollie-modus is test, maar MOLLIE_API_KEY_TEST ontbreekt. Zet die als Supabase Edge secret (begint met test_).',
    }
  }

  if (mode === 'live') {
    if (liveKey) {
      if (!liveKey.startsWith('live_')) {
        return {
          ok: false,
          mode: 'live',
          message:
            'MOLLIE_API_KEY_LIVE moet met live_ beginnen. Controleer het Edge Function secret.',
        }
      }
      return { ok: true, mode: 'live', apiKey: liveKey }
    }
    if (legacyKey.startsWith('live_')) {
      return { ok: true, mode: 'live', apiKey: legacyKey }
    }
    if (legacyKey) {
      return {
        ok: false,
        mode: 'live',
        message:
          'Mollie-modus is live, maar MOLLIE_API_KEY_LIVE ontbreekt. Legacy MOLLIE_API_KEY is geen live-sleutel — checkout weigert stil te vallen op test. Zet MOLLIE_API_KEY_LIVE (begint met live_) als Edge secret.',
      }
    }
    return {
      ok: false,
      mode: 'live',
      message:
        'Mollie-modus is live, maar MOLLIE_API_KEY_LIVE ontbreekt. Zet die als Supabase Edge secret (begint met live_).',
    }
  }

  // Setting ontbreekt → legacy gedrag
  if (legacyKey) {
    return { ok: true, mode: inferModeFromApiKey(legacyKey), apiKey: legacyKey }
  }

  // Geen setting én geen legacy: probeer mode-specifieke keys (default test)
  if (testKey) {
    if (!testKey.startsWith('test_')) {
      return {
        ok: false,
        mode: null,
        message:
          'MOLLIE_API_KEY_TEST moet met test_ beginnen. Controleer het Edge Function secret.',
      }
    }
    return { ok: true, mode: 'test', apiKey: testKey }
  }
  if (liveKey) {
    if (!liveKey.startsWith('live_')) {
      return {
        ok: false,
        mode: null,
        message:
          'MOLLIE_API_KEY_LIVE moet met live_ beginnen. Controleer het Edge Function secret.',
      }
    }
    return { ok: true, mode: 'live', apiKey: liveKey }
  }

  return {
    ok: false,
    mode: null,
    message:
      'Zet MOLLIE_API_KEY_TEST en/of MOLLIE_API_KEY_LIVE (of legacy MOLLIE_API_KEY) als Supabase Edge secret.',
  }
}

/**
 * Fetch a Mollie payment using the mode that created it when possible.
 * Order: preferredMode (metadata/settings) → other mode → legacy.
 */
export async function fetchMolliePaymentWithMode(
  paymentId: string,
  preferredMode: MollieMode | null,
): Promise<
  | { ok: true; payment: Record<string, unknown>; mode: MollieMode }
  | { ok: false; status: number; message: string }
> {
  const modesToTry: MollieMode[] =
    preferredMode === 'live'
      ? ['live', 'test']
      : preferredMode === 'test'
        ? ['test', 'live']
        : ['test', 'live']

  const tried = new Set<string>()
  let lastStatus = 502
  let lastDetail = 'Mollie payment ophalen mislukt'

  for (const mode of modesToTry) {
    const resolved = resolveMollieApiKey(mode)
    if (!resolved.ok) continue
    if (tried.has(resolved.apiKey)) continue
    tried.add(resolved.apiKey)

    const res = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${resolved.apiKey}` },
    })
    if (res.ok) {
      const payment = (await res.json()) as Record<string, unknown>
      const metaMode = parseMollieMode(
        (payment.metadata as Record<string, unknown> | undefined)?.mollie_mode,
      )
      // If metadata asks for the other mode and we have that key, re-fetch
      if (metaMode && metaMode !== mode) {
        const correct = resolveMollieApiKey(metaMode)
        if (correct.ok && !tried.has(correct.apiKey)) {
          tried.add(correct.apiKey)
          const res2 = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${correct.apiKey}` },
          })
          if (res2.ok) {
            return {
              ok: true,
              payment: (await res2.json()) as Record<string, unknown>,
              mode: metaMode,
            }
          }
        }
      }
      return { ok: true, payment, mode: metaMode ?? mode }
    }
    lastStatus = res.status
    lastDetail = `Mollie HTTP ${res.status}`
    // 401/404 = wrong mode key; try next. Other errors: still try other mode once.
    if (res.status !== 401 && res.status !== 404 && res.status !== 403) {
      // Keep trying other mode for 404-like mismatches; for 5xx stop after both
    }
  }

  // Last resort: legacy-only resolve (mode null)
  const legacy = resolveMollieApiKey(null)
  if (legacy.ok && !tried.has(legacy.apiKey)) {
    const res = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${legacy.apiKey}` },
    })
    if (res.ok) {
      const payment = (await res.json()) as Record<string, unknown>
      const metaMode = parseMollieMode(
        (payment.metadata as Record<string, unknown> | undefined)?.mollie_mode,
      )
      return { ok: true, payment, mode: metaMode ?? legacy.mode }
    }
    lastStatus = res.status
  }

  return {
    ok: false,
    status: lastStatus >= 400 ? lastStatus : 502,
    message: `${lastDetail}. Controleer MOLLIE_API_KEY_TEST / MOLLIE_API_KEY_LIVE en mollie_mode.`,
  }
}
