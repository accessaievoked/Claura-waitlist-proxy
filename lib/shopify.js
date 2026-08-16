// lib/shopify.js
// Shared Shopify Admin GraphQL helper — same shape as your wishlist backend.

const SHOP        = process.env.SHOPIFY_STORE || 'claura-in'; // storefront prefix, e.g. 'claura-in' for claura-in.myshopify.com
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

export async function adminFetch(query, variables = {}) {
  const r = await fetch(
    `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  const json = await r.json();
  if (json.errors) {
    console.error('[Shopify] GraphQL errors:', JSON.stringify(json.errors));
  }
  return json;
}

export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-notify-secret');
}

export function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
