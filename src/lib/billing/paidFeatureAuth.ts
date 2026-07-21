/**
 * Guests must authenticate before any paid checkout (subscription or pay-per-use
 * unlocks such as full_print, copy_order_list, bom_print, viewport_print,
 * download_model, full_pdf, …).
 * UI: open AuthModal with this reason — never start Mollie while logged out.
 */
export const PAID_FEATURE_AUTH_REASON =
  'Maak een account of log in om deze functie te gebruiken'
