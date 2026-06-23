# @socialgo/mcp

[![npm version](https://img.shields.io/npm/v/@socialgo/mcp.svg)](https://www.npmjs.com/package/@socialgo/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Official **Model Context Protocol** server for [SocialGO](https://github.com/SocialGOcompany/socialgo-tools).
It lets AI assistants — Claude Desktop, Claude Code, Cursor, Cline, Windsurf,
VS Code, and any MCP client — search your SMM catalog, place and track orders,
request refills, and even run guest (no-account) checkouts, all from a
natural-language conversation.

Binary: **`socialgo-mcp`** · Transport: **stdio**

> **The `@socialgo/*` packages aren't on npm yet (coming soon).** Until then,
> run the server **from source** — the steps below work today. When published,
> `npx -y @socialgo/mcp` becomes a drop-in replacement for the
> `node .../packages/mcp/dist/index.js` command.

---

## Install & build (from source)

```bash
git clone https://github.com/SocialGOcompany/socialgo-tools.git
cd socialgo-tools
pnpm install        # pnpm monorepo (npm i -g pnpm)
pnpm build          # compiles packages/mcp → packages/mcp/dist/index.js
```

Smoke-test (prints a readiness line to stderr, then waits for an MCP client over
stdin — Ctrl-C to exit). **No API key needed for guest mode:**

```bash
# Guest mode (no account / no key) — the guest tools are fully keyless:
SOCIALGO_API_URL="https://api.usesocialgo.com" \
node <repo>/packages/mcp/dist/index.js
# stderr: [socialgo-mcp] MCP server ready (stdio).

# Reseller mode (account) — add your key only if you have an account:
SOCIALGO_API_URL="https://api.usesocialgo.com" \
SOCIALGO_API_KEY="your-api-key-here" \
node <repo>/packages/mcp/dist/index.js
```

Requires Node.js ≥ 18. Replace `<repo>` with your clone path.

---

## Quick start

### Claude Desktop

Add to `claude_desktop_config.json`
(`~/Library/Application Support/Claude/` on macOS, `%APPDATA%\Claude\` on
Windows):

**Guest mode (no account / no key)** — set only the URL:

```jsonc
{
  "mcpServers": {
    "socialgo": {
      "command": "node",
      "args": ["<repo>/packages/mcp/dist/index.js"],
      "env": {
        "SOCIALGO_API_URL": "https://api.usesocialgo.com"
      }
    }
  }
}
```

**Reseller mode (account)** — add your key (only if you have an account):

```jsonc
{
  "mcpServers": {
    "socialgo": {
      "command": "node",
      "args": ["<repo>/packages/mcp/dist/index.js"],
      "env": {
        "SOCIALGO_API_URL": "https://api.usesocialgo.com",
        "SOCIALGO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Restart Claude Desktop and the `socialgo` tools appear. A ready-to-edit template
lives at
[`examples/mcp-claude-config.json`](https://github.com/SocialGOcompany/socialgo-tools/blob/main/examples/mcp-claude-config.json).

### Claude Code

```bash
# Guest mode (no key needed):
claude mcp add socialgo \
  --env SOCIALGO_API_URL=https://api.usesocialgo.com \
  -- node <repo>/packages/mcp/dist/index.js

# Reseller mode (add your key only if you have an account):
claude mcp add socialgo \
  --env SOCIALGO_API_URL=https://api.usesocialgo.com \
  --env SOCIALGO_API_KEY=your-api-key-here \
  -- node <repo>/packages/mcp/dist/index.js
```

> Config blocks for **Cursor, Cline, Windsurf, and VS Code** are in
> [`docs/mcp.md`](https://github.com/SocialGOcompany/socialgo-tools/blob/main/docs/mcp.md#client-configuration).
> When `@socialgo/mcp` lands on npm, swap `"command": "node"` +
> `"args": ["<repo>/packages/mcp/dist/index.js"]` for `"command": "npx"` +
> `"args": ["-y", "@socialgo/mcp"]`.

---

## Configuration

Configured entirely through environment variables — no secrets in code:

| Variable           | Required    | Description                                                                  |
| ------------------ | ----------- | ---------------------------------------------------------------------------- |
| `SOCIALGO_API_URL` | Optional    | Base URL of your panel (e.g. `https://api.usesocialgo.com`). SMM v2 lives at `${SOCIALGO_API_URL}/api/v2`. Defaults to `https://api.usesocialgo.com`. |
| `SOCIALGO_API_KEY` | **Optional** | Your API key, from **Dashboard › API Key**. Needed **only** for reseller tools (balance, place_order, wallet, …). The guest tools (`socialgo_guest_*`) are fully keyless — the server runs without any key. |

**Two purchasing modes — how the AI should choose:**

- **Guest (no account / no key)** — buy without an account, pay-per-order,
  identified by email. **No API key required.** Funnel: `socialgo_guest_services`
  → `socialgo_guest_gateways` → `socialgo_guest_order` → `socialgo_guest_order_status`,
  all over the public `/guest/*` endpoints. Use this whenever the user has no
  account or you have no key.
- **Reseller (account)** — uses your API key and wallet balance for the
  non-`guest` tools. Use only when authenticated with a key.

> **Never commit a real API key.**

---

## Tools

A small, fixed toolset (a **search-then-act** design): the model searches the
catalog (keyless `socialgo_guest_services` for guest mode, or `socialgo_services`
with a key for reseller mode), then acts on a service id. This keeps the number
of tools constant no matter how big the catalog is.

**Guest tools need no API key** — start with these when the user has no account.

| Tool | Mode | Key? | Purpose |
| ---- | ---- | ---- | ------- |
| `socialgo_guest_services` | Guest | No | **Start here (no account):** search the public catalog to find a `serviceId`. |
| `socialgo_guest_gateways` | Guest | No | List active payment methods for guest checkout. |
| `socialgo_guest_order` | Guest | No | Buy without an account; returns a payment URL (pay-per-order). |
| `socialgo_guest_order_status` | Guest | No | Track a guest order by token or email. |
| `socialgo_balance` | Reseller | Yes | Current account balance + currency. |
| `socialgo_services` | Reseller | Yes | Search/filter the catalog by natural-language intent. |
| `socialgo_service_details` | Reseller | Yes | Full details of one service by id. |
| `socialgo_place_order` | Reseller | Yes | Create an order from account balance (per-type params + drip-feed). |
| `socialgo_order_status` | Reseller | Yes | Status of one or many account orders. |
| `socialgo_refill` | Reseller | Yes | Request a refill for one or many orders. |
| `socialgo_refill_status` | Reseller | Yes | Status of a refill (by refill id or order id). |
| `socialgo_cancel` | Reseller | Yes | Cancel one or many orders. |
| `socialgo_orders` | Reseller | Yes | Account order history. |

(Plus reseller-only `socialgo_wallet`, `socialgo_add_funds`, `socialgo_mass_order`,
`socialgo_create_subscription`, `socialgo_subscriptions`, `socialgo_validate_coupon`,
`socialgo_affiliate_stats`, `socialgo_loyalty_status`, `socialgo_recommend`,
`socialgo_build_campaign`, `socialgo_storefront` — all require a key.)

Full input schemas, per-tool call/response examples, an end-to-end flow, and
client configs for every editor are in
[`docs/mcp.md`](https://github.com/SocialGOcompany/socialgo-tools/blob/main/docs/mcp.md).

---

## Example: AI-driven guest purchase

> **User:** I want 500 views on my latest TikTok video. My email is
> `buyer@example.com` and I'd like to pay with PIX.

1. Assistant calls `socialgo_guest_services` (no key needed) (`query: "tiktok views"`,
   `platform: "tiktok"`), picks a service by its `id`, confirms limits.
2. Assistant calls `socialgo_guest_gateways` and offers only the active methods
   (`mercadopago` covers PIX).
3. Assistant calls `socialgo_guest_order`:

   ```jsonc
   {
     "email": "buyer@example.com",
     "serviceId": "872",
     "link": "https://www.tiktok.com/@user/video/123456789",
     "quantity": 500,
     "method": "mercadopago"
   }
   ```

   → `{ "orderId": "ord_abc123", "guestToken": "gtok_9f8e7d6c", "url": "https://usesocialgo.com/guest/pay/ord_abc123", "amount": "1.20", "currency": "USD" }`

4. Assistant hands the `url` to the user to pay.
5. After payment, assistant tracks with `socialgo_guest_order_status`
   (`{ "id": "ord_abc123", "token": "gtok_9f8e7d6c" }`). A status of
   `awaiting_payment` means it hasn't been paid yet; once confirmed, the order
   begins delivery.

---

## How it works

- Speaks the SMM API v2 protocol (`POST ${SOCIALGO_API_URL}/api/v2` with
  `key` + `action`) for reseller tools, and the public REST `/guest/*` endpoints
  for guest tools.
- Runs over stdio, launched on demand by the AI client. Logs go to stderr
  (stdout is reserved for the MCP protocol).
- Network calls time out after 30 seconds with a clear, model-readable message.
- Errors are surfaced to the model in a readable form, without leaking stack
  traces or third-party PII. The model only ever sees the SocialGO panel.

---

## Related packages

- [`@socialgo/sdk`](https://github.com/SocialGOcompany/socialgo-tools/tree/main/packages/sdk) — typed client for the SMM v2 protocol.
- [`@socialgo/cli`](https://github.com/SocialGOcompany/socialgo-tools/tree/main/packages/cli) — the `socialgo` command-line tool.

## License

MIT
