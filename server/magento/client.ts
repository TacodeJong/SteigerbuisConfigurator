/** Eenvoudige cookie-jar voor server-side fetch naar Magento. */
export class CookieJar {
  private store = new Map<string, string>()

  ingest(response: Response) {
    const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
    const raw =
      typeof getSetCookie === 'function'
        ? getSetCookie.call(response.headers)
        : (response.headers.get('set-cookie')?.split(/,(?=\s*[^;,]+=)/) ?? [])

    for (const part of raw) {
      const segment = part.split(';')[0]?.trim()
      if (!segment || !segment.includes('=')) continue
      const eq = segment.indexOf('=')
      const name = segment.slice(0, eq).trim()
      const value = segment.slice(eq + 1).trim()
      if (name) this.store.set(name, value)
    }
  }

  header(): string | undefined {
    if (this.store.size === 0) return undefined
    return [...this.store.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  clear() {
    this.store.clear()
  }
}

export const SHOP_ORIGIN = 'https://www.steigerbuisgroothandel.nl'
const USER_AGENT = 'SteigerbuisConfigurator/1.0 (local-cart)'

/**
 * Fetch met cookie-jar. Volgt redirects handmatig zodat Set-Cookie headers
 * van tussenliggende 302-responses (bijv. sessie-regeneratie na login) niet
 * verloren gaan — automatische redirect-follow gooit die weg.
 */
export async function shopFetch(
  jar: CookieJar,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  let url = path.startsWith('http') ? path : `${SHOP_ORIGIN}${path}`
  let method = init.method ?? 'GET'
  let body = init.body

  for (let hop = 0; hop < 10; hop++) {
    const headers = new Headers(init.headers)
    if (!headers.has('User-Agent')) headers.set('User-Agent', USER_AGENT)
    const cookie = jar.header()
    if (cookie) headers.set('Cookie', cookie)

    const res = await fetch(url, { method, headers, body, redirect: 'manual' })
    jar.ingest(res)

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) return res
      url = location.startsWith('http') ? location : `${SHOP_ORIGIN}${location}`
      method = 'GET'
      body = undefined
      continue
    }
    return res
  }
  throw new Error(`Te veel redirects voor ${path}`)
}

export function parseFormKey(html: string): string | null {
  const m = html.match(/name="form_key"\s+type="hidden"\s+value="([^"]+)"/)
    ?? html.match(/name="form_key"[^>]*value="([^"]+)"/)
  return m?.[1] ?? null
}

export interface AddToCartForm {
  action: string
  productId: string
  formKey: string
  lengthFieldName?: string
  shapeId?: string
  shapeFormula?: string
  unitPricePerMm?: number
}

function parseDppcConfig(html: string): Pick<AddToCartForm, 'shapeId' | 'shapeFormula' | 'unitPricePerMm' | 'lengthFieldName'> {
  const lengthFieldName = html.match(/name="(side_options\[\d+\]\[\d+\]\[lengte\])"/)?.[1]
  const shapeId = lengthFieldName?.match(/\[(\d+)\]\[lengte\]$/)?.[1]
    ?? html.match(/name="side_options\[\d+\]\[(\d+)\]\[lengte\]"/)?.[1]
  const dppcBlock = html.match(/"dppc":\s*\{[\s\S]*?"config":\s*\{[\s\S]*?\}\s*\}/)?.[0]
  const shapeFormula = dppcBlock?.match(/"formula":\s*\{[^}]*"(\d+)":\s*"([^"]+)"/)
  const formula = shapeFormula?.[2] ?? (shapeId ? 'lengte' : undefined)
  const unitPricePerMm = dppcBlock
    ? Number(dppcBlock.match(/"unitPrice":\s*([0-9.]+)/)?.[1])
  : undefined

  return {
    lengthFieldName,
    shapeId,
    shapeFormula: formula,
    unitPricePerMm: Number.isFinite(unitPricePerMm) ? unitPricePerMm : undefined,
  }
}

/** Parse het add-to-cart formulier van een productpagina. */
export function parseAddToCartForm(html: string): AddToCartForm | null {
  const formKey = parseFormKey(html)
  const productId = html.match(/name="product"\s+value="(\d+)"/)?.[1]
  const action = html.match(
    /action="(https:\/\/www\.steigerbuisgroothandel\.nl\/checkout\/cart\/add\/[^"]+)"/,
  )?.[1]
  const dppc = parseDppcConfig(html)

  if (!formKey || !productId || !action) return null
  return { action, productId, formKey, ...dppc }
}

export function pipeLengthMm(lineKey: string): number | null {
  const m = /^pipe:(\d+)$/.exec(lineKey)
  return m ? Number(m[1]) : null
}

export function shopProductPath(productUrl: string): string {
  if (productUrl.startsWith(SHOP_ORIGIN)) {
    return productUrl.slice(SHOP_ORIGIN.length) || '/'
  }
  return productUrl.startsWith('/') ? productUrl : `/${productUrl}`
}

export function buildAddToCartParams(
  form: AddToCartForm,
  line: { kind: 'pipe' | 'fitting'; quantity: number; lineKey: string },
): URLSearchParams {
  const params = new URLSearchParams()
  params.set('form_key', form.formKey)
  params.set('product', form.productId)
  params.set('qty', String(line.quantity))

  if (line.kind === 'pipe') {
    if (!form.lengthFieldName || !form.shapeId) {
      throw new Error('Product vereist lengte maar formulier mist DPPC-velden')
    }
    const lengthMm = pipeLengthMm(line.lineKey)
    if (lengthMm == null) throw new Error(`Geen geldige buislengte voor ${line.lineKey}`)
    if (lengthMm < 50) throw new Error(`Lengte ${lengthMm} mm te kort (min. 50 mm)`)

    params.set('item', form.productId)
    params.set(form.lengthFieldName, String(lengthMm))
    params.set(`shape_options[${form.productId}]`, form.shapeId)
    params.set('selected_shape', form.shapeId)
    params.set('selected_shape_formula', form.shapeFormula ?? 'lengte')
    params.set('option-area-mm', String(lengthMm))
    const rate = form.unitPricePerMm ?? 0.0069
    params.set('dppc_price', (lengthMm * rate).toFixed(2))
  }

  return params
}

export function rewriteShopActionForProxy(action: string, proxyPrefix = '/shop'): string {
  if (action.startsWith(SHOP_ORIGIN)) {
    return `${proxyPrefix}${action.slice(SHOP_ORIGIN.length)}`
  }
  return action.startsWith('/') ? `${proxyPrefix}${action}` : action
}
