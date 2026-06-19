# Guest Checkout — Buy Without an Account

Guest checkout lets anyone place a SocialGO order **without creating an account or
funding a wallet**. You provide an email and a target link, pay once for that single
order (pay-per-order), and track it later with the order id plus a guest token.

It is the simplest way to use SocialGO: no signup, no API key, no balance to top up.

- **Reseller mode** (covered elsewhere) uses an API key and a prepaid wallet — the
  cost of each order is debited from your balance.
- **Guest mode** (this guide) uses **public endpoints** under `/guest/*`. No API key is
  ever sent. You pay for each order directly at checkout.

---

## Table of contents

- [How it works](#how-it-works)
- [The endpoints](#the-endpoints)
- [Browse the public catalog](#1-browse-the-public-catalog)
- [Create an order](#2-create-an-order)
- [Pay (card / PIX / crypto)](#3-pay-card--pix--crypto)
- [Track an order](#4-track-an-order)
- [Order lifecycle](#order-lifecycle)
- [Per-type parameters](#per-type-parameters)
- [Use it three ways](#use-it-three-ways)
  - [Via the website](#via-the-website)
  - [Via the CLI](#via-the-cli)
  - [Via the MCP server](#via-the-mcp-server)
- [Troubleshooting](#troubleshooting)

---

## How it works

```
                          ┌──────────────────────────────────────────┐
  1. find a service       │  GET  /guest/services                    │
                          └──────────────────────────────────────────┘
                                          │  serviceId
                                          ▼
                          ┌──────────────────────────────────────────┐
  2. create order         │  POST /guest/order                        │
                          │       → { orderId, guestToken, url, … }    │
                          └──────────────────────────────────────────┘
                                          │  open url
                                          ▼
  3. pay at the gateway   ┌──────────────────────────────────────────┐
     (card / PIX / crypto)│  hosted checkout — payment confirmed      │
                          └──────────────────────────────────────────┘
                                          │  webhook
                                          ▼
  4. order is dispatched  ┌──────────────────────────────────────────┐
     & you can track it   │  GET  /guest/order/:id?token=…            │
                          └──────────────────────────────────────────┘
```

Key points:

- **Pay-per-order.** Each order is paid for individually at a hosted checkout. There is
  no shared balance, and no wallet is debited.
- **The order is created in `awaiting_payment`.** It is only dispatched for delivery
  **after the payment confirms** (via webhook). Until then nothing is sent.
- **A guest user is found or created by email.** The same email reused on a later order
  is linked to the same guest identity, but each order is still paid for separately.
- **Ownership is proven by token (preferred) or email** when tracking the order.

---

## The endpoints

Everything is relative to your panel base URL — `SOCIALGO_API_URL`
(e.g. `https://usesocialgo.com`). These routes are public and accept **no API key**.

| Method | Path                  | Purpose                                          |
| ------ | --------------------- | ------------------------------------------------ |
| `GET`  | `/guest/services`     | Public catalog (filter by platform / term)       |
| `POST` | `/guest/order`        | Create a pay-per-order and get a payment URL      |
| `GET`  | `/guest/order/:id`    | Track an order (validate with `token` or `email`) |

> The authenticated reseller protocol (`POST /api/v2` with `key` + `action`) is a
> separate surface. Guest checkout never touches it.

---

## 1. Browse the public catalog

`GET /guest/services` returns the services available for guest purchase. Optional query
parameters narrow the list:

| Query      | Type     | Description                              |
| ---------- | -------- | ---------------------------------------- |
| `platform` | `string` | Filter by platform (e.g. `instagram`)    |
| `q`        | `string` | Search term matched against service name |
| `limit`    | `number` | Cap the number of results                |

Response shape (`{ items, total }`):

```json
{
  "items": [
    {
      "id": "1234",
      "name": "Instagram Followers — High Quality",
      "platform": "instagram",
      "categoryName": "Followers",
      "sellRate": "1.20",
      "min": 50,
      "max": 100000,
      "refill": true,
      "cancel": false,
      "dripfeed": true
    }
  ],
  "total": 1
}
```

`sellRate` is the price **per 1000 units**. The amount you actually pay is computed by
the panel from the rate and your `quantity` and returned by the create-order call as
`amount`. Use the `id` field as the `serviceId` when you create the order.

---

## 2. Create an order

`POST /guest/order` (JSON body):

| Field       | Type     | Required | Description                                                       |
| ----------- | -------- | -------- | ----------------------------------------------------------------- |
| `email`     | `string` | yes      | Buyer email — used to find/create the guest user and to track     |
| `serviceId` | `string` | yes      | Service id from `/guest/services`                                 |
| `link`      | `string` | yes      | Target link (profile, post, video, …)                             |
| `quantity`  | `number` | no\*     | Desired quantity, within the service `min`/`max`                  |
| `method`    | `string` | yes      | Payment method — see [below](#3-pay-card--pix--crypto)            |
| `metadata`  | `object` | no       | Per-type extra fields (see [Per-type parameters](#per-type-parameters)) |

\* For list-based service types (e.g. custom comments), quantity is derived from the
number of lines you pass in `metadata` rather than from `quantity`.

Response (`GuestOrderResult`):

```json
{
  "orderId": "ord_9f2c…",
  "guestToken": "gtk_4a7b…",
  "url": "https://checkout.example/pay/ord_9f2c…",
  "amount": 1.2,
  "currency": "BRL"
}
```

> **Save `orderId` and `guestToken`.** The token is the cleanest way to prove ownership
> and check status afterward. Treat it like a receipt — don't share it publicly.

---

## 3. Pay (card / PIX / crypto)

The `method` you pass selects which hosted checkout `url` is returned. Open that URL in
a browser and complete the payment there. The accepted values are:

| `method`      | Pays with                         | Notes                                  |
| ------------- | --------------------------------- | -------------------------------------- |
| `mercadopago` | PIX + credit/debit card + boleto  | Best coverage for Brazil               |
| `stripe`      | Credit/debit card                 | International cards                     |
| `crypto`      | Cryptocurrency                    | When enabled on the panel              |
| `paypal`      | PayPal                            | When enabled on the panel              |
| `paytm`       | Paytm                             | When enabled on the panel              |

Only methods **enabled on your panel** will work. The CLI's `guest-order` command
restricts its `--method` flag to `mercadopago`, `stripe`, and `crypto`; the MCP
`socialgo_guest_order` tool accepts the full set above. If you pass a method the panel
has not enabled, the create-order call returns an error.

The order remains `awaiting_payment` until the gateway confirms the payment. Only then
does SocialGO dispatch it for delivery.

---

## 4. Track an order

`GET /guest/order/:id` returns the current status of one order. You must prove you own
it with **one** of:

- `token` — the `guestToken` from the create-order response (**preferred**), or
- `email` — the email used when the order was created.

```
GET /guest/order/ord_9f2c…?token=gtk_4a7b…
```

Response (`GuestOrderStatus`):

```json
{
  "id": "ord_9f2c…",
  "status": "In progress",
  "serviceName": "Instagram Followers — High Quality",
  "link": "https://instagram.com/yourprofile",
  "quantity": 1000,
  "charge": "1.20",
  "startCount": 5230,
  "remains": 240,
  "createdAt": "2026-06-18T12:00:00.000Z"
}
```

Only the fields of **your own** order are returned — never another buyer's data.

---

## Order lifecycle

| Status            | Meaning                                                        |
| ----------------- | -------------------------------------------------------------- |
| `awaiting_payment`| Order created, payment not yet confirmed — nothing dispatched  |
| `Pending`         | Paid; queued for delivery                                      |
| `In progress`     | Delivery underway (`startCount` recorded, `remains` decreasing)|
| `Completed`       | Delivered in full                                              |
| `Partial`         | Partially delivered                                            |
| `Canceled`        | Canceled                                                       |

If a status check still shows `awaiting_payment`, the payment has not been confirmed —
re-open the `url` and finish the checkout.

---

## Per-type parameters

Some service types need extra inputs beyond `quantity`. Pass them in `metadata` (REST /
MCP) or via the matching CLI flag. The field names match the SMM v2 protocol:

| Service type                       | Field(s)                | CLI flag(s)                  |
| ---------------------------------- | ----------------------- | ---------------------------- |
| Default / Package                  | `quantity`              | `--quantity`                 |
| Drip-feed                          | `quantity`, `runs`, `interval` | `--quantity --runs --interval` |
| Custom Comments / Comments Package | `comments` (1 per line) | `--comments`                 |
| Mentions Custom List               | `usernames` (1 per line)| `--usernames`                |
| Mentions with Hashtags             | `usernames`, `hashtags` | `--usernames --hashtags`     |
| Mentions Hashtag                   | `hashtag`               | `--hashtag`                  |
| Mentions User Followers            | `username`              | `--username`                 |
| Mentions Media Likers              | `media`                 | `--media`                    |
| Comment Likes                      | `username`              | `--username`                 |
| Poll                               | `answer_number`         | `--answer-number`            |

Send **only** the fields relevant to the chosen service's type.

---

## Use it three ways

### Via the website

1. Open your SocialGO panel and go to the guest / "buy without account" checkout.
2. Pick a service, paste your target link, set the quantity, and enter your email.
3. Choose a payment method and complete the hosted checkout (card / PIX / crypto).
4. Keep the order id and token shown on the confirmation page to check status later.

### Via the CLI

Install the CLI and point it at your panel (no API key needed for guest commands):

```bash
npm install -g @socialgo/cli
export SOCIALGO_API_URL="https://usesocialgo.com"   # your panel base URL
```

Find a service in the public catalog:

```bash
socialgo guest-services --platform instagram --q followers --limit 10
```

Create a guest order (returns the payment URL):

```bash
socialgo guest-order 1234 \
  --email you@example.com \
  --link https://instagram.com/yourprofile \
  --quantity 1000 \
  --method mercadopago
```

The CLI prints the `Order ID`, `Guest Token`, `amount`, and the payment `url`. Open the
URL to pay. The CLI accepts `--method mercadopago | stripe | crypto` and defaults to
`mercadopago`.

Track it after paying — prove ownership with `--token` (preferred) or `--email`:

```bash
socialgo guest-status ord_9f2c… --token gtk_4a7b…
# or
socialgo guest-status ord_9f2c… --email you@example.com
```

Add `--json` to any command for raw JSON output suitable for scripting. Per-type inputs
use the same flags as reseller orders (`--comments`, `--usernames`, `--hashtags`,
`--hashtag`, `--username`, `--media`, `--answer-number`); list flags accept either inline
text or a file path.

### Via the MCP server

The MCP server exposes guest checkout to AI assistants through two tools:

- `socialgo_guest_order` — create a pay-per-order and return the payment URL.
- `socialgo_guest_order_status` — track a guest order by id + token/email.

Use `socialgo_services` first to discover the `serviceId`. Configure the server with
just `SOCIALGO_API_URL` (guest tools need no API key, though the catalog search tool
does). Example client config: see [`examples/mcp-claude-config.json`](../examples/mcp-claude-config.json).

`socialgo_guest_order` returns `{ orderId, guestToken, url, amount, currency }`. The
assistant should hand the `url` to the user to pay, then keep `orderId` + `guestToken`
for follow-up status checks via `socialgo_guest_order_status`.

---

## Troubleshooting

| Symptom                                  | Likely cause / fix                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| Status stays `awaiting_payment`          | Payment not confirmed yet — reopen the `url` and complete checkout.      |
| `--method` rejected by the CLI           | CLI only allows `mercadopago`, `stripe`, `crypto`. Use one of those.     |
| Create-order error about payment method  | That method isn't enabled on the panel — pick an enabled one.            |
| Quantity error                           | Quantity must be within the service's `min`/`max` (see `/guest/services`).|
| Can't track the order                    | You must pass `token` **or** `email`. The token is the one from creation.|
| Connection / timeout                     | Check `SOCIALGO_API_URL` points to your panel and is reachable.          |

---

See also: the runnable [`examples/`](../examples/) for a curl walkthrough of the guest
endpoints, an SDK order script, and an MCP client config.
