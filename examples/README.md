# Examples

Runnable examples for the SocialGO tools, across shell, Node.js (SDK), and Python (raw
HTTP). They all read config from the environment and **never hard-code credentials** —
wherever you see `YOUR_API_KEY`, substitute your own key.

> The `@socialgo/*` npm packages are **coming soon** — they are not on npm yet. Until
> they publish, run the SDK-based examples against the SDK built **from source** (the
> `pnpm install && pnpm --filter @socialgo/sdk build` step shown below). The pure-HTTP
> examples (curl / Python) need nothing from this repo at all.

## Index

| File | Language | Mode | What it shows | Needs API key? |
| --- | --- | --- | --- | --- |
| `guest-order.sh` | bash + curl | guest | Guest checkout end-to-end against the public `/guest/*` endpoints | no |
| `guest-order.py` | Python (HTTP) | guest | Same guest flow as above, in Python with `requests` | no |
| `reseller-curl.sh` | bash + curl | reseller | The SMM API v2 (`/api/v2`) with pure curl: balance, services, add, status | yes |
| `reseller.py` | Python (HTTP) | reseller | A tiny `requests`-based v2 client: find service, estimate, order, poll | yes |
| `place-order.ts` | TypeScript (SDK) | reseller | Single reseller order via `@socialgo/sdk` (`SmmV2Client`) | yes |
| `mass-order.mjs` | Node.js (SDK) | reseller | Many orders + batched `multiStatus`, with balance check & concurrency | yes |
| `monitor-order.ts` | TypeScript (SDK) | reseller | Automation: poll one order until it reaches a terminal state | yes |
| `mcp-claude-config.json` | JSON | both | MCP client config for the `@socialgo/mcp` server | yes (server) |

## Common environment

```bash
export SOCIALGO_API_URL="https://usesocialgo.com"   # your panel base URL
export SOCIALGO_API_KEY="YOUR_API_KEY"              # reseller key (from /dashboard/api-key)
```

The reseller SMM v2 endpoint lives at `${SOCIALGO_API_URL}/api/v2`; guest mode uses the
public `${SOCIALGO_API_URL}/guest/*` routes and sends no key.

---

## Guest mode (no account, no API key)

### `guest-order.sh`

Pure `curl` + `jq`. Browses the public catalog, creates a pay-per-order, prints the
payment URL, and tracks the order with the returned token.

```bash
SOCIALGO_API_URL=https://usesocialgo.com \
EMAIL=you@example.com \
LINK=https://instagram.com/yourprofile \
QUANTITY=1000 \
METHOD=mercadopago \
./examples/guest-order.sh
```

### `guest-order.py`

The same flow in Python — only dependency is `requests`.

```bash
pip install requests
SOCIALGO_API_URL=https://usesocialgo.com \
python examples/guest-order.py \
  --email you@example.com \
  --link https://instagram.com/yourprofile \
  --quantity 1000 \
  --method mercadopago
```

See [`docs/guest-checkout.md`](../docs/guest-checkout.md) for the full guest flow.

---

## Reseller mode — pure HTTP (no SDK)

### `reseller-curl.sh`

The whole reseller protocol is one endpoint: `POST /api/v2` with form-urlencoded
`key` + `action`. This script exercises `balance`, `services`, `add`, and `status`
with nothing but `curl` and `jq`, and shows `refill` / `cancel` / drip-feed in comments.

```bash
SOCIALGO_API_URL=https://usesocialgo.com \
SOCIALGO_API_KEY=YOUR_API_KEY \
LINK=https://instagram.com/yourprofile \
QUANTITY=1000 \
./examples/reseller-curl.sh
```

### `reseller.py`

A minimal `requests`-based v2 client (find a service, estimate cost, check balance,
place the order, poll status). No SDK, no repo build needed.

```bash
pip install requests
SOCIALGO_API_URL=https://usesocialgo.com \
SOCIALGO_API_KEY=YOUR_API_KEY \
python examples/reseller.py \
  --query "instagram followers" \
  --link https://instagram.com/yourprofile \
  --quantity 1000
```

---

## Reseller mode — with `@socialgo/sdk`

These import the SDK. Build it from source first (npm packages are coming soon):

```bash
pnpm install
pnpm --filter @socialgo/sdk build
```

### `place-order.ts`

Typed single-order flow: find a service, estimate cost, check balance, place the order,
poll status. Run it with a TypeScript loader such as `tsx`:

```bash
SOCIALGO_API_URL=https://usesocialgo.com \
SOCIALGO_API_KEY=YOUR_API_KEY \
npx tsx examples/place-order.ts \
  --query "instagram followers" \
  --link https://instagram.com/yourprofile \
  --quantity 1000
```

### `mass-order.mjs`

Plain ESM JavaScript (no TS loader). Places one order per target link with limited
concurrency, estimates total cost up front, checks the balance, then fetches every
order's status in a single batched `multiStatus` call.

```bash
SOCIALGO_API_URL=https://usesocialgo.com \
SOCIALGO_API_KEY=YOUR_API_KEY \
node examples/mass-order.mjs --service 1234 --quantity 500 \
  --links https://instagram.com/a,https://instagram.com/b,https://instagram.com/c

# or read targets from a file (one link per line):
node examples/mass-order.mjs --service 1234 --quantity 500 --links-file ./targets.txt
```

### `monitor-order.ts`

An automation building block: polls one order until it is `Completed` / `Partial` /
`Canceled` (or times out), printing progress and exiting non-zero unless it completes —
so it composes in shell pipelines and cron jobs.

```bash
SOCIALGO_API_URL=https://usesocialgo.com \
SOCIALGO_API_KEY=YOUR_API_KEY \
npx tsx examples/monitor-order.ts \
  --order 98765 --quantity 1000 --interval 15 --timeout 3600 \
  && echo "delivered!"
```

---

## MCP — AI assistants

### `mcp-claude-config.json`

Add the `socialgo` entry to your MCP-capable client's config (under `mcpServers`) and
restart the client. Replace the placeholder API key with your own — never commit a real
key. See [`docs/mcp.md`](../docs/mcp.md) for the full tool reference.
