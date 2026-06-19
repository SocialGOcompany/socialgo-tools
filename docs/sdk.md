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

---

## Installation

```bash
npm install @socialgo/sdk
# or
pnpm add @socialgo/sdk
# or
yarn add @socialgo/sdk
```

The package is ESM-only (`"type": "module"`) and ships its own type declarations.

```ts
import {
  SmmV2Client,
  SmmV2Error,
  applyMarkup,
  orderCost,
  resolveMarkup,
} from "@socialgo/sdk";
```

---

## Configuration

The client talks to a single SMM API v2 endpoint. You configure it with two values, usually
sourced from environment variables:

| Variable           | Maps to                | Description                                                    |
| ------------------ | ---------------------- | -------------------------------------------------------------- |
| `SOCIALGO_API_URL` | `apiUrl`               | Base URL of the panel, e.g. `https://usesocialgo.com`. The SDK posts to `{apiUrl}/api/v2`. |
| `SOCIALGO_API_KEY` | `apiKey`               | Your account key, obtained from the panel under `/dashboard/api-key`. |

> The SMM API v2 endpoint is always reached via `POST` with a `application/x-www-form-urlencoded`
> body containing `key`, `action`, and any action-specific parameters.

---

## Instantiating the client

```ts
import { SmmV2Client } from "@socialgo/sdk";

const client = new SmmV2Client({
  apiUrl: `${process.env.SOCIALGO_API_URL}/api/v2`,
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

| Option      | Type           | Default        | Notes                                                                 |
| ----------- | -------------- | -------------- | --------------------------------------------------------------------- |
| `apiUrl`    | `string`       | —              | Full endpoint URL the client posts to.                                |
| `apiKey`    | `string`       | —              | Sent as the `key` field on every request.                             |
| `timeoutMs` | `number`       | `30000`        | Each request is aborted via `AbortController` after this many ms.     |
| `fetchImpl` | `typeof fetch` | global `fetch` | Inject a custom fetch (proxy, mock, instrumented client, edge shims). |

---

## Methods

Every method returns a `Promise` and rejects with [`SmmV2Error`](#error-handling-smmv2error)
on transport failures, non-2xx responses, or a JSON body containing an `error` field.

### `services(): Promise<SmmService[]>`

Lists every service the endpoint exposes (`action=services`).

```ts
const services = await client.services();
console.log(services.length, "services");
```

### `add(params: SmmAddOrderParams): Promise<{ order: number }>`

Creates an order (`action=add`). Returns the new order id. Only the parameters relevant to the
service type need to be supplied — `undefined`/`null` fields are stripped from the payload.

```ts
const { order } = await client.add({
  service: 123,
  link: "https://instagram.com/p/ABC123",
  quantity: 1000,
});
```

### `status(order): Promise<SmmOrderStatus>`

Status of a single order (`action=status`).

```ts
const s = await client.status(order);
console.log(s.status, "—", s.remains, "remaining");
```

### `multiStatus(orders): Promise<Record<string, SmmOrderStatus>>`

Status of many orders at once. Accepts an array and sends it as a CSV `orders` field; the
response is keyed by order id.

```ts
const map = await client.multiStatus([order, 456, 789]);
console.log(map[order].status);
```

### `refill(order): Promise<{ refill: number | string }>`

Requests a refill for an order (`action=refill`). Returns the refill ticket id.

```ts
const { refill } = await client.refill(order);
```

### `cancel(orders): Promise<Array<{ order: number; cancel: unknown }>>`

Cancels one or more orders (`action=cancel`, CSV). Returns a per-order result array.

```ts
const results = await client.cancel([order, 456]);
```

### `balance(): Promise<SmmBalance>`

Current account balance (`action=balance`).

```ts
const { balance, currency } = await client.balance();
console.log(`Balance: ${balance} ${currency}`);
```

---

## Core types

### `SmmService`

Returned by `services()`.

```ts
interface SmmService {
  service: number | string;
  name: string;
  type: string;       // "Default" | "Package" | "Custom Comments" | "Subscriptions" | ...
  category: string;
  rate: string;       // price per 1000, as a string
  min: string;
  max: string;
  refill?: boolean;
  cancel?: boolean;
  dripfeed?: boolean;
}
```

### `SmmAddOrderParams`

Passed to `add()`. Beyond the common fields, the protocol accepts type-specific parameters —
include only the ones that apply to the service you are ordering.

```ts
interface SmmAddOrderParams {
  service: number | string;
  link: string;
  quantity?: number;

  // drip-feed
  runs?: number;
  interval?: number;

  // type-specific (only relevant fields are sent)
  comments?: string;     // Custom Comments / Custom Comments Package (one per line)
  usernames?: string;    // Mentions Custom List / Mentions with Hashtags
  hashtags?: string;     // Mentions with Hashtags
  hashtag?: string;      // Mentions Hashtag
  username?: string;     // Mentions User Followers / Comment Likes
  media?: string;        // Mentions Media Likers
  answer_number?: number; // Poll
  keywords?: string;
}
```

### `SmmOrderStatus`

```ts
interface SmmOrderStatus {
  charge: string;
  start_count: string;
  status:
    | "Pending"
    | "In progress"
    | "Processing"
    | "Completed"
    | "Partial"
    | "Canceled"
    | string;
  remains: string;
  currency: string;
}
```

### `SmmBalance`

```ts
interface SmmBalance {
  balance: string;
  currency: string;
}
```

### `SmmAction`

The set of protocol actions the client uses internally:

```ts
type SmmAction =
  | "services"
  | "add"
  | "status"
  | "refill"
  | "refill_status"
  | "cancel"
  | "balance";
```

---

## Pricing helpers (markup)

SMM rates are quoted **per 1000 units**. These pure helpers let resellers turn a supplier rate
into a sell price and compute the cost of an order. They have no I/O and no dependencies.

### `MarkupRule`

```ts
interface MarkupRule {
  /** global multiplier (e.g. 1.5 = +50%) */
  multiplier: number;
  /** optional flat add-on per 1000, in the sell currency */
  flatPer1000?: number;
}
```

### `applyMarkup(supplierRatePer1000, rule): number`

Applies a markup rule to a supplier rate (per 1000) and rounds to 2 decimals.

```ts
import { applyMarkup } from "@socialgo/sdk";

// supplier rate 2.00 per 1000, +50% markup, +0.30 flat
const sell = applyMarkup(2.0, { multiplier: 1.5, flatPer1000: 0.3 });
// => 3.30
```

### `orderCost(ratePer1000, quantity): number`

Computes the cost of an order from a per-1000 rate and quantity (rounded to 2 decimals).

```ts
import { orderCost } from "@socialgo/sdk";

orderCost(3.3, 5000); // => 16.5
```

### `resolveMarkup(supplier, categoryOverride?): MarkupRule`

Resolves the effective markup in a cascade — **category override beats supplier default** —
so you can reprice thousands of services by changing one rule.

```ts
import { resolveMarkup, applyMarkup } from "@socialgo/sdk";

const supplierDefault = { multiplier: 1.5 };
const followersRule = resolveMarkup(supplierDefault, { multiplier: 2.0 });
// followersRule => { multiplier: 2.0, flatPer1000: undefined }

const sell = applyMarkup(2.0, followersRule); // => 4.00
```

---

## Error handling: `SmmV2Error`

All failures surface as a single typed error. `SmmV2Error` is thrown when:

- the HTTP response is not OK (`HTTP <status> do fornecedor`);
- the JSON body contains a truthy `error` field (the message is the provider's error string);
- the request fails at the transport level or times out (the original error is attached as `raw`).

```ts
class SmmV2Error extends Error {
  name: "SmmV2Error";
  /** the raw provider payload or underlying error, when available */
  readonly raw?: unknown;
}
```

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
    console.error("raw payload:", err.raw); // provider body or underlying error
  } else {
    throw err; // unexpected — rethrow
  }
}
```

---

## Full end-to-end example (TypeScript)

A complete reseller flow: list services, price one with markup, place an order, poll its
status, and check the account balance — all with typed error handling.

```ts
import {
  SmmV2Client,
  SmmV2Error,
  applyMarkup,
  orderCost,
  type SmmService,
} from "@socialgo/sdk";

const client = new SmmV2Client({
  apiUrl: `${process.env.SOCIALGO_API_URL}/api/v2`,
  apiKey: process.env.SOCIALGO_API_KEY!,
  timeoutMs: 20_000,
});

async function main() {
  // 1. Discover services.
  const services: SmmService[] = await client.services();
  const followers = services.find((s) => /followers/i.test(s.name));
  if (!followers) throw new Error("No followers service found");

  // 2. Price it for resale: supplier rate per 1000 → sell price.
  const supplierRate = Number(followers.rate);
  const sellPer1000 = applyMarkup(supplierRate, { multiplier: 1.6, flatPer1000: 0.25 });
  const quantity = 1000;
  console.log(
    `Service ${followers.service} — sell ${sellPer1000}/1k, ` +
      `cost for ${quantity}: ${orderCost(sellPer1000, quantity)}`,
  );

  // 3. Place the order.
  const { order } = await client.add({
    service: followers.service,
    link: "https://instagram.com/yourprofile",
    quantity,
  });
  console.log("Order created:", order);

  // 4. Poll status.
  const status = await client.status(order);
  console.log(`Status: ${status.status} — ${status.remains} remaining`);

  // 5. Check balance.
  const { balance, currency } = await client.balance();
  console.log(`Remaining balance: ${balance} ${currency}`);
}

main().catch((err) => {
  if (err instanceof SmmV2Error) {
    console.error("SMM API failed:", err.message, err.raw ?? "");
    process.exit(1);
  }
  throw err;
});
```

---

## See also

- [`@socialgo/cli`](https://github.com/SocialGOcompany/socialgo-tools/tree/main/packages/cli) — the `socialgo` command-line tool.
- [`@socialgo/mcp`](https://github.com/SocialGOcompany/socialgo-tools/tree/main/packages/mcp) — the `socialgo-mcp` server for AI assistants.

## License

MIT © SocialGO
