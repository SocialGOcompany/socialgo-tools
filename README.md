<div align="center">

# SocialGO Tools

### The official SDK, CLI and MCP server for the SocialGO SMM platform

**Browse the catalog, place and track social-media-marketing orders, and let AI assistants do it for you — all from a single, typed TypeScript toolkit.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![CI](https://github.com/SocialGOcompany/socialgo-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/SocialGOcompany/socialgo-tools/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933.svg)](https://nodejs.org)
[![npm](https://img.shields.io/badge/npm-coming%20soon-lightgrey.svg)](#installation)

</div>

---

## Table of contents

- [Why SocialGO Tools](#why-socialgo-tools)
- [The three packages](#the-three-packages)
- [Installation](#installation)
- [Configuration](#configuration)
- [Quickstart — CLI](#quickstart--cli)
- [Quickstart — MCP (AI assistants)](#quickstart--mcp-ai-assistants)
- [Quickstart — SDK](#quickstart--sdk)
- [Guest checkout (no account)](#guest-checkout-no-account)
- [SDK vs CLI vs MCP — which one should I use?](#sdk-vs-cli-vs-mcp--which-one-should-i-use)
- [Two ways to buy](#two-ways-to-buy)
- [Documentation](#documentation)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Why SocialGO Tools

**SocialGO** is an SMM (social-media-marketing) platform: you order engagement — followers, likes, views, comments and more — for the social profiles, posts and videos you care about.

A panel like this exposes **thousands** of services and a verbose, form-encoded HTTP protocol. Wiring that into a script, a terminal workflow, or an AI assistant by hand is tedious and error-prone. **SocialGO Tools** does that work for you:

- **One protocol, three surfaces.** Everything is built on the standard **SMM API v2** protocol your panel exposes (`POST {SOCIALGO_API_URL}/api/v2`). The same typed core powers a library, a CLI, and an MCP server — so you script it, run it from your terminal, or hand it to an AI, with identical behavior.
- **Fully typed.** The SDK ships TypeScript models for services, orders, balances and statuses, plus dependency-free pricing/markup helpers for resellers.
- **AI-native.** The MCP server uses a *search-then-act* design: a small, fixed set of tools lets an assistant find the right service on demand instead of drowning in the full catalog.
- **No account needed.** A built-in **guest checkout** flow lets anyone place and track a single order with just an email — no API key, no wallet.
- **Secrets stay yours.** Credentials are always read from the environment. Nothing is hardcoded, and no upstream supplier is ever exposed.

---

## The three packages

| Package | What it does | Reference |
| --- | --- | --- |
| [**`@socialgo/sdk`**](./packages/sdk) | TypeScript client for the SMM API v2 — typed models, a fetch-based client and pricing/markup helpers. | [SDK docs](./docs/sdk.md) |
| [**`@socialgo/cli`**](./packages/cli) | The `socialgo` command — browse services, place & track orders, manage your wallet, all from the terminal. | [CLI docs](./docs/cli.md) |
| [**`@socialgo/mcp`**](./packages/mcp) | The `socialgo-mcp` Model Context Protocol server — lets Claude and other AI assistants search services and place orders for you. | [MCP docs](./docs/mcp.md) |

---

## Installation

> **npm packages are coming soon.** Until `@socialgo/cli`, `@socialgo/sdk` and `@socialgo/mcp` are published, install by **building from source**. This is a [pnpm](https://pnpm.io) monorepo and builds in one step.

```bash
git clone https://github.com/SocialGOcompany/socialgo-tools.git
cd socialgo-tools
pnpm install
pnpm build      # builds @socialgo/sdk, @socialgo/cli and @socialgo/mcp
```

After `pnpm build`, the executables live at:

| Tool | Path after build | Run it with |
| --- | --- | --- |
| CLI | `packages/cli/dist/index.js` | `node packages/cli/dist/index.js <command>` |
| MCP server | `packages/mcp/dist/index.js` | `node packages/mcp/dist/index.js` |

To get the global `socialgo` command on your `PATH`, link the CLI package:

```bash
cd packages/cli && npm link    # then `socialgo` is available everywhere
```

> **Coming soon (npm):** once published you'll be able to `npm i -g @socialgo/cli`, `npx -y @socialgo/mcp`, and `npm i @socialgo/sdk`. The commands below show that future form where relevant — for now, use the `node packages/.../dist/index.js` paths above (or `socialgo` after `npm link`).

---

## Configuration

Every tool is configured the same way, through two environment variables:

| Variable | Required | What it is |
| --- | --- | --- |
| `SOCIALGO_API_URL` | yes | Base URL of your SocialGO panel, e.g. `https://usesocialgo.com`. The SMM v2 endpoint lives at `{SOCIALGO_API_URL}/api/v2`. |
| `SOCIALGO_API_KEY` | for account mode | Your personal API key, found on your panel under **Account › API**. Not required for [guest mode](#guest-checkout-no-account). |

```bash
export SOCIALGO_API_URL="https://usesocialgo.com"
export SOCIALGO_API_KEY="your-api-key"
```

> The CLI also accepts `--api-url` and `--key` as global flags to override the environment per command.

---

## Quickstart — CLI

Assuming you've [built from source](#installation) and run `npm link` (so `socialgo` is on your `PATH`):

**1. Confirm your configuration**

```bash
export SOCIALGO_API_URL="https://usesocialgo.com"
export SOCIALGO_API_KEY="your-api-key"

socialgo config     # confirms the API URL and that your key is set
socialgo balance    # shows your wallet balance
```

**2. Find a service and place an order**

```bash
# search the catalog for what you want
socialgo services search "instagram followers"

# inspect one service to confirm its limits and type
socialgo service 1234

# place the order against a target link
socialgo order add --service 1234 --link https://instagram.com/yourpage --quantity 1000

# track it
socialgo order status 98765
```

Other handy commands: `socialgo orders` (order history), `socialgo order refill <id>`, `socialgo order cancel <ids...>`, `socialgo refill-status --order <id>`, `socialgo wallet`, and `socialgo add-funds --amount 50 --method mercadopago`. Add `--json` to any command for raw, script-friendly output.

> Drip-feed and per-type parameters (custom comments, mentions, polls) are fully supported — see the [CLI reference](./docs/cli.md) or run `socialgo order add --help`.

> Not linked the binary? The same commands work via `node packages/cli/dist/index.js <command>`.

---

## Quickstart — MCP (AI assistants)

The MCP server exposes a small, fixed set of tools so an AI assistant can search the catalog and place orders on your behalf — without ever loading the full catalog at once.

Until the npm package ships, point your client at the **built binary** (`packages/mcp/dist/index.js`).

**Claude Code** — add it with one command (use the absolute path to your clone):

```bash
claude mcp add socialgo \
  --env SOCIALGO_API_URL=https://usesocialgo.com \
  --env SOCIALGO_API_KEY=your-api-key \
  -- node /absolute/path/to/socialgo-tools/packages/mcp/dist/index.js
```

**Claude Desktop** — add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "socialgo": {
      "command": "node",
      "args": ["/absolute/path/to/socialgo-tools/packages/mcp/dist/index.js"],
      "env": {
        "SOCIALGO_API_URL": "https://usesocialgo.com",
        "SOCIALGO_API_KEY": "your-api-key"
      }
    }
  }
}
```

Once connected, just ask in natural language:

> "Find cheap Instagram followers and order 1,000 for instagram.com/mypage."

The assistant uses `socialgo_services` to find the right service, then `socialgo_place_order`, and can follow up with `socialgo_order_status`, `socialgo_refill` and `socialgo_cancel`. Guest (no-account) checkout is available too via `socialgo_guest_gateways`, `socialgo_guest_order` and `socialgo_guest_order_status`.

> **Coming soon:** when published, the `command`/`args` become `npx` + `["-y", "@socialgo/mcp"]`. See the full [MCP reference](./docs/mcp.md) for every tool and its parameters.

---

## Quickstart — SDK

For custom integrations, build on `@socialgo/sdk` directly. In this workspace, import it from the built package (or add it as a dependency once published):

```ts
import { SmmV2Client, applyMarkup, orderCost } from "@socialgo/sdk";

const client = new SmmV2Client({
  apiUrl: `${process.env.SOCIALGO_API_URL}/api/v2`, // the SMM v2 endpoint
  apiKey: process.env.SOCIALGO_API_KEY!,
});

// catalog + orders
const services = await client.services();
const { order } = await client.add({ service: 1234, link: "https://...", quantity: 1000 });
const status = await client.status(order);

// pricing helpers (reseller markup)
const sellRate = applyMarkup(0.9, { multiplier: 1.5 }); // supplier rate per 1000 → sell rate
const cost = orderCost(sellRate, 1000);                 // cost for a 1000-unit order
```

The client also exposes `multiStatus`, `refill`, `cancel` and `balance`. See the full [SDK reference](./docs/sdk.md).

---

## Guest checkout (no account)

You don't need an account or an API key to buy. **Guest mode** is pay-per-order: you provide only an email, and you pay directly at checkout.

```bash
# 1. List the active payment gateways (names you can pass as --method)
socialgo guest-gateways

# 2. Browse the public catalog (no key needed) and grab a service id
socialgo guest-services --platform instagram --q "followers"

# 3. Create the order — returns a payment URL
socialgo guest-order 1234 \
  --email you@example.com \
  --link https://instagram.com/yourpage \
  --quantity 1000 \
  --method mercadopago
```

The command prints an **Order ID**, a **Guest Token**, and a checkout **URL**. Open the URL to pay using whichever gateways your panel has enabled. The order is only sent for delivery **after** payment confirms.

```bash
# 4. Track it with the token you received (or the email you used)
socialgo guest-status <ORDER_ID> --token <GUEST_TOKEN>
```

Payment methods are **not hardcoded** — the available gateways come from your panel (`socialgo guest-gateways`). See the full [guest checkout guide](./docs/guest-checkout.md).

---

## SDK vs CLI vs MCP — which one should I use?

All three speak the same SMM API v2 protocol against the same panel. Pick by *how* you want to drive it:

| | [**SDK**](./packages/sdk) (`@socialgo/sdk`) | [**CLI**](./packages/cli) (`@socialgo/cli`) | [**MCP**](./packages/mcp) (`@socialgo/mcp`) |
| --- | --- | --- | --- |
| **You are…** | a developer building an app/integration | an operator or scripter in a terminal | an AI assistant (Claude, etc.) acting for a user |
| **Interface** | TypeScript functions & types | `socialgo` command (human or `--json`) | natural-language tools over MCP |
| **Best for** | embedding ordering/pricing in your own code | one-off ops, cron jobs, shell pipelines | conversational "find and order X for me" |
| **Catalog access** | full `services()` list, you filter | `services search`, `service <id>` | `socialgo_services` search-then-act (never dumps the full catalog) |
| **Guest checkout** | build on the public endpoints yourself | `guest-services` / `guest-order` / `guest-status` | `socialgo_guest_*` tools |
| **Pricing helpers** | ✅ `applyMarkup`, `orderCost`, `resolveMarkup` | — | — |
| **Auth** | `SOCIALGO_API_KEY` (or none for guest) | env vars or `--key` / `--api-url` | env vars passed by the MCP host |

> The CLI and MCP server are both **built on top of the SDK** — so if you want maximum control, drop down to the SDK; if you want batteries-included surfaces, use the CLI or MCP.

---

## Two ways to buy

SocialGO Tools supports two purchase flows. Pick whichever fits your use case.

| | **Account / reseller mode** | **Guest mode** |
| --- | --- | --- |
| **Account required** | Yes | No |
| **Auth** | `SOCIALGO_API_KEY` | None — just an email |
| **Billing** | Debited from your wallet balance | Pay-per-order at checkout |
| **Best for** | High volume, automation, reselling | One-off purchases, quick buys |
| **CLI commands** | `services`, `service`, `order add`, `order status`, `order refill`, `order cancel`, `refill-status`, `orders`, `balance`, `wallet`, `add-funds` | `guest-gateways`, `guest-services`, `guest-order`, `guest-status` |
| **MCP tools** | `socialgo_services`, `socialgo_service_details`, `socialgo_place_order`, `socialgo_order_status`, `socialgo_refill`, `socialgo_refill_status`, `socialgo_cancel`, `socialgo_orders`, `socialgo_balance` | `socialgo_guest_gateways`, `socialgo_guest_order`, `socialgo_guest_order_status` |

**Account mode** uses the SMM API v2 protocol (`POST /api/v2`) with your key and a prepaid wallet. **Guest mode** uses the public `/guest/*` endpoints — no key is ever sent — and creates/tracks an order tied to your email, with payment collected directly at the gateway.

---

## Documentation

- [Getting started](./docs/getting-started.md) — detailed install, getting your API key, env setup, your first order, and guest mode.
- [SDK reference](./docs/sdk.md) — the `@socialgo/sdk` client, types and pricing helpers.
- [CLI reference](./docs/cli.md) — every `socialgo` command and flag.
- [MCP reference](./docs/mcp.md) — the `socialgo-mcp` server and all its tools.
- [Guest checkout guide](./docs/guest-checkout.md) — buying without an account, end to end.
- [API reference](./docs/api-reference.md) — the SMM API v2 protocol and guest endpoints these tools speak.
- [Troubleshooting](./docs/troubleshooting.md) — common errors and how to fix them.
- [FAQ](./docs/faq.md) — quick answers to common questions.

---

## Roadmap

npm publishing, more catalog filters, and richer reseller pricing tooling are on the way. See [ROADMAP.md](./ROADMAP.md) for what's planned and how to influence it.

---

## Contributing

Contributions are welcome! This is a [pnpm](https://pnpm.io) monorepo.

```bash
git clone https://github.com/SocialGOcompany/socialgo-tools.git
cd socialgo-tools
pnpm install
pnpm build      # build all packages
pnpm typecheck  # type-check all packages
pnpm test       # run tests
```

Please open an [issue](https://github.com/SocialGOcompany/socialgo-tools/issues) to discuss substantial changes before sending a pull request, and read [CONTRIBUTING.md](./CONTRIBUTING.md) first.

## Security

Found a vulnerability? Please follow our [security policy](./SECURITY.md) — do not open a public issue for sensitive reports.

## License

[MIT](./LICENSE) © SocialGO
