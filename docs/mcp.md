# SocialGO MCP Server

> Connect your AI assistant to the SocialGO panel. Search the SMM catalog, place
> orders, track delivery, request refills, and run guest (no-account) checkouts —
> all from a natural-language conversation.

The `@socialgo/mcp` package ships a [Model Context Protocol](https://modelcontextprotocol.io)
server (binary `socialgo-mcp`) that exposes the SocialGO panel to AI assistants
such as Claude Desktop, Claude Code, Cursor, Cline, Windsurf, and VS Code. It
speaks the same SMM API v2 protocol the panel offers to resellers, plus the
public guest-checkout endpoints, behind a small, fixed set of tools.

- **Repository:** https://github.com/SocialGOcompany/socialgo-tools
- **Transport:** stdio (launched by the AI client)
- **Configuration:** environment variables only — no secrets in code

> **Install note.** The `@socialgo/*` packages are **not on npm yet** (coming
> soon). Until then, run the server **from source** — the steps below work today.
> Once published, the `npx -y @socialgo/mcp` form will work as a drop-in
> replacement for the `node .../packages/mcp/dist/index.js` command shown here.

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

## Install & build (from source)

The server is a Node binary launched over **stdio** by your AI client. Build it
once, then point your client at the compiled entrypoint.

```bash
# 1. Clone the monorepo
git clone https://github.com/SocialGOcompany/socialgo-tools.git
cd socialgo-tools

# 2. Install workspace deps (pnpm monorepo)
pnpm install

# 3. Build all packages (compiles packages/mcp → packages/mcp/dist)
pnpm build
```

This produces the runnable entrypoint at:

```text
<repo>/packages/mcp/dist/index.js
```

Smoke-test it directly (it prints a readiness line to **stderr** and then waits
for an MCP client to speak to it over stdin — press Ctrl-C to exit):

```bash
SOCIALGO_API_URL="https://usesocialgo.com" \
SOCIALGO_API_KEY="your-api-key-here" \
node <repo>/packages/mcp/dist/index.js
# stderr: [socialgo-mcp] MCP server ready (stdio).
```

> Replace `<repo>` with the absolute path where you cloned `socialgo-tools`
> (e.g. `/home/you/socialgo-tools`). All client configs below use this path.

**Requirements:** Node.js ≥ 18 and [pnpm](https://pnpm.io) (`npm i -g pnpm`).

> **Coming soon — npm.** Once `@socialgo/mcp` is published, you'll be able to
> drop the build step and use `npx -y @socialgo/mcp` anywhere this guide shows
> `node <repo>/packages/mcp/dist/index.js`.

---

## Configuration

All configuration comes from the environment:

| Variable           | Required          | Description                                                                 |
| ------------------ | ----------------- | --------------------------------------------------------------------------- |
| `SOCIALGO_API_URL` | Recommended       | Base URL of your SocialGO panel (e.g. `https://usesocialgo.com`). The SMM v2 endpoint is `${SOCIALGO_API_URL}/api/v2`. Defaults to `https://usesocialgo.com` if unset. |
| `SOCIALGO_API_KEY` | For reseller mode | Your API key, from **Dashboard › API Key**. Required by every reseller tool. The guest tools do **not** use it. |

Two purchasing modes are supported:

- **Reseller / account mode** — uses your `SOCIALGO_API_KEY` and your wallet
  balance. All tools except the guest ones operate in this mode.
- **Guest mode** — buy **without an account**, pay-per-order, identified only by
  an email. Uses the public `/guest/*` endpoints and needs **no API key**
  (`socialgo_guest_gateways`, `socialgo_guest_order`,
  `socialgo_guest_order_status`).

> **Never commit a real API key.** Keep it in your client's `env` block or a
> local secrets store. A ready-to-edit template lives at
> [`examples/mcp-claude-config.json`](https://github.com/SocialGOcompany/socialgo-tools/blob/main/examples/mcp-claude-config.json).

---

## Client configuration

Every MCP client launches the server the same way — a `command` plus `args` plus
an `env` block. The blocks below are copy-pasteable; just replace `<repo>` with
your clone path and `your-api-key-here` with your key.

> The shape used everywhere is the standard MCP `stdioServer` form:
>
> ```jsonc
> {
>   "command": "node",
>   "args": ["<repo>/packages/mcp/dist/index.js"],
>   "env": {
>     "SOCIALGO_API_URL": "https://usesocialgo.com",
>     "SOCIALGO_API_KEY": "your-api-key-here"
>   }
> }
> ```
>
> When `@socialgo/mcp` lands on npm, swap `"command": "node"` +
> `"args": ["<repo>/packages/mcp/dist/index.js"]` for `"command": "npx"` +
> `"args": ["-y", "@socialgo/mcp"]`.

### Claude Desktop

Edit `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```jsonc
{
  "mcpServers": {
    "socialgo": {
      "command": "node",
      "args": ["<repo>/packages/mcp/dist/index.js"],
      "env": {
        "SOCIALGO_API_URL": "https://usesocialgo.com",
        "SOCIALGO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Restart Claude Desktop — the `socialgo` tools then appear in the tools menu.
See also [`examples/mcp-claude-config.json`](https://github.com/SocialGOcompany/socialgo-tools/blob/main/examples/mcp-claude-config.json).

### Claude Code

Register it with one command (no JSON file to edit):

```bash
claude mcp add socialgo \
  --env SOCIALGO_API_URL=https://usesocialgo.com \
  --env SOCIALGO_API_KEY=your-api-key-here \
  -- node <repo>/packages/mcp/dist/index.js
```

Verify it loaded:

```bash
claude mcp list
```

### Cursor

Add the server to Cursor's MCP config — `~/.cursor/mcp.json` (global) or
`.cursor/mcp.json` in your project root:

```jsonc
{
  "mcpServers": {
    "socialgo": {
      "command": "node",
      "args": ["<repo>/packages/mcp/dist/index.js"],
      "env": {
        "SOCIALGO_API_URL": "https://usesocialgo.com",
        "SOCIALGO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Then enable **socialgo** under **Settings › MCP**.

### Cline (VS Code extension)

Open Cline's MCP settings (**Cline › MCP Servers › Configure**, which edits
`cline_mcp_settings.json`) and add:

```jsonc
{
  "mcpServers": {
    "socialgo": {
      "command": "node",
      "args": ["<repo>/packages/mcp/dist/index.js"],
      "env": {
        "SOCIALGO_API_URL": "https://usesocialgo.com",
        "SOCIALGO_API_KEY": "your-api-key-here"
      },
      "disabled": false
    }
  }
}
```

### Windsurf

Edit `~/.codeium/windsurf/mcp_config.json` (or use **Settings › Cascade › MCP
Servers › Add server**):

```jsonc
{
  "mcpServers": {
    "socialgo": {
      "command": "node",
      "args": ["<repo>/packages/mcp/dist/index.js"],
      "env": {
        "SOCIALGO_API_URL": "https://usesocialgo.com",
        "SOCIALGO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### VS Code (GitHub Copilot agent mode)

Create `.vscode/mcp.json` in your workspace (note VS Code uses a top-level
`servers` key):

```jsonc
{
  "servers": {
    "socialgo": {
      "type": "stdio",
      "command": "node",
      "args": ["<repo>/packages/mcp/dist/index.js"],
      "env": {
        "SOCIALGO_API_URL": "https://usesocialgo.com",
        "SOCIALGO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Then start it from the **MCP: List Servers** command, or it auto-starts when you
open agent mode.

---

## Tools at a glance

The server registers **23 tools**. All return their result as JSON text. The
assistant works in any language — ask in English, Portuguese or Spanish and it
reads the figures back to you in the language you used.

| Tool | Mode | Purpose | Required input |
| ---- | ---- | ------- | -------------- |
| `socialgo_balance` | Reseller | Account balance + currency. | _(none)_ |
| `socialgo_wallet` | Reseller | Balance + currency plus recent ledger transactions. | _(none)_ |
| `socialgo_add_funds` | Reseller | Create a pending wallet top-up; finish payment in the panel. | `amount`, `method` |
| `socialgo_services` | Reseller | Search/filter the catalog by natural-language intent. | _(none)_ |
| `socialgo_service_details` | Reseller | Full details of one service by id. | `service` |
| `socialgo_recommend` | Reseller | Recommend related services from an anchor service and/or platform. | `service` or `platform` |
| `socialgo_place_order` | Reseller | Create an order (per-type params + drip-feed). | `service`, `link` |
| `socialgo_mass_order` | Reseller | Place several orders in one call; each line independent. | `orders` |
| `socialgo_build_campaign` | Reseller | Build a campaign plan from budget + window + goal (no order placed). | `budget`, `days` + (`service` or `platform`) |
| `socialgo_create_subscription` | Reseller | Recurring subscription: re-order every `interval` minutes for `runs` runs. | `service`, `link`, `quantity`, `runs`, `interval` |
| `socialgo_subscriptions` | Reseller | List the user's recurring subscriptions. | _(none)_ |
| `socialgo_order_status` | Reseller | Status of one or many orders. | `order` or `orders` |
| `socialgo_refill` | Reseller | Request a refill for one or many orders. | `order` or `orders` |
| `socialgo_refill_status` | Reseller | Status of a refill (by refill id or order id). | `refill` or `order` |
| `socialgo_cancel` | Reseller | Cancel one or many orders. | `orders` |
| `socialgo_orders` | Reseller | Account order history. | _(none)_ |
| `socialgo_validate_coupon` | Reseller | Preview a coupon without redeeming it. | `code` |
| `socialgo_affiliate_stats` | Reseller | The user's own referral link and affiliate numbers. | _(none)_ |
| `socialgo_loyalty_status` | Reseller | The user's loyalty tier, points and progress. | _(none)_ |
| `socialgo_storefront` | Public | Resolve a public storefront by slug with its packages. | `slug` |
| `socialgo_guest_gateways` | Guest | List active payment methods for guest checkout. | _(none)_ |
| `socialgo_guest_order` | Guest | Buy without an account; returns a payment URL. | `email`, `serviceId`, `link` |
| `socialgo_guest_order_status` | Guest | Track a guest order by token or email. | `id` + (`token` or `email`) |

---

## Tool reference

### Catalog & wallet

#### `socialgo_balance`

Returns the current account balance on the SocialGO panel (`balance` +
`currency`). Use it before placing orders to confirm there is enough balance.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| _(none)_ | — | — | No inputs. |

Example call / response:

```jsonc
// call
{}
// → response (JSON text)
{ "balance": "42.50", "currency": "USD" }
```

> _"What's my SocialGO balance?"_

---

#### `socialgo_services`

The heart of the search-then-act design. Searches and filters the SMM catalog by
a natural-language intent and returns **only the relevant services**. Matching is
a case-insensitive substring search across each service's `name`, `category`, and
`type`, ranked by how many query terms hit and then by lowest `rate`. Always call
this before `socialgo_place_order` to discover the correct `service` id.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `query` | string | No | Search intent, e.g. `"brazilian instagram followers"`. Empty returns a general (limited) list. |
| `platform` | string | No | Optional platform filter, e.g. `"Instagram"`, `"TikTok"`, `"YouTube"`. |
| `type` | string | No | Optional service-type filter, e.g. `"Default"`, `"Package"`, `"Custom Comments"`, `"Poll"`. |
| `limit` | integer (1–50) | No | Max services to return. Default `20`. |

Returns `{ count, total, services }`, where `count` is how many matched (after
the limit), `total` is the full catalog size, and `services` is the ranked,
trimmed list. Each service item has the shape:

```jsonc
{
  "service": 1234,        // id to use in place_order / guest_order
  "name": "Instagram Followers — Brazilian (Real)",
  "type": "Default",
  "category": "Instagram Followers",
  "rate": "0.90",         // price per 1000
  "min": "100",
  "max": "100000",
  "refill": true,
  "cancel": true,
  "dripfeed": true
}
```

Example call / response:

```jsonc
// call
{ "query": "brazilian instagram followers", "platform": "Instagram", "limit": 3 }
// → response
{
  "count": 1,
  "total": 4821,
  "services": [
    {
      "service": 1234,
      "name": "Instagram Followers — Brazilian (Real)",
      "type": "Default",
      "category": "Instagram Followers",
      "rate": "0.90",
      "min": "100",
      "max": "100000",
      "refill": true,
      "cancel": true,
      "dripfeed": false
    }
  ]
}
```

> _"Find me cheap Instagram followers."_

---

#### `socialgo_service_details`

Returns the full details of a single catalog service by its id (rate, min, max,
type, and refill/cancel/dripfeed flags). Use it to confirm limits and type before
placing an order. (Internally this fetches the catalog and returns the matching
item; it errors if the id is not found.)

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `service` | number \| string | Yes | Service id from `socialgo_services`. |

Example call / response:

```jsonc
// call
{ "service": 1234 }
// → response
{
  "service": 1234,
  "name": "Instagram Followers — Brazilian (Real)",
  "type": "Default",
  "category": "Instagram Followers",
  "rate": "0.90",
  "min": "100",
  "max": "100000",
  "refill": true,
  "cancel": true,
  "dripfeed": false
}
```

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

Example call / response:

```jsonc
// call (Default service)
{
  "service": 1234,
  "link": "https://instagram.com/some.profile",
  "quantity": 1000
}
// → response
{ "order": 98765 }
```

```jsonc
// call (Drip-feed: 5 runs of 200 every 60 min)
{
  "service": 1234,
  "link": "https://instagram.com/some.profile",
  "quantity": 200,
  "runs": 5,
  "interval": 60
}
```

> _"Order 1000 of service 1234 for https://instagram.com/some.profile."_

---

#### `socialgo_order_status`

Checks the status of one or more orders (`status`, `charge`, `start_count`,
`remains`, `currency`). Pass `order` for a single order **or** `orders` (a list)
for several at once.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `order` | number \| string | No* | Id of a single order. |
| `orders` | array of (number \| string) | No* | List of order ids for a batch lookup. |

\* Provide either `order` or `orders` (if both are given, `orders` wins).

Example call / response:

```jsonc
// call (single)
{ "order": 98765 }
// → response
{
  "charge": "0.90",
  "start_count": "12000",
  "status": "In progress",
  "remains": "350",
  "currency": "USD"
}
```

```jsonc
// call (batch — keyed by order id)
{ "orders": [98765, 4321] }
```

> _"What's the status of order 98765?"_ · _"Check orders 98765 and 4321."_

---

#### `socialgo_refill`

Requests a refill (top-up) for one or more orders, when the service supports
refills. Returns the refill id(s), used later with `socialgo_refill_status`.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `order` | number \| string | No* | Id of a single order to refill. |
| `orders` | array of (number \| string) | No* | List of order ids to refill in batch. |

\* Provide either `order` or `orders` (if both are given, `orders` wins).

Example call / response:

```jsonc
// call
{ "order": 98765 }
// → response
{ "refill": 555 }
```

> _"Request a refill for order 98765."_

---

#### `socialgo_refill_status`

Checks the status of a refill (`Pending` / `Completed` / `Rejected`). Pass the
`refill` id (returned by `socialgo_refill`) **or** the `order` id (uses that
order's most recent refill).

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `refill` | number \| string | No* | Refill id (returned by `socialgo_refill`). |
| `order` | number \| string | No* | Order id — looks up its most recent refill. |

\* Provide either `refill` or `order` (`refill` takes precedence if both given).

Example call / response:

```jsonc
// call
{ "refill": 555 }
// → response
{ "status": "Completed" }
```

> _"Is the refill for order 98765 done yet?"_

---

#### `socialgo_cancel`

Cancels one or more orders by id (when the service allows cancellation). Returns,
per order, whether the cancellation was accepted or the error.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `orders` | array of (number \| string), min 1 | Yes | List of order ids to cancel. |

Example call / response:

```jsonc
// call
{ "orders": [98765, 4321] }
// → response
[
  { "order": 98765, "cancel": 1 },
  { "order": 4321, "cancel": { "error": "Cancel not allowed for this service" } }
]
```

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

### Wallet, growth & extras

These tools cover the wallet, recurring delivery, recommendations, campaign
planning, coupons, the affiliate program and public storefronts. All are scoped
to the API key's user (except `socialgo_storefront`, which is public).

#### `socialgo_wallet`

Richer than `socialgo_balance`: returns the current `balance` + `currency` plus
the most recent ledger `transactions` (`{ id, type, amount, balanceAfter,
description, createdAt }`). Use it to explain recent deposits and charges.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| _(none)_ | — | — | No inputs. |

> _"What's in my wallet, and what were my last few charges?"_

---

#### `socialgo_add_funds`

Creates a **pending** payment to top up the wallet and returns the payment to be
completed in the panel (`{ payment, status, amount, currency, method, message }`).
Balance is **not** credited immediately — funds land only after the payment
confirms. Use `socialgo_guest_gateways` to confirm which methods are active first.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `amount` | number | Yes | Amount to add, in the account currency. |
| `method` | string | Yes | Payment gateway. Prefer one returned active by `socialgo_guest_gateways`. |

> _"Add 50 to my wallet with mercadopago."_

---

#### `socialgo_mass_order`

Places **several** orders in a single call. Each line is independent — a failing
line does not cancel the others. Returns `{ orders: [{ line, order }], errors:
[{ line, reason }] }`. Resolve each `service` id with `socialgo_services` first.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `orders` | array of `{ service, link, quantity }` | Yes | Orders to create in one batch. |

> _"Order 1,000 followers for these three profiles in one go."_

---

#### `socialgo_create_subscription`

Creates a **recurring** subscription for the current user — it auto re-orders a
service on a fixed cadence. Returns `{ subscription, status, runs,
remaining_runs, interval, next_run }`. Differs from drip-feed (a single
fractioned order): a subscription is an ongoing schedule.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `service` | number \| string | Yes | Service id (from `socialgo_services`). |
| `link` | string | Yes | Target link (profile, post, video). |
| `quantity` | number | Yes | Quantity ordered on **each** run. |
| `runs` | number | Yes | Total number of recurring runs. |
| `interval` | number | Yes | Interval in **minutes** between runs. |

> _"Drip 100 followers a day to my profile for 30 days."_

---

#### `socialgo_subscriptions`

Lists the user's recurring subscriptions (`{ subscription, service, link,
status, quantity, runs, remaining_runs, interval, next_run, created_at }`).

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| _(none)_ | — | — | No inputs. |

> _"List my active subscriptions."_

---

#### `socialgo_validate_coupon`

Validates / **previews** a coupon code **without** redeeming it. Returns `{ valid,
reason?, code?, kind?, value?, minAmount?, expiresAt? }`, where `kind` is
`deposit_bonus` (percentage) or `wallet_credit` (fixed credit). Read-only — it
never applies the coupon.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `code` | string | Yes | Coupon code to validate (case-insensitive). |

> _"Is the coupon WELCOME10 still valid?"_

---

#### `socialgo_affiliate_stats`

Returns the user's **own** affiliate stats and referral link (`{ referral_code,
referral_link, affiliate_balance, enabled, commission_percent, level2_percent,
minimum_payout, referrals_count, level2_count, total_earned, earned_l1,
earned_l2 }`). Scoped to the API key's user — never exposes other users' data.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| _(none)_ | — | — | No inputs. |

> _"What's my referral link and how much have I earned?"_

---

#### `socialgo_loyalty_status`

Returns the user's loyalty status (`{ tier, label, next_threshold, progress_pct,
points_balance, lifetime_spent, currency }`) — use it to tell the user their tier
and how close they are to the next one.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| _(none)_ | — | — | No inputs. |

> _"What loyalty tier am I on?"_

---

#### `socialgo_recommend`

**Recommends** related services given an anchor `service` id and/or a `platform`.
Returns a ranked list of `{ service, name, category, platform, rate, min, max,
refill, reason }`, where `reason` is `bought_together` | `same_platform` |
`popular`. The natural cross-sell after a user shows interest.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `service` | number \| string | No* | Anchor service id to recommend around. |
| `platform` | string | No* | Platform to recommend for, e.g. `Instagram`, `TikTok`. |
| `limit` | number | No | Max recommendations to return (1–50). |

\* Provide `service`, `platform`, or both.

> _"What else pairs well with Instagram followers?"_

---

#### `socialgo_build_campaign`

**Builds a campaign plan** from a budget, a goal and a delivery window — it does
**not** place any order, it only returns the proposed plan for review. Returns
`{ feasible, reason?, service?, totalQuantity?, totalCost?, runs?,
intervalMinutes?, schedule?, params }`. After review, execute via
`socialgo_place_order` (drip-feed) or `socialgo_create_subscription`.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `budget` | number | Yes | Total budget, in the account currency. |
| `days` | number | Yes | Delivery window in **days** for gradual rollout. |
| `service` | number \| string | No* | Target service id. Provide this **or** `platform`. |
| `platform` | string | No* | Target platform, used when no `service` id is given. |
| `boost_type` | string | No | Bias service selection, e.g. `followers`, `likes`, `views`. |
| `link` | string | No | Target link the plan should boost. |

\* Provide a `service` id or a `platform`.

> _"Plan a 30-day Instagram followers campaign for a $100 budget."_

---

#### `socialgo_storefront`

Resolves a **public storefront** by its `slug` and returns the store with its
packages (`{ slug, title, description, theme, locale, packages: [{ id, title,
description, quantity, price, serviceName }] }`). The displayed `price` is a
reference — the charged amount is recomputed server-side.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `slug` | string | Yes | Public storefront slug to resolve. |

> _"Show me the packages in the store at slug my-shop."_

---

### Guest checkout (no account)

These tools buy **without an account** (pay-per-order). They hit the public
`/guest/*` endpoints and do **not** use `SOCIALGO_API_KEY`, so they work even
without a reseller key configured.

#### `socialgo_guest_gateways`

Lists the payment methods **currently active** on the panel for guest checkout
(`GET /gateways/active`). Returns `{ gateways: [{ gateway, label, kind, coins,
notice }] }`, where `gateway` is the value to pass as `method` in
`socialgo_guest_order`. **Call this before offering payment options** — offer
only the methods returned here; never assume a fixed list. If the panel can't be
reached, it returns an empty `gateways` array plus a `note` describing a minimal
safe fallback.

| Input | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| _(none)_ | — | — | No inputs. |

Example call / response:

```jsonc
// call
{}
// → response
{
  "gateways": [
    { "gateway": "mercadopago", "label": "PIX + card + boleto", "kind": "hosted", "coins": [] },
    { "gateway": "stripe", "label": "Card", "kind": "hosted", "coins": [] }
  ]
}
```

> _"Which payment methods can I use without an account?"_

---

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
| `method` | string | No | Payment gateway — the `gateway` value from `socialgo_guest_gateways`. **Not a fixed list.** Validated against the panel's active gateways at call time. If omitted, the first active gateway is used. |
| `metadata` | object | No | Per-type extra fields (`comments`, `usernames`, `hashtags`, `hashtag`, `username`, `media`, `answer_number`, `runs`, `interval`). Send only those relevant to the service type. |

Returns `{ orderId, guestToken, url, amount, currency }`. **Hand the `url` to the
user** and keep `orderId` + `guestToken` to track via
`socialgo_guest_order_status`. If `method` isn't one of the panel's active
gateways, the tool returns a clear error listing the valid ones.

Example call / response:

```jsonc
// call
{
  "email": "buyer@example.com",
  "serviceId": "872",
  "link": "https://www.tiktok.com/@user/video/123456789",
  "quantity": 500,
  "method": "mercadopago"
}
// → response
{
  "orderId": "ord_abc123",
  "guestToken": "gtok_9f8e7d6c",
  "url": "https://usesocialgo.com/guest/pay/ord_abc123",
  "amount": "1.20",
  "currency": "USD"
}
```

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

\* Provide either `token` or `email` (`token` takes precedence if both given).

Returns `{ id, status, serviceName, link, quantity, charge, startCount, remains,
createdAt }`. A status of `awaiting_payment` means the order has not been paid
yet.

Example call / response:

```jsonc
// call
{ "id": "ord_abc123", "token": "gtok_9f8e7d6c" }
// → response
{
  "id": "ord_abc123",
  "status": "awaiting_payment",
  "serviceName": "TikTok Views",
  "link": "https://www.tiktok.com/@user/video/123456789",
  "quantity": 500,
  "charge": "1.20",
  "startCount": null,
  "remains": null,
  "createdAt": "2026-06-21T18:04:00.000Z"
}
```

> _"Has my guest order ord_abc123 been paid and started?"_

---

## Example flow: search a service and create an order

A complete conversation, no account required:

> **User:** I want 500 views on my latest TikTok video. My email is
> `buyer@example.com` and I'd like to pay with PIX.

1. **Search.** The assistant calls **`socialgo_services`** with
   `query: "tiktok views"`, `platform: "TikTok"` and picks a service from the
   result, e.g. service `872` (rate, min, max all checked):

   ```jsonc
   // call
   { "query": "tiktok views", "platform": "TikTok", "limit": 3 }
   // → response (trimmed)
   { "count": 1, "total": 4821, "services": [
     { "service": 872, "name": "TikTok Views", "type": "Default",
       "category": "TikTok Views", "rate": "0.24", "min": "100", "max": "1000000" }
   ] }
   ```

2. **Check payment options.** Because this is a guest purchase, it calls
   **`socialgo_guest_gateways`** and offers only the active methods (it sees
   `mercadopago` covers PIX, matching the user's request).

3. **Create the order.** With the user's confirmation it calls
   **`socialgo_guest_order`**:

   ```jsonc
   {
     "email": "buyer@example.com",
     "serviceId": "872",
     "link": "https://www.tiktok.com/@user/video/123456789",
     "quantity": 500,
     "method": "mercadopago"
   }
   // → response
   {
     "orderId": "ord_abc123",
     "guestToken": "gtok_9f8e7d6c",
     "url": "https://usesocialgo.com/guest/pay/ord_abc123",
     "amount": "1.20",
     "currency": "USD"
   }
   ```

4. **Hand off the payment link.** The assistant replies:

   > Your order is ready — 500 TikTok views for $1.20. Open this link and
   > complete the payment (PIX, card, or boleto):
   > **https://usesocialgo.com/guest/pay/ord_abc123**
   > I'll track it once you've paid.

5. **Track delivery.** After the user pays, the assistant calls
   **`socialgo_guest_order_status`**:

   ```jsonc
   { "id": "ord_abc123", "token": "gtok_9f8e7d6c" }
   ```

   While the response shows `"status": "awaiting_payment"`, the order has not
   been paid yet. Once it confirms, `status` moves on and `startCount` /
   `remains` populate — the assistant then reports delivery progress.

> **Reseller variant.** With a `SOCIALGO_API_KEY` set, swap steps 2–5 for
> `socialgo_place_order` (debits the wallet directly, returns an `order` id) and
> track with `socialgo_order_status`. No payment URL is involved.

---

## Notes

- Errors from the API are returned to the model in a readable form, without
  leaking stack traces or third-party PII.
- The model only ever sees the SocialGO panel — no upstream provider is exposed.
- Guest order status returns only the buyer's own safe fields; it never reveals
  third-party data.
- Logs go to **stderr** (`[socialgo-mcp] MCP server ready (stdio).`); stdout is
  reserved for the MCP protocol.
- Network calls time out after 30 seconds with a clear, model-readable message.

---

## Related packages

- [`@socialgo/sdk`](https://github.com/SocialGOcompany/socialgo-tools/tree/main/packages/sdk) — typed client for the SMM v2 protocol.
- [`@socialgo/cli`](https://github.com/SocialGOcompany/socialgo-tools/tree/main/packages/cli) — the `socialgo` command-line tool.
