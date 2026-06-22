<div align="center">

# SocialGO Tools

# Tell Claude what you want. It runs your SMM panel.

### The first MCP server + CLI for an SMM platform — the AI-native way to run social-media-marketing.

Browse the catalog, place and track orders, and manage your balance straight from **Claude** (and Cursor, Cline, Windsurf, VS Code), from your **terminal**, or from your **own code**. No clicking around a legacy PHP panel.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![CI](https://github.com/SocialGOcompany/socialgo-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/SocialGOcompany/socialgo-tools/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933.svg)](https://nodejs.org)
[![SMM API v2](https://img.shields.io/badge/protocol-SMM%20API%20v2-blue.svg)](./docs/api-reference.md)

</div>

---

> "Find me 1,000 Instagram followers for instagram.com/mypage and place the order."
>
> Claude finds the right service, checks the price, places the order, and hands you the order ID. That sentence is the whole workflow.

---

## Table of contents

- [The old way vs. the AI-native way](#the-old-way-vs-the-ai-native-way)
- [The mechanism: three tools, one typed toolkit](#the-mechanism-three-tools-one-typed-toolkit)
- [Use it from Claude (30-second setup)](#use-it-from-claude-30-second-setup)
- [The SMM MCP server tools](#the-smm-mcp-server-tools)
- [The SMM CLI commands](#the-smm-cli-commands)
- [Quickstart — MCP (AI assistants)](#quickstart--mcp-ai-assistants)
- [Quickstart — CLI (terminal)](#quickstart--cli-terminal)
- [Quickstart — SDK (your code)](#quickstart--sdk-your-code)
- [Guest checkout: buy with no account](#guest-checkout-buy-with-no-account)
- [Installation](#installation)
- [Configuration](#configuration)
- [Which one should I use?](#which-one-should-i-use)
- [Who it's for](#who-its-for)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## The old way vs. the AI-native way

An SMM panel exposes thousands of services and a verbose, form-encoded HTTP protocol behind a click-heavy PHP dashboard. To order followers you log in, hunt through menus, copy a service ID, paste a link, set a quantity, submit, then keep refreshing a status page. Automating it means hand-wiring `key` + `action` form bodies and parsing raw JSON yourself.

SocialGO Tools removes that friction. The same typed core speaks the standard **SMM API v2** protocol (`POST {SOCIALGO_API_URL}/api/v2`) and gives you three ways to drive your panel:

- **Talk to it.** Add the MCP server to Claude and order in plain English. No service IDs to memorize, no forms.
- **Script it.** The `socialgo` CLI runs the full reseller flow from your terminal or a cron job.
- **Build on it.** The TypeScript SDK ships typed models plus dependency-free pricing/markup helpers for resellers.

MCP (the Model Context Protocol) is the new standard that lets AI assistants call real tools. Legacy SMM panels are PHP click-UIs with no AI surface at all. As far as we know, this is the first MCP server and CLI built for an SMM platform.

---

## The mechanism: three tools, one typed toolkit

Everything is one core wearing three faces. Pick the surface that fits how you want to work; the behavior is identical underneath.

| Package | What it does | Reference |
| --- | --- | --- |
| [**`@socialgo/mcp`**](./packages/mcp) | The `socialgo-mcp` **SMM MCP server** — lets Claude and other AI assistants search the catalog and place orders for you. | [MCP docs](./docs/mcp.md) |
| [**`@socialgo/cli`**](./packages/cli) | The `socialgo` command — browse services, place and track orders, manage your wallet, all from the terminal. | [CLI docs](./docs/cli.md) |
| [**`@socialgo/sdk`**](./packages/sdk) | TypeScript client for the **social media marketing API** — typed models, a fetch-based client, and pricing/markup helpers. | [SDK docs](./docs/sdk.md) |

The clever part is the MCP server's **search-then-act** design. A panel can carry thousands of services. Registering one tool per service would blow up the model's context. Instead the server exposes a small, fixed set of tools, anchored by `socialgo_services`: the assistant searches by intent ("cheap Instagram followers"), gets back only the relevant services with IDs and prices, then acts on the one it picked. The tool count stays constant no matter how big the catalog gets.

---

## Use it from Claude (30-second setup)

This is the part that changes how you work. Add the SMM MCP server once, then just ask.

**Claude Desktop** — add this to your `claude_desktop_config.json` and restart Claude:

```json
{
  "mcpServers": {
    "socialgo": {
      "command": "npx",
      "args": ["-y", "@socialgo/mcp"],
      "env": {
        "SOCIALGO_API_URL": "https://usesocialgo.com",
        "SOCIALGO_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

**Claude Code** — one command:

```bash
claude mcp add socialgo \
  --env SOCIALGO_API_URL=https://usesocialgo.com \
  --env SOCIALGO_API_KEY=YOUR_API_KEY \
  -- npx -y @socialgo/mcp
```

The same `npx -y @socialgo/mcp` command works in **Cursor, Cline, Windsurf, and VS Code** — point each client's MCP config at it with the two env vars above.

Now ask in natural language:

> "Find cheap Instagram followers and order 1,000 for instagram.com/mypage."

Here's what happens under the hood:

1. Claude calls `socialgo_services` with your intent and gets back the matching services (IDs, rates per 1,000, min/max).
2. It calls `socialgo_place_order` with the service ID, your link, and the quantity.
3. It reports the order ID back to you, and can follow up with `socialgo_order_status`, `socialgo_refill`, or `socialgo_cancel` on request.

Want to buy without an account? Claude can use the guest tools (`socialgo_guest_gateways`, `socialgo_guest_order`, `socialgo_guest_order_status`) to create a pay-per-order checkout link and track it by token. See [Guest checkout](#guest-checkout-buy-with-no-account).

> Building from source instead of npm? Swap `npx -y @socialgo/mcp` for `node /absolute/path/to/socialgo-tools/packages/mcp/dist/index.js`. See [Installation](#installation).

---

## The SMM MCP server tools

A small, fixed toolset — the complete list the server registers, straight from the code. Account-mode tools use your API key; guest tools need no account.

### Account mode

| Tool | What it does |
| --- | --- |
| `socialgo_services` | Search/filter the catalog by natural-language intent (`query`, optional `platform`/`type`, `limit`). Returns only the relevant services with id, rate per 1,000, min/max and refill/cancel/dripfeed flags. The search-then-act entry point. |
| `socialgo_service_details` | Full details for one service by id (rate, min, max, type, refill/cancel/dripfeed). Confirm limits before ordering. |
| `socialgo_place_order` | Create an order for a service id against a `link`. Supports `quantity`, drip-feed (`runs` + `interval`), and per-type params (`comments`, `usernames`, `hashtags`, `hashtag`, `username`, `media`, `answer_number`). Charged to your wallet. |
| `socialgo_order_status` | Status of one order (`order`) or many at once (`orders` list): status, charge, start_count, remains, currency. |
| `socialgo_refill` | Request a refill for one (`order`) or many (`orders`) orders, when the service supports it. Returns refill id(s). |
| `socialgo_refill_status` | Status of a refill (Pending/Completed/Rejected) by `refill` id or `order` id. |
| `socialgo_cancel` | Cancel one or more orders by id (when the service allows it). |
| `socialgo_orders` | List the account's order history (id, charge, status, start_count, remains, link, quantity, created_at). |
| `socialgo_balance` | Current account balance (balance + currency). Use before ordering to confirm funds. |

### Guest mode (no account, no API key)

| Tool | What it does |
| --- | --- |
| `socialgo_guest_gateways` | List the payment gateways currently active on the panel. Returns `{ gateway, label, kind, coins, notice }` — `gateway` is the value to pass as `method`. Not a fixed list. |
| `socialgo_guest_order` | Create a pay-per-order with just an `email`, a `serviceId`, a `link`, and a `quantity`. Returns `{ orderId, guestToken, url, amount, currency }`. The order ships only after payment confirms. |
| `socialgo_guest_order_status` | Track a guest order by `id`, proving ownership with the `token` (preferred) or the `email` used. Returns safe order fields only. |

See the full [MCP reference](./docs/mcp.md) for every parameter.

---

## The SMM CLI commands

The `socialgo` command covers the whole reseller flow. Add `--json` to any command for script-friendly raw output. Global flags `--api-url` and `--key` override the environment per command.

| Command | What it does |
| --- | --- |
| `socialgo config` | Show the resolved API URL and whether a key is set. |
| `socialgo balance` | Show your wallet balance. |
| `socialgo services list` | List the full catalog. |
| `socialgo services search <query>` | Search services by name, category, type, or id. |
| `socialgo service <id>` | Show one service's details (rate, min/max, refill/cancel/dripfeed). |
| `socialgo order add --service <id> --link <url> [--quantity n]` | Place an order. Supports `--runs`/`--interval` (drip-feed) and per-type params (`--comments`, `--usernames`, `--hashtags`, `--hashtag`, `--username`, `--media`, `--answer-number`); list params accept a file path or inline text. |
| `socialgo order status <ids...>` | Status of one or many orders (batch). |
| `socialgo order refill <id>` | Request a refill for an order. |
| `socialgo order cancel <ids...>` | Cancel one or more orders. |
| `socialgo refill-status --refill <id>` / `--order <id>` | Status of a refill. |
| `socialgo orders` | List your order history. |
| `socialgo wallet` | Balance plus recent transactions. |
| `socialgo add-funds --amount <v> --method <gateway>` | Create a pending top-up payment (finish it in the panel). |
| `socialgo guest-gateways` | List the panel's active payment gateways. |
| `socialgo guest-services [--platform p] [--q term]` | Browse the public catalog (no key) to find a `serviceId`. |
| `socialgo guest-order <serviceId> --email <e> --link <url> [--quantity n] [--method g]` | Create a no-account order; returns a payment URL. |
| `socialgo guest-status <id> --token <t>` / `--email <e>` | Track a guest order. |

Full flag-by-flag detail in the [CLI reference](./docs/cli.md), or run `socialgo <command> --help`.

---

## Quickstart — MCP (AI assistants)

See [Use it from Claude](#use-it-from-claude-30-second-setup) above for the copy-paste config. Once connected, ask Claude things like:

> "What's my SocialGO balance?"
>
> "Order 5,000 YouTube views for this video: youtube.com/watch?v=..."
>
> "Check the status of order 98765, and refill it if it's done."

---

## Quickstart — CLI (terminal)

```bash
npm i -g @socialgo/cli

export SOCIALGO_API_URL="https://usesocialgo.com"
export SOCIALGO_API_KEY="YOUR_API_KEY"

socialgo config                              # confirm URL + key
socialgo balance                             # check your wallet

# find a service, inspect it, order against a link, then track it
socialgo services search "instagram followers"
socialgo service 1234
socialgo order add --service 1234 --link https://instagram.com/yourpage --quantity 1000
socialgo order status 98765
```

Drip-feed and per-type orders work too:

```bash
socialgo order add --service 70 --link <url> --runs 10 --interval 30        # drip-feed
socialgo order add --service 55 --link <url> --comments ./comments.txt      # custom comments
```

> Building from source? The same commands run via `node packages/cli/dist/index.js <command>`.

---

## Quickstart — SDK (your code)

```bash
npm i @socialgo/sdk
```

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

// reseller pricing helpers (dependency-free)
const sellRate = applyMarkup(0.9, { multiplier: 1.5 }); // supplier rate per 1,000 → sell rate
const cost = orderCost(sellRate, 1000);                 // cost for a 1,000-unit order
```

The client also exposes `multiStatus`, `refill`, `cancel` and `balance`; the SDK exports `resolveMarkup` for cascading category overrides. See the full [SDK reference](./docs/sdk.md).

---

## Guest checkout: buy with no account

No account, no API key, no wallet. Guest mode is pay-per-order: provide an email, pay once at checkout.

```bash
# 1. List the active payment gateways (use a name as --method)
socialgo guest-gateways

# 2. Browse the public catalog and grab a service id
socialgo guest-services --platform instagram --q "followers"

# 3. Create the order — returns a payment URL
socialgo guest-order 1234 \
  --email you@example.com \
  --link https://instagram.com/yourpage \
  --quantity 1000 \
  --method mercadopago

# 4. Track it with the token you received (or the email you used)
socialgo guest-status <ORDER_ID> --token <GUEST_TOKEN>
```

The order ships for delivery only **after** payment confirms. Payment methods are never hardcoded — they come live from your panel (`/gateways/active`). Full walkthrough in the [guest checkout guide](./docs/guest-checkout.md).

---

## Installation

The npm packages publish under the `@socialgo` org. The primary path:

```bash
npm i -g @socialgo/cli     # the `socialgo` command
npx -y @socialgo/mcp       # the MCP server (point your AI client at this)
npm i @socialgo/sdk        # the TypeScript SDK
```

Or build from source (a [pnpm](https://pnpm.io) monorepo):

```bash
git clone https://github.com/SocialGOcompany/socialgo-tools.git
cd socialgo-tools
pnpm install
pnpm build      # builds @socialgo/sdk, @socialgo/cli and @socialgo/mcp
```

After `pnpm build`, the CLI lives at `packages/cli/dist/index.js` and the MCP server at `packages/mcp/dist/index.js`. Run `cd packages/cli && npm link` to get the global `socialgo` command from a source build.

---

## Configuration

Every tool reads the same two environment variables. Secrets always come from the environment — nothing is hardcoded, and no upstream supplier is ever exposed.

| Variable | Required | What it is |
| --- | --- | --- |
| `SOCIALGO_API_URL` | yes | Base URL of your SocialGO panel, e.g. `https://usesocialgo.com`. The SMM v2 endpoint is `{SOCIALGO_API_URL}/api/v2`. |
| `SOCIALGO_API_KEY` | account mode | Your API key, found in the panel under **Account › API**. Not needed for [guest mode](#guest-checkout-buy-with-no-account). |

```bash
export SOCIALGO_API_URL="https://usesocialgo.com"
export SOCIALGO_API_KEY="YOUR_API_KEY"
```

The CLI also accepts `--api-url` and `--key` to override per command.

---

## Which one should I use?

All three speak the same SMM API v2 protocol against the same panel. Pick by how you want to drive it.

| | [**MCP**](./packages/mcp) (`@socialgo/mcp`) | [**CLI**](./packages/cli) (`@socialgo/cli`) | [**SDK**](./packages/sdk) (`@socialgo/sdk`) |
| --- | --- | --- | --- |
| **You are…** | running an AI assistant (Claude, etc.) | an operator or scripter in a terminal | a developer building an app/integration |
| **Interface** | natural-language tools over MCP | `socialgo` command (human or `--json`) | TypeScript functions and types |
| **Best for** | conversational "find and order X for me" | one-off ops, cron jobs, shell pipelines | embedding ordering/pricing in your own code |
| **Catalog access** | `socialgo_services` search-then-act | `services search`, `service <id>` | full `services()` list, you filter |
| **Guest checkout** | `socialgo_guest_*` tools | `guest-services` / `guest-order` / `guest-status` | build on the public endpoints |
| **Pricing helpers** | — | — | `applyMarkup`, `orderCost`, `resolveMarkup` |

The CLI and MCP server are both built on top of the SDK. Want maximum control? Drop down to the SDK. Want batteries included? Use the CLI or MCP.

---

## Who it's for

- **SMM resellers** who want to run a panel from one chat window, a terminal, or a cron job instead of clicking through a dashboard. Markup helpers handle reseller pricing in code.
- **Developers** embedding social-media-marketing ordering into their own apps with a typed client.
- **Anyone buying a single order** — guest checkout means no account required.

---

## Documentation

- [Getting started](./docs/getting-started.md) — install, API key, env setup, your first order, guest mode.
- [MCP reference](./docs/mcp.md) — the `socialgo-mcp` SMM MCP server and every tool.
- [CLI reference](./docs/cli.md) — every `socialgo` command and flag.
- [SDK reference](./docs/sdk.md) — the `@socialgo/sdk` client, types, and pricing helpers.
- [API reference](./docs/api-reference.md) — the SMM API v2 protocol and guest endpoints these tools speak.
- [Guest checkout guide](./docs/guest-checkout.md) — buying without an account, end to end.
- [Troubleshooting](./docs/troubleshooting.md) — common errors and fixes.
- [FAQ](./docs/faq.md) — quick answers.

See also the [ROADMAP](./ROADMAP.md).

---

## Contributing

Contributions are welcome. This is a [pnpm](https://pnpm.io) monorepo.

```bash
git clone https://github.com/SocialGOcompany/socialgo-tools.git
cd socialgo-tools
pnpm install
pnpm build      # build all packages
pnpm typecheck  # type-check all packages
pnpm test       # run tests
```

Open an [issue](https://github.com/SocialGOcompany/socialgo-tools/issues) to discuss substantial changes before sending a pull request, and read [CONTRIBUTING.md](./CONTRIBUTING.md) first.

## Security

Found a vulnerability? Follow our [security policy](./SECURITY.md) — please don't open a public issue for sensitive reports.

## License

[MIT](./LICENSE) © SocialGO
</content>
</invoke>
