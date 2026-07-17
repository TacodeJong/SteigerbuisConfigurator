import type { QuoteLine, SupplierQuote } from './types'

const STUNTER_CART_ADD = 'https://www.steigerbuisstunter.nl/cart/add'
const PIPE_LENGTH_PROPERTY = 'Lengte (cm)'

function pipeLengthCm(line: QuoteLine): number | null {
  const match = /^pipe:(\d+)$/.exec(line.lineKey)
  if (!match) return null
  return Math.round(Number(match[1]) / 10)
}

function appendHiddenInput(form: HTMLFormElement, name: string, value: string) {
  const input = document.createElement('input')
  input.type = 'hidden'
  input.name = name
  input.value = value
  form.appendChild(input)
}

/** Lines that can be added to a Shopify cart (need variant ID). */
export function shopifyCartableLines(quote: SupplierQuote): QuoteLine[] {
  return quote.lines.filter((line) => line.cartItemId != null && line.cartItemId > 0)
}

export function canFillSteigerbuisstunterCart(quote: SupplierQuote): boolean {
  return quote.supplierId === 'steigerbuisstunter' && shopifyCartableLines(quote).length > 0
}

/**
 * POST form to Steigerbuisstunter (Shopify). Opens their cart in a new tab.
 * Pipes include custom length via line item property "Lengte (cm)".
 */
export function submitSteigerbuisstunterCart(quote: SupplierQuote): boolean {
  const lines = shopifyCartableLines(quote)
  if (lines.length === 0) return false

  const form = document.createElement('form')
  form.method = 'POST'
  form.action = STUNTER_CART_ADD
  form.target = '_blank'
  form.style.display = 'none'

  let idx = 0
  for (const line of lines) {
    const variantId = line.cartItemId!
    appendHiddenInput(form, `items[${idx}][id]`, String(variantId))
    appendHiddenInput(form, `items[${idx}][quantity]`, String(line.quantity))
    if (line.kind === 'pipe') {
      const lengthCm = pipeLengthCm(line)
      if (lengthCm != null && lengthCm > 0) {
        appendHiddenInput(form, `items[${idx}][properties][${PIPE_LENGTH_PROPERTY}]`, String(lengthCm))
      }
    }
    idx++
  }

  document.body.appendChild(form)
  form.submit()
  form.remove()
  return true
}
