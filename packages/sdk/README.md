# `@socialgo/sdk`

[![npm version](https://img.shields.io/npm/v/@socialgo/sdk.svg)](https://www.npmjs.com/package/@socialgo/sdk)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/SocialGOcompany/socialgo-tools/blob/main/LICENSE)

Official TypeScript SDK for the **SocialGO** SMM (Social Media Marketing) platform.
A fully typed, dependency-free client for the **SMM API v2** protocol, plus small pricing
helpers for resellers.

Runs anywhere `fetch` is available — Node 18+, Bun, Deno, browsers, and edge runtimes.
The package is ESM-only and ships its own type declarations.

## Installation

> **npm — coming soon.** The `@socialgo/*` packages are not on npm yet. Until they are,
> build from source or install from GitHub. Both work today.

**From source (recommended — this is a [pnpm](https://pnpm.io) monorepo):**

```bash
git clone https://github.com/SocialGOcompany/socialgo-tools.git
cd socialgo-tools
pnpm install
pnpm --filter @socialgo/sdk build   # emits packages/sdk/dist
```

Inside the repo, `import { SmmV2Client } from "@socialgo/sdk"` resolves after the build. To use
it from an external project, `npm link` the built package or add a local dependency:

```jsonc
{ "dependencies": { "@socialgo/sdk": "file:../socialgo-tools/packages/sdk" } }
```

**From GitHub (pnpm builds the subpackage on install):**

```bash
pnpm add "github:SocialGOcompany/socialgo-tools#main&path:/packages/sdk"
```

**Once published to npm:**

```bash
npm install @socialgo/sdk   # or: pnpm add @socialgo/sdk / yarn add @socialgo/sdk
```

See [`docs/sdk.md`](https://github.com/SocialGOcompany/socialgo-tools/blob/main/docs/sdk.md)
for detailed install options.

## Configuration

| Variable           | Description                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `SOCIALGO_API_URL` | Base URL of the panel, e.g. `https://api.usesocialgo.com`. You append `/api/v2` for the client. |
| `SOCIALGO_API_KEY` | Your account key, from the panel under `/dashboard/api-key`.                                |

> `apiUrl` is the **full** endpoint URL the client posts to — it does not append `/api/v2`
> for you. Build it yourself and trim any trailing slash from the base.

## Quick start

```ts
import { SmmV2Client, SmmV2Error, applyMarkup, orderCost } from "@socialgo/sdk";

const client = new SmmV2Client({
  apiUrl: `${process.env.SOCIALGO_API_URL?.replace(/\/+$/, "")}/api/v2`,
  apiKey: process.env.SOCIALGO_API_KEY!,
});

try {
  // 1. List services and price one for resale (rate is a string -> Number()).
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

Every method is a thin wrapper over the single SMM API v2 endpoint and returns a `Promise`.
The `action` it sends is shown in parentheses.

| Method                | Returns                                          | Description                          |
| --------------------- | ------------------------------------------------ | ------------------------------------ |
| `services()`          | `SmmService[]`                                   | List every available service.        |
| `add(params)`         | `{ order: number }`                              | Create an order (`add`).             |
| `status(order)`       | `SmmOrderStatus`                                 | Status of one order (`status`).      |
| `multiStatus(orders)` | `Record<string, SmmOrderStatus>`                 | Status of many orders, keyed by id (CSV `status`). |
| `refill(order)`       | `{ refill: number \| string }`                   | Request a refill (`refill`).         |
| `cancel(orders)`      | `Array<{ order: number; cancel: unknown }>`      | Cancel one or more orders (CSV `cancel`). |
| `balance()`           | `SmmBalance`                                     | Current account balance (`balance`). |

Constructor options: `apiUrl`, `apiKey`, optional `timeoutMs` (default `30000`, enforced via
`AbortController`) and `fetchImpl` (default global `fetch`). Requests are sent as
`POST` `application/x-www-form-urlencoded`; `undefined`/`null` params are dropped, the rest are
stringified. Numeric response fields (`rate`, `min`, `max`, `charge`, `balance`, …) come back
as **strings** — wrap them in `Number(...)`.

### Pricing helpers

SMM rates are quoted **per 1000 units**. These are pure, I/O-free, and round to 2 decimals.

| Helper                                       | Description                                              |
| -------------------------------------------- | -------------------------------------------------------- |
| `applyMarkup(rate, rule)`                    | Apply a `MarkupRule` to a supplier rate per 1000.        |
| `orderCost(ratePer1000, quantity)`           | Cost of an order from a per-1000 rate and quantity.      |
| `resolveMarkup(supplier, categoryOverride?)` | Effective markup in cascade (category beats default; uses `??`, so an override of `0` is honored). |

```ts
applyMarkup(2.0, { multiplier: 1.5, flatPer1000: 0.3 }); // => 3.3
orderCost(3.3, 5000);                                     // => 16.5
```

## Exported types

`SmmService`, `SmmAddOrderParams`, `SmmOrderStatus`, `SmmBalance`, `SmmAction`,
`SmmV2ClientOptions`, and `MarkupRule` are all exported from the package root. `SmmAddOrderParams`
carries type-specific fields (drip-feed `runs`/`interval`, `comments`, `usernames`/`hashtags`,
`answer_number`, …) — only the relevant ones are sent. Full type reference in
[`docs/sdk.md`](https://github.com/SocialGOcompany/socialgo-tools/blob/main/docs/sdk.md#core-types).

## Error handling

All failures throw a single typed `SmmV2Error` — on non-2xx HTTP responses, on a JSON body
containing a truthy `error` field (the message is the provider's error string), and on transport
failures or timeouts (the original error or provider payload is attached as `.raw`). Match on
`instanceof SmmV2Error` and read `.raw` rather than parsing message text.

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

Full reference, all types, the markup system, and an end-to-end example:
[`docs/sdk.md`](https://github.com/SocialGOcompany/socialgo-tools/blob/main/docs/sdk.md).

## Related packages

- [`@socialgo/cli`](https://github.com/SocialGOcompany/socialgo-tools/tree/main/packages/cli) — the `socialgo` command-line tool.
- [`@socialgo/mcp`](https://github.com/SocialGOcompany/socialgo-tools/tree/main/packages/mcp) — the `socialgo-mcp` server for AI assistants.

## License

MIT © SocialGO
