// lib/convertway.js
//
// ConvertWay WhatsApp Template Message API
// Docs: POST https://app.theconvertway.com/api/v1/messaging_templates/whatsapp/send_message
//
// IMPORTANT: the template below (CONVERTWAY_TEMPLATE_NAME) must already be
// Meta-approved, and the variable count/order in buildComponents() below
// must exactly match what was approved -- a mismatch fails with
// "Invalid parameter count". Adjust buildComponents() to match your actual
// approved template if it differs from the 3-variable assumption here.

const CONVERTWAY_URL = process.env.CONVERTWAY_API_URL || 'https://app.theconvertway.com/api/v1/messaging_templates/whatsapp/send_message';
const CONVERTWAY_TOKEN = process.env.CONVERTWAY_API_TOKEN; // your ConvertWay License Key
const TEMPLATE_NAME = process.env.CONVERTWAY_TEMPLATE_NAME || 'back_in_stock_notify';
const TEMPLATE_LANG = process.env.CONVERTWAY_TEMPLATE_LANG || 'en';
const COUNTRY_CODE = process.env.CONVERTWAY_COUNTRY_CODE || 'IN';

/**
 * Sends a "back in stock" WhatsApp template message via ConvertWay.
 * @param {object} params
 * @param {string} params.phone         Customer phone (any format -- normalized below)
 * @param {string} params.name          Customer name
 * @param {string} params.productTitle  e.g. "Elegant Pink Embroidered V-Neck Tunic"
 * @param {string} params.variantTitle  e.g. "M" or "Blue / M"
 * @param {string} params.productUrl    Full product URL (with variant id)
 * @returns {Promise<{ok: boolean, error?: string, messageId?: string}>}
 */
export async function sendWhatsApp({ phone, name, productTitle, variantTitle, productUrl }) {
  if (!CONVERTWAY_TOKEN) {
    console.warn('[ConvertWay] CONVERTWAY_API_TOKEN not set -- skipping send (dev mode)');
    return { ok: false, error: 'CONVERTWAY_API_TOKEN not configured' };
  }

  const to = normalizePhone(phone);
  if (!to) {
    return { ok: false, error: `Could not normalize phone: ${phone}` };
  }

  const payload = {
    country_code: COUNTRY_CODE,
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: TEMPLATE_NAME,
      language: { code: TEMPLATE_LANG },
      components: buildComponents({ name, productTitle, variantTitle, productUrl }),
    },
  };

  try {
    const res = await fetch(CONVERTWAY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CONVERTWAY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.status !== 'SUCCESS') {
      const errMsg = data.message || `ConvertWay HTTP ${res.status}`;
      return { ok: false, error: errMsg };
    }

    return { ok: true, messageId: data.data?.message_id };
  } catch (err) {
    console.error('[ConvertWay] send failed:', err);
    return { ok: false, error: err.message };
  }
}

// -- Template components ----------------------------------------------------
// Matches the approved template:
//   "Hi {{1}}, good news! Your requested item {{2}} in {{3}}, size {{4}}
//    is back in stock. Grab it before it sells out again!"
//   + a dynamic-URL "View Product" button.
// {{1}} name, {{2}} product title, {{3}} colour, {{4}} size.
function buildComponents({ name, productTitle, variantTitle, productUrl }) {
  const { colour, size } = splitVariantTitle(variantTitle);

  return [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: name || 'there' },
        { type: 'text', text: productTitle || 'Your item' },
        { type: 'text', text: colour },
        { type: 'text', text: size },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: 0,
      parameters: [
        { type: 'text', text: productUrl },
      ],
    },
  ];
}

// Shopify variant titles for this store are formatted "Colour / Size"
// (e.g. "Elegant Pink / M"). Falls back gracefully if only one value exists.
function splitVariantTitle(variantTitle) {
  const parts = String(variantTitle || '').split('/').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { colour: parts[0], size: parts[1] };
  if (parts.length === 1) return { colour: parts[0], size: '' };
  return { colour: '', size: '' };
}

// ConvertWay wants the number without a leading + (E.164 digits only).
function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`; // bare Indian number
  return digits;
}
