# `@socialgo/sdk`

[![npm version](https://img.shields.io/npm/v/@socialgo/sdk.svg)](https://www.npmjs.com/package/@socialgo/sdk)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/SocialGOcompany/socialgo-tools/blob/main/LICENSE)

The TypeScript SDK for the **SocialGO** SMM (Social Media Marketing) platform. It ships a
fully typed client for the **SMM API v2** protocol — the de-facto single-endpoint standard
used across SMM panels — plus small, dependency-free pricing helpers for resellers.

The SDK is intentionally thin and transport-only: one `POST` per call, no global state, no
runtime dependencies. It runs anywhere `fetch` is available (Node 18+, Bun, Deno, modern
browsers, edge runtimes).

- **`SmmV2Client`** — typed wrapper around the SMM API v2 endpoint (`services`, `add`,
  `status`, `refill`, `cancel`, `balance`).
- **Markup helpers** — turn a supplier rate into a sell price and compute order cost.
- **`SmmV2Error`** — a single typed error you can `instanceof`-check.

> **Source of truth.** Everything below documents the actual code in
> [`packages/sdk/src`](https://github.com/SocialGOcompany/socialgo-tools/tree/main/packages/sdk/src)
> (`smm-v2.ts` + `markup.ts`).

---

## Installation

> **npm — coming soon.** The `@socialgo/*` packages are not published to npm yet. Until they
> are, install from source or directly from GitHub. Every step below works today.

### Option A — from source (recommended)

This is a [pnpm](https://pnpm.io) monorepo. Clone it, install, and build the SDK once:

```bash
git clone https://github.com/SocialGOcompany/socialgo-tools.git
cd socialgo-tools
pnpm install
pnpm --filter @socialgo/sdk build   # emits packages/sdk/dist
```

If your project lives inside this repo (e.g. under `examples/` or another workspace package),
`import { SmmV2Client } from "@socialgo/sdk"` resolves automatically after the build above.

### Option B — link into an external project

To use the SDK from a project outside this repo, build it and link the built package:

```bash
# in the cloned socialgo-tools repo
pnpm --filter @socialgo/sdk build
cd packages/sdk
npm link            # or: pnpm link --global

# in your own project
npm link @socialgo/sdk   # or: pnpm link --global @socialgo/sdk
```

Alternatively, point your `package.json` at the local build with a file/workspace dependency:

```jsonc
{
  "dependencies": {
    "@socialgo/sdk": "file:../socialgo-tools/packages/sdk"
  }
}
```

### Option C — install straight from GitHub

You can also add the package directly from the Git repository. Because it lives in a
monorepo subdirectory, this requires a package manager that supports a build step on git
dependencies (pnpm does). The SDK's `prepublishOnly`/`build` script compiles `dist` on
install:

```bash
pnpm add "github:SocialGOcompany/socialgo-tools#main&path:/packages/sdk"
```

### Once npm publishing lands

```bash
npm install @socialgo/sdk
# or
pnpm add @socialgo/sdk
# or
yarn add @socialgo/sdk
```

### Importing

The package is ESM-only (`"type": "module"`) and ships its own type declarations
(`dist/index.d.ts`). The entry point re-exports everything from `smm-v2.ts` and `markup.ts`:

```ts
import {
  SmmV2Client,
  SmmV2Error,
  applyMarkup,
  orderCost,
  resolveMarkup,
} from "@socialgo/sdk";

// types are exported too:
import type {
  SmmService,
  SmmAddOrderParams,
  SmmOrderStatus,
  SmmBalance,
  SmmAction,
  SmmV2ClientOptions,
  MarkupRule,
} from "@socialgo/sdk";
```

There are no CommonJS or default exports — use named ESM imports.

---

## How the protocol works

The SMM API v2 is a single HTTP endpoint. The client always issues a **`POST`** with an
`application/x-www-form-urlencoded` body. Every request carries:

- `key` — your API key (from the client constructor),
- `action` — one of the [`SmmAction`](#smmaction) values,
- plus any action-specific fields.

The client builds the body with `URLSearchParams`, **omits any parameter that is `undefined`
or `null`**, and coerces all remaining values to strings (`String(v)`). The response is parsed
as JSON. See [Error handling](#error-handling-smmv2error) for how failures surface.

---

## Configuration

You configure the client with two values, usually sourced from environment variables:

| Variable           | Maps to  | Description                                                                                |
| ------------------ | -------- | ------------------------------------------------------------------------------------------ |
| `SOCIALGO_API_URL` | `apiUrl` | Base URL of the panel, e.g. `https://api.usesocialgo.com`. The SDK posts to `{apiUrl}/api/v2`. |
| `SOCIALGO_API_KEY` | `apiKey` | Your account key, obtained from the panel under `/dashboard/api-key`.                      |

> **`apiUrl` is the full endpoint URL.** The client posts to exactly the URL you pass — it
> does **not** append `/api/v2` for you. Build it yourself, e.g.
> `` `${process.env.SOCIALGO_API_URL}/api/v2` ``. Trim any trailing slash from the base first
> (`base.replace(/\/+$/, "")`) to avoid `//api/v2`.

---

## Instantiating the client

```ts
import { SmmV2Client } from "@socialgo/sdk";

const client = new SmmV2Client({
  apiUrl: `${process.env.SOCIALGO_API_URL?.replace(/\/+$/, "")}/api/v2`,
  apiKey: process.env.SOCIALGO_API_KEY!,
});
```

### `SmmV2ClientOptions`

```ts
interface SmmV2ClientOptions {
  apiUrl: string;
  apiKey: string;
  /** request timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** custom fetch implementation (default: global fetch) */
  fetchImpl?: typeof fetch;
}
```

| Option      | Type           | Default        | Notes                                                                                     |
| ----------- | -------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `apiUrl`    | `string`       | —              | Full endpoint URL the client posts to (you append `/api/v2`).                             |
| `apiKey`    | `string`       | —              | Sent as the `key` field on every request.                                                 |
| `timeoutMs` | `number`       | `30000`        | Each request is aborted via `AbortController` after this many ms (a timeout throws `SmmV2Error`). |
| `fetchImpl` | `typeof fetch` | global `fetch` | Inject a custom fetch (proxy, mock, instrumented client, edge shim). Captured once at construction. |

The constructor stores these values privately; there is no shared/global state, so you can
create as many clients as you need (e.g. one per supplier).

---

## Methods

Every method returns a `Promise` and rejects with [`SmmV2Error`](#error-handling-smmv2error)
on transport failures, timeouts, non-2xx responses, or a JSON body containing a truthy `error`
field. All methods are thin wrappers over the single endpoint; the `action` they send is noted
below.

| Method                  | `action`   | Returns                                       | Description                                |
| ----------------------- | ---------- | --------------------------------------------- | ------------------------------------------ |
| `services()`            | `services` | `Promise<SmmService[]>`                       | List every available service.             |
| `add(params)`           | `add`      | `Promise<{ order: number }>`                  | Create an order.                          |
| `status(order)`         | `status`   | `Promise<SmmOrderStatus>`                     | Status of one order.                      |
| `multiStatus(orders)`   | `status`   | `Promise<Record<string, SmmOrderStatus>>`     | Status of many orders, keyed by id.       |
| `refill(order)`         | `refill`   | `Promise<{ refill: number \| string }>`       | Request a refill, returns the ticket id.  |
| `cancel(orders)`        | `cancel`   | `Promise<Array<{ order: number; cancel: unknown }>>` | Cancel one or more orders.         |
| `balance()`             | `balance`  | `Promise<SmmBalance>`                         | Current account balance.                  |
| `wallet()`              | `wallet`   | `Promise<SmmWallet>`                          | Balance + recent ledger transactions.     |
| `addFunds(params)`      | `add_funds` | `Promise<SmmAddFundsResult>`                 | Create a pending wallet top-up.           |
| `massOrder(orders)`     | `mass_order` | `Promise<SmmMassOrderResult>`               | Place many orders in one call.            |
| `subscriptionCreate(params)` | `subscription_create` | `Promise<SmmSubscriptionCreateResult>` | Create a recurring subscription.      |
| `subscriptions()`       | `subscriptions` | `Promise<SmmSubscriptionListItem[]>`     | List recurring subscriptions.             |
| `couponValidate(code)`  | `coupon_validate` | `Promise<SmmCouponPreview>`            | Preview a coupon without redeeming it.    |
| `affiliateStats()`      | `affiliate_stats` | `Promise<SmmAffiliateStats>`           | The user's own affiliate numbers.         |
| `loyaltyStatus()`       | `loyalty_status` | `Promise<SmmLoyaltyStatus>`             | The user's loyalty tier and points.       |
| `recommend(params)`     | `recommend` | `Promise<SmmRecommendedService[]>`           | Recommend related services.               |
| `campaignBuild(params)` | `campaign_build` | `Promise<SmmCampaignPlan>`              | Build a campaign plan (no order placed).  |
| `storefront(slug)`      | `storefront` | `Promise<SmmStorefront>`                    | Resolve a public storefront by slug.      |

### `services(): Promise<SmmService[]>`

Lists every service the endpoint exposes (`action=services`). No parameters.

```ts
const services = await client.services();
console.log(services.length, "services");

const followers = services.filter((s) => /followers/i.test(s.name));
```

**Returns:** an array of [`SmmService`](#smmservice). Numeric fields (`rate`, `min`, `max`)
arrive as **strings** — wrap them in `Number(...)` before doing math.

### `add(params: SmmAddOrderParams): Promise<{ order: number }>`

Creates an order (`action=add`) and returns the new order id as `{ order }`.

Only the parameters relevant to the service type need to be supplied — any `undefined`/`null`
field is stripped from the request body, so you can pass a partial object safely. See
[`SmmAddOrderParams`](#smmaddorderparams) for the full set of type-specific fields (custom
comments, mentions, polls, drip-feed, etc.).

```ts
// Standard order
const { order } = await client.add({
  service: 123,
  link: "https://instagram.com/p/ABC123",
  quantity: 1000,
});

// Drip-feed: split into `runs` deliveries `interval` minutes apart
await client.add({
  service: 123,
  link: "https://instagram.com/p/ABC123",
  quantity: 1000,
  runs: 5,
  interval: 30,
});

// Custom comments (one comment per line)
await client.add({
  service: 555,
  link: "https://instagram.com/p/ABC123",
  comments: "great post!\nlove this\nawesome",
});
```

**Parameters:** see [`SmmAddOrderParams`](#smmaddorderparams).
**Returns:** `{ order: number }` — the created order id.

### `status(order: number | string): Promise<SmmOrderStatus>`

Status of a single order (`action=status`, parameter `order`).

```ts
const s = await client.status(order);
console.log(s.status, "—", s.remains, "remaining");
```

**Parameters:** `order` — the order id (number or string).
**Returns:** [`SmmOrderStatus`](#smmorderstatus).

### `multiStatus(orders: Array<number | string>): Promise<Record<string, SmmOrderStatus>>`

Status of many orders at once. The array is joined into a CSV and sent as the `orders` field
(`action=status`); the response is an object **keyed by order id**.

```ts
const map = await client.multiStatus([order, 456, 789]);
console.log(map[String(order)].status);

for (const [id, s] of Object.entries(map)) {
  console.log(`#${id}: ${s.status} (${s.remains} remaining)`);
}
```

**Parameters:** `orders` — array of order ids; joined with `,`.
**Returns:** `Record<string, SmmOrderStatus>` — map from order id (string key) to status.

### `refill(order: number | string): Promise<{ refill: number | string }>`

Requests a refill for an order (`action=refill`, parameter `order`). Returns the refill ticket
id. (The protocol also defines a `refill_status` action — see [`SmmAction`](#smmaction) — but
the current client does not expose a dedicated method for it.)

```ts
const { refill } = await client.refill(order);
console.log("refill ticket:", refill);
```

**Parameters:** `order` — the order id.
**Returns:** `{ refill: number | string }` — the refill ticket id.

### `cancel(orders: Array<number | string>): Promise<Array<{ order: number; cancel: unknown }>>`

Cancels one or more orders (`action=cancel`, CSV `orders`). Returns a per-order result array;
each item's `cancel` field carries the provider's per-order outcome (an id, `1`, or an error
string — hence `unknown`).

```ts
const results = await client.cancel([order, 456]);
for (const r of results) {
  console.log(`#${r.order}:`, r.cancel);
}
```

**Parameters:** `orders` — array of order ids; joined with `,`.
**Returns:** `Array<{ order: number; cancel: unknown }>`.

### `balance(): Promise<SmmBalance>`

Current account balance (`action=balance`). No parameters.

```ts
const { balance, currency } = await client.balance();
console.log(`Balance: ${balance} ${currency}`);
```

**Returns:** [`SmmBalance`](#smmbalance) (`balance` is a string).

### `wallet(): Promise<SmmWallet>`

Richer than `balance()` (`action=wallet`): balance + currency plus the most recent ledger `transactions` (`SmmWalletTransaction[]`). No parameters.

```ts
const { balance, currency, transactions } = await client.wallet();
```

**Returns:** `SmmWallet`.

### `addFunds(params: SmmAddFundsParams): Promise<SmmAddFundsResult>`

Creates a **pending** wallet top-up (`action=add_funds`). Pass `{ amount, method }`. Balance is credited only after the payment confirms.

```ts
const payment = await client.addFunds({ amount: 50, method: "mercadopago" });
```

**Returns:** `SmmAddFundsResult` (`{ payment, status, amount, currency, method, message? }`).

### `massOrder(orders: SmmMassOrderLine[] | string): Promise<SmmMassOrderResult>`

Places **several** orders in one call (`action=mass_order`). Accepts a list of `{ service, link, quantity }` (serialized to the `service|link|quantity` CSV the protocol expects) or a raw CSV string. Each line is independent.

```ts
const result = await client.massOrder([
  { service: 1234, link: "https://insta.com/a", quantity: 1000 },
  { service: 55, link: "https://insta.com/b", quantity: 500 },
]);
```

**Returns:** `SmmMassOrderResult` (`{ orders: [{ line, order }], errors: [{ line, reason }] }`).

### `subscriptionCreate(params: SmmSubscriptionCreateParams): Promise<SmmSubscriptionCreateResult>`

Creates a **recurring** subscription (`action=subscription_create`). Pass `{ service, link, quantity, runs, interval }` where `interval` is in **minutes**.

```ts
const sub = await client.subscriptionCreate({
  service: 70, link: "https://insta.com/u", quantity: 100, runs: 30, interval: 1440,
});
```

**Returns:** `SmmSubscriptionCreateResult`.

### `subscriptions(): Promise<SmmSubscriptionListItem[]>`

Lists the user's recurring subscriptions (`action=subscriptions`). No parameters.

**Returns:** `SmmSubscriptionListItem[]`.

### `couponValidate(code: string): Promise<SmmCouponPreview>`

Validates / **previews** a coupon **without** redeeming it (`action=coupon_validate`). Read-only.

```ts
const preview = await client.couponValidate("WELCOME10");
if (preview.valid) console.log(preview.kind, preview.value);
```

**Returns:** `SmmCouponPreview` (`{ valid, reason?, code?, kind?, value?, minAmount?, expiresAt? }`).

### `affiliateStats(): Promise<SmmAffiliateStats>`

Returns the user's **own** affiliate stats and referral link (`action=affiliate_stats`). Scoped to the API key's user.

**Returns:** `SmmAffiliateStats`.

### `loyaltyStatus(): Promise<SmmLoyaltyStatus>`

Returns the user's loyalty tier, points and progress (`action=loyalty_status`). No parameters.

**Returns:** `SmmLoyaltyStatus`.

### `recommend(params?: SmmRecommendParams): Promise<SmmRecommendedService[]>`

**Recommends** related services from an anchor `service` id and/or a `platform` (`action=recommend`). Each item carries a `reason` (`bought_together` | `same_platform` | `popular`).

```ts
const ideas = await client.recommend({ platform: "Instagram", limit: 5 });
```

**Returns:** `SmmRecommendedService[]`.

### `campaignBuild(params: SmmCampaignBuildParams): Promise<SmmCampaignPlan>`

**Builds a campaign plan** from `{ budget, days, service? | platform?, boost_type?, link? }` (`action=campaign_build`). Returns a reviewable plan — it does **not** place any order.

```ts
const plan = await client.campaignBuild({ budget: 100, days: 30, platform: "Instagram", boost_type: "followers" });
if (plan.feasible) console.log(plan.totalQuantity, plan.totalCost, plan.schedule);
```

**Returns:** `SmmCampaignPlan`.

### `storefront(slug: string): Promise<SmmStorefront>`

Resolves a **public** storefront by `slug` and returns the store with its `packages` (`action=storefront`). The package `price` is a reference; the charged amount is recomputed server-side.

```ts
const store = await client.storefront("my-shop");
```

**Returns:** `SmmStorefront`.

---

## Core types

All types are exported from the package root.

### `SmmService`

Returned by `services()`.

```ts
interface SmmService {
  service: number | string; // service id
  name: string;
  type: string;       // "Default" | "Package" | "Custom Comments" | "Subscriptions" | ...
  category: string;
  rate: string;       // price per 1000, as a string
  min: string;        // minimum quantity, as a string
  max: string;        // maximum quantity, as a string
  refill?: boolean;   // refill supported
  cancel?: boolean;   // cancel supported
  dripfeed?: boolean; // drip-feed supported
}
```

> Numeric fields are **strings** as returned by the protocol. Convert with `Number(s.rate)`,
> `Number(s.min)`, `Number(s.max)` before arithmetic or comparisons.

### `SmmAddOrderParams`

Passed to `add()`. Beyond the common fields, the protocol accepts type-specific parameters —
include only the ones that apply to the service you are ordering. The client drops every
`undefined`/`null` field before sending.

```ts
interface SmmAddOrderParams {
  service: number | string; // required: which service
  link: string;             // required: target URL/profile/post
  quantity?: number;        // for quantity-based services

  // drip-feed
  runs?: number;     // number of deliveries
  interval?: number; // minutes between deliveries

  // type-specific (only relevant fields are sent)
  comments?: string;      // Custom Comments / Custom Comments Package (one per line)
  usernames?: string;     // Mentions Custom List / Mentions with Hashtags
  hashtags?: string;      // Mentions with Hashtags
  hashtag?: string;       // Mentions Hashtag
  username?: string;      // Mentions User Followers / Comment Likes
  media?: string;         // Mentions Media Likers
  answer_number?: number; // Poll
  keywords?: string;      // keyword-targeted services
}
```

| Field           | Type               | When to use                                                       |
| --------------- | ------------------ | ----------------------------------------------------------------- |
| `service`       | `number \| string` | Always. The service id from `services()`.                         |
| `link`          | `string`           | Always. Target profile, post, or media URL.                       |
| `quantity`      | `number`           | Quantity-based services (followers, likes, views…).               |
| `runs`          | `number`           | Drip-feed: how many deliveries to split the quantity into.        |
| `interval`      | `number`           | Drip-feed: minutes between deliveries.                            |
| `comments`      | `string`           | Custom Comments / Custom Comments Package — one comment per line. |
| `usernames`     | `string`           | Mentions Custom List / Mentions with Hashtags.                    |
| `hashtags`      | `string`           | Mentions with Hashtags.                                           |
| `hashtag`       | `string`           | Mentions Hashtag.                                                 |
| `username`      | `string`           | Mentions User Followers / Comment Likes.                          |
| `media`         | `string`           | Mentions Media Likers.                                            |
| `answer_number` | `number`           | Poll services.                                                    |
| `keywords`      | `string`           | Keyword-targeted services.                                        |

### `SmmOrderStatus`

Returned by `status()` (and as the value type of `multiStatus()`).

```ts
interface SmmOrderStatus {
  charge: string;      // amount charged, as a string
  start_count: string; // count at order time
  status:
    | "Pending"
    | "In progress"
    | "Processing"
    | "Completed"
    | "Partial"
    | "Canceled"
    | string;          // open union — providers may return other labels
  remains: string;     // units still to be delivered
  currency: string;
}
```

> `status` is an **open string union**: the listed values are the common ones, but the type
> falls back to `string`, so guard with comparisons rather than assuming an exhaustive set.

### `SmmBalance`

Returned by `balance()`.

```ts
interface SmmBalance {
  balance: string;  // as a string — convert with Number()
  currency: string;
}
```

### `SmmAction`

The set of protocol actions. The client sends one of these as the `action` field on every
request. Exported for typing your own integrations.

```ts
type SmmAction =
  | "services"
  | "add"
  | "status"
  | "refill"
  | "refill_status" // defined in the protocol; no dedicated client method yet
  | "cancel"
  | "balance";
```

---

## Pricing helpers (markup)

SMM rates are quoted **per 1000 units**. These pure helpers (from `markup.ts`) let resellers
turn a supplier rate into a sell price and compute the cost of an order. They have **no I/O and
no dependencies**, and they round to **2 decimals** using `Math.round(x * 100) / 100`.

### `MarkupRule`

```ts
interface MarkupRule {
  /** global multiplier (e.g. 1.5 = +50%) */
  multiplier: number;
  /** optional flat add-on per 1000, in the sell currency */
  flatPer1000?: number;
}
```

### `applyMarkup(supplierRatePer1000: number, rule: MarkupRule): number`

Applies a markup rule to a supplier rate (per 1000) and rounds to 2 decimals. The formula is:

```text
sell = round2( supplierRatePer1000 * rule.multiplier + (rule.flatPer1000 ?? 0) )
```

`flatPer1000` defaults to `0` when omitted.

```ts
import { applyMarkup } from "@socialgo/sdk";

// supplier rate 2.00 per 1000, +50% markup, +0.30 flat
applyMarkup(2.0, { multiplier: 1.5, flatPer1000: 0.3 }); // => 3.30

// multiplier only
applyMarkup(2.0, { multiplier: 1.5 });                   // => 3.00
```

### `orderCost(ratePer1000: number, quantity: number): number`

Computes the cost of an order from a per-1000 rate and quantity, rounded to 2 decimals:

```text
cost = round2( (ratePer1000 / 1000) * quantity )
```

```ts
import { orderCost } from "@socialgo/sdk";

orderCost(3.3, 5000); // => 16.5
orderCost(3.0, 1000); // => 3
```

> **Tip:** pass the **sell** price (the output of `applyMarkup`) to `orderCost` to estimate
> what the customer pays; pass the **supplier** `rate` to estimate your cost.

### `resolveMarkup(supplier: MarkupRule, categoryOverride?: Partial<MarkupRule>): MarkupRule`

Resolves the effective markup in a cascade — **a category override beats the supplier
default** — so you can reprice thousands of services by changing one rule. Each field is
resolved independently with `??` (nullish coalescing):

```text
multiplier  = categoryOverride?.multiplier  ?? supplier.multiplier
flatPer1000 = categoryOverride?.flatPer1000 ?? supplier.flatPer1000
```

Because it uses `??` (not `||`), a category override of `flatPer1000: 0` **is honored** (zero
is not nullish) — only `undefined`/missing falls through to the supplier default.

```ts
import { resolveMarkup, applyMarkup } from "@socialgo/sdk";

const supplierDefault: import("@socialgo/sdk").MarkupRule = {
  multiplier: 1.5,
  flatPer1000: 0.2,
};

// Override just the multiplier for the "followers" category:
const followersRule = resolveMarkup(supplierDefault, { multiplier: 2.0 });
// => { multiplier: 2.0, flatPer1000: 0.2 }  (flat inherited from supplier)

applyMarkup(2.0, followersRule); // => 4.20

// Override the flat add-on to zero for a promo category:
const promoRule = resolveMarkup(supplierDefault, { flatPer1000: 0 });
// => { multiplier: 1.5, flatPer1000: 0 }
```

**Bulk repricing pattern:**

```ts
import { resolveMarkup, applyMarkup, type MarkupRule } from "@socialgo/sdk";

const supplierDefault: MarkupRule = { multiplier: 1.5 };
const categoryRules: Record<string, Partial<MarkupRule>> = {
  Followers: { multiplier: 2.0 },
  Likes: { multiplier: 1.8, flatPer1000: 0.1 },
};

const services = await client.services();
const priced = services.map((s) => {
  const rule = resolveMarkup(supplierDefault, categoryRules[s.category]);
  return { ...s, sellPer1000: applyMarkup(Number(s.rate), rule) };
});
```

---

## Error handling: `SmmV2Error`

All failures surface as a single typed error. `SmmV2Error` extends `Error`, sets
`name = "SmmV2Error"`, and exposes an optional `raw` with the underlying cause.

```ts
class SmmV2Error extends Error {
  name: "SmmV2Error";
  /** the raw provider payload or underlying error, when available */
  readonly raw?: unknown;
}
```

It is thrown in exactly these cases:

| Cause                                   | `message`                          | `raw`                          |
| --------------------------------------- | ---------------------------------- | ------------------------------ |
| HTTP response not OK (non-2xx)          | `HTTP <status> do fornecedor`      | _(unset)_                      |
| JSON body has a truthy `error` field    | the provider's `error` string      | the full parsed response body  |
| Transport failure / timeout / abort     | `Falha ao chamar fornecedor (<action>)` | the original thrown error |

> The two literal messages above come straight from the source and are in Portuguese
> (`do fornecedor` = "from the provider", `Falha ao chamar fornecedor` = "failed to call the
> provider"). Match on `instanceof SmmV2Error` and inspect `.raw` rather than parsing the
> message text. Timeouts manifest as the transport-failure case because the request is aborted
> via `AbortController` after `timeoutMs`.

Usage:

```ts
import { SmmV2Client, SmmV2Error } from "@socialgo/sdk";

try {
  const { order } = await client.add({
    service: 123,
    link: "https://instagram.com/p/ABC123",
    quantity: 1000,
  });
  console.log("order created:", order);
} catch (err) {
  if (err instanceof SmmV2Error) {
    console.error("SMM API error:", err.message);
    console.error("raw payload/cause:", err.raw); // provider body or underlying error
  } else {
    throw err; // unexpected — rethrow
  }
}
```

---

## Full end-to-end example (TypeScript)

A complete reseller flow: list services, price one with markup, check balance, place an order,
and poll its status until it leaves `Pending` — all with typed error handling.

```ts
import {
  SmmV2Client,
  SmmV2Error,
  applyMarkup,
  orderCost,
  type SmmService,
} from "@socialgo/sdk";

const client = new SmmV2Client({
  apiUrl: `${process.env.SOCIALGO_API_URL?.replace(/\/+$/, "")}/api/v2`,
  apiKey: process.env.SOCIALGO_API_KEY!,
  timeoutMs: 20_000,
});

async function main() {
  // 1. Discover services (rate/min/max come back as strings).
  const services: SmmService[] = await client.services();
  const followers = services.find((s) => /followers/i.test(s.name));
  if (!followers) throw new Error("No followers service found");

  // 2. Price it for resale: supplier rate per 1000 -> sell price.
  const supplierRate = Number(followers.rate);
  const sellPer1000 = applyMarkup(supplierRate, { multiplier: 1.6, flatPer1000: 0.25 });
  const quantity = Math.max(Number(followers.min), 1000);
  console.log(
    `Service ${followers.service} — sell ${sellPer1000}/1k, ` +
      `customer pays ~${orderCost(sellPer1000, quantity)} for ${quantity}`,
  );

  // 3. Make sure there is balance for our cost.
  const { balance, currency } = await client.balance();
  const myCost = orderCost(supplierRate, quantity);
  console.log(`Balance: ${balance} ${currency} — order cost ~${myCost}`);
  if (Number(balance) < myCost) throw new Error("Insufficient balance");

  // 4. Place the order.
  const { order } = await client.add({
    service: followers.service,
    link: "https://instagram.com/yourprofile",
    quantity,
  });
  console.log("Order created:", order);

  // 5. Poll status until it leaves "Pending".
  for (let i = 0; i < 5; i++) {
    const status = await client.status(order);
    console.log(`[${i}] ${status.status} — ${status.remains} remaining`);
    if (status.status !== "Pending") break;
    await new Promise((r) => setTimeout(r, 3000));
  }
}

main().catch((err) => {
  if (err instanceof SmmV2Error) {
    console.error("SMM API failed:", err.message, err.raw ?? "");
    process.exit(1);
  }
  throw err;
});
```

A runnable version of this flow lives at
[`examples/place-order.ts`](https://github.com/SocialGOcompany/socialgo-tools/blob/main/examples/place-order.ts):

```bash
pnpm install
pnpm --filter @socialgo/sdk build
SOCIALGO_API_URL=https://api.usesocialgo.com \
SOCIALGO_API_KEY=your-key \
npx tsx examples/place-order.ts \
  --query "instagram followers" \
  --link https://instagram.com/yourprofile \
  --quantity 1000
```

---

## See also

- [`@socialgo/cli`](https://github.com/SocialGOcompany/socialgo-tools/tree/main/packages/cli) — the `socialgo` command-line tool.
- [`@socialgo/mcp`](https://github.com/SocialGOcompany/socialgo-tools/tree/main/packages/mcp) — the `socialgo-mcp` server for AI assistants.

## License

MIT © SocialGO
