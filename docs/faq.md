# FAQ

Quick answers to common questions. See also the
[Troubleshooting](./troubleshooting.md) guide.

---

### What is SocialGO?

SocialGO is an SMM (social-media-marketing) platform: you order engagement —
followers, likes, views, comments and more — for social profiles, posts and videos.
**SocialGO Tools** is the official, open-source way to talk to that platform from
code, the terminal, or an AI assistant.

### Do I need an account?

No. **Guest checkout** lets anyone place and track a single order with just an email
and pay once at checkout — no account, no API key, no wallet. See the
[guest checkout guide](./guest-checkout.md). For high volume, automation or
reselling, an account (with an API key and a prepaid wallet) is the better fit.

### Are the packages on npm?

Not yet — **npm publishing is coming soon**. For now, install by
[building from source](../README.md#installation): `git clone`, `pnpm install`,
`pnpm build`. The CLI and MCP server run from their built `dist/index.js`, and you
can `npm link` the CLI for a global `socialgo` command.

### Which package should I use — SDK, CLI, or MCP?

- **SDK** if you're building an app or integration in TypeScript.
- **CLI** if you're an operator/scripter working from a terminal.
- **MCP** if you want an AI assistant (Claude, etc.) to do it conversationally.

See the [comparison table](../README.md#sdk-vs-cli-vs-mcp--which-one-should-i-use)
in the README.

### What protocol does it speak?

The standard **SMM API v2** protocol (`POST {SOCIALGO_API_URL}/api/v2`, `key` +
`action`) for account mode, and public REST endpoints (`/guest/*`,
`/gateways/active`) for guest mode. See the [API reference](./api-reference.md).

### Where do I get my API key?

In your SocialGO panel under **Account › API**. Set it as `SOCIALGO_API_KEY` (and
`SOCIALGO_API_URL` for your panel host).

### Which payment methods are supported?

Whatever gateways your panel has enabled — it's not a fixed list. Query them with
`socialgo guest-gateways` (CLI) or `socialgo_guest_gateways` (MCP), then pass the
gateway name as the payment `method`.

### What's a markup / how do I price as a reseller?

The SDK ships dependency-free helpers — `applyMarkup`, `orderCost` and
`resolveMarkup` — to turn a supplier rate (per 1000) into a sell rate and compute
order cost. See the [SDK reference](./sdk.md).

### Does this expose my upstream supplier?

No. The tools only ever see your SocialGO panel. No upstream supplier is referenced,
and credentials are always read from the environment — never hardcoded.

### How do I report a security issue?

Follow the [security policy](../SECURITY.md). Please don't open a public issue for
sensitive reports.
