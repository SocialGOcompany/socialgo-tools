<div align="center">

# SocialGO Tools

### The official SDK, CLI and MCP server for the SocialGO SMM platform

Browse the catalog, place and track social-media-marketing orders, and let AI assistants do it for you — all from a single, typed toolkit.

[![@socialgo/cli on npm](https://img.shields.io/npm/v/@socialgo/cli?label=%40socialgo%2Fcli&color=blue)](https://www.npmjs.com/package/@socialgo/cli)
[![@socialgo/mcp on npm](https://img.shields.io/npm/v/@socialgo/mcp?label=%40socialgo%2Fmcp&color=blue)](https://www.npmjs.com/package/@socialgo/mcp)
[![@socialgo/sdk on npm](https://img.shields.io/npm/v/@socialgo/sdk?label=%40socialgo%2Fsdk&color=blue)](https://www.npmjs.com/package/@socialgo/sdk)
[![CI](https://github.com/SocialGOcompany/socialgo-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/SocialGOcompany/socialgo-tools/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

</div>

---

## What is this?

**SocialGO** is an SMM (social-media-marketing) platform: you order engagement — followers, likes, views, comments and more — for the social profiles, posts and videos you care about.

**SocialGO Tools** is the official, open-source way to talk to that platform programmatically. It speaks the standard **SMM API v2** protocol your panel exposes (`POST {SOCIALGO_API_URL}/api/v2`), so the same toolkit works whether you script it, run it from your terminal, or wire it into an AI assistant.

It ships three packages that build on one another:

| Package | What it does | Docs |
| --- | --- | --- |
| [**`@socialgo/sdk`**](./packages/sdk) | TypeScript client for the SMM API v2 — typed models, a fetch-based client and pricing/markup helpers. | [→](./packages/sdk) |
| [**`@socialgo/cli`**](./packages/cli) | The `socialgo` command — browse services, place & track orders, manage your wallet, all from the terminal. | [→](./packages/cli) |
| [**`@socialgo/mcp`**](./packages/mcp) | The `socialgo-mcp` Model Context Protocol server — lets Claude and other AI assistants search services and place orders for you. | [→](./packages/mcp) |

---

## Configuration

Every tool is configured the same way, through two environment variables:

| Variable | Required | What it is |
| --- | --- | --- |
| `SOCIALGO_API_URL` | yes | Base URL of your SocialGO panel, e.g. `https://usesocialgo.com`. The SMM v2 endpoint lives at `{SOCIALGO_API_URL}/api/v2`. |
| `SOCIALGO_API_KEY` | for account mode | Your personal API key, found on your panel under **Dashboard › API key**. Not required for [guest mode](#two-ways-to-buy). |

```bash
export SOCIALGO_API_URL="https://usesocialgo.com"
export SOCIALGO_API_KEY="your-api-key"
```

> The CLI also accepts `--api-url` and `--key` as global flags to override the environment per command.

---

## Quickstart — CLI

Install the CLI globally and place your first order in three steps.

**1. Install**

```bash
npm install -g @socialgo/cli
# or run it without installing:
npx @socialgo/cli config
```

**2. Configure your key**

```bash
export SOCIALGO_API_URL="https://usesocialgo.com"
export SOCIALGO_API_KEY="your-api-key"

socialgo config     # confirms the API URL and that your key is set
socialgo balance    # shows your wallet balance
```

**3. Find a service and place an order**

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

Other handy commands: `socialgo orders` (order history), `socialgo order refill <id>`, `socialgo order cancel <ids...>`, `socialgo wallet`, and `socialgo add-funds --amount 50 --method mercadopago`. Add `--json` to any command for raw, script-friendly output.

> Drip-feed and per-type parameters (custom comments, mentions, polls) are fully supported — see [`socialgo order add --help`](./packages/cli) and the [getting-started guide](./docs/getting-started.md).

---

## Quickstart — MCP (AI assistants)

The MCP server exposes a small, fixed set of tools so an AI assistant can search the catalog and place orders on your behalf, without ever seeing the full catalog at once.

**Claude Code** — add it with one command:

```bash
claude mcp add socialgo \
  --env SOCIALGO_API_URL=https://usesocialgo.com \
  --env SOCIALGO_API_KEY=your-api-key \
  -- npx -y @socialgo/mcp
```

**Claude Desktop** — add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "socialgo": {
      "command": "npx",
      "args": ["-y", "@socialgo/mcp"],
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

The assistant uses `socialgo_services` to find the right service, then `socialgo_place_order`, and can follow up with `socialgo_order_status`, `socialgo_refill` and `socialgo_cancel`. Guest orders are available too via `socialgo_guest_order` and `socialgo_guest_order_status`.

---

## Example — guest checkout (no account)

You don't need an account or an API key to buy. **Guest mode** is pay-per-order: you provide only an email, and you pay directly at checkout.

```bash
# 1. Browse the public catalog (no key needed) and grab a service id
socialgo guest-services --platform instagram --q "followers"

# 2. Create the order — returns a payment URL
socialgo guest-order 1234 \
  --email you@example.com \
  --link https://instagram.com/yourpage \
  --quantity 1000 \
  --method mercadopago
```

The command prints an **Order ID**, a **Guest Token**, and a checkout **URL**. Open the URL to pay (MercadoPago offers PIX + card, Stripe is card, crypto where enabled). The order is only sent for delivery **after** payment confirms.

```bash
# 3. Track it with the token you received (or the email you used)
socialgo guest-status <ORDER_ID> --token <GUEST_TOKEN>
```

---

## Two ways to buy

SocialGO Tools supports two purchase flows. Pick whichever fits your use case.

| | **Account / reseller mode** | **Guest mode** |
| --- | --- | --- |
| **Account required** | Yes | No |
| **Auth** | `SOCIALGO_API_KEY` | None — just an email |
| **Billing** | Debited from your wallet balance | Pay-per-order at checkout |
| **Best for** | High volume, automation, reselling | One-off purchases, quick buys |
| **CLI commands** | `services`, `order add`, `order status`, `order refill`, `order cancel`, `orders`, `balance`, `wallet`, `add-funds` | `guest-services`, `guest-order`, `guest-status` |
| **MCP tools** | `socialgo_services`, `socialgo_place_order`, `socialgo_order_status`, `socialgo_refill`, `socialgo_cancel`, `socialgo_orders`, `socialgo_balance` | `socialgo_guest_order`, `socialgo_guest_order_status` |

**Account mode** uses the SMM API v2 protocol (`POST /api/v2`) with your key and a prepaid wallet. **Guest mode** uses the public `/guest/*` endpoints — no key is ever sent — and creates/tracks an order tied to your email, with payment collected directly at the gateway.

---

## Using the SDK

For custom integrations, build on `@socialgo/sdk` directly:

```ts
import { SmmV2Client, applyMarkup, orderCost } from "@socialgo/sdk";

const client = new SmmV2Client({
  apiUrl: `${process.env.SOCIALGO_API_URL}/api/v2`,
  apiKey: process.env.SOCIALGO_API_KEY!,
});

const services = await client.services();
const { order } = await client.add({ service: 1234, link: "https://...", quantity: 1000 });
const status = await client.status(order);

// pricing helpers
const sellRate = applyMarkup(0.9, { multiplier: 1.5 }); // supplier rate per 1000 → sell rate
const cost = orderCost(sellRate, 1000);
```

---

## Documentation

- [Getting started](./docs/getting-started.md) — detailed install, getting your API key, env setup, your first order, and guest mode.
- [`@socialgo/sdk`](./packages/sdk) — SDK reference.
- [`@socialgo/cli`](./packages/cli) — full command reference.
- [`@socialgo/mcp`](./packages/mcp) — MCP tools reference.

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

Please open an [issue](https://github.com/SocialGOcompany/socialgo-tools/issues) to discuss substantial changes before sending a pull request.

## License

[MIT](./LICENSE) © SocialGO
