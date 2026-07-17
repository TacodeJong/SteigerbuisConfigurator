import type { Plugin } from 'vite'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loginAndExportCookieHeader, setProxyCookies } from './magento/proxySession.ts'

function loadDotEnv(root: string) {
  const path = resolve(root, '.env')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}

export function groothandelCartApiPlugin(): Plugin {
  return {
    name: 'groothandel-cart-api',
    configureServer(server) {
      loadDotEnv(server.config.root)

      server.middlewares.use('/api/groothandel/proxy-session', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        void (async () => {
          try {
            const email = process.env.STEIGERBUISGROOTHANDEL_EMAIL?.trim()
            const password = process.env.STEIGERBUISGROOTHANDEL_PASSWORD
            if (!email || !password) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  ok: false,
                  error: 'Zet STEIGERBUISGROOTHANDEL_EMAIL en STEIGERBUISGROOTHANDEL_PASSWORD in .env.',
                }),
              )
              return
            }

            // Magento bindt de sessie aan de User-Agent: log in met de UA van de browser.
            const browserUa = req.headers['user-agent']
            const cookieHeader = await loginAndExportCookieHeader(email, password, browserUa)
            setProxyCookies(res, cookieHeader)
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch (err) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                ok: false,
                error: err instanceof Error ? err.message : 'Inloggen mislukt',
              }),
            )
          }
        })()
      })
    },
  }
}
