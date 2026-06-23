# @socialgo/cli

[![npm version](https://img.shields.io/npm/v/@socialgo/cli.svg)](https://www.npmjs.com/package/@socialgo/cli)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

The official command-line client for **SocialGO** — browse services, place and track orders, request refills and cancellations, and manage your wallet, all from your terminal. It can also place **guest** orders with no account at all.

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
| `SOCIALGO_API_KEY` | Yes\*    | —                          | Your API key, from your panel under **/dashboard/api-key**.  |

\* Required for all reseller commands. The **guest** commands work without a key.

```bash
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

```bash
# Configure and check
export SOCIALGO_API_KEY="your-key"
socialgo config
socialgo balance

# Find a service and place an order
socialgo services search "instagram followers"
socialgo order add --service 1234 --link https://insta.com/p/abc --quantity 1000

# Track it
socialgo order status 98765
```

### Buy without an account (guest)

```bash
socialgo guest-services --platform instagram --q followers
socialgo guest-order ig01 --email you@example.com --link https://instagram.com/profile --quantity 500
# open the returned payment URL, then:
socialgo guest-status gord_abc123 --token gtok_xyz789
```

### Scripting

Add `--json` to any command for machine-readable output:

```bash
socialgo --json order status 98765 | jq '.status'
```

---

## License

[MIT](../../LICENSE)
