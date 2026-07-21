/** Shared constants and API error shapes for accounts / entitlements. */

export const FREE_PRIVATE_MODEL_LIMIT = Number(
  import.meta.env.VITE_FREE_PRIVATE_MODEL_LIMIT ?? 3,
) || 3

export type ApiErrorCode =
  | 'paid_required'
  | 'save_limit'
  | 'not_found'
  | 'unauthorized'
  | 'validation'
  | 'not_configured'
  | 'unknown'

export class ApiError extends Error {
  code: ApiErrorCode

  constructor(code: ApiErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

/** NL message for save_limit; optional explicit cap from RPC (`save_limit:3`). */
export function saveLimitMessage(limit?: number | null): string {
  const n =
    typeof limit === 'number' && Number.isFinite(limit) && limit >= 0
      ? Math.floor(limit)
      : FREE_PRIVATE_MODEL_LIMIT
  return `Je hebt het maximum van ${n} opgeslagen privémodellen bereikt. Upgrade je abonnement of verwijder een model.`
}

export function parseRpcError(err: unknown): ApiError {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  if (lower.includes('save_limit')) {
    const match = msg.match(/save_limit:(\d+)/i)
    const parsed = match ? Number(match[1]) : undefined
    return new ApiError('save_limit', saveLimitMessage(parsed))
  }
  if (lower.includes('paid_required')) {
    return new ApiError('paid_required', 'Deze actie vereist een maandabonnement.')
  }
  if (lower.includes('not_found') || lower.includes('p0002')) {
    return new ApiError('not_found', 'Model niet gevonden.')
  }
  if (lower.includes('unauthorized') || lower.includes('42501')) {
    return new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  }
  if (lower.includes('validation')) {
    return new ApiError(
      'validation',
      'Stel eerst een weergavenaam in via het accountmenu om te publiceren.',
    )
  }
  return new ApiError('unknown', msg || 'Er ging iets mis.')
}

/** @deprecated use parseRpcError */
export const mapRpcError = parseRpcError
