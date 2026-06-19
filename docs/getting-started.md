# Getting Started

This guide walks you through installing SocialGO Tools, getting your API key, configuring your environment, placing your first order, and using guest mode (no account required).

If you only want a quick taste, the [README](../README.md) has copy-paste quickstarts. This page goes into detail.

---

## Table of contents

1. [Requirements](#requirements)
2. [Install](#install)
3. [Get your API key](#get-your-api-key)
4. [Configure your environment](#configure-your-environment)
5. [Your first order (account mode)](#your-first-order-account-mode)
6. [Guest mode (no account)](#guest-mode-no-account)
7. [Per-type order parameters](#per-type-order-parameters)
8. [Connecting an AI assistant (MCP)](#connecting-an-ai-assistant-mcp)
9. [Troubleshooting](#troubleshooting)

---

## Requirements

- **Node.js 18 or newer** (the toolkit uses the built-in `fetch`).
- A **SocialGO panel URL** (for example `https://usesocialgo.com`).
- An **API key** — only for account mode. Guest mode needs no key.

---

## Install

The CLI is the fastest way to get hands-on.

```bash
# install globally — gives you the `socialgo` command
npm install -g @socialgo/cli
```

Or run it on demand without installing:

```bash
npx @socialgo/cli config
```

You can also use `pnpm add -g @socialgo/cli` or `yarn global add @socialgo/cli`.

The MCP server (`@socialgo/mcp`) and the SDK (`@socialgo/sdk`) are usually installed automatically when you need them — see [Connecting an AI assistant](#connecting-an-ai-assistant-mcp) and the [SDK package](../packages/sdk).

---

## Get your API key

The API key authenticates you in **account mode** and is tied to your wallet balance.

1. Sign in to your SocialGO panel (for example `https://usesocialgo.com`).
2. Open **Dashboard › API key**.
3. Copy the key.

> Treat the key like a password. Anyone with it can spend your wallet balance. Store it in an environment variable or a secrets manager — never commit it to source control.

If you only want to make a one-off purchase, you can skip the key entirely and use [guest mode](#guest-mode-no-account).

---

## Configure your environment

Both the CLI and the MCP server read the same two variables:

| Variable | Required | Description |
| --- | --- | --- |
| `SOCIALGO_API_URL` | yes | Base URL of your panel. The SMM v2 endpoint is `{SOCIALGO_API_URL}/api/v2`. |
| `SOCIALGO_API_KEY` | account mode only | Your personal key from **Dashboard › API key**. |

Set them in your shell:

```bash
export SOCIALGO_API_URL="https://usesocialgo.com"
export SOCIALGO_API_KEY="your-api-key"
```

To make them permanent, add those lines to your `~/.bashrc`, `~/.zshrc`, or your project's `.env`.

Verify the configuration at any time:

```bash
socialgo config
```

```
Configuração SocialGO CLI
  API URL  https://usesocialgo.com
  Chave    definida
```

> **Per-command override.** Instead of environment variables, you can pass `--api-url` and `--key` as global flags on any command, e.g. `socialgo --key abc --api-url https://usesocialgo.com balance`.

---

## Your first order (account mode)

Account mode debits your prepaid wallet. The flow is **search → inspect → order → track**.

### 1. Check your balance

```bash
socialgo balance
```

Need to top up? `socialgo add-funds --amount 50 --method mercadopago` creates a pending payment you complete in the panel. (`--method` accepts `mercadopago`, `stripe`, `crypto`, or `manual`.) Use `socialgo wallet` for balance plus a recent statement.

### 2. Find a service

The catalog can hold thousands of services, so search by intent:

```bash
socialgo services search "instagram followers"
```

```
ID    NOME                         TIPO     CATEGORIA          RATE/1k  MIN   MAX
1234  Instagram Followers [Real]   Default  Instagram          1.20     50    50000
...
```

To list everything: `socialgo services list`.

### 3. Inspect the service

Confirm the limits, type, and whether it supports refill/cancel/drip-feed:

```bash
socialgo service 1234
```

```
Serviço 1234
  Nome       Instagram Followers [Real]
  Tipo       Default
  Categoria  Instagram
  Rate/1k    1.20
  Min / Max  50 / 50000
  Refill     sim
  Cancel     não
  Dripfeed   sim
```

### 4. Place the order

```bash
socialgo order add \
  --service 1234 \
  --link https://instagram.com/yourpage \
  --quantity 1000
```

```
✔ Pedido criado.
  Order ID  98765
  Serviço   1234
  Link      https://instagram.com/yourpage
  Qtd       1000

Acompanhe: socialgo order status 98765
```

### 5. Track, refill, cancel

```bash
socialgo order status 98765            # one order
socialgo order status 98765 4321 555   # several at once
socialgo orders                        # full history
socialgo order refill 98765            # request a refill (if supported)
socialgo refill-status --order 98765   # check a refill
socialgo order cancel 98765 4321       # cancel (if supported)
```

> Add `--json` to any command to get raw JSON — ideal for scripts and pipelines.

---

## Guest mode (no account)

Guest mode lets anyone buy **without an account or API key**. It's pay-per-order: you give an email and pay directly at the gateway. These commands hit the public `/guest/*` endpoints and never send your API key.

### 1. Browse the public catalog

```bash
socialgo guest-services --platform instagram --q "followers" --limit 20
```

```
ID    NOME                         PLATAFORMA  CATEGORIA   RATE/1k  MIN   MAX
1234  Instagram Followers [Real]   instagram   Followers   1.80     50    50000
...
n serviço(s). Use o ID em: socialgo guest-order --email <email> <ID>
```

### 2. Create the order

```bash
socialgo guest-order 1234 \
  --email you@example.com \
  --link https://instagram.com/yourpage \
  --quantity 1000 \
  --method mercadopago
```

```
✔ Pedido criado (aguardando pagamento).
  Order ID      ord_abc123
  Guest Token   gtok_xyz789
  Valor         1.80 BRL
  Método        mercadopago

  Pague abrindo esta URL no navegador:
  https://usesocialgo.com/checkout/...
```

Payment methods: `mercadopago` (PIX + card), `stripe` (card), `crypto` (where enabled). Open the URL to pay. **The order is only sent for delivery after the payment confirms.**

Save the **Order ID** and **Guest Token** — you'll need them to track the order.

### 3. Track the order

```bash
socialgo guest-status ord_abc123 --token gtok_xyz789
# or, if you lost the token, prove ownership with the email you used:
socialgo guest-status ord_abc123 --email you@example.com
```

A status of `awaiting_payment` means the payment hasn't confirmed yet.

---

## Per-type order parameters

Some services need extra inputs beyond `--quantity`. Pass only the fields that match the service type. These flags work on both `order add` and `guest-order`. For list-style flags (`--comments`, `--usernames`, `--hashtags`) you can pass either inline text (one item per line) or a path to a file.

| Service type | Flags |
| --- | --- |
| Default / Package | `--quantity` |
| Drip-feed | `--quantity --runs <n> --interval <minutes>` |
| Custom Comments | `--comments <text|file>` (one comment per line) |
| Mentions Custom List | `--usernames <text|file>` (one @user per line) |
| Mentions with Hashtags | `--usernames <text|file> --hashtags <text|file>` |
| Mentions Hashtag | `--hashtag <tag>` |
| Mentions User Followers / Comment Likes | `--username <user>` |
| Mentions Media Likers | `--media <url>` |
| Poll | `--answer-number <n>` |

Examples:

```bash
# drip-feed: 10 runs of 100, 30 minutes apart
socialgo order add --service 70 --link <url> --quantity 1000 --runs 10 --interval 30

# custom comments from a file (quantity is derived from the number of lines)
socialgo order add --service 55 --link <url> --comments ./comments.txt
```

---

## Connecting an AI assistant (MCP)

The `@socialgo/mcp` server lets AI assistants search services and place orders for you through the Model Context Protocol.

**Claude Code:**

```bash
claude mcp add socialgo \
  --env SOCIALGO_API_URL=https://usesocialgo.com \
  --env SOCIALGO_API_KEY=your-api-key \
  -- npx -y @socialgo/mcp
```

**Claude Desktop** — edit `claude_desktop_config.json`:

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

The server exposes a small, fixed set of tools — `socialgo_services`, `socialgo_service_details`, `socialgo_place_order`, `socialgo_order_status`, `socialgo_refill`, `socialgo_refill_status`, `socialgo_cancel`, `socialgo_orders`, `socialgo_balance`, plus `socialgo_guest_order` and `socialgo_guest_order_status` for account-free purchases.

> Guest tools (`socialgo_guest_order` / `socialgo_guest_order_status`) work even without `SOCIALGO_API_KEY`, since guest checkout never sends a key.

See the [MCP package](../packages/mcp) for the full tool reference.

---

## Troubleshooting

- **`SOCIALGO_API_KEY não definido` / key missing** — Set the variable (or use `--key`). Guest commands don't need it; account commands do.
- **Connection or timeout errors** — Check `SOCIALGO_API_URL` points at the right panel and is reachable. The clients time out after 30 seconds.
- **`Serviço <id> não encontrado`** — The service id isn't in the catalog. Re-run `socialgo services search` (or `guest-services`) to get a current id.
- **Order rejected for a list-type service** — Make sure you passed the right per-type flag (see [Per-type order parameters](#per-type-order-parameters)). For list services, quantity is derived from the number of lines.
- **Guest order stuck on `awaiting_payment`** — The payment hasn't confirmed. Open the checkout URL and complete it; delivery starts only after confirmation.

Still stuck? Open an [issue](https://github.com/SocialGOcompany/socialgo-tools/issues).
