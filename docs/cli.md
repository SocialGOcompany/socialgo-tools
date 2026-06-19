# SocialGO CLI Reference

`socialgo` is the official command-line client for the SocialGO SMM platform. Browse the service catalog, place and track orders, request refills and cancellations, manage your wallet, and even buy **without an account** (guest checkout) — all from your terminal.

It speaks the SMM v2 protocol (`POST {SOCIALGO_API_URL}/api/v2`) for reseller operations, and the public REST endpoints (`/guest/*`) for guest checkout.

---

## Installation

```bash
# Global install (recommended)
npm install -g @socialgo/cli

# Or run on demand without installing
npx @socialgo/cli config
```

The binary is named `socialgo`.

```bash
socialgo --help
socialgo --version
```

---

## Configuration

The CLI is configured through environment variables (or per-invocation global flags).

| Variable           | Required | Default                     | Description                                                                 |
| ------------------ | -------- | --------------------------- | --------------------------------------------------------------------------- |
| `SOCIALGO_API_URL` | No       | `https://usesocialgo.com`  | Base URL of your panel/API. Point this at the host where the API runs.      |
| `SOCIALGO_API_KEY` | Yes\*    | —                           | Your API key. Get it in your panel under **/dashboard/api-key**.            |

\* The API key is required for all reseller commands. The **guest** commands (`guest-services`, `guest-order`, `guest-status`) hit public endpoints and work **without a key**.

```bash
export SOCIALGO_API_KEY="your-key"
export SOCIALGO_API_URL="https://your-panel.com"   # optional
```

### Global flags

These apply to every command and override the environment:

| Flag              | Description                                                |
| ----------------- | ---------------------------------------------------------- |
| `--json`          | Emit raw JSON instead of formatted tables (great for scripts). |
| `--api-url <url>` | Override `SOCIALGO_API_URL` for this invocation.           |
| `--key <key>`     | Override `SOCIALGO_API_KEY` for this invocation.           |

```bash
# One-off, no env needed
socialgo --key your-key --api-url https://your-panel.com balance
```

Verify your setup at any time:

```bash
socialgo config
```

---

## Command overview

| Command                          | Auth        | Description                                                        |
| -------------------------------- | ----------- | ----------------------------------------------------------------- |
| `config`                         | none        | Show current config (API URL + whether a key is set).             |
| `services list`                  | API key     | List the full service catalog.                                    |
| `services search <query>`        | API key     | Search the catalog by name, category, type, or id.                |
| `service <id>`                   | API key     | Show details for one service.                                     |
| `order add` (alias `create`)     | API key     | Create an order (supports drip-feed and type-specific params).    |
| `order status <ids...>`          | API key     | Status of one or more orders (batch lookup).                      |
| `order refill <id>`              | API key     | Request a refill (replenishment) for an order.                    |
| `order cancel <ids...>`          | API key     | Cancel one or more orders.                                        |
| `refill-status`                  | API key     | Status of a refill by `--refill` or `--order`.                    |
| `orders`                         | API key     | List your order history.                                          |
| `balance`                        | API key     | Show account balance.                                             |
| `wallet`                         | API key     | Wallet summary (balance + recent transactions when available).    |
| `add-funds`                      | API key     | Create a pending top-up payment (completed in the panel).         |
| `admin sync-catalog`             | API key/admin | Sync the catalog from active suppliers (admin only).            |
| `guest-services`                 | **none**    | Public catalog — find a `serviceId` for a guest order.            |
| `guest-order <serviceId>`        | **none**    | Create a guest (no-account) order and get a payment URL.          |
| `guest-status <id>`              | **none**    | Public status of a guest order (validate with `--token`/`--email`). |

---

## Reseller commands

These require `SOCIALGO_API_KEY` (or `--key`).

### `config`

Shows the resolved API URL and whether a key is configured (the key itself is never printed).

```bash
socialgo config
```

```text
Configuração SocialGO CLI
  API URL  https://your-panel.com
  Chave    definida
```

With `--json`:

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

Lists the full catalog as a table.

```bash
socialgo services list
```

```text
ID    NOME                          TIPO     CATEGORIA          RATE/1k  MIN   MAX
1234  Instagram Followers [Real]    Default  Instagram Follow…     0.90   10  10000
55    Instagram Custom Comments     Custom…  Instagram Comme…     2.50    5   5000

2 serviço(s).
```

---

### `services search <query>`

Filters the catalog client-side by name, category, type, or id.

```bash
socialgo services search "instagram followers"
```

```text
Busca: "instagram followers"
ID    NOME                          TIPO     CATEGORIA          RATE/1k  MIN   MAX
1234  Instagram Followers [Real]    Default  Instagram Follow…     0.90   10  10000

1 serviço(s).
```

---

### `service <id>`

Shows the full detail for a single service, including capabilities (refill, cancel, drip-feed).

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

---

### `order add` (alias `create`)

Creates an order. Required: `--service` and `--link`. Additional parameters depend on the **service type** — send only the ones the type requires.

**Options**

| Flag                       | Description                                                                 |
| -------------------------- | --------------------------------------------------------------------------- |
| `--service <id>` (required) | Service id.                                                                |
| `--link <url>` (required)   | Target link (profile / post / video).                                      |
| `--quantity <n>`            | Quantity (optional for list-derived types such as comments).               |
| `--runs <n>`                | Drip-feed: number of runs.                                                 |
| `--interval <min>`          | Drip-feed: interval in minutes.                                            |
| `--comments <txt\|file>`    | Custom Comments: one comment per line (inline text or a file path).        |
| `--usernames <txt\|file>`   | Mentions Custom List / with Hashtags: one `@username` per line.            |
| `--hashtags <txt\|file>`    | Mentions with Hashtags: hashtags, one per line.                            |
| `--hashtag <tag>`           | Mentions Hashtag: a single target hashtag.                                 |
| `--username <user>`         | Mentions User Followers / Comment Likes: target username.                  |
| `--media <url>`             | Mentions Media Likers: target media.                                       |
| `--answer-number <n>`       | Poll: answer number.                                                       |

> List options (`--comments`, `--usernames`, `--hashtags`) accept either a literal string (newline-separated) **or** a path to a file. If the value is an existing file, its contents are used.

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

# Drip-feed: 10 runs, every 30 minutes
socialgo order add --service 70 --link https://insta.com/p/abc --quantity 100 --runs 10 --interval 30

# Custom comments from a file (one per line)
socialgo order add --service 55 --link https://insta.com/p/abc --comments ./comments.txt
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

---

### `order status <ids...>`

Status of one or more orders. Pass multiple ids for a batch lookup.

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

```bash
# Batch
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

---

### `order refill <id>`

Requests a refill (replenishment) for an order. Returns a refill id you can track.

```bash
socialgo order refill 98765
```

```text
✔ Refill solicitado para o pedido 98765.
  Refill ID  44321

Acompanhe: socialgo refill-status --refill 44321
```

---

### `order cancel <ids...>`

Cancels one or more orders.

```bash
socialgo order cancel 98765 4321
```

```text
✔ Pedido 98765 marcado para cancelamento.
✖ Pedido 4321: order cannot be cancelled
```

---

### `refill-status`

Status of a refill. Identify it either by the refill id (`--refill`) or by the order id (`--order`, uses the most recent refill). At least one is required.

```bash
socialgo refill-status --refill 44321
# or
socialgo refill-status --order 98765
```

```text
Reposição (refill 44321)
  Status  Completed
```

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

---

### `balance`

Shows the current account balance.

```bash
socialgo balance
```

```text
Saldo  42.50 USD
```

---

### `wallet`

Wallet summary: balance plus a recent transaction statement when the panel exposes it. If the statement isn't available for your key, only the balance is shown.

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

---

### `add-funds`

Creates a **pending** top-up payment. Complete the payment in the panel.

| Flag                       | Description                                            |
| -------------------------- | ------------------------------------------------------ |
| `--amount <value>` (required) | Amount to add (positive number).                    |
| `--method <method>` (required) | One of `mercadopago`, `stripe`, `crypto`, `manual`. |

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

---

### `admin sync-catalog`

Triggers a catalog sync from active suppliers. Requires an admin key.

```bash
socialgo admin sync-catalog
```

```text
Sincronizando catálogo dos fornecedores ativos…
✔ Catálogo sincronizado. 1842 serviço(s) importado(s).
```

---

## Guest commands (public, no account)

The guest commands let anyone buy **without an account** — pay-per-order, identified only by an email. They hit the public REST endpoints (`/guest/*`) and **never send your API key**. They still use the same base URL (`--api-url` / `SOCIALGO_API_URL`).

Typical flow: `guest-services` → `guest-order` → pay at the returned URL → `guest-status`.

### `guest-services`

Public catalog — browse services and find a `serviceId` to order with.

| Flag                       | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| `--platform <platform>`    | Filter by platform (e.g. `instagram`, `tiktok`).     |
| `--q <term>`               | Search by term in the service name.                  |
| `--limit <n>`              | Limit the number of results.                         |

```bash
socialgo guest-services --platform instagram --q followers --limit 5
```

```text
ID    NOME                          PLATAFORMA   CATEGORIA          RATE/1k  MIN   MAX
ig01  Instagram Followers           instagram    Followers             1.10   10  10000
ig02  Instagram Followers [Real]    instagram    Followers             1.40   50   5000

2 serviço(s). Use o ID em: socialgo guest-order --email <email> <ID>
```

---

### `guest-order <serviceId>`

Creates a guest order (no account) and returns a payment URL plus a guest token.

| Flag                       | Description                                                       |
| -------------------------- | ---------------------------------------------------------------- |
| `--email <email>` (required) | Buyer email (used to track the order).                         |
| `--link <url>` (required)    | Target link (profile / post / video).                          |
| `--quantity <n>`             | Quantity (optional for list types).                            |
| `--method <method>`          | `mercadopago` (PIX/card), `stripe` (card), or `crypto`. Default: `mercadopago`. |
| `--comments <txt\|file>`     | Custom Comments: one comment per line (inline text or a file). |
| `--usernames <txt\|file>`    | Mentions Custom List / with Hashtags: one `@username` per line.|
| `--hashtags <txt\|file>`     | Mentions with Hashtags: hashtags, one per line.                |
| `--hashtag <tag>`            | Mentions Hashtag: a single target hashtag.                     |
| `--username <user>`          | Mentions User Followers / Comment Likes: target username.      |
| `--media <url>`              | Mentions Media Likers: target media.                           |
| `--answer-number <n>`        | Poll: answer number.                                           |

> The type-specific params (`--comments`, `--usernames`, etc.) behave exactly as in `order add` and are sent as order metadata.

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

---

### `guest-status <id>`

Public status of a guest order. Prove ownership with the guest `--token` (preferred) or the `--email` used to place it. At least one is required.

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

---

## Scripting with `--json`

Every command supports `--json` for machine-readable output:

```bash
socialgo --json services search "tiktok views" | jq '.[] | {id: .service, rate}'
socialgo --json order status 98765 | jq '.status'
socialgo --json balance | jq '.balance'
```

## Exit codes

The CLI exits non-zero on any error (missing key, network failure, API business error). Error messages are printed to `stderr`; API errors include the HTTP status when available.
