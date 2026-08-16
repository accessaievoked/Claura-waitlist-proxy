// api/notify.js
// POST — save a new "notify me when back in stock" entry
// GET  — fetch all entries (pin-protected, used by the dashboard)

import { adminFetch, setCors } from '../lib/shopify.js';

const METAOBJECT_TYPE = 'notify_me_entry';

async function handlePost(req, res) {
  let body = req.body;
  if (typeof body !== 'object') {
    try { body = JSON.parse(body || '{}'); } catch { body = {}; }
  }

  const {
    name,
    phone,
    variant_id,
    variant_title,   // e.g. "Blue / M" — encodes colour/size
    product_id,
    product_title,
    product_handle,
    product_url,
  } = body;

  if (!name || !phone || !variant_id || !product_id) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }

  // Prevent duplicate active requests for the same phone + variant
  const dupeQuery = `
    query FindDupe($q: String!) {
      metaobjects(type: "${METAOBJECT_TYPE}", first: 1, query: $q) {
        edges { node { id } }
      }
    }
  `;
  const dupeCheck = await adminFetch(dupeQuery, {
    q: `fields.phone:'${phone}' AND fields.variant_id:'${variant_id}' AND fields.notified:'false'`,
  });
  const alreadyExists = dupeCheck?.data?.metaobjects?.edges?.length > 0;
  if (alreadyExists) {
    return res.status(200).json({ ok: true, alreadyRequested: true });
  }

  const mutation = `
    mutation CreateNotifyEntry($fields: [MetaobjectFieldInput!]!) {
      metaobjectCreate(metaobject: {
        type: "${METAOBJECT_TYPE}",
        fields: $fields
      }) {
        metaobject { id handle }
        userErrors { field message }
      }
    }
  `;

  const variables = {
    fields: [
      { key: 'name',           value: name },
      { key: 'phone',          value: String(phone) },
      { key: 'variant_id',     value: String(variant_id) },
      { key: 'variant_title',  value: variant_title || '' },
      { key: 'product_id',     value: String(product_id) },
      { key: 'product_title',  value: product_title || '' },
      { key: 'product_handle', value: product_handle || '' },
      { key: 'product_url',    value: product_url || '' },
      { key: 'submitted_at',   value: new Date().toISOString() },
      { key: 'notified',       value: 'false' },
    ],
  };

  const data = await adminFetch(mutation, variables);

  if (data.errors || data.data?.metaobjectCreate?.userErrors?.length > 0) {
    const err = data.errors?.[0]?.message || data.data?.metaobjectCreate?.userErrors?.[0]?.message;
    console.error('[Notify] Save error:', err);
    return res.status(500).json({ ok: false, error: err });
  }

  return res.status(200).json({ ok: true, id: data.data.metaobjectCreate.metaobject.id });
}

async function handleGet(req, res) {
  const pin = req.query.pin;
  if (pin !== process.env.DASHBOARD_PIN) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const query = `{
    metaobjects(type: "${METAOBJECT_TYPE}", first: 250) {
      edges {
        node {
          id
          fields { key value }
        }
      }
    }
  }`;

  const data = await adminFetch(query);
  if (data.errors) {
    return res.status(500).json({ ok: false, error: data.errors[0].message });
  }

  const entries = (data.data?.metaobjects?.edges || []).map((edge) => {
    const obj = { _id: edge.node.id };
    edge.node.fields.forEach((f) => { obj[f.key] = f.value; });
    return obj;
  });

  entries.sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));

  return res.status(200).json({ ok: true, entries });
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') return await handlePost(req, res);
    if (req.method === 'GET') return await handleGet(req, res);
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[Notify] Unhandled error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
