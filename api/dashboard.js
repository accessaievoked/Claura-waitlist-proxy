// api/dashboard.js
// Pin-protected dashboard, adapted from your waitlist proxy dashboard.
// Visit: https://<your-vercel-domain>/api/dashboard?pin=YOUR_PIN

import { adminFetch, esc } from '../lib/shopify.js';

const METAOBJECT_TYPE = 'notify_me_entry';

export default async function handler(req, res) {
  const pin = req.query.pin;
  if (pin !== process.env.DASHBOARD_PIN) {
    res.status(401).send('Unauthorized — add ?pin=YOUR_PIN to the URL.');
    return;
  }

  res.setHeader('Content-Security-Policy', "frame-ancestors https://claura.in https://admin.shopify.com;");
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  let entries = [];
  try {
    const query = `{
      metaobjects(type: "${METAOBJECT_TYPE}", first: 250) {
        edges { node { id fields { key value } } }
      }
    }`;
    const data = await adminFetch(query);
    const edges = data?.data?.metaobjects?.edges || [];
    entries = edges.map((edge) => {
      const obj = { _id: edge.node.id };
      edge.node.fields.forEach((f) => { obj[f.key] = f.value; });
      return obj;
    });
    entries.sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
  } catch (err) {
    console.error('[Dashboard]', err);
  }

  const pendingCount = entries.filter((e) => e.notified !== 'true').length;
  const notifiedCount = entries.filter((e) => e.notified === 'true').length;

  const byProduct = {};
  entries.forEach((e) => {
    const k = e.product_title || 'Unknown';
    byProduct[k] = (byProduct[k] || 0) + 1;
  });
  const statCards = Object.entries(byProduct)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => `
      <div class="stat-card">
        <div class="stat-count">${count}</div>
        <div class="stat-label">${esc(label)}</div>
      </div>
    `).join('');

  const rows = entries.map((e, i) => {
    const dt = e.submitted_at
      ? new Date(e.submitted_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })
      : '—';
    const waNum = (e.phone || '').replace('+', '');
    const statusBadge = e.notified === 'true'
      ? '<span class="badge badge--done">Notified</span>'
      : '<span class="badge badge--pending">Pending</span>';
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(dt)}</td>
        <td>${esc(e.name || '')}</td>
        <td><a href="https://wa.me/${esc(waNum)}" target="_blank">${esc(e.phone || '')}</a></td>
        <td>${esc(e.product_title || '')}</td>
        <td><span class="badge">${esc(e.variant_title || '')}</span></td>
        <td>${statusBadge}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Notify Me Dashboard — Claura</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { color: #1a1a2e; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f6f8; }
  .topbar { background: #fff; border-bottom: 1px solid #e3e5e8; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; }
  .topbar__title { font-size: 15px; font-weight: 600; color: #111; }
  .topbar__sub { font-size: 11px; color: #888; margin-top: 1px; }
  .btn { padding: 7px 14px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid #232C3E; background: #232C3E; color: #fff; text-decoration: none; display: inline-flex; align-items: center; gap: 5px; }
  .container { padding: 20px 24px; max-width: 1200px; margin: 0 auto; }
  .stats { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
  .stat-card, .total-badge { background: #fff; border: 1px solid #e3e5e8; border-radius: 8px; padding: 16px 20px; min-width: 130px; flex: 1 1 130px; }
  .stat-count { font-size: 26px; font-weight: 700; line-height: 1; color: #111; }
  .stat-label { font-size: 11px; color: #888; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
  .total-badge .stat-count { color: #6366f1; }
  .card { background: #fff; border: 1px solid #e3e5e8; border-radius: 8px; overflow: hidden; }
  .card-header { padding: 14px 16px; border-bottom: 1px solid #e3e5e8; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .filter-select, .search-input { border: 1px solid #c9cccf; border-radius: 6px; padding: 6px 10px; font-size: 12px; outline: none; background: #fff; color: #333; }
  .search-input { min-width: 220px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 10px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; border-bottom: 1px solid #e3e5e8; white-space: nowrap; background: #fafbfc; }
  td { padding: 11px 14px; border-bottom: 1px solid #f1f2f4; color: #333; vertical-align: middle; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover td { background: #fafbfc; }
  a { color: #6366f1; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .badge { display: inline-block; padding: 3px 8px; background: #f1f2f4; border-radius: 4px; font-size: 11px; color: #555; white-space: nowrap; }
  .badge--pending { background: #fff4e5; color: #a15c00; }
  .badge--done { background: #e6f4ea; color: #1e7e34; }
  .empty { text-align: center; padding: 48px; color: #aaa; font-size: 13px; }
  .count-pill { display: inline-block; background: #f1f2f4; border-radius: 10px; padding: 1px 7px; font-size: 11px; color: #666; margin-left: 4px; }
</style>
</head>
<body>

<div class="topbar">
  <div>
    <div class="topbar__title">Notify Me Dashboard</div>
    <div class="topbar__sub">Claura · ${entries.length} total · ${pendingCount} pending · ${notifiedCount} notified</div>
  </div>
  <div><button class="btn" onclick="location.reload()">↻ Refresh</button></div>
</div>

<div class="container">
  ${statCards ? `<div class="stats">${statCards}</div>` : ''}

  <div class="card">
    <div class="card-header">
      <select class="filter-select" id="filter-status" onchange="applyFilters()">
        <option value="">All Status</option>
        <option value="pending">Pending</option>
        <option value="notified">Notified</option>
      </select>
      <input type="search" class="search-input" id="search-input" placeholder="Search name, phone, product…" oninput="applyFilters()">
      <span class="count-pill" id="count-pill">${entries.length} results</span>
    </div>
    <div style="overflow-x:auto;">
      <table id="tbl">
        <thead>
          <tr><th>#</th><th>Date (IST)</th><th>Name</th><th>WhatsApp</th><th>Product</th><th>Colour / Size</th><th>Status</th></tr>
        </thead>
        <tbody id="tbody">
          ${rows || '<tr><td colspan="7" class="empty">No entries yet.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
</div>

<script>
  var allRows = ${JSON.stringify(entries)};

  function applyFilters() {
    var status = document.getElementById('filter-status').value;
    var search = document.getElementById('search-input').value.toLowerCase();
    var filtered = allRows.filter(function(e) {
      var matchStatus = !status || (status === 'notified' ? e.notified === 'true' : e.notified !== 'true');
      var matchSearch = !search || ((e.name||'')+(e.phone||'')+(e.product_title||'')).toLowerCase().includes(search);
      return matchStatus && matchSearch;
    });
    document.getElementById('count-pill').textContent = filtered.length + ' results';
    var tbody = document.getElementById('tbody');
    if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty">No entries found.</td></tr>'; return; }
    tbody.innerHTML = filtered.map(function(e, i) {
      var dt = e.submitted_at ? new Date(e.submitted_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'short',timeStyle:'short'}) : '—';
      var waNum = (e.phone||'').replace('+','');
      var status = e.notified === 'true' ? '<span class="badge badge--done">Notified</span>' : '<span class="badge badge--pending">Pending</span>';
      return '<tr><td>'+(i+1)+'</td><td>'+dt+'</td><td>'+(e.name||'')+'</td>'
        + '<td><a href="https://wa.me/'+waNum+'" target="_blank">'+(e.phone||'')+'</a></td>'
        + '<td>'+(e.product_title||'')+'</td><td><span class="badge">'+(e.variant_title||'')+'</span></td>'
        + '<td>'+status+'</td></tr>';
    }).join('');
  }
</script>
</body>
</html>`;

  res.status(200).send(html);
}
