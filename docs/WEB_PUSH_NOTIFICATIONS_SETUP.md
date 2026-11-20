# Web Push Notifications Setup

The application creates a push alert only when the Cloudflare Worker imports a genuinely new order from a connected live eBay seller account. Duplicate order imports do not create a second alert. Legacy notifications remain in the database but are deliberately hidden from the notification UI.

## Required Cloudflare Worker settings

Configure these values for the Worker before enabling push delivery:

- `VAPID_PUBLIC_KEY`: Base64URL-encoded uncompressed P-256 public key (65 bytes).
- `VAPID_PRIVATE_KEY`: Base64URL-encoded P-256 private scalar (32 bytes). Store as a Cloudflare secret; never commit it.
- `VAPID_SUBJECT`: A real operator contact such as `mailto:security@your-domain.example` or a public HTTPS contact URL. Replace the example with a monitored contact.

Generate a key pair locally with Node.js (the private key is printed only in your terminal):

```bash
node --input-type=module -e "const c=globalThis.crypto; const pair=await c.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']); const pub=new Uint8Array(await c.subtle.exportKey('raw',pair.publicKey)); const priv=await c.subtle.exportKey('jwk',pair.privateKey); const b=x=>Buffer.from(x).toString('base64url'); console.log('VAPID_PUBLIC_KEY='+b(pub)); console.log('VAPID_PRIVATE_KEY='+priv.d);"
```

For simplicity, the commands below store all three values as Worker secrets. The public key and contact subject are not private, but storing them as secrets is also supported:

```bash
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_SUBJECT
```

The Worker reports push as unavailable until all three values are configured. Do not put any VAPID private key in GitHub, source code, browser code, or chat.

## Browser behaviour

- Users enable push separately on each browser/device from the Notifications screen.
- Browser permission must be granted.
- Android/desktop browsers need a secure HTTPS origin and service-worker support.
- On iPhone/iPad, Web Push requires iOS/iPadOS 16.4 or later and the site installed to the Home Screen.
- Removing a subscription on one device does not affect other devices.
- Signing out removes the current device's push subscription before ending the authenticated session.
- Expired push endpoints (HTTP 404/410) are removed automatically.

## Data safety

- The migration adds notification provenance and a per-user push-subscription table; it does not delete or rewrite existing notifications or orders.
- Only notifications with source `EBAY` and type `NEW_EBAY_ORDER` are displayed in the current UI.
- New order alerts are idempotent by seller account and external eBay order ID.
- No Production migration, eBay sync, or deployment is performed by this source-code change.
