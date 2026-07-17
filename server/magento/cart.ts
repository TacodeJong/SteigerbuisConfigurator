import {
  CookieJar,
  parseAddToCartForm,
  parseFormKey,
  buildAddToCartParams,
  shopFetch,
  SHOP_ORIGIN,
  type AddToCartForm,
} from './client.ts'

export interface CartLineInput {
  lineKey: string
  kind: 'pipe' | 'fitting'
  quantity: number
  productUrl?: string
}

export interface FillCartResult {
  ok: boolean
  added: number
  skipped: number
  errors: string[]
  cartUrl: string
}

function envCredentials(): { email: string; password: string } {
  const email = process.env.STEIGERBUISGROOTHANDEL_EMAIL?.trim()
  const password = process.env.STEIGERBUISGROOTHANDEL_PASSWORD
  if (!email || !password) {
    throw new Error(
      'Zet STEIGERBUISGROOTHANDEL_EMAIL en STEIGERBUISGROOTHANDEL_PASSWORD in .env (zie .env.example).',
    )
  }
  return { email, password }
}

async function login(jar: CookieJar, email: string, password: string): Promise<void> {
  const loginPage = await shopFetch(jar, '/customer/account/login/')
  const html = await loginPage.text()
  const formKey = parseFormKey(html)
  if (!formKey) throw new Error('Kon form_key niet lezen op loginpagina.')

  const body = new URLSearchParams({
    form_key: formKey,
    'login[username]': email,
    'login[password]': password,
  })

  const res = await shopFetch(jar, '/customer/account/loginPost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const after = await res.text()
  if (after.includes('login[username]') && after.includes('Het inloggen')) {
    throw new Error('Inloggen mislukt — controleer e-mail en wachtwoord in .env.')
  }
  if (!jar.header()?.includes('PHPSESSID')) {
    // sommige installs gebruiken andere sessienaam; doorgaan als redirect slaagde
  }
}

const formCache = new Map<string, AddToCartForm>()

async function loadAddForm(jar: CookieJar, productUrl: string): Promise<AddToCartForm> {
  const path = productUrl.startsWith('http')
    ? productUrl.replace(SHOP_ORIGIN, '')
    : productUrl

  const res = await shopFetch(jar, path)
  if (!res.ok) throw new Error(`Productpagina ${productUrl} → HTTP ${res.status}`)
  const html = await res.text()
  const form = parseAddToCartForm(html)
  if (!form) throw new Error(`Geen winkelwagenformulier op ${productUrl}`)
  formCache.set(productUrl, form)
  return form
}

async function cartItemCount(jar: CookieJar): Promise<number> {
  const res = await shopFetch(jar, '/checkout/cart/')
  const html = await res.text()
  return (html.match(/class="item-info"/g) || []).length
}

async function addLine(
  jar: CookieJar,
  line: CartLineInput,
  form: AddToCartForm,
): Promise<void> {
  const params = buildAddToCartParams(form, line)
  const before = await cartItemCount(jar)

  const res = await shopFetch(jar, form.action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })

  if (!res.ok && res.status !== 302) {
    throw new Error(`Toevoegen product ${form.productId} → HTTP ${res.status}`)
  }

  const body = await res.text()
  const pageErrors = [...body.matchAll(/message-error[\s\S]*?<div[^>]*>([^<]+)/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean)
  if (pageErrors.length > 0) {
    throw new Error(pageErrors.join('; '))
  }

  const after = await cartItemCount(jar)
  if (after <= before) {
    throw new Error('Product niet in winkelwagen — controleer lengte en productpagina')
  }
}

export async function fillGroothandelCart(lines: CartLineInput[]): Promise<FillCartResult> {
  const { email, password } = envCredentials()
  const jar = new CookieJar()
  formCache.clear()

  await login(jar, email, password)

  let added = 0
  let skipped = 0
  const errors: string[] = []

  for (const line of lines) {
    if (!line.productUrl) {
      skipped++
      errors.push(`${line.lineKey}: geen product-URL`)
      continue
    }
    try {
      const form = await loadAddForm(jar, line.productUrl)
      await addLine(jar, line, form)
      added++
      await new Promise((r) => setTimeout(r, 400))
    } catch (err) {
      skipped++
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${line.lineKey}: ${msg}`)
    }
  }

  return {
    ok: added > 0,
    added,
    skipped,
    errors,
    cartUrl: `${SHOP_ORIGIN}/checkout/cart/`,
  }
}
