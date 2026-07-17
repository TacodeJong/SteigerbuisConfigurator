/**
 * Haalt actuele prijzen op van alle leveranciers en schrijft naar src/data/prices/.
 * Draai: npm run fetch-prices
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  bouwbuisFittingSources,
  bouwbuisPipeSources,
  bouwbuisProductUrl,
  buiskoppelenFittingSources,
  buiskoppelenPipeSources,
  buiskoppelenProductUrl,
  stunterFittingSources,
  stunterPipeSources,
  stunterProductUrl,
} from '../src/data/altSupplierPriceSources'
import { listFittingPriceSources, listPipePriceSources } from '../src/data/supplierPriceSources'
import { listCatalogPriceTargets } from '../src/data/supplierFittingCatalog'
import type { FittingSource } from '../src/data/altSupplierPriceSources'

const VAT_RATE = 0.21
const __dirname = dirname(fileURLToPath(import.meta.url))
const PRICES_DIR = join(__dirname, '../src/data/prices')

type Catalog = {
  updatedAt: string
  vatRate: number
  pipes: Record<string, unknown>
  fittings: Record<string, unknown>
}

async function fetchHtml(url: string, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SteigerbuisConfigurator/1.0 (price-sync)' },
    })
    if (res.ok) return res.text()
    if (res.status === 429 && attempt < retries) {
      await sleep(2000 * (attempt + 1))
      continue
    }
    throw new Error(`${url} → HTTP ${res.status}`)
  }
  throw new Error(`${url} → fetch failed`)
}

function setNested(obj: Record<string, unknown>, keys: string[], value: unknown) {
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    cur[k] = cur[k] ?? {}
    cur = cur[k] as Record<string, unknown>
  }
  cur[keys[keys.length - 1]] = value
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function parseSku(html: string) {
  const m =
    html.match(/Artikelnummer[\s\S]*?<td[^>]*>\s*([A-Za-z0-9-]+)\s*</i) ??
    html.match(/"sku"\s*:\s*"([^"]+)"/) ??
    html.match(/"sku":"([^"]+)"/)
  return m?.[1]
}

function parseShopifyVariantId(html: string): number | undefined {
  const m = html.match(/"variantId"\s*:\s*(\d+)/) ?? html.match(/variantId":(\d+)/)
  if (!m) return undefined
  const id = Number(m[1])
  return id > 0 ? id : undefined
}

function parseMagentoPipePrice(html: string) {
  const unitMatch = html.match(/"unitPrice":([\d.]+)/)
  if (unitMatch) {
    const perMm = parseFloat(unitMatch[1])
    if (perMm > 0) return perMm
  }
  const exTaxMatch = html.match(/"unitPriceExcludeTax":([\d.]+)/)
  if (exTaxMatch) {
    const perMm = parseFloat(exTaxMatch[1])
    if (perMm > 0) return perMm
  }
  const fixed = parseFixedPriceExVat(html)
  if (fixed) return fixed / 1000
  return null
}

function parseFixedPriceExVat(html: string): number | null {
  const jsonPrice = html.match(/"price":([\d.]+)/)
  if (jsonPrice) {
    const exVat = parseFloat(jsonPrice[1])
    if (exVat > 0) return exVat
  }
  const euroPrices = [...html.matchAll(/€[\s\u00a0]*([\d]+),([\d]{2})/g)].map((m) =>
    parseFloat(`${m[1]}.${m[2]}`),
  )
  if (euroPrices.length >= 2) return euroPrices[0]
  if (euroPrices.length === 1) return euroPrices[0]
  return null
}

function parseWooCommerceFittingPrice(html: string): number | null {
  if (/volle-doos|volle doos|\(\d+\s*stuks\)/i.test(html)) {
    const ldPrices = [...html.matchAll(/"price":"([0-9.]+)"[^}]*valueAddedTaxIncluded":false/g)].map((m) =>
      parseFloat(m[1]),
    )
    const reasonable = ldPrices.filter((p) => p > 0 && p < 80)
    if (reasonable.length > 0) return Math.min(...reasonable)
  }
  const ldPrice = html.match(/"price":"([0-9.]+)"[^}]*valueAddedTaxIncluded":false/)
  if (ldPrice) {
    const p = parseFloat(ldPrice[1])
    if (p > 0 && p < 80) return p
  }
  const ldPrice2 = html.match(/"price":"([0-9.]+)"/)
  if (ldPrice2) {
    const p = parseFloat(ldPrice2[1])
    if (p > 0 && p < 80) return p
  }
  const fixed = parseFixedPriceExVat(html)
  if (fixed && fixed < 80) return fixed
  return null
}

function parseWooCommercePipePricePerMm(html: string): number | null {
  const prices = [...html.matchAll(/data-non-vat-price="([0-9.]+)"/g)].map((m) => parseFloat(m[1]))
  const perMeter = prices.filter((p) => p >= 4 && p <= 25)
  if (perMeter.length > 0) return Math.min(...perMeter) / 1000
  return null
}

function parseShopifyPriceExVat(html: string): number | null {
  const m = html.match(/"price":\{"amount":([0-9.]+),"currencyCode":"EUR"\}/)
  if (m) return parseFloat(m[1])
  return null
}

function parseBouwbuisPipePricePerMm(html: string): number | null {
  const excl = html.match(/€\s*([0-9]+,[0-9]{2})\s*excl/)
  if (excl) {
    const perMeter = parseFloat(excl[1].replace(',', '.'))
    if (perMeter > 0) return perMeter / 1000
  }
  const incl = html.match(/"price":\s*"([0-9.]+)"/)
  if (incl) return parseFloat(incl[1]) / VAT_RATE / 1000
  return null
}

function parseBouwbuisFittingPriceExVat(html: string): number | null {
  const excl = html.match(/€\s*([0-9]+,[0-9]{2})\s*excl/)
  if (excl) return parseFloat(excl[1].replace(',', '.'))
  const incl = html.match(/"price":\s*"([0-9.]+)"/)
  if (incl) return parseFloat(incl[1]) / VAT_RATE
  return null
}

async function fetchGroothandel(catalog: Catalog) {
  const base = 'https://www.steigerbuisgroothandel.nl'
  let ok = 0
  let fail = 0

  for (const p of listPipePriceSources()) {
    const url = `${base}/${p.slug}`
    try {
      const html = await fetchHtml(url)
      const rate = parseMagentoPipePrice(html)
      const sku = parseSku(html)
      if (!rate || rate <= 0) {
        console.warn(`⚠ [groothandel] geen buisprijs: ${url}`)
        fail++
        continue
      }
      setNested(catalog.pipes, [p.materialId, String(p.diameter)], {
        unitPricePerMmExVat: rate,
        productUrl: url,
        sku,
      })
      console.log(`✓ [groothandel] buis ${p.materialId} Ø${p.diameter}: €${(rate * 1000).toFixed(2)}/m`)
      ok++
    } catch (e) {
      console.warn(`✗ [groothandel] ${url}: ${e instanceof Error ? e.message : e}`)
      fail++
    }
    await sleep(250)
  }

  const fetchedFittings = new Map<string, { exVat: number; sku?: string; url: string }>()
  const attempted = new Set<string>()

  for (const f of listFittingPriceSources()) {
    const url = `${base}/${f.slug}`
    if (!attempted.has(f.slug)) {
      attempted.add(f.slug)
      try {
        const html = await fetchHtml(url)
        const exVat = parseFixedPriceExVat(html)
        const sku = parseSku(html)
        if (!exVat || exVat <= 0) {
          console.warn(`⚠ [groothandel] geen koppelingsprijs: ${url}`)
          fail++
        } else {
          fetchedFittings.set(f.slug, { exVat, sku, url })
          console.log(`✓ [groothandel] ${f.type} (${f.slug}): €${exVat.toFixed(2)}`)
          ok++
        }
      } catch (e) {
        console.warn(`✗ [groothandel] ${url}: ${e instanceof Error ? e.message : e}`)
        fail++
      }
      await sleep(250)
    }
    const cached = fetchedFittings.get(f.slug)
    if (!cached) continue
    setNested(catalog.fittings, [f.type, f.materialId, String(f.diameter)], {
      unitPriceExVat: cached.exVat,
      productUrl: cached.url,
      sku: cached.sku,
    })
  }

  return { ok, fail }
}

function mergeFittingSources(
  hardcoded: FittingSource[],
  catalogId: 'buiskoppelen' | 'steigerbuisstunter' | 'bouwbuis',
): FittingSource[] {
  const byKey = new Map<string, FittingSource>()
  for (const f of hardcoded) {
    byKey.set(`${f.type}:${f.materialId}:${f.diameter}`, f)
  }
  for (const t of listCatalogPriceTargets(catalogId)) {
    byKey.set(`${t.type}:${t.materialId}:${t.diameter}`, {
      type: t.type,
      materialId: t.materialId,
      diameter: t.diameter,
      slug: t.slug,
    })
  }
  return [...byKey.values()]
}

async function fetchFittingsFromSources(
  label: string,
  sources: FittingSource[],
  productUrl: (slug: string) => string,
  parsePrice: (html: string) => number | null,
  catalog: Catalog,
  parseVariantId?: (html: string) => number | undefined,
) {
  let ok = 0
  let fail = 0
  const fetched = new Map<string, { exVat: number; sku?: string; url: string; variantId?: number }>()
  const attempted = new Set<string>()

  for (const f of sources) {
    const url = productUrl(f.slug)
    if (!attempted.has(f.slug)) {
      attempted.add(f.slug)
      try {
        const html = await fetchHtml(url)
        const exVat = parsePrice(html)
        const sku = parseSku(html)
        if (!exVat || exVat <= 0) {
          console.warn(`⚠ [${label}] geen koppelingsprijs: ${url}`)
          fail++
        } else {
          fetched.set(f.slug, {
            exVat,
            sku,
            url,
            variantId: parseVariantId?.(html),
          })
          console.log(`✓ [${label}] ${f.type} (${f.slug}): €${exVat.toFixed(2)}`)
          ok++
        }
      } catch (e) {
        console.warn(`✗ [${label}] ${url}: ${e instanceof Error ? e.message : e}`)
        fail++
      }
      await sleep(250)
    }
    const cached = fetched.get(f.slug)
    if (!cached) continue
    setNested(catalog.fittings, [f.type, f.materialId, String(f.diameter)], {
      unitPriceExVat: cached.exVat,
      productUrl: cached.url,
      sku: cached.sku,
      ...(cached.variantId ? { variantId: cached.variantId } : {}),
    })
  }
  return { ok, fail }
}

async function fetchBuiskoppelen(catalog: Catalog) {
  let ok = 0
  let fail = 0

  for (const p of buiskoppelenPipeSources()) {
    const url = buiskoppelenProductUrl(p.slug)
    try {
      const html = await fetchHtml(url)
      const rate = parseWooCommercePipePricePerMm(html)
      const sku = parseSku(html)
      if (!rate || rate <= 0) {
        console.warn(`⚠ [buiskoppelen] geen buisprijs: ${url}`)
        fail++
        continue
      }
      setNested(catalog.pipes, [p.materialId, String(p.diameter)], {
        unitPricePerMmExVat: rate,
        productUrl: url,
        sku,
      })
      console.log(`✓ [buiskoppelen] buis ${p.materialId} Ø${p.diameter}: €${(rate * 1000).toFixed(2)}/m`)
      ok++
    } catch (e) {
      console.warn(`✗ [buiskoppelen] ${url}: ${e instanceof Error ? e.message : e}`)
      fail++
    }
    await sleep(250)
  }

  const fittingSources = mergeFittingSources(buiskoppelenFittingSources(), 'buiskoppelen')
  const { ok: fOk, fail: fFail } = await fetchFittingsFromSources(
    'buiskoppelen',
    fittingSources,
    buiskoppelenProductUrl,
    parseWooCommerceFittingPrice,
    catalog,
  )
  ok += fOk
  fail += fFail

  return { ok, fail }
}

async function fetchStunter(catalog: Catalog) {
  let ok = 0
  let fail = 0

  for (const p of stunterPipeSources()) {
    const url = stunterProductUrl(p.slug)
    try {
      const html = await fetchHtml(url)
      const perMeter = parseShopifyPriceExVat(html)
      const sku = parseSku(html)
      if (!perMeter || perMeter <= 0) {
        console.warn(`⚠ [stunter] geen buisprijs: ${url}`)
        fail++
        continue
      }
      setNested(catalog.pipes, [p.materialId, String(p.diameter)], {
        unitPricePerMmExVat: perMeter / 1000,
        productUrl: url,
        sku,
        variantId: parseShopifyVariantId(html),
      })
      console.log(`✓ [stunter] buis ${p.materialId} Ø${p.diameter}: €${perMeter.toFixed(2)}/m`)
      ok++
    } catch (e) {
      console.warn(`✗ [stunter] ${url}: ${e instanceof Error ? e.message : e}`)
      fail++
    }
    await sleep(250)
  }

  const fittingSources = mergeFittingSources(stunterFittingSources(), 'steigerbuisstunter')
  const { ok: fOk, fail: fFail } = await fetchFittingsFromSources(
    'stunter',
    fittingSources,
    stunterProductUrl,
    parseShopifyPriceExVat,
    catalog,
    parseShopifyVariantId,
  )
  ok += fOk
  fail += fFail

  return { ok, fail }
}

async function fetchBouwbuis(catalog: Catalog) {
  let ok = 0
  let fail = 0

  for (const p of bouwbuisPipeSources()) {
    const url = bouwbuisProductUrl(p.slug)
    try {
      const html = await fetchHtml(url)
      const rate = parseBouwbuisPipePricePerMm(html)
      const sku = parseSku(html)
      if (!rate || rate <= 0) {
        console.warn(`⚠ [bouwbuis] geen buisprijs: ${url}`)
        fail++
        continue
      }
      setNested(catalog.pipes, [p.materialId, String(p.diameter)], {
        unitPricePerMmExVat: rate,
        productUrl: url,
        sku,
      })
      console.log(`✓ [bouwbuis] buis ${p.materialId} Ø${p.diameter}: €${(rate * 1000).toFixed(2)}/m`)
      ok++
    } catch (e) {
      console.warn(`✗ [bouwbuis] ${url}: ${e instanceof Error ? e.message : e}`)
      fail++
    }
    await sleep(250)
  }

  const fittingSources = mergeFittingSources(bouwbuisFittingSources(), 'bouwbuis')
  const { ok: fOk, fail: fFail } = await fetchFittingsFromSources(
    'bouwbuis',
    fittingSources,
    bouwbuisProductUrl,
    parseBouwbuisFittingPriceExVat,
    catalog,
  )
  ok += fOk
  fail += fFail

  return { ok, fail }
}

async function main() {
  mkdirSync(PRICES_DIR, { recursive: true })
  const suppliers: { id: string; fetch: (c: Catalog) => Promise<{ ok: number; fail: number }> }[] = [
    { id: 'steigerbuisgroothandel', fetch: fetchGroothandel },
    { id: 'buiskoppelen', fetch: fetchBuiskoppelen },
    { id: 'steigerbuisstunter', fetch: fetchStunter },
    { id: 'bouwbuis', fetch: fetchBouwbuis },
  ]

  let totalOk = 0
  let totalFail = 0

  for (const { id, fetch } of suppliers) {
    console.log(`\n=== ${id} ===`)
    const catalog: Catalog = {
      updatedAt: new Date().toISOString(),
      vatRate: VAT_RATE,
      pipes: {},
      fittings: {},
    }
    const { ok, fail } = await fetch(catalog)
    totalOk += ok
    totalFail += fail
    const outPath = join(PRICES_DIR, `${id}.json`)
    writeFileSync(outPath, JSON.stringify(catalog, null, 2) + '\n')
    console.log(`→ ${outPath} (${ok} ok, ${fail} mislukt)`)
  }

  console.log(`\nKlaar: ${totalOk} ok, ${totalFail} mislukt`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
