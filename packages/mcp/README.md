# @socialgo/mcp

[![npm version](https://img.shields.io/npm/v/@socialgo/mcp.svg)](https://www.npmjs.com/package/@socialgo/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Official **Model Context Protocol** server for [SocialGO](https://github.com/SocialGOcompany/socialgo-tools).
It lets AI assistants — Claude Desktop, Claude Code, and any MCP client — search
your SMM catalog, place and track orders, request refills, and even run guest
(no-account) checkouts, all from a natural-language conversation.

Binary: **`socialgo-mcp`** · Transport: **stdio**

---

## Quick start

### Claude Desktop

Add to `claude_desktop_config.json`
(`~/Library/Application Support/Claude/` on macOS, `%APPDATA%\Claude\` on
Windows):

```jsonc
{
  "mcpServers": {
    "socialgo": {
      "command": "npx",
      "args": ["-y", "@socialgo/mcp"],
      "env": {
        "SOCIALGO_API_URL": "https://usesocialgo.com",
        "SOCIALGO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Restart Claude Desktop and the `socialgo` tools appear.

### Claude Code

```bash
claude mcp add socialgo \
  --env SOCIALGO_API_URL=https://usesocialgo.com \
  --env SOCIALGO_API_KEY=your-api-key-here \
  -- npx -y @socialgo/mcp
```

---

## Configuration

Configured entirely through environment variables — no secrets in code:

| Variable           | Required          | Description                                                                  |
| ------------------ | ----------------- | ---------------------------------------------------------------------------- |
| `SOCIALGO_API_URL` | Recommended       | Base URL of your panel (e.g. `https://usesocialgo.com`). SMM v2 lives at `${SOCIALGO_API_URL}/api/v2`. |
| `SOCIALGO_API_KEY` | For reseller mode | Your API key, from **Dashboard › API Key**. The guest tools do **not** need it. |

**Two purchasing modes:**

- **Reseller / account** — uses your API key and wallet balance.
- **Guest** — buy without an account, pay-per-order, identified by email. Uses
  public `/guest/*` endpoints; needs no API key.

---

## Tools

A small, fixed toolset (a **search-then-act** design): the model searches the
catalog with `socialgo_services`, then acts on a `service` id. This keeps the
number of tools constant no matter how big the catalog is.

| Tool | Purpose |
| ---- | ------- |
| `socialgo_balance` | Current account balance + currency. |
| `socialgo_services` | Search/filter the catalog by natural-language intent. |
| `socialgo_service_details` | Full details of one service by id. |
| `socialgo_place_order` | Create an order (with per-type params + drip-feed). |
| `socialgo_order_status` | Status of one or many orders. |
| `socialgo_refill` | Request a refill for one or many orders. |
| `socialgo_refill_status` | Status of a refill (by refill id or order id). |
| `socialgo_cancel` | Cancel one or many orders. |
| `socialgo_orders` | Account order history. |
| `socialgo_guest_order` | Buy without an account; returns a payment URL. |
| `socialgo_guest_order_status` | Track a guest order by token or email. |

Full input schemas, descriptions, and conversational examples are in
[`docs/mcp.md`](https://github.com/SocialGOcompany/socialgo-tools/blob/main/docs/mcp.md).

---

## Example: AI-driven guest purchase

> **User:** I want 500 views on my latest TikTok video. My email is
> `buyer@example.com` and I'd like to pay with PIX.

1. Assistant calls `socialgo_services` (`query: "tiktok views"`,
   `platform: "TikTok"`), picks a service, confirms limits.
2. Assistant calls `socialgo_guest_order`:

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

3. Assistant hands the `url` to the user to pay.
4. After payment, assistant tracks with `socialgo_guest_order_status`
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
- Errors are surfaced to the model in a readable form, without leaking stack
  traces or third-party PII. The model only ever sees the SocialGO panel.

---

## Related packages

- [`@socialgo/sdk`](https://github.com/SocialGOcompany/socialgo-tools/tree/main/packages/sdk) — typed client for the SMM v2 protocol.
- [`@socialgo/cli`](https://github.com/SocialGOcompany/socialgo-tools/tree/main/packages/cli) — the `socialgo` command-line tool.

## License

MIT
