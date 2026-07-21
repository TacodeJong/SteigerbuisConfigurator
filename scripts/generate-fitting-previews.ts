/**
 * Seed standaard koppeling-previews (JPEG) naar public/fittings/v1/
 * en optioneel upload naar Supabase Storage bucket `fitting-previews`.
 *
 * Vereist: draaiende Vite-devserver (script start die zelf) + Chromium via Playwright.
 *
 * Usage:
 *   npm run generate-fitting-previews
 *   npm run generate-fitting-previews -- --upload   # needs SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL
 *   npm run generate-fitting-previews -- --port 5174
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outDir = path.join(root, 'public', 'fittings', 'v1')

const ASSET_VERSION = 'v1'
const BUCKET = 'fitting-previews'

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function argValue(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]!
  return fallback
}

function loadDotEnv(): void {
  const envPath = path.join(root, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    const key = m[1]!.trim()
    let val = m[2]!.trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 404) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`Dev server niet bereikbaar op ${url}`)
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const m = dataUrl.match(/^data:image\/jpeg;base64,(.+)$/)
  if (!m) throw new Error('Ongeldige JPEG data-URL')
  return Buffer.from(m[1]!, 'base64')
}

async function uploadToStorage(
  files: { objectPath: string; bytes: Buffer }[],
): Promise<void> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      'Upload vereist VITE_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY (niet committen).',
    )
  }

  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  for (const file of files) {
    const { error } = await admin.storage.from(BUCKET).upload(file.objectPath, file.bytes, {
      contentType: 'image/jpeg',
      upsert: true,
    })
    if (error) throw new Error(`Upload ${file.objectPath}: ${error.message}`)
    console.log(`  uploaded ${file.objectPath}`)
  }
}

async function main(): Promise<void> {
  loadDotEnv()
  const doUpload = argFlag('upload')
  const port = argValue('port', '5173')
  const base = `http://127.0.0.1:${port}`
  const genUrl = `${base}/?view=fitting-preview-gen`

  await mkdir(outDir, { recursive: true })

  let child: ChildProcess | null = null
  let startedByUs = false

  try {
    await waitForServer(base, 2000)
    console.log(`Dev server al actief op ${base}`)
  } catch {
    console.log(`Start Vite op poort ${port}…`)
    startedByUs = true
    child = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', port], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })
    const logPath = path.join(root, 'scripts', '.fitting-preview-gen.log')
    const log = createWriteStream(logPath)
    child.stdout?.pipe(log)
    child.stderr?.pipe(log)
    await waitForServer(base, 60_000)
  }

  console.log(`Open generator: ${genUrl}`)
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
  })
  const page = await browser.newPage()
  page.setDefaultTimeout(600_000)
  await page.goto(genUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 })

  await page.waitForFunction(
    () => {
      const meta = (window as unknown as { __FITTING_PREVIEWS_META__?: { ready?: boolean; error?: string } })
        .__FITTING_PREVIEWS_META__
      return Boolean(meta?.ready || meta?.error)
    },
    undefined,
    { timeout: 600_000 },
  )

  const meta = await page.evaluate(() => {
    return (window as unknown as { __FITTING_PREVIEWS_META__?: Record<string, unknown> })
      .__FITTING_PREVIEWS_META__
  })
  if (meta?.error) {
    throw new Error(`Generator fout: ${String(meta.error)}`)
  }

  const previews = await page.evaluate(() => {
    return (window as unknown as { __FITTING_PREVIEWS__?: Record<string, string> })
      .__FITTING_PREVIEWS__
  })
  await browser.close()

  if (!previews || Object.keys(previews).length === 0) {
    throw new Error('Geen previews ontvangen van de generator-pagina')
  }

  const manifest = {
    version: ASSET_VERSION,
    generatedAt: new Date().toISOString(),
    count: Object.keys(previews).length,
    files: Object.keys(previews).sort(),
  }

  const uploadBatch: { objectPath: string; bytes: Buffer }[] = []

  for (const [fileName, dataUrl] of Object.entries(previews)) {
    const bytes = dataUrlToBuffer(dataUrl)
    const dest = path.join(outDir, fileName)
    await writeFile(dest, bytes)
    console.log(`  wrote public/fittings/${ASSET_VERSION}/${fileName} (${bytes.length} B)`)
    uploadBatch.push({ objectPath: `${ASSET_VERSION}/${fileName}`, bytes })
  }

  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`Manifest: ${manifest.count} files → public/fittings/${ASSET_VERSION}/manifest.json`)

  if (doUpload) {
    console.log(`Upload naar Storage bucket "${BUCKET}"…`)
    await uploadToStorage(uploadBatch)
  } else {
    console.log('Tip: voeg --upload toe om naar Supabase Storage te syncen (service role).')
  }

  if (startedByUs && child?.pid) {
    child.kill('SIGTERM')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
