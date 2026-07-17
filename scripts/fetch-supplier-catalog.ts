/**
 * Haalt volledige fitting-catalogi op via leveranciers-API's en schrijft naar src/data/catalogs/.
 * Draai: npm run fetch-catalog
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FittingType } from '../src/types'
import {
  mapSupplierFittingProduct,
  type SupplierMaterialFamily,
} from '../src/lib/suppliers/fittingProductMapper'
import { listFittingPriceSources } from '../src/data/supplierPriceSources'
import type { SupplierFittingCatalogFile, SupplierFittingProduct } from '../src/data/supplierFittingCatalog'

const VAT_RATE = 0.21
const __dirname = dirname(fileURLToPath(import.meta.url))
const CATALOG_DIR = join(__dirname, '../src/data/catalogs')
const GROOTHANDEL_BASE = 'https://www.steigerbuisgroothandel.nl'

const USER_AGENT = 'SteigerbuisConfigurator/1.0 (catalog-sync)'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json() as Promise<T>
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.text()
}

function buildStats(products: SupplierFittingProduct[]): SupplierFittingCatalogFile['stats'] {
  const byFittingType: Partial<Record<FittingType, number>> = {}
  let mapped = 0
  let editorCompatible = 0
  for (const p of products) {
    if (p.fittingType) {
      mapped++
      byFittingType[p.fittingType] = (byFittingType[p.fittingType] ?? 0) + 1
    }
    if (p.editorCompatible) editorCompatible++
  }
  return { total: products.length, mapped, editorCompatible, byFittingType }
}

function dedupeProducts(products: SupplierFittingProduct[]): SupplierFittingProduct[] {
  const bySlug = new Map<string, SupplierFittingProduct>()
  for (const p of products) {
    const existing = bySlug.get(p.slug)
    if (!existing || (p.fittingType && !existing.fittingType)) {
      bySlug.set(p.slug, p)
    }
  }
  return [...bySlug.values()]
}

// ── Steigerbuisstunter (Shopify) ─────────────────────────────────────────────

interface ShopifyProduct {
  id: number
  title: string
  handle: string
  variants: { sku: string; price: string }[]
}

async function fetchStunter(): Promise<SupplierFittingProduct[]> {
  const products: SupplierFittingProduct[] = []
  const base = 'https://www.steigerbuisstunter.nl'
  let page = 1
  while (true) {
    const url = `${base}/collections/buiskoppelingen/products.json?limit=250&page=${page}`
    const data = await fetchJson<{ products: ShopifyProduct[] }>(url)
    if (!data.products.length) break
    for (const p of data.products) {
      const mapped = mapSupplierFittingProduct(p.title, p.handle)
      const price = parseFloat(p.variants[0]?.price ?? '0')
      products.push({
        slug: p.handle,
        name: p.title,
        url: `${base}/products/${p.handle}`,
        fittingType: mapped.fittingType,
        diameter: mapped.diameter,
        materialFamily: mapped.materialFamily,
        priceExVat: price > 0 ? price : null,
        sku: p.variants[0]?.sku || null,
        editorCompatible: mapped.editorCompatible,
      })
    }
    if (data.products.length < 250) break
    page++
    await sleep(200)
  }
  return dedupeProducts(products)
}

// ── Buiskoppelen (WooCommerce Store API) ─────────────────────────────────────

interface WcProduct {
  id: number
  name: string
  slug: string
  permalink: string
  sku: string
  prices: { price: string; currency_minor_unit: number }
}

/** Relevante WooCommerce categorieën voor ronde steigerbuis-koppelingen. */
const BUISKOPPELEN_CATEGORIES = [
  45, // alle buiskoppelingen
  55, // staal
  95, // zwart
  608, // onbehandeld
  635, // gekleurd
  1404, // outdoor zwart
  1738, // kniestukken
  1739, // koppelstukken
  1740, // voetplaten
  1742, // hoekstukken
  1743, // kruisstukken
  1745, // scharnierstukken
  1749, // afdekdoppen
]

async function fetchBuiskoppelen(): Promise<SupplierFittingProduct[]> {
  const products: SupplierFittingProduct[] = []
  const seen = new Set<number>()

  for (const categoryId of BUISKOPPELEN_CATEGORIES) {
    let page = 1
    while (true) {
      const url = `https://buiskoppelen.nl/wp-json/wc/store/v1/products?category=${categoryId}&per_page=100&page=${page}`
      const batch = await fetchJson<WcProduct[]>(url)
      if (!batch.length) break
      for (const p of batch) {
        if (seen.has(p.id)) continue
        seen.add(p.id)
        const plainName = p.name.replace(/&#\d+;/g, ' ').replace(/×/g, 'x')
        const mapped = mapSupplierFittingProduct(plainName, p.slug)
        if (!mapped.fittingType && !plainName.toLowerCase().includes('buiskoppeling')) continue
        const minor = p.prices?.currency_minor_unit ?? 2
        const raw = parseInt(p.prices?.price ?? '0', 10)
        const priceExVat = raw > 0 ? raw / 10 ** minor : null
        products.push({
          slug: p.slug,
          name: plainName,
          url: p.permalink,
          fittingType: mapped.fittingType,
          diameter: mapped.diameter,
          materialFamily: mapped.materialFamily,
          priceExVat,
          sku: p.sku || null,
          editorCompatible: mapped.editorCompatible,
        })
      }
      if (batch.length < 100) break
      page++
      await sleep(250)
    }
  }
  return dedupeProducts(products)
}

// ── Bouwbuis (sitemap + productpagina JSON-LD) ─────────────────────────────

const BOUWBUIS_FITTING_SLUG_RE =
  /kniestuk|t-stuk|kort-t|lang-t|kruis|voetplaat|koppel|hoekstuk|dop|scharnier|3-weg|drieweg|centraal|verbindingsstuk/i

async function fetchBouwbuis(): Promise<SupplierFittingProduct[]> {
  const sitemap = await fetchText('https://bouwbuis.nl/sitemap')
  const urls = [...sitemap.matchAll(/<loc>(https:\/\/bouwbuis\.nl\/([^/<]+)\/)<\/loc>/g)]
    .map((m) => ({ url: m[1], slug: m[2] }))
    .filter(({ slug }) => BOUWBUIS_FITTING_SLUG_RE.test(slug) && !slug.startsWith('blog'))

  const products: SupplierFittingProduct[] = []
  let i = 0
  for (const { url, slug } of urls) {
    i++
    try {
      const html = await fetchText(url)
      const titleMatch =
        html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ??
        html.match(/"name":\s*"([^"]+)"/)
      const name = titleMatch?.[1]?.replace(/\\u00d8/g, 'Ø').trim() ?? slug.replace(/-/g, ' ')
      const mapped = mapSupplierFittingProduct(name, slug)
      const priceMatch = html.match(/"price":\s*"([0-9.]+)"/)
      const skuMatch = html.match(/Artikelnummer[\s\S]*?<td[^>]*>\s*([A-Za-z0-9-]+)\s*</i)
      products.push({
        slug,
        name,
        url,
        fittingType: mapped.fittingType,
        diameter: mapped.diameter,
        materialFamily: mapped.materialFamily,
        priceExVat: priceMatch ? parseFloat(priceMatch[1]) : null,
        sku: skuMatch?.[1] ?? null,
        editorCompatible: mapped.editorCompatible,
      })
      if (i % 20 === 0) console.log(`  … bouwbuis ${i}/${urls.length}`)
    } catch (e) {
      console.warn(`⚠ [bouwbuis] ${url}: ${e instanceof Error ? e.message : e}`)
    }
    await sleep(150)
  }
  return dedupeProducts(products)
}

// ── Groothandel (bestaande slug-lijst → catalogus-metadata) ──────────────────

function fetchGroothandelFromSlugs(): SupplierFittingProduct[] {
  const products: SupplierFittingProduct[] = []
  const seen = new Set<string>()

  for (const f of listFittingPriceSources()) {
    if (seen.has(f.slug)) continue
    seen.add(f.slug)
    const mapped = mapSupplierFittingProduct(f.slug.replace(/-/g, ' '), f.slug)
    products.push({
      slug: f.slug,
      name: f.slug.replace(/-/g, ' '),
      url: `${GROOTHANDEL_BASE}/${f.slug}`,
      fittingType: f.type,
      diameter: f.diameter,
      materialFamily: materialFamilyFromMaterialId(f.materialId),
      priceExVat: null,
      sku: null,
      editorCompatible: true,
    })
  }
  return products
}

function materialFamilyFromMaterialId(materialId: string): SupplierMaterialFamily {
  if (materialId === 'zwart' || materialId === 'zwart-outdoor') return 'zwart'
  if (materialId === 'aluminium') return 'aluminium'
  if (materialId === 'groen-outdoor') return 'outdoor'
  return 'staal'
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(CATALOG_DIR, { recursive: true })

  const jobs: {
    id: string
    source: string
    fetch: () => Promise<SupplierFittingProduct[]>
  }[] = [
    {
      id: 'steigerbuisstunter',
      source: 'Shopify /collections/buiskoppelingen/products.json',
      fetch: fetchStunter,
    },
    {
      id: 'buiskoppelen',
      source: 'WooCommerce /wp-json/wc/store/v1/products?category=…',
      fetch: fetchBuiskoppelen,
    },
    {
      id: 'bouwbuis',
      source: 'Sitemap + productpagina JSON-LD (geen publieke API)',
      fetch: fetchBouwbuis,
    },
    {
      id: 'steigerbuisgroothandel',
      source: 'Bestaande supplierPriceSources slugs (prijzen via HTML-scrape)',
      fetch: async () => fetchGroothandelFromSlugs(),
    },
  ]

  for (const { id, source, fetch } of jobs) {
    console.log(`\n=== ${id} ===`)
    const products = await fetch()
    const catalog: SupplierFittingCatalogFile = {
      supplierId: id,
      source,
      updatedAt: new Date().toISOString(),
      products,
      stats: buildStats(products),
    }
    const outPath = join(CATALOG_DIR, `${id}.json`)
    writeFileSync(outPath, JSON.stringify(catalog, null, 2) + '\n')
    const s = catalog.stats
    console.log(
      `→ ${outPath}: ${s.total} producten, ${s.mapped} gemapt, ${s.editorCompatible} editor-compatibel`,
    )
    console.log(`  types: ${JSON.stringify(s.byFittingType)}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
