# Examples

Runnable examples for the SocialGO tools. All of them read config from the environment
and **never hard-code credentials**.

| File                       | What it shows                                            | Needs API key? |
| -------------------------- | -------------------------------------------------------- | -------------- |
| `place-order.ts`           | Reseller order via `@socialgo/sdk` (`SmmV2Client`)       | yes            |
| `guest-order.sh`           | Guest checkout end-to-end with `curl` against `/guest/*` | no             |
| `mcp-claude-config.json`   | MCP client config for the `@socialgo/mcp` server         | yes (server)   |

## Common environment

```bash
export SOCIALGO_API_URL="https://usesocialgo.com"   # your panel base URL
export SOCIALGO_API_KEY="your-api-key"              # reseller key (from /dashboard/api-key)
```

## place-order.ts

Typed reseller flow: find a service, estimate cost, check balance, place the order, poll
status. Build the SDK first, then run with a TypeScript loader:

```bash
pnpm install
pnpm --filter @socialgo/sdk build
npx tsx examples/place-order.ts \
  --query "instagram followers" \
  --link https://instagram.com/yourprofile \
  --quantity 1000
```

## guest-order.sh

No account, no API key — just `curl` + `jq`. Browses the public catalog, creates a
pay-per-order, prints the payment URL, and tracks the order with the returned token.

```bash
SOCIALGO_API_URL=https://usesocialgo.com \
EMAIL=you@example.com \
LINK=https://instagram.com/yourprofile \
QUANTITY=1000 \
METHOD=mercadopago \
./examples/guest-order.sh
```

See [`docs/guest-checkout.md`](../docs/guest-checkout.md) for the full guest flow.

## mcp-claude-config.json

Add the `socialgo` entry to your MCP-capable client's config (under `mcpServers`) and
restart the client. Replace the placeholder API key with your own — never commit a real
key.
