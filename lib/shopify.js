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

// Fetches all metaobjects of a type and flattens each into a plain object
// ({ _id, ...fields }). Filtering by field value is done client-side here
// rather than via Shopify's `query:` parameter, because that filter only
// works on fields explicitly marked "Admin filterable" — a capability that
// isn't set on fields created through the plain metaobject-definition UI,
// and silently no-ops (returning unfiltered results) rather than erroring
// when it's missing. First 250 entries only — fine for this volume; add
// cursor pagination here if you ever expect more than 250 open entries.
export async function fetchAllMetaobjects(type) {
  const query = `{
    metaobjects(type: "${type}", first: 250) {
      edges { node { id fields { key value } } }
    }
  }`;
  const data = await adminFetch(query);
  if (data.errors) {
    console.error('[Shopify] fetchAllMetaobjects errors:', JSON.stringify(data.errors));
    return [];
  }
  return (data?.data?.metaobjects?.edges || []).map((edge) => {
    const obj = { _id: edge.node.id };
    edge.node.fields.forEach((f) => { obj[f.key] = f.value; });
    return obj;
  });
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
