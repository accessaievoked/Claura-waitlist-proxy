// api/webhook-inventory.js
// Shopify webhook receiver — topic: inventory_levels/update
// When a variant's inventory goes from 0 to available, find matching
// notify_me_entry metaobjects for that variant and WhatsApp them, then
// mark them notified so they don't get messaged twice.
//
// Register this webhook (once) with:
//   topic: inventory_levels/update
//   address: https://<your-vercel-domain>/api/webhook-inventory
//   format: json
// via Shopify admin API (webhookSubscriptionCreate) or Settings → Notifications
// → Webhooks in the Shopify admin.

import crypto from 'crypto';
import { adminFetch, fetchAllMetaobjects } from '../lib/shopify.js';
import { sendWhatsApp } from '../lib/convertway.js';

const METAOBJECT_TYPE = 'notify_me_entry';
const STORE_DOMAIN = process.env.STORE_DOMAIN || 'claura.in'; // for building product_url fallback

export const config = {
  api: { bodyParser: false }, // need raw body for HMAC verification
};

function verifyHmac(rawBody, hmacHeader) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return true; // allow through if not configured (dev), but log
  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader || ''));
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

// Map an inventory_item_id to its variant (id, availableForSale, product info)
async function getVariantFromInventoryItem(inventoryItemId) {
  const gid = `gid://shopify/InventoryItem/${inventoryItemId}`;
  const query = `
    query GetVariant($id: ID!) {
      inventoryItem(id: $id) {
        variant {
          id
          title
          availableForSale
          selectedOptions { name value }
          product {
            id
            title
            handle
          }
        }
      }
    }
  `;
  const data = await adminFetch(query, { id: gid });
  return data?.data?.inventoryItem?.variant || null;
}

async function getPendingEntriesForVariant(variantNumericId) {
  // Filtered client-side, not via Shopify's query: parameter -- see
  // fetchAllMetaobjects in lib/shopify.js for why that filter isn't
  // reliable for fields not marked "Admin filterable."
  const allEntries = await fetchAllMetaobjects(METAOBJECT_TYPE);
  return allEntries.filter(
    (e) => e.variant_id === String(variantNumericId) && e.notified !== 'true'
  );
}

async function markNotified(metaobjectId) {
  const mutation = `
    mutation MarkNotified($id: ID!, $fields: [MetaobjectFieldInput!]!) {
      metaobjectUpdate(id: $id, metaobject: { fields: $fields }) {
        metaobject { id }
        userErrors { field message }
      }
    }
  `;
  await adminFetch(mutation, {
    id: metaobjectId,
    fields: [
      { key: 'notified', value: 'true' },
      { key: 'notified_at', value: new Date().toISOString() },
    ],
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await readRawBody(req);
  const hmac = req.headers['x-shopify-hmac-sha256'];

  if (!verifyHmac(rawBody, hmac)) {
    console.warn('[Webhook] HMAC verification failed');
    return res.status(401).json({ ok: false, error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON' });
  }

  // inventory_levels/update payload: { inventory_item_id, location_id, available }
  const { inventory_item_id, available } = payload;

  // Respond fast — Shopify expects a 200 within a few seconds.
  res.status(200).json({ ok: true });

  if (available === undefined || available <= 0) return; // still out of stock

  try {
    const variant = await getVariantFromInventoryItem(inventory_item_id);
    if (!variant || !variant.availableForSale) return;

    const variantNumericId = variant.id.split('/').pop();
    const pending = await getPendingEntriesForVariant(variantNumericId);
    if (pending.length === 0) return;

    const productUrl = pending[0].product_url
      || `https://${STORE_DOMAIN}/products/${variant.product.handle}?variant=${variantNumericId}`;

    for (const entry of pending) {
      const result = await sendWhatsApp({
        phone: entry.phone,
        name: entry.name,
        productTitle: entry.product_title || variant.product.title,
        variantTitle: entry.variant_title || variant.title,
        productUrl,
      });

      if (result.ok) {
        await markNotified(entry._id);
      } else {
        console.error(`[Webhook] WhatsApp send failed for ${entry.phone}:`, result.error);
      }
    }
  } catch (err) {
    console.error('[Webhook] Processing error:', err);
  }
}
