# @socialgo/cli

[![npm version](https://img.shields.io/npm/v/@socialgo/cli.svg)](https://www.npmjs.com/package/@socialgo/cli)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

The official command-line client for **SocialGO**. The **main path is guest** — anyone can browse services and **buy with no account, no signup, and no API key** (`guest-*` commands, pay-per-order). An account + API key is **optional**, for **better tracking**: order history, wallet, refills, subscriptions (the reseller commands).

The binary is named `socialgo`.

---

## Installation

> **Heads-up:** this package is **not on npm yet** — `npm install -g @socialgo/cli` and `npx @socialgo/cli` are **coming soon**. Until then, run it from source (below). These steps work today.

### Build from source (works today)

Requires Node.js ≥ 18 and [pnpm](https://pnpm.io). The CLI depends on the workspace package `@socialgo/sdk`, so build it inside the monorepo:

```bash
git clone https://github.com/SocialGOcompany/socialgo-tools.git
cd socialgo-tools
pnpm install     # installs deps + links @socialgo/sdk
pnpm build       # builds all packages
```

Then run the `socialgo` binary any of these ways:

```bash
# Via the package start script (from repo root)
pnpm --filter @socialgo/cli start -- config

# Or the built entrypoint directly
node packages/cli/dist/index.js config

# Or expose `socialgo` globally on your PATH
pnpm --filter @socialgo/cli exec npm link
socialgo config
```

To try a command without building, run the source with `tsx`:

```bash
pnpm --filter @socialgo/cli exec tsx src/index.ts config
```

### Coming soon (npm)

```bash
# Not published yet — coming soon
npm install -g @socialgo/cli
npx @socialgo/cli config
```

---

## Configuration

Configure via environment variables (or the global `--api-url` / `--key` flags):

| Variable           | Required | Default                    | Description                                                  |
| ------------------ | -------- | -------------------------- | ------------------------------------------------------------ |
| `SOCIALGO_API_URL` | No       | `https://api.usesocialgo.com` | Base URL of your panel/API.                                  |
| `SOCIALGO_API_KEY` | Optional\* | —                        | Your API key, from your panel under **/dashboard/api-key**.  |

\* **Not needed to buy.** The **guest** commands work with no key and no account. The key is only required for the reseller commands (order history, wallet, refills) — i.e. optional, for better tracking.

```bash
# No key needed — buy as a guest right away:
socialgo config                 # shows you can buy without an account
socialgo guest-services --platform instagram --q followers

# Optional — only if you have an account and want tracking (history/wallet/refill):
export SOCIALGO_API_KEY="your-key"
export SOCIALGO_API_URL="https://your-panel.com"   # optional
socialgo config   # verify your setup
```

Global flags: `--json` (raw JSON output), `--api-url <url>`, `--key <key>`.

---

## Commands

| Command                      | Auth     | Description                                                     |
| ---------------------------- | -------- | -------------------------------------------------------------- |
| `config`                     | none     | Show current config (API URL + whether a key is set).          |
| `services list`              | API key  | List the full service catalog.                                 |
| `services search <query>`    | API key  | Search the catalog by name, category, type, or id.             |
| `service <id>`               | API key  | Show details for one service.                                  |
| `order add` (alias `create`) | API key  | Create an order (supports drip-feed and type-specific params). |
| `order status <ids...>`      | API key  | Status of one or more orders (batch lookup).                   |
| `order refill <id>`          | API key  | Request a refill for an order.                                 |
| `order cancel <ids...>`      | API key  | Cancel one or more orders.                                     |
| `refill-status`              | API key  | Status of a refill (`--refill` or `--order`).                  |
| `orders`                     | API key  | List your order history.                                       |
| `balance`                    | API key  | Show account balance.                                          |
| `wallet`                     | API key  | Wallet summary (balance + recent transactions).                |
| `add-funds`                  | API key  | Create a pending top-up payment.                               |
| `admin sync-catalog`         | admin    | Sync the catalog from active suppliers.                        |
| `guest-gateways`             | **none** | List the panel's active payment methods (use for `--method`).  |
| `guest-services`             | **none** | Public catalog — find a `serviceId` for a guest order.         |
| `guest-order <serviceId>`    | **none** | Place a no-account order and get a payment URL.                |
| `guest-status <id>`          | **none** | Status of a guest order (`--token` or `--email`).              |

Full reference, flags, and example outputs: [`docs/cli.md`](https://github.com/SocialGOcompany/socialgo-tools/blob/main/docs/cli.md).

---

## Quick start

> Examples below use `socialgo <command>`. If you haven't linked the binary (`npm link`), substitute your run method — e.g. `node packages/cli/dist/index.js <command>`.

### Buy without an account (guest) — the main path

No key, no signup. The `serviceId` is a UUID printed by `guest-services`; the
order id and guest token are returned by `guest-order` — copy the real values
from your own output (the ones below are placeholders).

```bash
# 1. Find a service (prints its UUID under the ID column):
socialgo guest-services --platform instagram --q followers
# 2. See which payment methods are active:
socialgo guest-gateways
# 3. Place the order (email is just a contact for receipt/tracking — not an account):
socialgo guest-order <serviceId-uuid> --email you@example.com \
  --link https://instagram.com/profile --quantity 500
# 4. Open the returned payment URL, then track it with the returned ids:
socialgo guest-status <orderId-uuid> --token <guestToken>
```

### Optional: account mode (better tracking)

Only if you have an account and want history/wallet/refills:

```bash
export SOCIALGO_API_KEY="your-key"
socialgo config
socialgo balance

# Find a service and place an order from your balance
socialgo services search "instagram followers"
socialgo order add --service 1234 --link https://insta.com/p/abc --quantity 1000

# Track it
socialgo order status 98765
```

### Scripting

Add `--json` to any command for machine-readable output:

```bash
socialgo --json order status 98765 | jq '.status'
```

---

## License

[MIT](../../LICENSE)
