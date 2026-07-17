import { CookieJar, parseFormKey, shopFetch } from './client.ts'

/**
 * Log in op de shop en geef cookie-header voor browser-proxy (/shop).
 * Belangrijk: Magento valideert sessies op User-Agent. Log daarom in met
 * dezelfde UA als de browser die de sessie gaat gebruiken.
 */
export async function loginAndExportCookieHeader(
  email: string,
  password: string,
  userAgent?: string,
): Promise<string> {
  const jar = new CookieJar()
  const uaHeaders: Record<string, string> = userAgent ? { 'User-Agent': userAgent } : {}
  const loginPage = await shopFetch(jar, '/customer/account/login/', { headers: uaHeaders })
  const formKey = parseFormKey(await loginPage.text())
  if (!formKey) throw new Error('Kon form_key niet lezen op loginpagina.')

  await shopFetch(jar, '/customer/account/loginPost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...uaHeaders },
    body: new URLSearchParams({
      form_key: formKey,
      'login[username]': email,
      'login[password]': password,
    }),
  })

  const cookie = jar.header()
  if (!cookie) throw new Error('Geen sessiecookie na inloggen.')
  return cookie
}

/** Zet shop-cookies op localhost zodat /shop-proxy ze meestuurt (geen Secure: http localhost). */
export function setProxyCookies(res: { setHeader: (name: string, value: string) => void }, cookieHeader: string) {
  for (const part of cookieHeader.split(';')) {
    const segment = part.trim()
    const eq = segment.indexOf('=')
    if (eq <= 0) continue
    const name = segment.slice(0, eq).trim()
    const value = segment.slice(eq + 1).trim()
    if (!name) continue
    res.setHeader('Set-Cookie', `${name}=${value}; Path=/shop; SameSite=Lax`)
  }
}

export function rewriteProxySetCookies(headers: { 'set-cookie'?: string | string[] }) {
  const raw = headers['set-cookie']
  if (!raw) return
  const list = Array.isArray(raw) ? raw : [raw]
  headers['set-cookie'] = list.map((cookie) =>
    cookie
      .replace(/;\s*secure/gi, '')
      .replace(/domain=[^;]+/gi, 'Domain=localhost')
      .replace(/;\s*path=\/(?=;|$)/gi, '; Path=/shop'),
  )
}
