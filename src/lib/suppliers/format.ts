export function formatEuro(amount: number, decimals = 2): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

export function formatEuroPerMeter(pricePerMm: number): string {
  return `${formatEuro(pricePerMm * 1000)}/m`
}
