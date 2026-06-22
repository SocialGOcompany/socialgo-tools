# SocialGO CLI Reference

`socialgo` is the official command-line client for the SocialGO SMM platform. Browse the service catalog, place and track orders, request refills and cancellations, manage your wallet, and even buy **without an account** (guest checkout) — all from your terminal.

It speaks two protocols against the same base URL:

- **SMM v2** (`POST {SOCIALGO_API_URL}/api/v2`) for reseller operations. Every reseller call sends `{ key, action, ...params }` and authenticates with your API key.
- **Public REST** (`/guest/*`, `/gateways/active`) for guest checkout. These endpoints are open — the CLI **never** sends your API key on them.

---

## Installation & running today

> **Heads-up:** the `@socialgo/cli`, `@socialgo/sdk` and `@socialgo/mcp` packages are **not on npm yet** (`npm install -g @socialgo/cli` and `npx @socialgo/cli` are **coming soon**). Until then, run the CLI from source. The steps below work today.

The CLI is a small TypeScript program that depends on the workspace package `@socialgo/sdk`, so the most reliable way to run it is from inside the monorepo after a build.

### Build from source (recommended)

Requires Node.js ≥ 18 and [pnpm](https://pnpm.io).

```bash
git clone https://github.com/SocialGOcompany/socialgo-tools.git
cd socialgo-tools
pnpm install          # installs deps + links the @socialgo/sdk workspace package
pnpm build            # builds all packages (sdk, cli, mcp)
```

After `pnpm build`, the CLI is compiled to `packages/cli/dist/index.js`. Run it any of these ways:

```bash
# Via the package's start script (from the repo root)
pnpm --filter @socialgo/cli start -- config

# Or call the built entrypoint directly
node packages/cli/dist/index.js config

# Or expose it on your PATH as `socialgo`
pnpm --filter @socialgo/cli exec npm link    # makes `socialgo` available globally
socialgo config
```

The binary is named **`socialgo`** (defined by the package `bin` field).

### Run without building (dev mode)

If you just want to try a command, `tsx` runs the TypeScript source directly — no compile step:

```bash
git clone https://github.com/SocialGOcompany/socialgo-tools.git
cd socialgo-tools
pnpm install
pnpm --filter @socialgo/cli exec tsx src/index.ts config
```

### Coming soon (npm)

Once published, installation will be a one-liner. These commands **do not work yet**:

```bash
# Coming soon — not published to npm yet
npm install -g @socialgo/cli
npx @socialgo/cli config
```

Throughout this document, examples are written as `socialgo <command>`. If you have not linked the binary, substitute your chosen run method — e.g. `node packages/cli/dist/index.js <command>` or `pnpm --filter @socialgo/cli start -- <command>`.

```bash
socialgo --help
socialgo --version      # prints 0.2.0
```

---

## Configuration

The CLI is configured through environment variables, or per-invocation global flags that override them. There is no config file — credentials come **only** from the environment or the `--key` / `--api-url` flags.

| Variable           | Required | Default                   | Description                                                                |
| ------------------ | -------- | ------------------------- | -------------------------------------------------------------------------- |
| `SOCIALGO_API_URL` | No       | `https://usesocialgo.com` | Base URL of your panel/API. Point this at the host where the API runs. Any trailing slashes are stripped automatically. |
| `SOCIALGO_API_KEY` | Yes\*    | —                         | Your reseller API key. Get it in your panel under **Dashboard › API key**. |

\* The API key is required for all **reseller** commands. The **guest** commands (`guest-services`, `guest-gateways`, `guest-order`, `guest-status`) hit public endpoints and work **without a key**.

```bash
export SOCIALGO_API_KEY="your-key"
export SOCIALGO_API_URL="https://your-panel.com"   # optional; defaults to https://usesocialgo.com
```

The key is sent two ways on every reseller request: in the JSON body as `key`, and as an `Authorization: Bearer <key>` header. Requests time out after 30 seconds.

### Global flags

These apply to every command and override the environment for that single invocation:

| Flag              | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `--json`          | Emit raw JSON instead of formatted tables/text (ideal for scripts).      |
| `--api-url <url>` | Override `SOCIALGO_API_URL` for this invocation.                         |
| `--key <key>`     | Override `SOCIALGO_API_KEY` for this invocation.                         |

```bash
# One-off, no env needed
socialgo --key your-key --api-url https://your-panel.com balance
```

Verify your setup at any time with `socialgo config` (it never prints the key itself).

### Output: tables vs JSON

By default, commands print human-friendly, **color** output. Colors are emitted **only when stdout is a TTY** — when you pipe or redirect, output is plain text, so it is safe to parse or save.

Add `--json` to any command to get the raw API response as pretty-printed JSON instead. See [Scripting & automation](#scripting--automation).

---

## Command index

| Command                       | Auth          | Description                                                          |
| ----------------------------- | ------------- | ------------------------------------------------------------------- |
| `config`                      | none          | Show current config (API URL + whether a key is set, and its source). |
| `services list`               | API key       | List the full service catalog as a table.                           |
| `services search <query>`     | API key       | Search the catalog (client-side) by name, category, type, or id.    |
| `service <id>`                | API key       | Show full details for one service.                                  |
| `order add` (alias `create`)  | API key       | Create an order (supports drip-feed and type-specific params).      |
| `order status <ids...>`       | API key       | Status of one or more orders (batch lookup with multiple ids).      |
| `order refill <id>`           | API key       | Request a refill (replenishment) for an order.                      |
| `order cancel <ids...>`       | API key       | Cancel one or more orders.                                          |
| `refill-status`               | API key       | Status of a refill, by `--refill <id>` or `--order <id>`.           |
| `orders`                      | API key       | List your reseller order history.                                   |
| `mass-order`                  | API key       | Place many orders in one call (`--line` or `--file`; per-line errors don't block the rest). |
| `subscription create`         | API key       | Create a recurring subscription (scheduled drip-feed).              |
| `subscription list`           | API key       | List your subscriptions.                                            |
| `coupon validate <code>`      | API key       | Validate/preview a coupon (does **not** redeem).                    |
| `affiliate stats`             | API key       | Your affiliate numbers (referrals, commissions, balance).          |
| `affiliate link`              | API key       | Just your referral link + code.                                     |
| `loyalty`                     | API key       | Your loyalty tier and points.                                      |
| `recommend <serviceId\|platform>` | API key   | Recommended services from an anchor service and/or platform.        |
| `campaign build`              | API key       | Build a campaign **plan** from budget/goal/days (does not place orders). |
| `storefront <slug>`           | API key       | Resolve a public storefront by slug → packages.                     |
| `balance`                     | API key       | Show account balance.                                               |
| `wallet`                      | API key       | Wallet summary (balance + recent transactions when available).      |
| `add-funds`                   | API key       | Create a pending top-up payment (completed in the panel).           |
| `admin sync-catalog`          | API key/admin | Sync the catalog from active suppliers (admin only).                |
| `guest-gateways`              | **none**      | List the panel's currently **active** payment methods.              |
| `guest-services`              | **none**      | Public catalog — find a `serviceId` for a guest order.              |
| `guest-order <serviceId>`     | **none**      | Create a guest (no-account) order and get a payment URL.            |
| `guest-status <id>`           | **none**      | Public status of a guest order (validate with `--token`/`--email`). |

---

## Reseller commands

These require `SOCIALGO_API_KEY` (or `--key`). If no key is present, the command exits non-zero with a message pointing you to `socialgo config`.

### `config`

Shows the resolved API URL, whether a key is configured, and (in JSON) where each value came from. The key value itself is never printed. This command does **not** make a network call.

```bash
socialgo config
```

```text
Configuração SocialGO CLI
  API URL  https://your-panel.com
  Chave    definida
```

When no key is configured, it also prints how to set one. With `--json`, it reports the resolved values and their **source** (`--api-url` / `SOCIALGO_API_URL` / `default`, and `--key` / `SOCIALGO_API_KEY` / `none`):

```bash
socialgo config --json
```

```json
{
  "apiUrl": "https://your-panel.com",
  "hasKey": true,
  "source": {
    "apiUrl": "SOCIALGO_API_URL",
    "key": "SOCIALGO_API_KEY"
  }
}
```

---

### `services list`

Lists the full catalog as a table. The CLI accepts both shapes the API may return (a bare array, or `{ services: [...] }`).

```bash
socialgo services list
```

```text
ID    NOME                          TIPO     CATEGORIA          RATE/1k  MIN    MAX
1234  Instagram Followers [Real]    Default  Instagram Follow…     0.90   10  10000
55    Instagram Custom Comments     Custom…  Instagram Comme…     2.50    5   5000

2 serviço(s).
```

Columns: `ID`, `NOME` (name), `TIPO` (type), `CATEGORIA` (category), `RATE/1k` (price per 1,000), `MIN`, `MAX`. Long names/types/categories are truncated with an ellipsis in the table; use `--json` for untruncated values.

---

### `services search <query>`

Filters the catalog **client-side** — it fetches the full catalog, then matches the query (case-insensitive) against the service's name, category, type, and id combined. An empty query returns everything.

```bash
socialgo services search "instagram followers"
```

```text
Busca: "instagram followers"
ID    NOME                          TIPO     CATEGORIA          RATE/1k  MIN    MAX
1234  Instagram Followers [Real]    Default  Instagram Follow…     0.90   10  10000

1 serviço(s).
```

---

### `service <id>`

Shows full detail for a single service, including its capabilities (refill, cancel, drip-feed). It finds the service in the catalog by id; if no service matches, it exits non-zero with `Serviço <id> não encontrado no catálogo.`

```bash
socialgo service 1234
```

```text
Serviço 1234
  Nome       Instagram Followers [Real]
  Tipo       Default
  Categoria  Instagram Followers
  Rate/1k    0.90
  Min / Max  10 / 10000
  Refill     sim
  Cancel     não
  Dripfeed   sim
```

`sim` = yes, `não` = no. With `--json`, the raw service object is printed.

---

### `order add` (alias `create`)

Creates an order. **Required:** `--service` and `--link`. Everything else depends on the **service type** — send only the params the type requires. `--quantity`, if given, must be a positive integer.

**Options**

| Flag                          | Description                                                          |
| ----------------------------- | -------------------------------------------------------------------- |
| `--service <id>` (required)   | Service id.                                                          |
| `--link <url>` (required)     | Target link (profile / post / video).                               |
| `--quantity <n>`              | Quantity. Optional for list-derived types (e.g. Custom Comments, where the count is implied by the list). |
| `--runs <n>`                  | Drip-feed: number of runs.                                          |
| `--interval <min>`            | Drip-feed: interval between runs, in minutes.                       |
| `--comments <txt\|file>`      | Custom Comments: one comment per line (inline text **or** a file path). |
| `--usernames <txt\|file>`     | Mentions Custom List / Mentions with Hashtags: one `@username` per line. |
| `--hashtags <txt\|file>`      | Mentions with Hashtags: hashtags, one per line.                     |
| `--hashtag <tag>`             | Mentions Hashtag: a single target hashtag.                          |
| `--username <user>`           | Mentions User Followers / Comment Likes: target username.           |
| `--media <url>`               | Mentions Media Likers: target media.                                |
| `--answer-number <n>`         | Poll: answer number.                                                |

> **File or text:** the list options (`--comments`, `--usernames`, `--hashtags`) accept either a literal string (newline-separated) **or** a path to a file. If the value is the path of an existing file, the CLI reads the file's contents; otherwise the value is used literally. The single-value options (`--hashtag`, `--username`, `--media`) are always literal.
>
> Empty/blank type params are dropped from the request — only the fields you actually fill are sent.

**Params by service type** — send only what the type needs:

| Service type             | Required params                  |
| ------------------------ | -------------------------------- |
| Default / Package        | `--quantity`                     |
| Drip-feed                | `--quantity --runs --interval`   |
| Custom Comments          | `--comments`                     |
| Mentions Custom List     | `--usernames`                    |
| Mentions with Hashtags   | `--usernames --hashtags`         |
| Mentions Hashtag         | `--hashtag`                      |
| Mentions User Followers  | `--username`                     |
| Mentions Media Likers    | `--media`                        |
| Comment Likes            | `--username`                     |
| Poll                     | `--answer-number`                |

**Examples**

```bash
# Standard order
socialgo order add --service 1234 --link https://insta.com/p/abc --quantity 1000

# Same thing using the alias
socialgo create --service 1234 --link https://insta.com/p/abc --quantity 1000

# Drip-feed: 100 each run, 10 runs, every 30 minutes
socialgo order add --service 70 --link https://insta.com/p/abc --quantity 100 --runs 10 --interval 30

# Custom comments from a file (one per line)
socialgo order add --service 55 --link https://insta.com/p/abc --comments ./comments.txt

# Custom comments inline (newline-separated)
socialgo order add --service 55 --link https://insta.com/p/abc --comments $'Great post!\nLove this\nFire'

# Mentions with hashtags, both from files
socialgo order add --service 88 --link https://insta.com/p/abc \
  --usernames ./users.txt --hashtags ./tags.txt
```

**Output**

```text
✔ Pedido criado.
  Order ID  98765
  Serviço   1234
  Link      https://insta.com/p/abc
  Qtd       1000

Acompanhe: socialgo order status 98765
```

`Runs` and `Intervalo` lines are shown only when you passed `--runs` / `--interval`. With `--json`, the response is the raw `{ "order": ... }` object:

```json
{
  "order": 98765
}
```

---

### `order status <ids...>`

Status of one or more orders. Pass a single id for one order, or multiple ids for a **batch lookup** (sent as a single comma-separated request).

```bash
# Single order
socialgo order status 98765
```

```text
Pedido 98765
  Status       In progress
  Cobrança     0.90 USD
  Início       5400
  Restante     250
```

`Cobrança` is the charge (with currency when present), `Início` is the start count, `Restante` is the amount remaining. Statuses are color-coded: completed → green, partial → yellow, canceled/error/failed/rejected → red, anything else → cyan.

```bash
# Batch — two orders at once
socialgo order status 98765 4321
```

```text
Pedido 98765
  Status       Completed
  Cobrança     0.90 USD
  Início       5400
  Restante     0

Pedido 4321
  Status       Partial
  Cobrança     1.20 USD
  Início       1200
  Restante     300
```

In batch mode, if the API returns an error for a specific id, that line shows the error (e.g. `Pedido 4321  Incorrect order ID`) while the others still render. With `--json`:

- Single id → the raw status object.
- Multiple ids → a map keyed by order id, each value a status object or `{ "error": "..." }`.

```json
{
  "98765": { "charge": "0.90", "status": "Completed", "start_count": "5400", "remains": "0", "currency": "USD" },
  "4321":  { "error": "Incorrect order ID" }
}
```

---

### `order refill <id>`

Requests a refill (replenishment) for a single order. Returns a refill id you can track with `refill-status`.

```bash
socialgo order refill 98765
```

```text
✔ Refill solicitado para o pedido 98765.
  Refill ID  44321

Acompanhe: socialgo refill-status --refill 44321
```

With `--json`: `{ "refill": 44321 }`.

---

### `order cancel <ids...>`

Cancels one or more orders (sent as a single comma-separated request). The API replies with one result per order; the CLI prints a line per order indicating success or the per-order error.

```bash
socialgo order cancel 98765 4321
```

```text
✔ Pedido 98765 marcado para cancelamento.
✖ Pedido 4321: Incorrect order ID
```

With `--json`, the raw array is printed, each item `{ order, cancel }` where `cancel` is either a confirmation value or `{ "error": "..." }`:

```json
[
  { "order": 98765, "cancel": 1 },
  { "order": 4321,  "cancel": { "error": "Incorrect order ID" } }
]
```

---

### `refill-status`

Status of a refill. Identify it **either** by the refill id (`--refill`) **or** by the order id (`--order`, which uses that order's most recent refill). At least one is required — calling it with neither exits non-zero with `Informe --refill <id> ou --order <id>.`

```bash
socialgo refill-status --refill 44321
# or
socialgo refill-status --order 98765
```

```text
Reposição (refill 44321)
  Status  Completed
```

With `--json`: `{ "status": "Completed" }`.

---

### `orders`

Lists your reseller order history as a table.

```bash
socialgo orders
```

```text
ID     STATUS       CARGA   QTD  RESTANTE  LINK
98765  Completed     0.90  1000         0  https://insta.com/p/abc
4321   Partial       1.20   500       300  https://tiktok.com/@x/video/1

2 pedido(s).
```

Columns: `ID`, `STATUS`, `CARGA` (charge), `QTD` (quantity), `RESTANTE` (remaining), `LINK` (truncated at 44 chars in the table). With `--json`, the full untruncated array is printed.

---

### `mass-order`

Places **several** orders in a single call. Each line is independent — a failing line does **not** cancel the rest. Provide orders inline with repeated `--line`, or from a CSV `--file` (one `service|link|quantity` per line).

| Flag                | Description                                                              |
| ------------------- | ------------------------------------------------------------------------ |
| `--line "<s\|l\|q>"`| Inline order `service|link|quantity`. Repeat `--line` for each order.    |
| `--file <csv>`      | CSV file with one `service|link|quantity` per line.                      |

```bash
socialgo mass-order \
  --line "1234|https://insta.com/p/a|1000" \
  --line "55|https://insta.com/p/b|500"
# or
socialgo mass-order --file ./pedidos.csv
```

```text
✔ 2 pedido(s) criado(s):
  linha 1  Order ID 98765
  linha 2  Order ID 98766
```

Lines that fail are listed separately under `✖ N linha(s) com erro:` with the reason. With `--json`, the raw `{ orders: [{ line, order }], errors: [{ line, reason }] }` is printed.

---

### `subscription create`

Creates a **recurring** subscription — it auto re-orders a service on a fixed cadence. Unlike a single drip-feed order, a subscription is an ongoing schedule. All five flags are required.

| Flag                  | Description                                         |
| --------------------- | --------------------------------------------------- |
| `--service <id>`      | Service id.                                         |
| `--link <url>`        | Target link (profile/post/video).                   |
| `--quantity <n>`      | Quantity ordered on **each** run.                   |
| `--runs <n>`          | Total number of recurring runs.                     |
| `--interval <min>`    | Interval in **minutes** between runs.               |

```bash
socialgo subscription create --service 70 --link https://insta.com/u \
  --quantity 100 --runs 30 --interval 1440
```

```text
✔ Assinatura criada (active).
  Subscription ID  sub_abc123
  Execuções        30/30 restantes
  Intervalo        1440 min
```

With `--json`, the raw `{ subscription, status, runs, remaining_runs, interval, next_run }` is printed.

---

### `subscription list`

Lists your recurring subscriptions as a table (id, service, status, remaining runs, interval, next run).

```bash
socialgo subscription list
```

With `--json`, the full array is printed.

---

### `coupon validate <code>`

Validates / **previews** a coupon **without** redeeming it (read-only). `kind` is `deposit_bonus` (percentage) or `wallet_credit` (fixed credit).

```bash
socialgo coupon validate WELCOME10
```

```text
✔ Cupom WELCOME10 válido.
  Tipo        bônus em depósito
  Valor       10%
```

Invalid coupons print `✖ Cupom <code> inválido.` with the reason. With `--json`, the raw `{ valid, reason?, code?, kind?, value?, minAmount?, expiresAt? }` is printed.

---

### `affiliate stats`

Shows your **own** affiliate numbers and referral link (code, balance, commission rates, referral counts, total earned, minimum payout).

```bash
socialgo affiliate stats
```

With `--json`, the raw affiliate stats object is printed.

---

### `affiliate link`

Prints just your referral link and code.

```bash
socialgo affiliate link
```

```text
https://your-panel.com/?ref=abc123
código: abc123
```

With `--json`: `{ "referral_code": "abc123", "referral_link": "https://…" }`.

---

### `loyalty`

Shows your loyalty tier, points, lifetime spend and progress toward the next tier.

```bash
socialgo loyalty
```

```text
Fidelidade
  Tier          Gold (gold)
  Pontos        1240
  Gasto total   620 USD
  Progresso     74% para o próximo tier (840)
```

With `--json`, the raw `{ tier, label, next_threshold, progress_pct, points_balance, lifetime_spent, currency }` is printed.

---

### `recommend <serviceId|platform>`

**Recommends** related services from an anchor service and/or a platform. The positional argument is a shortcut: numeric → `--service`, otherwise → `--platform`.

| Flag                       | Description                              |
| -------------------------- | ---------------------------------------- |
| `--service <id>`           | Anchor service id.                       |
| `--platform <platform>`    | Platform (instagram, tiktok, …).         |
| `--limit <n>`              | Max results.                             |

```bash
socialgo recommend 1234
socialgo recommend instagram
socialgo recommend --service 1234 --limit 5
```

Prints a ranked table with a `reason` (bought together / same platform / popular). With `--json`, the raw array is printed.

---

### `campaign build`

Builds a campaign **plan** from a budget, a goal and a delivery window in days — it does **not** place any order. Review the plan, then execute it with `subscription create` or `order add`.

| Flag                       | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `--budget <value>` (required) | Total budget (positive number).                 |
| `--days <n>` (required)    | Delivery window in days for gradual rollout.       |
| `--service <id>`           | Target service id. Provide this **or** `--platform`. |
| `--platform <platform>`    | Target platform, used when no `--service` is given. |
| `--goal <goal>`            | Boost type to bias selection (followers, views, likes). |
| `--link <url>`             | Target link (optional, carried in the plan).       |

```bash
socialgo campaign build --budget 100 --days 30 --platform instagram --goal followers
socialgo campaign build --budget 50 --days 7 --service 1234
```

```text
✔ Plano de campanha (proposta — nada foi cobrado).
  Serviço       1234 Instagram Followers
  Qtd total     5000
  Custo total   90
  Execuções     30
  Intervalo     1440 min
```

Infeasible plans print `✖ Plano inviável.` with the reason. With `--json`, the raw `{ feasible, reason?, service?, totalQuantity?, totalCost?, runs?, intervalMinutes?, schedule?, params }` is printed.

---

### `storefront <slug>`

Resolves a **public** storefront by its slug and lists its packages. The displayed package price is a reference — the charged amount is recomputed server-side.

```bash
socialgo storefront my-shop
```

Prints the store title, description, theme/locale, then a packages table. With `--json`, the raw store object is printed.

---

### `balance`

Shows the current account balance.

```bash
socialgo balance
```

```text
Saldo  42.50 USD
```

With `--json`: `{ "balance": "42.50", "currency": "USD" }`.

---

### `wallet`

Wallet summary: balance plus a recent transaction statement, when the panel exposes it. The CLI first tries the `wallet` action; if the server doesn't implement it (HTTP 400/404), it **gracefully degrades** to just the balance and notes that the statement is unavailable for your key.

```bash
socialgo wallet
```

```text
Carteira
  Saldo  42.50 USD

  Extrato recente:
    deposit          50.00  Top-up via card   2026-06-17 10:02
    order            -7.50  Order #98765      2026-06-17 11:14
```

Negative amounts are shown in red, positive in green. When the statement isn't available you'll instead see `(extrato indisponível por esta chave — exibindo apenas saldo)`. With `--json`, the raw wallet object (or balance-only fallback) is printed.

---

### `add-funds`

Creates a **pending** top-up payment; you complete it in the panel. Both flags are required. `--amount` must be a positive number; `--method` must be an active gateway (see `guest-gateways`) or `manual`.

| Flag                           | Description                                                              |
| ------------------------------ | ------------------------------------------------------------------------ |
| `--amount <value>` (required)  | Amount to add (positive number).                                         |
| `--method <method>` (required) | An active payment gateway from your panel (`socialgo guest-gateways`), or `manual`. |

```bash
socialgo add-funds --amount 25 --method mercadopago
```

```text
✔ Pagamento criado (pending).
  Payment ID  pay_abc123
  Valor       25 USD
  Método      mercadopago

  Complete o pagamento no painel.
```

The trailing message line appears only if the API returns one. With `--json`, the raw payment object `{ payment, status, amount, currency, method, message? }` is printed.

---

### `admin sync-catalog`

Triggers a catalog sync from your active suppliers. Requires an **admin** key.

```bash
socialgo admin sync-catalog
```

```text
Sincronizando catálogo dos fornecedores ativos…
✔ Catálogo sincronizado. 1842 serviço(s) importado(s).
```

With `--json`: `{ "imported": 1842, "suppliers": 12 }` (the `suppliers` field may be omitted by the server).

---

## Guest commands (public, no account)

The guest commands let anyone buy **without an account** — pay-per-order, identified only by an email. They hit the public REST endpoints (`/guest/*`, `/gateways/active`) and **never send your API key**. They still use the same base URL (`--api-url` / `SOCIALGO_API_URL`).

Typical flow: `guest-gateways` (see how to pay) → `guest-services` (find a service) → `guest-order` (place it, get a payment URL) → pay → `guest-status` (track it).

### `guest-gateways`

Lists the panel's **currently active** payment methods, fetched live from `/gateways/active`. These are the values you pass to `--method` in `guest-order` (and to `add-funds`). The CLI never hardcodes a payment list — the panel is the source of truth.

```bash
socialgo guest-gateways
```

```text
Métodos de pagamento ativos (use o valor de 'method' no guest-order):

  mercadopago  Mercado Pago (card)
  stripe  Stripe (card)
  crypto  Crypto (crypto) — moedas: BTC, ETH, USDT
      ⚠ Some regional cards may be declined.
```

The first token on each line (e.g. `mercadopago`) is the canonical `gateway` value to pass to `--method`; the bold text is its display label and `(...)` is its kind (`card` / `crypto` / `wallet`). `moedas:` lists accepted coins for crypto gateways, and a `⚠` line shows any regional notice. If no gateways are active you'll see `Nenhum gateway ativo no painel no momento.` With `--json`, the raw array of `{ gateway, label, kind, coins, notice? }` is printed.

---

### `guest-services`

Public catalog — browse services and find a `serviceId` to order with. No key required.

| Flag                    | Description                                       |
| ----------------------- | ------------------------------------------------- |
| `--platform <platform>` | Filter by platform (e.g. `instagram`, `tiktok`).  |
| `--q <term>`            | Search by term in the service name.               |
| `--limit <n>`           | Limit the number of results.                      |

Filtering and limiting happen **server-side** (the flags are forwarded as query params; empty ones are omitted).

```bash
socialgo guest-services --platform instagram --q followers --limit 5
```

```text
ID    NOME                          PLATAFORMA   CATEGORIA          RATE/1k  MIN    MAX
ig01  Instagram Followers           instagram    Followers             1.10   10  10000
ig02  Instagram Followers [Real]    instagram    Followers             1.40   50   5000

2 serviço(s). Use o ID em: socialgo guest-order --email <email> <ID>
```

Note the guest catalog uses its own field names (`id`, `sellRate`, `categoryName`, `platform`) — distinct from the reseller catalog. With `--json`, the array of guest-service items is printed.

---

### `guest-order <serviceId>`

Creates a guest order (no account) and returns a checkout URL plus a guest token. The `serviceId` is a **positional argument** (use the `ID` from `guest-services`).

| Flag                         | Description                                                                |
| ---------------------------- | -------------------------------------------------------------------------- |
| `--email <email>` (required) | Buyer email (used to track and later validate the order).                  |
| `--link <url>` (required)    | Target link (profile / post / video).                                      |
| `--quantity <n>`             | Quantity (optional for list types; must be a positive integer if given).   |
| `--method <method>`          | An **active** gateway from `socialgo guest-gateways`. **Default:** the panel's first active gateway. |
| `--comments <txt\|file>`     | Custom Comments: one comment per line (inline text or a file).             |
| `--usernames <txt\|file>`    | Mentions Custom List / with Hashtags: one `@username` per line.            |
| `--hashtags <txt\|file>`     | Mentions with Hashtags: hashtags, one per line.                            |
| `--hashtag <tag>`            | Mentions Hashtag: a single target hashtag.                                 |
| `--username <user>`          | Mentions User Followers / Comment Likes: target username.                  |
| `--media <url>`              | Mentions Media Likers: target media.                                       |
| `--answer-number <n>`        | Poll: answer number.                                                       |

> The type-specific params behave exactly as in [`order add`](#order-add-alias-create) (file-or-text for the list options) and are sent as order **metadata**.
>
> **`--method` validation:** the CLI fetches the live active gateways and only accepts one of those values. If the panel can't be reached, it falls back to a minimal safe set so you aren't blocked. An invalid `--method` exits non-zero and lists the currently valid methods.

```bash
socialgo guest-order ig01 \
  --email buyer@example.com \
  --link https://instagram.com/someprofile \
  --quantity 500 \
  --method mercadopago
```

```text
✔ Pedido criado (aguardando pagamento).
  Order ID      gord_abc123
  Guest Token   gtok_xyz789
  Valor         0.55 USD
  Método        mercadopago

  Pague abrindo esta URL no navegador:
  https://your-panel.com/checkout/gord_abc123

  Após pagar (cartão/PIX/cripto), acompanhe: socialgo guest-status gord_abc123 --token gtok_xyz789
```

Keep the `Guest Token` — it's how you prove ownership in `guest-status`. With `--json`, the raw `{ orderId, guestToken, url, amount, currency }` object is printed.

---

### `guest-status <id>`

Public status of a guest order. Prove ownership with the guest `--token` (preferred) **or** the `--email` used to place it. At least one is required — calling it with neither exits non-zero with `Informe --token <t> ou --email <e> para validar a posse do pedido.`

```bash
socialgo guest-status gord_abc123 --token gtok_xyz789
# or
socialgo guest-status gord_abc123 --email buyer@example.com
```

```text
Pedido gord_abc123
  Status     In progress
  Serviço    Instagram Followers
  Link       https://instagram.com/someprofile
  Qtd        500
  Cobrança   0.55
  Início     1200
  Restante   80
  Criado em  2026-06-17 09:31
```

`Início` (start count) and `Restante` (remaining) lines appear only when the API returns those values. With `--json`, the raw status object is printed.

---

## Scripting & automation

Every command supports `--json`, and colors are automatically disabled when output isn't a TTY, so the CLI composes cleanly in pipelines.

### JSON + jq

```bash
# Service ids and rates for a search
socialgo --json services search "tiktok views" | jq '.[] | {id: .service, rate}'

# Just the status string of one order
socialgo --json order status 98765 | jq -r '.status'

# Current balance as a bare number
socialgo --json balance | jq -r '.balance'

# Pull the order id straight out of a fresh order
ORDER_ID=$(socialgo --json order add --service 1234 --link "$LINK" --quantity 1000 | jq -r '.order')
echo "placed order $ORDER_ID"
```

### Batch status in a loop

```bash
# Re-check every pending order until all are Completed
for id in 98765 4321 5678; do
  status=$(socialgo --json order status "$id" | jq -r '.status')
  echo "$id -> $status"
done
```

### Exit codes

The CLI exits with:

- **`0`** on success.
- **`1`** (non-zero) on **any** error: missing API key, invalid flag value (e.g. non-positive `--quantity`/`--amount`), missing required option, network/timeout failure, or an API business error (the SMM v2 protocol can signal `{ error }` even with HTTP 200 — the CLI treats that as a failure).

This makes the CLI safe in `set -e` scripts and CI:

```bash
set -e
socialgo config                 # fails fast if no key
socialgo order add --service 1234 --link "$LINK" --quantity 1000
```

```bash
# Branch on success/failure explicitly
if socialgo --json order refill 98765 >/tmp/refill.json; then
  echo "refill id: $(jq -r '.refill' /tmp/refill.json)"
else
  echo "refill failed" >&2
fi
```

### stdout vs stderr

Normal output (tables, JSON, success messages) goes to **stdout**. Error messages go to **stderr** (prefixed with `✖`), and API errors include the HTTP status when available (e.g. `(HTTP 401)`). That separation lets you capture data on stdout while still seeing errors:

```bash
socialgo --json orders > orders.json 2> errors.log
```
