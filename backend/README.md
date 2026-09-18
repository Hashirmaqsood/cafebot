# Backend

Minimal Node.js backend for CafeBot. No framework and no dependencies — just Node's built-in `http` module. Requires Node.js 18 or later (see `engines` in `package.json`).

## Run it

```bash
npm start
```

Runs on `PORT` from the environment (default `3000`).

**Note:** no `dotenv` dependency (kept dependency-free on purpose) — the server reads `../.env` itself on startup with a small built-in parser, without overriding any variable your shell or hosting platform already set. Copy `../.env.example` to `../.env` and fill in `ANTHROPIC_API_KEY` to enable real AI replies; `AI_MODEL` defaults to `claude-haiku-4-5-20251001` if left blank, `AI_API_BASE_URL` defaults to Anthropic's API, and `AI_MAX_TOKENS` defaults to `512`.

## Deploying

- Deploy this `backend/` folder as a Node.js web service (start command `npm start`); the platform should provide `PORT` itself (most do) or you can set it explicitly.
- `data/orders.json` (one level up) is where confirmed orders are saved. It's plain-file storage recreated automatically if missing — fine for a low-cost demo, but note that most hosting platforms have an ephemeral filesystem, so its contents can be lost on redeploy or restart unless your host provides a persistent disk/volume. It also contains customer PII (name, phone, address), so it's gitignored and must never be committed.
- The staff dashboard (`frontend/staff.html`) requires logging in with `ADMIN_PASSWORD` (see `staffAuth.js` and the `/api/staff/*` endpoints below). Set that variable wherever the backend runs — an unset/blank password refuses all staff access rather than allowing it.
- Every response already sends permissive CORS headers (`Access-Control-Allow-Origin: *`) so a frontend hosted elsewhere can call this API; if you deploy the backend somewhere other than `http://localhost:3000`, update the `API_BASE` constant near the top of `frontend/staff.html`'s `<script>` to point at it.

## Endpoint

### `POST /api/chat`

Accepts a customer message and the conversation history.

**Request body:**

```json
{
  "message": "What coffees do you have?",
  "history": [
    { "role": "customer", "content": "Hi!" },
    { "role": "bot", "content": "Hi there! How can I help?" }
  ],
  "sessionId": "optional, returned from a previous response"
}
```

- `message` (string, required)
- `history` (array, optional)
- `sessionId` (string, optional) — omit on the first request; pass back the `sessionId` from the response on later requests to keep using the same order.

**Response body:**

```json
{
  "reply": "...",
  "sessionId": "...",
  "order": {
    "items": [],
    "orderType": null,
    "customerDetails": { "name": null, "phone": null },
    "promotion": null,
    "subtotal": 0,
    "tax": 0,
    "deliveryFee": 0,
    "total": 0,
    "confirmed": false,
    "status": "building"
  },
  "orderSummary": "Your order is currently empty."
}
```

On startup, the server loads `../prompts/system-prompt.md` and uses its contents as CafeBot's system instructions for each request. If that file can't be read, `/api/chat` responds with a 500 error.

Each session gets a simple structured order (see `orderState.js`), held in memory only — no database. Restarting the server clears all order state.

Every endpoint below that returns `order` also returns `orderSummary`: a short, human-readable string (e.g. `"Here's your current order:\n- 1x Medium Caramel Latte (Oat milk (+$0.50)) — $4.50\nSubtotal: $4.50\nTax: $0.36\nTotal: $4.86"`) listing each item's quantity, size, and customizations, plus the price breakdown, so CafeBot can read the order back to the customer.

## Pricing (deterministic, not AI-calculated)

`order.subtotal`, `order.tax`, `order.deliveryFee`, and `order.total` are always computed by plain arithmetic in `pricing.js` — never by the language model. See `recalculateOrderTotals()`:

1. `subtotal` = sum of each item's `lineTotal` (`unitPrice × quantity`, where `unitPrice` came from `data/menu.json` when the item was added — see `POST /api/order/items`).
2. The best currently-eligible active promotion (if any) from `promotionEngine.js` is subtracted to get a discounted subtotal.
3. `tax` = discounted subtotal × `TAX_RATE`.
4. `deliveryFee` = `DELIVERY_FEE` if `orderType` is `"delivery"`, otherwise `0`.
5. `total` = discounted subtotal + tax + delivery fee.

`TAX_RATE` and `DELIVERY_FEE` are the only two settings, in `pricingConfig.js` — change them there, nothing else needs to change:

```js
const TAX_RATE = 0.08;   // 8% sales tax
const DELIVERY_FEE = 3.0; // flat fee, delivery orders only
```

`recalculateOrderTotals()` runs after every change that could affect price: adding/updating/removing an item, or selecting pickup/delivery. CafeBot's job is only to read back `order.subtotal` / `order.tax` / `order.deliveryFee` / `order.total` (or the ready-made `orderSummary`) — it must never calculate, estimate, or restate these numbers itself.

Those same endpoints also return `promotionMessage`: a short note about the currently applied promotion (or `null` if none applies). See "Promotions" below.

`/api/chat`'s `reply` comes from Anthropic's Messages API (`AI_MODEL`, called via the built-in `fetch` — no SDK dependency). CafeBot's system instructions (`prompts/system-prompt.md`) are grounded with the live `data/menu.json`, currently active promotions, `data/faq.json` (hours/location/wifi), and the session's current `orderSummary` before every call, so replies are never invented — see `buildGroundedSystemPrompt()` and `generateReply()` in `aiReply.js`. If `ANTHROPIC_API_KEY` isn't set, or the API call fails, `reply` falls back to a plain apology message rather than fabricating an answer.

`aiReply.js` is shared with `frontend/api/chat.js` — the stateless Vercel serverless version of this endpoint used when the frontend is deployed to Vercel (see the root `README.md`'s "Deploying" section). That version can't hold order/session state across requests, so it always grounds against a fresh empty order; this full backend is the only place multi-step order-building actually works.

### `GET /api/menu`

Returns every menu item and the currently active promotions — read-only, no session needed. Used by `frontend/home.html` to render the menu grid.

**Response body:**

```json
{
  "items": [{ "...": "same shape as data/menu.json's items" }],
  "activePromotions": [{ "id": "promo-001", "name": "Happy Hour Coffee", "rule": "20% off any coffee category item purchased between 2pm and 4pm." }]
}
```

### `GET /api/faq`

Returns `data/faq.json` as-is (hours, location, wifi) — read-only, no session needed. Used by `frontend/home.html`'s Hours & Location section, and included in CafeBot's grounded system prompt so it can answer these questions too.

### `POST /api/order/items`

Adds one valid menu item (validated against `../data/menu.json`) to a session's order. Checkout is not implemented yet.

**Request body:**

```json
{
  "sessionId": "required, from a previous /api/chat or /api/order/items response",
  "itemId": "coffee-003",
  "size": "Medium",
  "options": ["Oat milk (+$0.50)"],
  "quantity": 1
}
```

- `sessionId` (string, required)
- `itemId` (string, required) — must match an `id` in `data/menu.json`
- `size` (string, optional/required) — required only if the item has sizes; omit it and CafeBot will ask for it
- `options` (array of strings, optional) — each must be one of the item's listed `options`
- `quantity` (number, optional) — positive whole number, defaults to `1`

**Response body — success:**

```json
{
  "sessionId": "...",
  "order": { "...": "updated order, including the new item and total" },
  "orderSummary": "...",
  "recommendations": [{ "id": "pastry-001", "name": "Butter Croissant" }],
  "recommendationMessage": "You might also like: Butter Croissant. Totally optional, just let me know!"
}
```

`recommendations` suggests at most 2 real menu items (never invented) that fill an obvious gap in the order — e.g. a food item if it's all drinks, or a drink if it's all food. If there's nothing worth suggesting, `recommendations` is `[]` and `recommendationMessage` is `null`. See `recommendations.js`.

**Response body — missing required size:**

```json
{
  "needsInput": "size",
  "message": "What size would you like for Caramel Latte? Choose from: Small, Medium, Large.",
  "sessionId": "...",
  "order": { "...": "unchanged" }
}
```

**Response body — invalid item/size/option/quantity:**

```json
{ "error": "...", "sessionId": "...", "order": { "...": "unchanged" } }
```

### `PATCH /api/order/items`

Modifies an existing order item's quantity, size, and/or options, validated against `../data/menu.json`. To reduce quantity, pass a smaller `quantity`; to remove the item entirely, use `DELETE /api/order/items` instead. Checkout is not implemented yet.

**Request body:**

```json
{
  "sessionId": "required",
  "itemIndex": 0,
  "quantity": 2,
  "size": "Large",
  "options": ["Oat milk (+$0.50)"]
}
```

- `sessionId` (string, required)
- `itemIndex` (number, required) — the item's position in `order.items` (from a previous response)
- `quantity` (number, optional) — positive whole number
- `size` (string, optional) — must be one of the item's valid sizes; only allowed if the item has sizes
- `options` (array of strings, optional) — each must be one of the item's listed `options`; replaces the item's current options

At least one of `quantity`, `size`, or `options` must be provided. Only the fields you include are changed — anything omitted keeps its current value.

**Response body — success:**

```json
{ "sessionId": "...", "order": { "...": "updated order, including the recalculated total" } }
```

**Response body — invalid index/size/option/quantity:**

```json
{ "error": "...", "sessionId": "...", "order": { "...": "unchanged" } }
```

### `DELETE /api/order/items`

Removes an item entirely from a session's order. Checkout is not implemented yet.

**Request body:**

```json
{ "sessionId": "required", "itemIndex": 0 }
```

- `sessionId` (string, required)
- `itemIndex` (number, required) — the item's position in `order.items` (from a previous response)

**Response body — success:**

```json
{ "sessionId": "...", "order": { "...": "updated order, with the item removed and total recalculated" } }
```

**Response body — invalid index:**

```json
{ "error": "...", "sessionId": "...", "order": { "...": "unchanged" } }
```

### `POST /api/order/pickup`

Selects pickup for the order and collects the customer name (required before checkout) and pickup time (optional). Only send the fields you have — anything omitted keeps its current value, and CafeBot only asks for what's still missing. Checkout is not implemented yet.

**Request body:**

```json
{ "sessionId": "required", "customerName": "Alex", "pickupTime": "3:30 PM" }
```

- `sessionId` (string, required)
- `customerName` (string, optional per call, but required overall before checkout) — omit if already set and you're only updating `pickupTime`
- `pickupTime` (string, optional) — free text, e.g. `"3:30 PM"` or `"ASAP"`

**Response body — success (name now known):**

```json
{ "sessionId": "...", "order": { "...": "orderType is now \"pickup\", customerDetails.name and pickupTime set" }, "orderSummary": "..." }
```

**Response body — name still missing:**

```json
{
  "needsInput": "customerName",
  "message": "Can I get your name for the pickup order?",
  "sessionId": "...",
  "order": { "...": "orderType is \"pickup\", name still null" },
  "orderSummary": "..."
}
```

**Response body — invalid input:**

```json
{ "error": "...", "sessionId": "...", "order": { "...": "unchanged" } }
```

### `POST /api/order/delivery`

Selects delivery for the order and collects the required customer name, phone number, and full delivery address, plus the optional apartment/unit and delivery instructions. Only send the fields you have — anything omitted keeps its current value, and CafeBot only asks for whichever required fields are still missing. Nothing is ever guessed: required fields stay `null` until the customer actually provides them. Checkout is not implemented yet.

**Request body:**

```json
{
  "sessionId": "required",
  "customerName": "Alex",
  "phone": "555-123-4567",
  "address": "123 Main St",
  "apartmentUnit": "Apt 4B",
  "deliveryInstructions": "Leave at the door"
}
```

- `sessionId` (string, required)
- `customerName` (string, required overall before checkout) — omit if already set and you're only updating another field
- `phone` (string, required overall before checkout)
- `address` (string, required overall before checkout) — the full delivery address
- `apartmentUnit` (string, optional) — only ask the customer for this if applicable to their address
- `deliveryInstructions` (string, optional)

**Response body — success (all required fields known and address already confirmed):**

```json
{
  "sessionId": "...",
  "order": { "...": "orderType is now \"delivery\", customerDetails.name/phone, deliveryAddress, etc. set" },
  "orderSummary": "..."
}
```

**Response body — required fields still missing:**

```json
{
  "needsInput": "deliveryDetails",
  "missingFields": ["phone", "address"],
  "message": "Could you share your phone number and your full delivery address for delivery?",
  "sessionId": "...",
  "order": { "...": "orderType is \"delivery\", missing fields still null" },
  "orderSummary": "..."
}
```

**Response body — required fields known, but address not yet confirmed:**

Any `address` you send (or the first time all required fields become known) marks the address unconfirmed, so CafeBot must repeat it back for explicit confirmation before checkout — see `POST /api/order/delivery/confirm-address` below.

```json
{
  "needsInput": "addressConfirmation",
  "message": "Just to confirm, I have your delivery address as: 123 Main St, Apt 4B. Is that correct, or would you like to correct it?",
  "sessionId": "...",
  "order": { "...": "addressConfirmed is false" },
  "orderSummary": "..."
}
```

**Response body — invalid input:**

```json
{ "error": "...", "sessionId": "...", "order": { "...": "unchanged" } }
```

### `POST /api/order/delivery/confirm-address`

Records the customer's explicit confirmation or correction of the delivery address. Required before checkout for delivery orders — the address is never assumed correct just because it was typed in once.

**Request body — confirming:**

```json
{ "sessionId": "required", "confirmed": true }
```

**Request body — correcting:**

```json
{ "sessionId": "required", "correctedAddress": "456 Oak Ave" }
```

- `sessionId` (string, required)
- `confirmed` (boolean, optional) — `true` accepts the address as-is; `false` prompts for a correction
- `correctedAddress` (string, optional) — provide this instead of `confirmed` to directly replace the address; it always requires confirming again afterward

**Response body — confirmed:**

```json
{ "sessionId": "...", "order": { "...": "addressConfirmed is true" }, "orderSummary": "..." }
```

**Response body — still needs confirmation (after a correction, or after `confirmed: false`):**

```json
{
  "needsInput": "addressConfirmation",
  "message": "Just to confirm, I have your delivery address as: 456 Oak Ave. Is that correct, or would you like to correct it?",
  "sessionId": "...",
  "order": { "...": "addressConfirmed is false" },
  "orderSummary": "..."
}
```

**Response body — invalid input (e.g. no address on file yet):**

```json
{ "error": "...", "sessionId": "...", "order": { "...": "unchanged" } }
```

### `GET /api/order/summary?sessionId=...`

Returns the current order and its `orderSummary` for a session, without changing anything — useful when the customer asks "what's in my order?".

- `sessionId` (query parameter, required)

**Response body:**

```json
{ "sessionId": "...", "order": { "...": "current order" }, "orderSummary": "..." }
```

### `GET /api/order/recommendations?sessionId=...`

Returns up to 2 real-menu-item recommendations for a session's current order, without changing anything — useful when the customer asks "what do you recommend?". See the `recommendations` note under `POST /api/order/items` above for how these are chosen.

- `sessionId` (query parameter, required)

**Response body:**

```json
{
  "sessionId": "...",
  "recommendations": [{ "id": "coffee-001", "name": "Classic Drip Coffee" }],
  "recommendationMessage": "You might also like: Classic Drip Coffee. Totally optional, just let me know!"
}
```

### `GET /api/order/promotions?sessionId=...`

Returns which active promotions currently apply to a session's order, without changing anything — useful when the customer asks "any deals right now?".

- `sessionId` (query parameter, required)

**Response body:**

```json
{
  "sessionId": "...",
  "eligiblePromotions": [
    { "id": "promo-001", "name": "Happy Hour Coffee", "rule": "20% off any coffee category item purchased between 2pm and 4pm." }
  ],
  "appliedPromotion": { "id": "promo-001", "name": "Happy Hour Coffee", "discountAmount": 0.9 },
  "promotionMessage": "The \"Happy Hour Coffee\" promotion has been applied, saving you $0.90."
}
```

### `GET /api/order/checkout-summary?sessionId=...`

Returns the complete structured order summary CafeBot should show the customer before checkout: items with quantities/customizations, fulfillment details, currently valid promotions, and the price breakdown. Read-only — doesn't change anything. See `orderSummary.js`.

- `sessionId` (query parameter, required)

**Response body:**

```json
{
  "sessionId": "...",
  "checkoutSummary": {
    "items": [
      {
        "id": "coffee-003",
        "name": "Caramel Latte",
        "size": "Medium",
        "quantity": 1,
        "options": ["Oat milk (+$0.50)"],
        "unitPrice": 4.5,
        "lineTotal": 4.5
      }
    ],
    "fulfillment": {
      "type": "delivery",
      "customerName": "Sam",
      "phone": "555-123-4567",
      "address": "123 Main St",
      "addressConfirmed": true,
      "apartmentUnit": null,
      "deliveryInstructions": null
    },
    "promotions": {
      "applied": null,
      "valid": []
    },
    "pricing": { "subtotal": 4.5, "tax": 0.36, "deliveryFee": 3.0, "total": 7.86 },
    "readyForCheckout": true,
    "blockers": []
  },
  "orderSummary": "..."
}
```

- `promotions.applied` — the promotion actually applied to the total (or `null`)
- `promotions.valid` — every active promotion currently eligible for this order (usually the same as `applied`, since the best one is auto-applied)
- `readyForCheckout` — `true` only when there's at least one item, an order type is selected, and all of that type's required fulfillment info (including, for delivery, address confirmation) is present
- `blockers` — plain-language reasons `readyForCheckout` is `false` (empty when ready)

### `POST /api/order/confirm`

The confirmation gate. This is the only way `order.confirmed` can ever become `true` — nothing else in the codebase sets it — and confirming is also the only way an order gets saved to `data/orders.json` (see `confirmation.js` and `orderStorage.js`).

**Request body:**

```json
{ "sessionId": "required", "reply": "yes" }
```

- `sessionId` (string, required)
- `reply` (string, required) — the customer's exact reply after being shown the checkout summary

**Response body — confirmed and saved:**

```json
{
  "sessionId": "...",
  "order": {
    "...": "confirmed: true, status: \"confirmed\"",
    "orderId": "b3f1c2...",
    "confirmedAt": "2026-01-15T18:32:04.123Z"
  },
  "orderSummary": "...\nOrder confirmed! Order ID: b3f1c2... (at 2026-01-15T18:32:04.123Z)",
  "checkoutSummary": { "...": "readyForCheckout: true" },
  "saved": {
    "orderId": "b3f1c2...",
    "sessionId": "...",
    "timestamp": "2026-01-15T18:32:04.123Z",
    "status": "confirmed",
    "order": { "...": "the same structured checkoutSummary shape, as saved to data/orders.json" }
  }
}
```

**Response body — order not ready yet** (`reply` is ignored until the order is actually complete):

```json
{
  "needsInput": "orderIncomplete",
  "blockers": ["Delivery address has not been confirmed yet."],
  "message": "This order isn't ready to confirm yet: Delivery address has not been confirmed yet.",
  "sessionId": "...",
  "order": { "...": "confirmed: false" },
  "orderSummary": "...",
  "checkoutSummary": { "...": "readyForCheckout: false" }
}
```

**Response body — customer declined** (`reply` was an exact match like `"no"` or `"cancel"`):

```json
{
  "needsInput": "orderChanges",
  "message": "No problem — what would you like to change?",
  "sessionId": "...",
  "order": { "...": "confirmed: false" },
  "orderSummary": "...",
  "checkoutSummary": { "...": "..." }
}
```

**Response body — ambiguous reply** (anything that isn't an exact, known affirmative or decline — `"maybe"`, `"sure"`, `"ok"`, `"I guess"`, unrelated text, etc.):

```json
{
  "needsInput": "confirmation",
  "message": "I didn't quite catch that. Could you clearly say \"yes\" to confirm this order as shown, or \"no\" if you'd like to change something?",
  "sessionId": "...",
  "order": { "...": "confirmed: false" },
  "orderSummary": "...",
  "checkoutSummary": { "...": "..." }
}
```

**Response body — invalid input:**

```json
{ "error": "...", "sessionId": "...", "order": { "...": "unchanged" }, "orderSummary": "...", "checkoutSummary": { "...": "..." } }
```

## Confirmation gate

The system never marks an order confirmed except through `POST /api/order/confirm`, and even then only when both are true:

1. **The order is checkout-ready** — `getCheckoutBlockers()` (from `orderSummary.js`) returns no blockers: at least one item, an order type selected, and all required fulfillment info for that type present (for delivery, the address must already be confirmed via `POST /api/order/delivery/confirm-address`).
2. **The reply is an unambiguous, exact affirmative** — matched against a fixed allowlist in `confirmation.js` (`"yes"`, `"confirm"`, `"that's correct"`, etc.). A decline (`"no"`, `"cancel"`, ...) is recognized and handled separately. Anything else — hedged replies (`"maybe"`, `"I guess"`, `"probably"`), a bare `"ok"` or `"sure"`, an empty reply, or unrelated text — is **ambiguous** and never counts as confirmation; CafeBot is told to ask again plainly.

If anything about the order changes after it was confirmed (an item added/updated/removed, pickup/delivery details changed, or the delivery address corrected), `order.confirmed`, `order.status`, `order.orderId`, and `order.confirmedAt` automatically reset (to `false`/`"building"`/`null`/`null`) — a stale confirmation of a since-changed order never counts, and re-confirming later saves a fresh record with a new `orderId`.

### Saving a confirmed order

The moment (and only the moment) `confirmOrder()` classifies a reply as confirmed, it calls `saveConfirmedOrder()` (`orderStorage.js`), which:

1. Refuses to run at all unless `order.confirmed` and `order.status === "confirmed"` are already true — a defensive check on top of the gate above, so a draft can never be written as if it were placed even by a coding mistake elsewhere.
2. Appends one record to `data/orders.json` with a unique `orderId` (`crypto.randomUUID()`), an ISO `timestamp`, `status: "confirmed"`, and the same structured `order` shape as `checkoutSummary` above.
3. Stores that `orderId` and `timestamp` back onto the in-memory order as `orderId`/`confirmedAt`.

`data/orders.json` is a plain JSON array — no database — and is only ever appended to by this one function.

### `POST /api/staff/login`

Exchanges the admin password for a session token. This is the only way to obtain a token — every other `/api/staff/*` endpoint requires one.

**Request body:**

```json
{ "password": "..." }
```

**Response body — success:**

```json
{ "token": "0f3828ff-8c8a-4b07-8fd2-dadd3a062a8b" }
```

**Response body — wrong password, or `ADMIN_PASSWORD` isn't set:**

```json
{ "error": "Incorrect password." }
```

Tokens are plain random UUIDs kept in an in-memory `Set` (`staffAuth.js`) — no JWT, no expiry logic, cleared on server restart. Send the token on every subsequent staff request as `Authorization: Bearer <token>`.

### `POST /api/staff/logout`

Invalidates a token (send it as `Authorization: Bearer <token>`). Always responds `{ "loggedOut": true }`, even if the token was already invalid.

### `GET /api/staff/orders`

Requires `Authorization: Bearer <token>` from a successful login — responds `401 { "error": "Not authenticated. Please log in." }` otherwise.

Returns every saved order (from `data/orders.json`), newest first, for the staff dashboard (`frontend/staff.html`).

**Response body:**

```json
{
  "orders": [
    {
      "orderId": "b3f1c2...",
      "sessionId": "...",
      "timestamp": "2026-01-15T18:32:04.123Z",
      "status": "confirmed",
      "order": { "items": [ "..." ], "fulfillment": { "...": "..." }, "promotions": { "...": "..." }, "pricing": { "...": "..." } }
    }
  ]
}
```

### `PATCH /api/staff/orders/:orderId`

Requires `Authorization: Bearer <token>`, same as above. Updates one saved order's status. This is the only way a saved order's status can change after it's placed.

**Request body:**

```json
{ "status": "preparing" }
```

- `status` (string, required) — one of `"confirmed"`, `"preparing"`, `"ready"`, `"completed"`, `"cancelled"` (see `ORDER_STATUSES` in `orderStorage.js`)

**Response body — success:**

```json
{ "order": { "orderId": "b3f1c2...", "status": "preparing", "updatedAt": "...", "...": "rest of the saved record" } }
```

**Response body — invalid status or unknown order ID:**

```json
{ "error": "..." }
```

These two endpoints (plus every other endpoint) send `Access-Control-Allow-Origin: *`, and the server answers `OPTIONS` preflight requests, so the dashboard can be opened from a different origin/port than the backend.

## Promotions

`data/promotions.json` is the only source of promotions — see `promotions.js` and `promotionEngine.js`.

- Only promotions with `"active": true` are ever considered; inactive/expired ones (like the seasonal smoothie special) are filtered out entirely and can never be applied or recommended.
- An active promotion is only applied if its `eligibility` rules are actually met by the current order: `requiredCategories` (all must be present), `minItems` (total quantity across items), and `timeWindow` (checked against the server's current local time — there's no timezone handling, which is fine for local development but worth knowing).
- After every add/update/remove, the order is re-evaluated and the single best currently-eligible promotion (largest discount) is applied to `order.promotion` and reflected in `order.total`; `order.promotion` is `null` when nothing currently qualifies.
- Discount amounts are always computed from the real menu prices and the promotion's own `discount` data — nothing is invented or hardcoded per item.
