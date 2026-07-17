import type { SupplierQuote } from './types'
import {
  buildAddToCartParams,
  parseAddToCartForm,
  parseFormKey,
  rewriteShopActionForProxy,
  shopProductPath,
} from '../../../server/magento/client.ts'

const SHOP_PROXY = '/shop'
const CART_PATH = `${SHOP_PROXY}/checkout/cart/`

export interface GroothandelCartResponse {
  ok: boolean
  added?: number
  skipped?: number
  errors?: string[]
  cartUrl?: string
  error?: string
}

export interface GroothandelCartLine {
  lineKey: string
  kind: 'pipe' | 'fitting'
  quantity: number
  productUrl?: string
}

export function groothandelCartableLines(quote: SupplierQuote) {
  return quote.lines.filter((l) => l.productUrl)
}

export function canFillGroothandelCart(quote: SupplierQuote): boolean {
  return quote.supplierId === 'steigerbuisgroothandel' && groothandelCartableLines(quote).length > 0
}

function postForm(action: string, fields: Record<string, string>): Promise<Response> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) params.set(key, value)
  return fetch(action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    credentials: 'include',
    body: params,
  })
}

async function isLoggedIn(): Promise<boolean> {
  const res = await fetch(`${SHOP_PROXY}/customer/account/`, { credentials: 'include' })
  const html = await res.text()
  return /customer-account-navigation|account-nav|Uitloggen|logout/i.test(html)
}

/** Log in op de shop via browser-proxy (.env credentials via dev-API). */
async function ensureProxySession(): Promise<void> {
  if (await isLoggedIn()) return

  const credRes = await fetch('/api/groothandel/proxy-session', { method: 'POST', credentials: 'include' })
  const credData = (await credRes.json()) as { ok?: boolean; email?: string; password?: string; error?: string }
  if (!credRes.ok || !credData.ok || !credData.email || !credData.password) {
    throw new Error(credData.error ?? 'Kon inloggegevens niet ophalen (.env).')
  }

  const loginPage = await fetch(`${SHOP_PROXY}/customer/account/login/`, { credentials: 'include' })
  const loginHtml = await loginPage.text()
  const formKey = parseFormKey(loginHtml)
  if (!formKey) throw new Error('Kon loginformulier niet lezen.')

  await postForm(`${SHOP_PROXY}/customer/account/loginPost/`, {
    form_key: formKey,
    'login[username]': credData.email,
    'login[password]': credData.password,
  })

  if (!(await isLoggedIn())) {
    throw new Error('Inloggen mislukt — controleer .env-gegevens.')
  }
}

async function cartItemCount(): Promise<number> {
  const res = await fetch(CART_PATH, { credentials: 'include' })
  const html = await res.text()
  if (html.includes('cart-empty') || html.includes('geen product')) return 0
  return (html.match(/class="item-info"/g) || []).length
}

async function loadAddForm(productUrl: string) {
  const path = shopProductPath(productUrl)
  const res = await fetch(`${SHOP_PROXY}${path}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Productpagina niet bereikbaar (${res.status})`)
  const html = await res.text()
  const form = parseAddToCartForm(html)
  if (!form) throw new Error('Geen winkelwagenformulier op productpagina')
  return form
}

async function addLine(line: GroothandelCartLine): Promise<void> {
  if (!line.productUrl) throw new Error('Geen product-URL')

  const form = await loadAddForm(line.productUrl)
  const params = buildAddToCartParams(form, line)
  const before = await cartItemCount()

  const res = await fetch(rewriteShopActionForProxy(form.action, SHOP_PROXY), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    credentials: 'include',
    body: params,
  })

  if (!res.ok && res.status !== 302) {
    throw new Error(`Toevoegen mislukt (HTTP ${res.status})`)
  }

  const body = await res.text()
  const pageErrors = [...body.matchAll(/message-error[\s\S]*?<div[^>]*>([^<]+)/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean)
  if (pageErrors.length > 0) {
    throw new Error(pageErrors.join('; '))
  }

  const after = await cartItemCount()
  if (after <= before) {
    throw new Error('Product niet in winkelwagen — controleer lengte of productpagina')
  }
}

/**
 * Vult de winkelwagen via de browser (shop-proxy), één product per keer.
 * Gebruikt .env-inloggegevens; winkelwagen opent op localhost/shop/checkout/cart/.
 */
export async function submitGroothandelCart(quote: SupplierQuote): Promise<GroothandelCartResponse> {
  const lines = groothandelCartableLines(quote).map((line) => ({
    lineKey: line.lineKey,
    kind: line.kind,
    quantity: line.quantity,
    productUrl: line.productUrl,
  }))

  try {
    await ensureProxySession()
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Shop-sessie mislukt',
      cartUrl: CART_PATH,
    }
  }

  let added = 0
  let skipped = 0
  const errors: string[] = []

  for (const line of lines) {
    try {
      await addLine(line)
      added++
      await new Promise((r) => setTimeout(r, 500))
    } catch (err) {
      skipped++
      errors.push(`${line.lineKey}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return {
    ok: added > 0,
    added,
    skipped,
    errors,
    cartUrl: CART_PATH,
  }
}
