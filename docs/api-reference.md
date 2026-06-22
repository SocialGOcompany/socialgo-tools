# SocialGO API v2 Reference

This is the complete reference for the **SocialGO API v2** — the HTTP contract that
the [`@socialgo/sdk`](./sdk.md), [`@socialgo/cli`](./cli.md), and
[`@socialgo/mcp`](./mcp.md) packages encapsulate. Use it to debug requests or to build
directly against your SocialGO panel.

The API has two distinct surfaces:

| Surface | Auth | Transport | Purpose |
| --- | --- | --- | --- |
| **Reseller API** | API key (`key` + `action`) | single endpoint `POST /api/v2` | Drive your prepaid reseller account: catalog, orders, refills, cancels, wallet. |
| **Guest checkout** | none (public) | REST under `/guest/*` and `/gateways/active` | Place a single pay-per-order **without an account or API key**. |

The reseller surface follows the de-facto **SMM API v2** convention used across the
industry: one endpoint that receives a `key` and an `action`, and replies with JSON.
The guest surface is a small set of public REST endpoints layered on the same backend.

---

## Table of contents

- [Base URL](#base-url)
- [Reseller API](#reseller-api)
  - [Authentication](#authentication)
  - [Request format](#request-format)
  - [Response format](#response-format)
  - [Actions](#actions)
    - [`services`](#action-services)
    - [`add`](#action-add)
    - [`status`](#action-status)
    - [`orders`](#action-orders)
    - [`refill`](#action-refill)
    - [`refill_status`](#action-refill_status)
    - [`cancel`](#action-cancel)
    - [`balance`](#action-balance)
    - [`wallet`](#action-wallet)
    - [`add_funds`](#action-add_funds)
    - [`sync`](#action-sync)
  - [Per-type order parameters](#per-type-order-parameters)
  - [Order status values](#order-status-values)
  - [Errors](#errors)
- [Guest checkout API](#guest-checkout-api)
  - [`GET /guest/services`](#get-guestservices)
  - [`GET /gateways/active`](#get-gatewaysactive)
  - [`POST /guest/order`](#post-guestorder)
  - [`GET /guest/order/:id`](#get-guestorderid)
- [Rate limits & best practices](#rate-limits--best-practices)
- [See also](#see-also)

---

## Base URL

All requests go to a single base URL. The default is:

```
https://usesocialgo.com
```

You can point the tooling at a different host (e.g. a self-hosted or staging panel)
with the `SOCIALGO_API_URL` environment variable. The SDK/CLI strip any trailing
slash before composing paths.

| Surface | Path |
| --- | --- |
| Reseller API | `POST {base}/api/v2` |
| Guest catalog | `GET {base}/guest/services` |
| Active gateways | `GET {base}/gateways/active` |
| Create guest order | `POST {base}/guest/order` |
| Guest order status | `GET {base}/guest/order/:id` |

---

## Reseller API

### Authentication

The reseller API is authenticated with an **API key** issued by your SocialGO panel
(found under **Account › API**). There is no separate login step — the key is sent
with every request.

The key can be provided in **either** of two ways (the CLI sends both for
convenience):

1. In the request body, as the `key` field — this is the canonical SMM v2 method and
   is always honored.
2. As a `Bearer` token in the `Authorization` header (optional, also accepted).

> **Never hard-code your key.** The tooling reads it from `SOCIALGO_API_KEY` and never
> embeds it. Treat it like a password — anyone with the key can spend your wallet.

### Request format

Every reseller call is a `POST` to `/api/v2` carrying at least `key` and `action`.
Two content types are accepted:

- **`application/x-www-form-urlencoded`** — the classic SMM v2 form. Used by the MCP
  server and by most third-party SMM clients.
- **`application/json`** — the same fields as a JSON object. Used by the CLI.

Both are equivalent. Pick whichever your HTTP client makes easiest.

Form-urlencoded:

```bash
curl -s https://usesocialgo.com/api/v2 \
  -d key="$SOCIALGO_API_KEY" \
  -d action=balance
```

JSON (equivalent):

```bash
curl -s https://usesocialgo.com/api/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SOCIALGO_API_KEY" \
  -d '{"key":"'"$SOCIALGO_API_KEY"'","action":"balance"}'
```

> The `curl` examples below use form-urlencoded (`-d field=value`) for brevity. Run
> `export SOCIALGO_API_KEY=...` in your shell first so the key is never written down.

### Response format

Responses are JSON. The exact shape depends on the action (documented per action
below). There is no envelope: a successful `balance` call returns the balance object
directly, `services` returns an array directly, and so on.

A **business error** is signalled by an `error` field in the JSON body — even when the
HTTP status is `200`. Always check for `error` before reading the result. See
[Errors](#errors).

---

### Actions

The reseller endpoint supports the following actions.

| Action | Summary | Returns |
| --- | --- | --- |
| [`services`](#action-services) | List the full service catalog | `SmmService[]` |
| [`add`](#action-add) | Place an order | `{ order }` |
| [`status`](#action-status) | Status of one or many orders | status object(s) |
| [`orders`](#action-orders) | Reseller order history *(extension)* | `OrderListItem[]` |
| [`refill`](#action-refill) | Request a refill | `{ refill }` |
| [`refill_status`](#action-refill_status) | Status of a refill | `{ status }` |
| [`cancel`](#action-cancel) | Cancel one or many orders | `[{ order, cancel }]` |
| [`balance`](#action-balance) | Current account balance | `{ balance, currency }` |
| [`wallet`](#action-wallet) | Balance + recent transactions *(extension)* | wallet object |
| [`add_funds`](#action-add_funds) | Create a pending top-up payment *(extension)* | payment object |
| [`sync`](#action-sync) | Re-import the catalog *(admin)* | `{ imported, suppliers? }` |

Actions marked *(extension)* are SocialGO additions on top of the base SMM v2 spec.

---

#### Action: `services`

List the entire service catalog.

**Parameters**

| Field | Required | Description |
| --- | --- | --- |
| `key` | yes | Your API key. |
| `action` | yes | `services` |

**Returns** — an array of service objects (`SmmService[]`):

| Field | Type | Description |
| --- | --- | --- |
| `service` | number \| string | Service id — use this as `service` when placing orders. |
| `name` | string | Display name. |
| `type` | string | Service type, e.g. `Default`, `Package`, `Custom Comments`, `Subscriptions`. Drives [per-type parameters](#per-type-order-parameters). |
| `category` | string | Category grouping. |
| `rate` | string | Price per 1,000 units, in the account currency. |
| `min` | string | Minimum order quantity. |
| `max` | string | Maximum order quantity. |
| `refill` | boolean? | Whether the service supports refills. |
| `cancel` | boolean? | Whether the service supports cancellation. |
| `dripfeed` | boolean? | Whether the service supports drip-feed. |

> Some panels wrap the array as `{ "services": [...] }`. The SDK handles both shapes
> transparently.

**Example**

```bash
curl -s https://usesocialgo.com/api/v2 \
  -d key="$SOCIALGO_API_KEY" \
  -d action=services
```

```json
[
  {
    "service": 101,
    "name": "Instagram Followers — High Quality",
    "type": "Default",
    "category": "Instagram Followers",
    "rate": "1.20",
    "min": "50",
    "max": "100000",
    "refill": true,
    "cancel": true,
    "dripfeed": false
  }
]
```

---

#### Action: `add`

Place an order. The order cost is debited from your wallet and the order is dispatched.

**Parameters**

| Field | Required | Description |
| --- | --- | --- |
| `key` | yes | Your API key. |
| `action` | yes | `add` |
| `service` | yes | Service id from the catalog. |
| `link` | yes | Target link (profile, post, video, etc.). |
| `quantity` | conditional | Amount to order. Required for most types; omitted for fixed-size packages. |
| `runs` | no | Drip-feed: number of runs. |
| `interval` | no | Drip-feed: minutes between runs. |
| *(per-type)* | conditional | Extra fields that depend on the service `type` — see [Per-type order parameters](#per-type-order-parameters). |

**Returns**

```json
{ "order": 230193 }
```

| Field | Type | Description |
| --- | --- | --- |
| `order` | number \| string | The new order id. Use it with `status`, `refill`, `cancel`. |

**Example — simple order**

```bash
curl -s https://usesocialgo.com/api/v2 \
  -d key="$SOCIALGO_API_KEY" \
  -d action=add \
  -d service=101 \
  -d link="https://instagram.com/your_profile" \
  -d quantity=1000
```

**Example — drip-feed**

```bash
curl -s https://usesocialgo.com/api/v2 \
  -d key="$SOCIALGO_API_KEY" \
  -d action=add \
  -d service=101 \
  -d link="https://instagram.com/your_profile" \
  -d quantity=1000 \
  -d runs=10 \
  -d interval=60
```

---

#### Action: `status`

Get the status of one order or several orders at once.

**Parameters**

| Field | Required | Description |
| --- | --- | --- |
| `key` | yes | Your API key. |
| `action` | yes | `status` |
| `order` | one of `order`/`orders` | A single order id. |
| `orders` | one of `order`/`orders` | A **comma-separated** list of order ids for a batch lookup. |

**Returns — single (`order`)**

```json
{
  "charge": "1.20",
  "start_count": "4500",
  "status": "In progress",
  "remains": "320",
  "currency": "USD"
}
```

| Field | Type | Description |
| --- | --- | --- |
| `charge` | string | Amount charged for the order. |
| `start_count` | string | Counter value when the order started. |
| `status` | string | See [Order status values](#order-status-values). |
| `remains` | string | Units still pending. |
| `currency` | string | Currency of `charge`. |

**Returns — batch (`orders`)** — a map keyed by order id. Each value is either a
status object (same shape as above) or `{ "error": "..." }` for an id that could not
be read:

```json
{
  "230193": { "charge": "1.20", "start_count": "4500", "status": "Completed", "remains": "0", "currency": "USD" },
  "230194": { "error": "Incorrect order ID" }
}
```

**Example — single**

```bash
curl -s https://usesocialgo.com/api/v2 \
  -d key="$SOCIALGO_API_KEY" \
  -d action=status \
  -d order=230193
```

**Example — batch**

```bash
curl -s https://usesocialgo.com/api/v2 \
  -d key="$SOCIALGO_API_KEY" \
  -d action=status \
  -d orders="230193,230194,230195"
```

---

#### Action: `orders`

> **SocialGO extension** (not part of the base SMM v2 spec).

List the reseller's order history.

**Parameters**

| Field | Required | Description |
| --- | --- | --- |
| `key` | yes | Your API key. |
| `action` | yes | `orders` |

**Returns** — an array of order summaries:

| Field | Type | Description |
| --- | --- | --- |
| `order` | number \| string | Order id. |
| `charge` | string | Amount charged. |
| `status` | string | Current status. |
| `start_count` | string | Counter at start. |
| `remains` | string | Units remaining. |
| `link` | string? | Target link. |
| `quantity` | number? | Ordered quantity. |
| `created_at` | string? | Creation timestamp. |

**Example**

```bash
curl -s https://usesocialgo.com/api/v2 \
  -d key="$SOCIALGO_API_KEY" \
  -d action=orders
```

---

#### Action: `refill`

Request a refill for an order (only valid on services where `refill` is `true`).

**Parameters**

| Field | Required | Description |
| --- | --- | --- |
| `key` | yes | Your API key. |
| `action` | yes | `refill` |
| `order` | yes | Order id to refill. |

**Returns**

```json
{ "refill": 4501 }
```

| Field | Type | Description |
| --- | --- | --- |
| `refill` | number \| string | Refill id — use it with `refill_status`. |

**Example**

```bash
curl -s https://usesocialgo.com/api/v2 \
  -d key="$SOCIALGO_API_KEY" \
  -d action=refill \
  -d order=230193
```

---

#### Action: `refill_status`

Get the status of a refill, either by refill id or by the original order id.

**Parameters**

| Field | Required | Description |
| --- | --- | --- |
| `key` | yes | Your API key. |
| `action` | yes | `refill_status` |
| `refill` | one of `refill`/`order` | Refill id returned by `refill`. |
| `order` | one of `refill`/`order` | Original order id. |

**Returns**

```json
{ "status": "Completed" }
```

| Field | Type | Description |
| --- | --- | --- |
| `status` | string | Refill status (e.g. `Pending`, `In progress`, `Completed`, `Rejected`). |

**Example**

```bash
curl -s https://usesocialgo.com/api/v2 \
  -d key="$SOCIALGO_API_KEY" \
  -d action=refill_status \
  -d refill=4501
```

---

#### Action: `cancel`

Cancel one or more orders (only valid on services where `cancel` is `true`).

**Parameters**

| Field | Required | Description |
| --- | --- | --- |
| `key` | yes | Your API key. |
| `action` | yes | `cancel` |
| `orders` | yes | A **comma-separated** list of order ids (a single id is also valid). |

**Returns** — always an array, one entry per requested order:

```json
[
  { "order": 230193, "cancel": 1 },
  { "order": 230194, "cancel": { "error": "Incorrect order ID" } }
]
```

| Field | Type | Description |
| --- | --- | --- |
| `order` | number \| string | The order id. |
| `cancel` | any | Result for that order — a success indicator or an `{ error }` object. |

**Example**

```bash
curl -s https://usesocialgo.com/api/v2 \
  -d key="$SOCIALGO_API_KEY" \
  -d action=cancel \
  -d orders="230193,230194"
```

---

#### Action: `balance`

Get the current account balance.

**Parameters**

| Field | Required | Description |
| --- | --- | --- |
| `key` | yes | Your API key. |
| `action` | yes | `balance` |

**Returns**

```json
{ "balance": "42.50", "currency": "USD" }
```

| Field | Type | Description |
| --- | --- | --- |
| `balance` | string | Current spendable balance. |
| `currency` | string | Account currency. |

**Example**

```bash
curl -s https://usesocialgo.com/api/v2 \
  -d key="$SOCIALGO_API_KEY" \
  -d action=balance
```

---

#### Action: `wallet`

> **SocialGO extension.** If the panel does not implement it (responding `400`/`404`),
> the SDK falls back to `balance` and returns balance + currency only.

Get the wallet summary: balance, currency, and (when available) a recent transaction
list.

**Parameters**

| Field | Required | Description |
| --- | --- | --- |
| `key` | yes | Your API key. |
| `action` | yes | `wallet` |

**Returns**

```json
{
  "balance": "42.50",
  "currency": "USD",
  "transactions": [
    { "type": "order", "amount": "-1.20", "balanceAfter": "42.50", "note": "Order #230193", "createdAt": "2026-06-20T18:04:00Z" }
  ]
}
```

| Field | Type | Description |
| --- | --- | --- |
| `balance` | string | Current balance. |
| `currency` | string | Account currency. |
| `transactions` | array? | Recent ledger entries (`type`, `amount`, `balanceAfter`, `note`, `createdAt`). |

**Example**

```bash
curl -s https://usesocialgo.com/api/v2 \
  -d key="$SOCIALGO_API_KEY" \
  -d action=wallet
```

---

#### Action: `add_funds`

> **SocialGO extension.**

Create a **pending** top-up payment. The call returns a payment that you then complete
in the panel (or at the gateway's hosted checkout).

**Parameters**

| Field | Required | Description |
| --- | --- | --- |
| `key` | yes | Your API key. |
| `action` | yes | `add_funds` |
| `amount` | yes | Amount to add. |
| `method` | yes | Payment method / gateway name. |

**Returns**

```json
{
  "payment": 99001,
  "status": "pending",
  "amount": "20.00",
  "currency": "USD",
  "method": "stripe",
  "message": "Complete the payment in your panel."
}
```

| Field | Type | Description |
| --- | --- | --- |
| `payment` | number \| string | Payment id. |
| `status` | string | Payment status (`pending`, ...). |
| `amount` | string | Amount. |
| `currency` | string | Currency. |
| `method` | string | Chosen method/gateway. |
| `message` | string? | Human-readable next step. |

**Example**

```bash
curl -s https://usesocialgo.com/api/v2 \
  -d key="$SOCIALGO_API_KEY" \
  -d action=add_funds \
  -d amount=20 \
  -d method=stripe
```

---

#### Action: `sync`

> **SocialGO extension — requires admin privileges.**

Re-import the catalog from the active providers.

**Parameters**

| Field | Required | Description |
| --- | --- | --- |
| `key` | yes | Your API key (admin). |
| `action` | yes | `sync` |

**Returns**

```json
{ "imported": 1284, "suppliers": 3 }
```

| Field | Type | Description |
| --- | --- | --- |
| `imported` | number | Number of services imported. |
| `suppliers` | number? | Number of providers synced. |

**Example**

```bash
curl -s https://usesocialgo.com/api/v2 \
  -d key="$SOCIALGO_API_KEY" \
  -d action=sync
```

---

### Per-type order parameters

Beyond `link` and `quantity`, the `add` action accepts extra fields that depend on the
service `type`. Only the fields relevant to a given type should be sent — the SDK omits
any field left `undefined` or empty.

| Field | Type | Used by service types |
| --- | --- | --- |
| `quantity` | number | Default / Package, and most types. |
| `runs` | number | Drip-feed: number of runs. |
| `interval` | number | Drip-feed: minutes between runs. |
| `comments` | string | `Custom Comments`, `Custom Comments Package` — one comment per line. |
| `usernames` | string | `Mentions Custom List`, `Mentions with Hashtags` — usernames to mention. |
| `hashtags` | string | `Mentions with Hashtags` — hashtags to target. |
| `hashtag` | string | `Mentions Hashtag` — a single hashtag. |
| `username` | string | `Mentions User Followers`, `Comment Likes` — a source username. |
| `media` | string | `Mentions Media Likers` — a media reference. |
| `answer_number` | number | `Poll` — the poll answer to vote for. |
| `keywords` | string | Keyword-targeted services. |

**Example — custom comments** (`--data-urlencode` preserves the line breaks):

```bash
curl -s https://usesocialgo.com/api/v2 \
  -d key="$SOCIALGO_API_KEY" \
  -d action=add \
  -d service=512 \
  -d link="https://instagram.com/p/POSTID" \
  --data-urlencode comments=$'Great post!\nLove this\nAmazing content'
```

---

### Order status values

The `status` field returned by `status` (and seen in `orders`) is one of:

| Status | Meaning |
| --- | --- |
| `Pending` | Accepted, not yet started. |
| `In progress` | Currently being delivered. |
| `Processing` | Being prepared/queued at the provider. |
| `Completed` | Fully delivered. |
| `Partial` | Partially delivered; the undelivered portion is typically refunded. |
| `Canceled` | Cancelled (manually or automatically); usually refunded. |

> The set is open-ended — treat `status` as a string and handle unknown values
> gracefully. The values above are the common ones the panel emits.

---

### Errors

There are two error channels — always handle both:

1. **HTTP-level** — a non-`2xx` status. The body normally still contains
   `{ "error": "..." }`; the SDK surfaces that message and the status code.
2. **Business-level** — an HTTP `200` whose body contains a non-empty `error` field.
   This is the standard SMM v2 way of reporting bad input or insufficient funds, so
   you **must** check for `error` even on success responses.

**Error body shape**

```json
{ "error": "Not enough funds" }
```

**Common messages**

| Message (example) | Typical cause |
| --- | --- |
| `Invalid API key` | Missing/wrong `key`. |
| `Invalid action` | Unknown `action`. |
| `Incorrect order ID` | The order id does not exist or is not yours. |
| `Not enough funds` | Wallet balance below the order cost. |
| `Incorrect service ID` | Unknown `service`. |
| `Neither parameter is set` | Required parameters omitted (e.g. `link`/`quantity`). |

In a **batch** `status` lookup, per-order errors appear inline as
`{ "<id>": { "error": "..." } }` rather than failing the whole request. In `cancel`,
per-order errors appear as the `cancel` value of that entry.

The SDK normalizes all of the above into a thrown `SmmV2Error` / `SocialGoApiError`
carrying the message, the HTTP status, and the raw body — so you only need a single
`try/catch`.

---

## Guest checkout API

Guest endpoints are **public**: they take **no API key** and never receive an
`Authorization` header. They let anyone place a single pay-per-order without an
account. Ownership of a guest order is proved later with a `token` (preferred) or the
order's `email`.

See the dedicated [Guest Checkout guide](./guest-checkout.md) for the end-to-end flow.

### `GET /guest/services`

Public catalog used to pick a service without logging in.

**Query parameters**

| Param | Required | Description |
| --- | --- | --- |
| `platform` | no | Filter by platform (e.g. `instagram`, `tiktok`). |
| `q` | no | Free-text search across name/category. |
| `limit` | no | Max number of items to return. |

**Returns**

```json
{
  "items": [
    {
      "id": "ig01",
      "name": "Instagram Followers — High Quality",
      "slug": "instagram-followers-hq",
      "type": "Default",
      "platform": "instagram",
      "categoryName": "Instagram Followers",
      "sellRate": "1.80",
      "min": 50,
      "max": 100000,
      "refill": true,
      "cancel": true,
      "dripfeed": false,
      "description": "Real-looking accounts, gradual delivery."
    }
  ],
  "total": 1
}
```

| Field | Type | Description |
| --- | --- | --- |
| `items[].id` | string | Public service id — use as `serviceId` when ordering. |
| `items[].name` | string | Display name. |
| `items[].slug` | string? | URL-friendly id. |
| `items[].type` | string? | Service type (drives per-type fields, sent via `metadata`). |
| `items[].platform` | string \| null | Platform. |
| `items[].categoryName` | string \| null | Category. |
| `items[].sellRate` | string? | Public price per 1,000 units. |
| `items[].min` / `items[].max` | number? | Order bounds. |
| `items[].refill` / `cancel` / `dripfeed` | boolean? | Feature flags. |
| `items[].description` | string \| null | Human description. |
| `total` | number | Total matching services. |

**Example**

```bash
curl -s "https://usesocialgo.com/guest/services?platform=instagram&q=followers&limit=20"
```

---

### `GET /gateways/active`

The **source of truth** for which payment methods guest checkout accepts. The `method`
you send to `POST /guest/order` must be one of the `gateway` values returned here —
there is no fixed list, gateways are enabled per panel.

**Returns**

```json
{
  "gateways": [
    { "gateway": "mercadopago", "label": "Mercado Pago", "kind": "card",   "coins": [],            "notice": "PIX, card & boleto (BR)" },
    { "gateway": "stripe",      "label": "Stripe",       "kind": "card",   "coins": []                                            },
    { "gateway": "crypto",      "label": "Crypto",       "kind": "crypto", "coins": ["BTC", "USDT", "ETH"]                         }
  ],
  "bonusTiers": []
}
```

| Field | Type | Description |
| --- | --- | --- |
| `gateways[].gateway` | string | Canonical name — the value to send as `method`. |
| `gateways[].label` | string | Friendly display label. |
| `gateways[].kind` | string | UI grouping: `card`, `crypto`, `wallet`, ... |
| `gateways[].coins` | string[] | Accepted coins (crypto); empty for non-crypto. |
| `gateways[].notice` | string? | Regional note (e.g. card availability). |
| `bonusTiers` | array? | Top-up bonus tiers, when configured. |

> Only **non-secret, UI-safe** fields are returned. No gateway credentials are ever
> exposed. If this endpoint is unreachable, clients fall back to a minimal safe set
> (`mercadopago`, `stripe`, `crypto`) purely to avoid blocking the user — it is **not**
> the source of truth.

**Example**

```bash
curl -s "https://usesocialgo.com/gateways/active"
```

---

### `POST /guest/order`

Create a pay-per-order without an account. Returns an `awaiting_payment` order plus a
hosted checkout `url` to complete payment.

**Body** (`application/json`)

| Field | Required | Description |
| --- | --- | --- |
| `email` | yes | Buyer email — used to find/create the guest and for tracking. |
| `serviceId` | yes | Public service id from `GET /guest/services`. |
| `link` | yes | Target link. |
| `method` | yes | An **active** `gateway` from `GET /gateways/active`. |
| `quantity` | conditional | Amount to order (omit for fixed-size packages). |
| `metadata` | no | Object with per-type fields (`comments`, `usernames`, `hashtags`, etc.). |

**Returns**

```json
{
  "orderId": "gord_abc123",
  "guestToken": "gtok_xyz789",
  "url": "https://usesocialgo.com/checkout/gord_abc123",
  "amount": 1.8,
  "currency": "USD"
}
```

| Field | Type | Description |
| --- | --- | --- |
| `orderId` | string | The guest order id. |
| `guestToken` | string | Token proving ownership — **save it** to track the order. |
| `url` | string | Hosted checkout URL — open it to pay. |
| `amount` | number | Amount to pay. |
| `currency` | string | Currency. |

> The order is dispatched for delivery **only after payment confirms** — until then its
> status is `awaiting_payment`.

**Example**

```bash
curl -s -X POST "https://usesocialgo.com/guest/order" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "you@example.com",
    "serviceId": "ig01",
    "link": "https://instagram.com/your_profile",
    "quantity": 500,
    "method": "stripe"
  }'
```

**Example — with per-type metadata (custom comments)**

```bash
curl -s -X POST "https://usesocialgo.com/guest/order" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "you@example.com",
    "serviceId": "ig_comments01",
    "link": "https://instagram.com/p/POSTID",
    "method": "mercadopago",
    "metadata": { "comments": "Great post!\nLove this\nAmazing content" }
  }'
```

---

### `GET /guest/order/:id`

Public status of a guest order. Ownership is validated with `token` (preferred) or
`email`.

**Path parameter**

| Param | Description |
| --- | --- |
| `id` | The `orderId` from `POST /guest/order`. |

**Query parameters**

| Param | Required | Description |
| --- | --- | --- |
| `token` | one of `token`/`email` | The `guestToken` (preferred). |
| `email` | one of `token`/`email` | The buyer email used to create the order. |

**Returns**

```json
{
  "id": "gord_abc123",
  "status": "in_progress",
  "serviceName": "Instagram Followers — High Quality",
  "link": "https://instagram.com/your_profile",
  "quantity": 500,
  "charge": "1.80",
  "startCount": 4500,
  "remains": 120,
  "createdAt": "2026-06-21T12:00:00Z"
}
```

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Order id. |
| `status` | string | Order status (e.g. `awaiting_payment`, `in_progress`, `completed`, ...). |
| `serviceName` | string \| null | Service display name. |
| `link` | string | Target link. |
| `quantity` | number | Ordered quantity. |
| `charge` | string | Amount charged. |
| `startCount` | number \| null | Counter at start. |
| `remains` | number \| null | Units remaining. |
| `createdAt` | string | Creation timestamp (ISO 8601). |

**Example — by token (recommended)**

```bash
curl -s "https://usesocialgo.com/guest/order/gord_abc123?token=gtok_xyz789"
```

**Example — by email**

```bash
curl -s "https://usesocialgo.com/guest/order/gord_abc123?email=you@example.com"
```

---

## Rate limits & best practices

The API does not advertise fixed rate-limit headers, but the guest endpoints can
return **HTTP `429`** under abuse. Build clients to be resilient:

- **Poll politely.** Don't hammer `status` or `GET /guest/order/:id` in a tight loop —
  orders take time to deliver. Poll every 30–60 seconds, and back off as an order
  approaches completion.
- **Batch status lookups.** Use the comma-separated `orders` form of `status` to check
  many orders in one request instead of one request per order.
- **Cache the catalog.** `services` / `GET /guest/services` change rarely. Cache the
  result and refresh on an interval (e.g. hourly) rather than per order.
- **Handle `429` with backoff.** On `429` (or a transient `5xx`), retry with
  exponential backoff and jitter; never retry a non-idempotent `add` / `POST /guest/order`
  blindly — confirm with `status` first to avoid duplicate orders.
- **Set timeouts.** The SDK uses a 30-second request timeout and an `AbortController`.
  Mirror this in your own clients so a hung request fails fast.
- **Treat `error` as terminal.** A business `error` (e.g. `Not enough funds`,
  `Incorrect service ID`) won't fix itself on retry — surface it to the user instead of
  looping.

---

## See also

- [SDK reference](./sdk.md) — the typed client for the SMM v2 protocol.
- [CLI reference](./cli.md) — commands mapped to these actions/endpoints.
- [MCP reference](./mcp.md) — the AI tools mapped to these actions/endpoints.
- [Guest checkout guide](./guest-checkout.md) — the end-to-end no-account flow.
