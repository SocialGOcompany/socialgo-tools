# SocialGO MCP Server

> Connect your AI assistant to the SocialGO panel. Search the SMM catalog, place
> orders, track delivery, request refills, and run guest (no-account) checkouts —
> all from a natural-language conversation.

The `@socialgo/mcp` package ships a [Model Context Protocol](https://modelcontextprotocol.io)
server (binary `socialgo-mcp`) that exposes the SocialGO panel to AI assistants
such as Claude Desktop and Claude Code. It speaks the same SMM API v2 protocol
the panel offers to resellers, plus the public guest-checkout endpoints, behind a
small, fixed set of tools.

- **Repository:** https://github.com/SocialGOcompany/socialgo-tools
- **Transport:** stdio (launched by the AI client)
- **Configuration:** environment variables only — no secrets in code

---

## Why a small toolset?

A panel exposes thousands of services (every combination of platform × type ×
source). Registering one tool per service would blow past the model's context
window. Instead the server follows a **search-then-act** design:

1. **SEARCH** — the model calls `socialgo_services` with a natural-language
   intent (e.g. "cheap Instagram followers") and gets back only the relevant
   services, each with its `service` id, price, min, and max.
2. **ACT** — with a `service` id in hand, the model calls `socialgo_place_order`,
   `socialgo_order_status`, `socialgo_refill`, `socialgo_cancel`, and so on.

The number of tools stays constant no matter how large the catalog grows.

---

## Configuration

All configuration comes from the environment:

| Variable           | Required        | Description                                                                 |
| ------------------ | --------------- | --------------------------------------------------------------------------- |
| `SOCIALGO_API_URL` | Recommended     | Base URL of your SocialGO panel (e.g. `https://usesocialgo.com`). The SMM v2 endpoint is `${SOCIALGO_API_URL}/api/v2`. |
| `SOCIALGO_API_KEY` | For reseller mode | Your API key, from **Dashboard › API Key**. Required by every reseller tool. The guest tools do **not** use it. |

Two purchasing modes are supported:

- **Reseller / account mode** — uses your `SOCIALGO_API_KEY` and your wallet
  balance. All tools except the guest ones operate in this mode.
- **Guest mode** — buy **without an account**, pay-per-order, identified only by
  an email. Uses the public `/guest/*` endpoints and needs **no API key**
  (`socialgo_guest_order`, `socialgo_guest_order_status`).

---

## Tool reference

The server registers **11 tools**. All return their result as JSON text.

### Catalog & wallet

#### `socialgo_balance`

Returns the current account balance on the SocialGO panel (`balance` +
`currency`). Use it before placing orders to confirm there is enough balance.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| _(none)_ | — | — | No inputs. |

> _"What's my SocialGO balance?"_

---

#### `socialgo_services`

The heart of the search-then-act design. Searches and filters the SMM catalog by
a natural-language intent and returns **only the relevant services** (service id,
name, category, type, rate per 1000, min, max, and refill/cancel/dripfeed flags).
Always call this before `socialgo_place_order` to discover the correct `service`
id.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `query` | string | No | Search intent, e.g. `"brazilian instagram followers"`. Empty returns a general (limited) list. |
| `platform` | string | No | Optional platform filter, e.g. `"Instagram"`, `"TikTok"`, `"YouTube"`. |
| `type` | string | No | Optional service-type filter, e.g. `"Default"`, `"Package"`, `"Custom Comments"`, `"Poll"`. |
| `limit` | integer (1–50) | No | Max services to return. Default `20`. |

Returns `{ count, total, services }` where `services` is the ranked, trimmed
list.

> _"Find me cheap Instagram followers."_

---

#### `socialgo_service_details`

Returns the full details of a single catalog service by its id (rate, min, max,
type, and refill/cancel/dripfeed flags). Use it to confirm limits and type before
placing an order.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `service` | number \| string | Yes | Service id from `socialgo_services`. |

> _"Show me the details and limits for service 1234."_

---

### Orders

#### `socialgo_place_order`

Creates an order for a service using the `service` id from `socialgo_services`.
The cost is debited from the account balance.

The SMM API v2 protocol takes **different parameters per service type**. Send
only the fields relevant to the chosen service type:

| Service type | Required fields |
| ------------ | --------------- |
| Default | `quantity` (within min/max) |
| Drip-feed | `quantity` + `runs` (executions) + `interval` (minutes between runs) |
| Custom Comments / Comments Package | `comments` (one comment per line) |
| Mentions Custom List / Mentions with Hashtags | `usernames` (one `@username` per line); for hashtags also `hashtags` |
| Mentions Hashtag | `hashtag` |
| Mentions User Followers / Comment Likes | `username` |
| Mentions Media Likers | `media` |
| Poll | `answer_number` |

Full input schema:

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `service` | number \| string | Yes | Service id (from `socialgo_services`). |
| `link` | string | Yes | Target link of the order (profile, post, video, etc.). |
| `quantity` | integer > 0 | No | Desired quantity, within the service's min/max. For list-based types (comments/usernames) the quantity is derived from the lines. |
| `runs` | integer > 0 | No | Drip-feed: number of executions. |
| `interval` | integer > 0 | No | Drip-feed: interval in minutes between executions. |
| `comments` | string | No | Custom Comments / Comments Package: one comment per line. |
| `usernames` | string | No | Mentions Custom List / Mentions with Hashtags: one `@username` per line. |
| `hashtags` | string | No | Mentions with Hashtags: one hashtag per line. |
| `hashtag` | string | No | Mentions Hashtag: the target hashtag. |
| `username` | string | No | Mentions User Followers / Comment Likes: the reference username. |
| `media` | string | No | Mentions Media Likers: link/id of the reference media. |
| `answer_number` | integer | No | Poll: the answer option number to vote for. |

> _"Order 1000 of service 1234 for https://instagram.com/p/abc."_

---

#### `socialgo_order_status`

Checks the status of one or more orders (`status`, `charge`, `start_count`,
`remains`, `currency`). Pass `order` for a single order **or** `orders` (a list)
for several at once.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `order` | number \| string | No* | Id of a single order. |
| `orders` | array of (number \| string) | No* | List of order ids for a batch lookup. |

\* Provide either `order` or `orders`.

> _"What's the status of order 98765?"_ · _"Check orders 98765, 4321 and 5566."_

---

#### `socialgo_refill`

Requests a refill (top-up) for one or more orders, when the service supports
refills. Returns the refill id(s), used later with `socialgo_refill_status`.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `order` | number \| string | No* | Id of a single order to refill. |
| `orders` | array of (number \| string) | No* | List of order ids to refill in batch. |

\* Provide either `order` or `orders`.

> _"Request a refill for order 98765."_

---

#### `socialgo_refill_status`

Checks the status of a refill (Pending / Completed / Rejected). Pass the `refill`
id (returned by `socialgo_refill`) **or** the `order` id (uses that order's most
recent refill).

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `refill` | number \| string | No* | Refill id (returned by `socialgo_refill`). |
| `order` | number \| string | No* | Order id — looks up its most recent refill. |

\* Provide either `refill` or `order`.

> _"Is the refill for order 98765 done yet?"_

---

#### `socialgo_cancel`

Cancels one or more orders by id (when the service allows cancellation). Returns,
per order, whether the cancellation was accepted or the error.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `orders` | array of (number \| string), min 1 | Yes | List of order ids to cancel. |

> _"Cancel orders 98765 and 4321."_

---

#### `socialgo_orders`

Lists the account's order history on the panel (`id`, `charge`, `status`,
`start_count`, `remains`, `link`, `quantity`, `created_at`).

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| _(none)_ | — | — | No inputs. |

> _"Show my recent SocialGO orders."_

---

### Guest checkout (no account)

These two tools buy **without an account** (pay-per-order). They hit the public
`/guest/*` endpoints and do **not** use `SOCIALGO_API_KEY`, so they work even
without a reseller key configured.

#### `socialgo_guest_order`

Creates an SMM order without an account and returns the payment URL. The order is
created as `awaiting_payment` and is only dispatched **after the payment
confirms** — so the assistant should hand the `url` to the user and ask them to
complete payment.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `email` | string (email) | Yes | Buyer's email. Used to find/create a guest user and to track the order. |
| `serviceId` | string | Yes | Id of the service to buy (from `socialgo_services`). |
| `link` | string | Yes | Target link of the order (profile, post, video, etc.). |
| `quantity` | integer > 0 | No | Desired quantity, within the service's min/max. For list types it is derived from the lines in `metadata`. |
| `method` | enum: `stripe` \| `mercadopago` \| `crypto` \| `paypal` \| `paytm` | Yes | Payment method. `mercadopago` = PIX + card + boleto; `stripe` = card; `crypto`/`paypal`/`paytm` as enabled. Only methods active on the panel work. |
| `metadata` | object | No | Per-type extra fields (`comments`, `usernames`, `hashtags`, `hashtag`, `username`, `media`, `answer_number`, `runs`, `interval`). Send only those relevant to the service type. |

Returns `{ orderId, guestToken, url, amount, currency }`. **Hand the `url` to the
user** and keep `orderId` + `guestToken` to track via
`socialgo_guest_order_status`.

> _"Buy 500 TikTok views for me — my email is buyer@example.com — pay with PIX."_

---

#### `socialgo_guest_order_status`

Checks the status of a guest order (created by `socialgo_guest_order`) without an
account. Pass the order `id` and prove ownership with `token` (the `guestToken`,
preferred) **or** the `email` used at purchase.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `id` | string | Yes | Guest order id (`orderId` from `socialgo_guest_order`). |
| `token` | string | No* | `guestToken` returned at creation (preferred way to prove ownership). |
| `email` | string (email) | No* | Email used at purchase (alternative to the token). |

\* Provide either `token` or `email`.

Returns `{ id, status, serviceName, link, quantity, charge, startCount, remains,
createdAt }`. A status of `awaiting_payment` means the order has not been paid
yet.

> _"Has my guest order ord_abc123 been paid and started?"_

---

## Example: an AI-driven guest purchase

A complete conversation, no account required:

> **User:** I want 500 views on my latest TikTok video. My email is
> `buyer@example.com` and I'd like to pay with PIX.

1. The assistant calls **`socialgo_services`** with `query: "tiktok views"`,
   `platform: "TikTok"` and picks a service from the result, e.g. service
   `872` (rate, min, max all checked).
2. It confirms the choice and the limits with the user, then calls
   **`socialgo_guest_order`**:

   ```jsonc
   {
     "email": "buyer@example.com",
     "serviceId": "872",
     "link": "https://www.tiktok.com/@user/video/123456789",
     "quantity": 500,
     "method": "mercadopago"
   }
   ```

   Response:

   ```jsonc
   {
     "orderId": "ord_abc123",
     "guestToken": "gtok_9f8e7d6c",
     "url": "https://usesocialgo.com/guest/pay/ord_abc123",
     "amount": "1.20",
     "currency": "USD"
   }
   ```

3. The assistant replies:

   > Your order is ready — 500 TikTok views for $1.20. Open this link and
   > complete the payment (PIX, card, or boleto):
   > **https://usesocialgo.com/guest/pay/ord_abc123**
   > I'll track it once you've paid.

4. After the user pays, the assistant calls **`socialgo_guest_order_status`**:

   ```jsonc
   { "id": "ord_abc123", "token": "gtok_9f8e7d6c" }
   ```

   While the response shows `"status": "awaiting_payment"`, the order has not
   been paid yet. Once it confirms, `status` moves on and `startCount` /
   `remains` populate — the assistant then reports delivery progress.

---

## Installation

The server runs over **stdio**, launched on demand by your AI client.

### Claude Desktop

Add the server to `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

> For **guest-only** usage you may omit `SOCIALGO_API_KEY` — the
> `socialgo_guest_order` and `socialgo_guest_order_status` tools work without it.
> The reseller tools will return a clear error until a key is set.

Restart Claude Desktop. The `socialgo` tools then appear in the tools menu.

### Claude Code

Add the server with the `claude mcp add` command:

```bash
claude mcp add socialgo \
  --env SOCIALGO_API_URL=https://usesocialgo.com \
  --env SOCIALGO_API_KEY=your-api-key-here \
  -- npx -y @socialgo/mcp
```

To verify it loaded:

```bash
claude mcp list
```

### Run directly

You can also point any MCP client at the binary:

```bash
SOCIALGO_API_URL=https://usesocialgo.com \
SOCIALGO_API_KEY=your-api-key-here \
npx -y @socialgo/mcp
```

The server logs `[socialgo-mcp] MCP server ready (stdio).` to stderr (stdout is
reserved for the MCP protocol).

---

## Notes

- Errors from the API are returned to the model in a readable form, without
  leaking stack traces or third-party PII.
- The model only ever sees the SocialGO panel — no upstream provider is exposed.
- Guest order status returns only the buyer's own safe fields; it never reveals
  third-party data.
