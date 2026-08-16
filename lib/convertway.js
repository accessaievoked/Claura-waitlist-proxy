// lib/convertway.js
//
// ⚠️ ACTION NEEDED
// I don't have the exact ConvertWay call from your wishlist backend (that repo
// wasn't in what you gave me — only the theme export and an unrelated waitlist
// proxy). This function has the right shape (inputs in, boolean/result out) but
// the fetch() below is a placeholder.
//
// To wire it up for real: open the wishlist backend's file that fires the
// "added to wishlist" WhatsApp confirmation, copy the fetch() call (URL,
// headers, body shape) into sendWhatsApp() below, and swap the message text
// for the restock version. Paste that file to me and I'll do this edit for you
// directly instead of guessing.

const CONVERTWAY_API_URL = process.env.CONVERTWAY_API_URL || 'https://api.convertway.com/send'; // PLACEHOLDER — replace with real endpoint
const CONVERTWAY_API_KEY = process.env.CONVERTWAY_API_KEY;

/**
 * Sends a "back in stock" WhatsApp message.
 * @param {object} params
 * @param {string} params.phone         E.164 or 10-digit Indian number
 * @param {string} params.name          Customer name
 * @param {string} params.productTitle  e.g. "Aria Kurta Set"
 * @param {string} params.variantTitle  e.g. "Blue / M" (colour / size)
 * @param {string} params.productUrl    Full product URL (with variant id)
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function sendWhatsApp({ phone, name, productTitle, variantTitle, productUrl }) {
  if (!CONVERTWAY_API_KEY) {
    console.warn('[ConvertWay] CONVERTWAY_API_KEY not set — skipping send (dev mode)');
    return { ok: false, error: 'CONVERTWAY_API_KEY not configured' };
  }

  const message =
    `Hi ${name}, good news! ${productTitle} (${variantTitle}) is back in stock.\n` +
    `Grab it before it sells out again: ${productUrl}`;

  try {
    // ── PLACEHOLDER — replace with the exact call your wishlist backend uses ──
    const res = await fetch(CONVERTWAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CONVERTWAY_API_KEY}`,
      },
      body: JSON.stringify({
        to: normalizePhone(phone),
        message,
      }),
    });
    // ─────────────────────────────────────────────────────────────────────────

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `ConvertWay ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('[ConvertWay] send failed:', err);
    return { ok: false, error: err.message };
  }
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`; // assume India if bare 10-digit
  return digits;
}
