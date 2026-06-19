# `@socialgo/sdk`

[![npm version](https://img.shields.io/npm/v/@socialgo/sdk.svg)](https://www.npmjs.com/package/@socialgo/sdk)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/SocialGOcompany/socialgo-tools/blob/main/LICENSE)

Official TypeScript SDK for the **SocialGO** SMM (Social Media Marketing) platform.
A fully typed, dependency-free client for the **SMM API v2** protocol, plus small pricing
helpers for resellers.

Runs anywhere `fetch` is available — Node 18+, Bun, Deno, browsers, and edge runtimes.

## Installation

```bash
npm install @socialgo/sdk
# or: pnpm add @socialgo/sdk  /  yarn add @socialgo/sdk
```

The package is ESM-only and ships its own type declarations.

## Configuration

| Variable           | Description                                                                          |
| ------------------ | ------------------------------------------------------------------------------------ |
| `SOCIALGO_API_URL` | Base URL of the panel, e.g. `https://usesocialgo.com`. The client posts to `{url}/api/v2`. |
| `SOCIALGO_API_KEY` | Your account key, from the panel under `/dashboard/api-key`.                          |

## Quick start

```ts
import { SmmV2Client, SmmV2Error, applyMarkup, orderCost } from "@socialgo/sdk";

const client = new SmmV2Client({
  apiUrl: `${process.env.SOCIALGO_API_URL}/api/v2`,
  apiKey: process.env.SOCIALGO_API_KEY!,
});

try {
  // 1. List services and price one for resale.
  const services = await client.services();
  const svc = services[0];
  const sellPer1000 = applyMarkup(Number(svc.rate), { multiplier: 1.6, flatPer1000: 0.25 });
  console.log(`Cost for 1000: ${orderCost(sellPer1000, 1000)}`);

  // 2. Place an order and check its status.
  const { order } = await client.add({
    service: svc.service,
    link: "https://instagram.com/yourprofile",
    quantity: 1000,
  });
  const status = await client.status(order);
  console.log(status.status, "—", status.remains, "remaining");

  // 3. Check balance.
  const { balance, currency } = await client.balance();
  console.log(`Balance: ${balance} ${currency}`);
} catch (err) {
  if (err instanceof SmmV2Error) {
    console.error("SMM API error:", err.message, err.raw ?? "");
  } else {
    throw err;
  }
}
```

## API at a glance

### `SmmV2Client`

| Method                | Returns                                          | Description                          |
| --------------------- | ------------------------------------------------ | ------------------------------------ |
| `services()`          | `SmmService[]`                                   | List every available service.        |
| `add(params)`         | `{ order: number }`                              | Create an order.                     |
| `status(order)`       | `SmmOrderStatus`                                 | Status of one order.                 |
| `multiStatus(orders)` | `Record<string, SmmOrderStatus>`                 | Status of many orders (keyed by id). |
| `refill(order)`       | `{ refill: number \| string }`                   | Request a refill.                    |
| `cancel(orders)`      | `Array<{ order: number; cancel: unknown }>`      | Cancel one or more orders.           |
| `balance()`           | `SmmBalance`                                     | Current account balance.             |

Constructor options: `apiUrl`, `apiKey`, optional `timeoutMs` (default `30000`) and
`fetchImpl` (default global `fetch`).

### Pricing helpers

SMM rates are quoted **per 1000 units**.

| Helper                                       | Description                                              |
| -------------------------------------------- | -------------------------------------------------------- |
| `applyMarkup(rate, rule)`                    | Apply a `MarkupRule` to a supplier rate per 1000.        |
| `orderCost(ratePer1000, quantity)`           | Cost of an order from a per-1000 rate and quantity.      |
| `resolveMarkup(supplier, categoryOverride?)` | Effective markup in cascade (category beats default).    |

```ts
applyMarkup(2.0, { multiplier: 1.5, flatPer1000: 0.3 }); // => 3.3
orderCost(3.3, 5000);                                     // => 16.5
```

## Error handling

All failures throw a single typed `SmmV2Error` — on non-2xx HTTP responses, on a JSON body
containing a truthy `error` field, and on transport failures or timeouts (the original error
or provider payload is attached as `.raw`).

```ts
try {
  await client.add({ service: 123, link: "...", quantity: 1000 });
} catch (err) {
  if (err instanceof SmmV2Error) {
    console.error(err.message, err.raw);
  }
}
```

## Documentation

Full reference, all types, and an end-to-end example:
[`docs/sdk.md`](https://github.com/SocialGOcompany/socialgo-tools/blob/main/docs/sdk.md).

## Related packages

- [`@socialgo/cli`](https://github.com/SocialGOcompany/socialgo-tools/tree/main/packages/cli) — the `socialgo` command-line tool.
- [`@socialgo/mcp`](https://github.com/SocialGOcompany/socialgo-tools/tree/main/packages/mcp) — the `socialgo-mcp` server for AI assistants.

## License

MIT © SocialGO
