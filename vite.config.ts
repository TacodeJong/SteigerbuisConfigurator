import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { groothandelCartApiPlugin } from './server/groothandelCartApi.ts'
import { rewriteProxySetCookies } from './server/magento/proxySession.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), groothandelCartApiPlugin()],
  server: {
    proxy: {
      '/shop': {
        target: 'https://www.steigerbuisgroothandel.nl',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/shop/, ''),
        cookieDomainRewrite: 'localhost',
        cookiePathRewrite: { '/': '/shop' },
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            rewriteProxySetCookies(proxyRes.headers as { 'set-cookie'?: string | string[] })
            const location = proxyRes.headers.location
            if (typeof location === 'string' && location.includes('steigerbuisgroothandel.nl')) {
              proxyRes.headers.location = location.replace('https://www.steigerbuisgroothandel.nl', '/shop')
            }
          })
        },
      },
    },
  },
})
