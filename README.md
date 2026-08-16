# Claura — Notify Me When Back In Stock

Same architecture as the Claura wishlist app: Vercel serverless functions +
Shopify Metaobjects for storage, ConvertWay for WhatsApp. No separate database.

## What it does
1. Customer clicks **Notify Me** on a sold-out product, enters name + phone in a popup.
2. Entry is saved as a `notify_me_entry` metaobject (via `api/notify.js`).
3. When that variant's inventory goes from 0 → available, Shopify fires a webhook
   to `api/webhook-inventory.js`, which looks up matching pending entries and
   sends each one a WhatsApp message via ConvertWay, then marks them notified.
4. `api/dashboard.js` gives you a pin-protected view of all entries.

## 1. Create the metaobject definition
In Shopify admin → **Settings → Custom data → Metaobjects → Add definition**:

- Type: `notify_me_entry`
- Fields (all "Single line text" except where noted):
  - `name`
  - `phone`
  - `variant_id`
  - `variant_title` (this is where colour/size lives, e.g. "Blue / M")
  - `product_id`
  - `product_title`
  - `product_handle`
  - `product_url`
  - `submitted_at`
  - `notified` — Boolean (as text: `"true"` / `"false"`)
  - `notified_at`
- Under **Access**, allow Storefront API read is NOT needed — this app only
  talks to the Admin API server-side, never from the browser directly.

## 2. Admin API token
Create/reuse a custom app in Shopify admin with these Admin API scopes:
- `read_products`, `read_inventory`
- `read_metaobjects`, `write_metaobjects`

Copy the Admin API access token into `SHOPIFY_ADMIN_TOKEN`.

## 3. Deploy to Vercel
```
cd claura-notify-me-backend
vercel --prod
```
Set the environment variables from `.env.example` in the Vercel project settings.

## 4. Register the inventory webhook
Once deployed, register the webhook (replace values):
```
curl -X POST "https://claura-in.myshopify.com/admin/api/2024-10/graphql.json" \
  -H "X-Shopify-Access-Token: $SHOPIFY_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { webhookSubscriptionCreate(topic: INVENTORY_LEVELS_UPDATE, webhookSubscription: { callbackUrl: \"https://YOUR-VERCEL-DOMAIN/api/webhook-inventory\", format: JSON }) { webhookSubscription { id } userErrors { field message } } }"
  }'
```
The response includes a webhook `id`. Shopify also signs every webhook call —
grab the shared secret shown for your custom app (**Settings → Notifications →
Webhooks → Signing secret**, or the app's API secret) and put it in
`SHOPIFY_WEBHOOK_SECRET`.

## 5. Wire up ConvertWay
`lib/convertway.js` has a placeholder `fetch()` call. Open your wishlist
backend's WhatsApp-send code, copy the real endpoint/headers/body shape in,
and swap the message text for the restock version already drafted in that file.

## 6. Theme side
See the theme files I've bundled separately:
- `snippets/notify-me-modal.liquid`
- `assets/notify-me.js`
- `assets/notify-me.css`
- the diff for `snippets/buy-buttons.liquid`

Set `window.NotifyMeConfig.apiUrl` in the modal snippet to your deployed
Vercel URL, same pattern as `window.WishlistConfig`.

## Notes on the dedupe / re-notify logic
- A phone number can only have one *pending* request per variant — submitting
  again while still out of stock is a no-op (`alreadyRequested: true`).
- Once notified, the entry is marked `notified: true` and won't be messaged
  again even if it goes out of stock and back in later. If you want repeat
  customers to be able to re-subscribe after a restock, that's already handled
  naturally — the dedupe check in `api/notify.js` only matches
  `notified:'false'`, so a fresh submission creates a new entry.
"# Claura-waitlist-proxy" 
