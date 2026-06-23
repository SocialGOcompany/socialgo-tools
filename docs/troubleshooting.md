# Troubleshooting

Common issues and how to fix them. If your problem isn't here, check the
[FAQ](./faq.md) or open an [issue](https://github.com/SocialGOcompany/socialgo-tools/issues).

---

## `SOCIALGO_API_KEY` not set / "key is missing"

Account-mode commands and most MCP tools need an API key.

```bash
export SOCIALGO_API_URL="https://api.usesocialgo.com"
export SOCIALGO_API_KEY="your-api-key"
```

Find your key in your panel under **Account › API**. You can also pass it per command
in the CLI with `--key` (and `--api-url`). Run `socialgo config` to confirm what's
resolved and where it came from.

> Guest commands/tools (`guest-*`, `socialgo_guest_*`) do **not** need a key — they
> use the public endpoints.

---

## `command not found: socialgo`

The npm packages aren't published yet, so the global `socialgo` binary only exists
after you build and link it:

```bash
pnpm install && pnpm build
cd packages/cli && npm link
```

Alternatively, run it directly without linking:

```bash
node packages/cli/dist/index.js config
```

---

## MCP server doesn't appear in my assistant

- Point the client at the **built** file: `packages/mcp/dist/index.js` (run
  `pnpm build` first). Use an **absolute** path.
- Pass `SOCIALGO_API_URL` and `SOCIALGO_API_KEY` via the MCP host's `env` block, not
  your shell — MCP servers don't inherit your interactive environment.
- Restart the assistant after changing its config.

See the [MCP reference](./mcp.md) for exact `claude mcp add` and
`claude_desktop_config.json` snippets.

---

## "HTTP 4xx/5xx from the panel" or `{ error: ... }`

The SMM v2 endpoint returns errors as `{ "error": "message" }`. The message comes
straight from your panel. Common causes:

- **Insufficient balance** — top up with `socialgo add-funds` or in the panel.
- **Quantity out of range** — must be within the service's `min`/`max`. Check with
  `socialgo service <id>`.
- **Wrong/missing per-type params** — e.g. a Custom Comments service needs
  `--comments`, a Poll needs `--answer-number`. See the
  [API reference](./api-reference.md#per-type-order-params-add).

---

## "Service `<id>` not found in the catalog"

`socialgo service <id>` (CLI) and `socialgo_service_details` (MCP) look the id up in
the catalog returned by `services`. You'll see this when:

- **The id is wrong** — list/search first to get a valid id:
  `socialgo services search "instagram followers"` (or `socialgo guest-services`
  for the public catalog).
- **The id isn't in the active catalog** — a service may have been removed or
  disabled. Re-run the search to get a current id. With an admin key you can refresh
  the catalog from active suppliers with `socialgo admin sync-catalog`.
- **You mixed up catalogs** — guest checkout uses the public service id from
  `socialgo guest-services`, which can differ from the reseller catalog id used by
  `socialgo order add`.

---

## Order rejected / refused

When the panel refuses an order it returns `{ "error": "<message>" }` (the message
is the panel's own). Common reasons:

- **Quantity out of range** — must be within the service's `min`/`max`
  (`socialgo service <id>` to check).
- **Missing per-type params** — e.g. a Custom Comments service needs `--comments`,
  a Poll needs `--answer-number`, Mentions services need `--username`/`--usernames`.
  See the [API reference](./api-reference.md#per-type-order-params-add).
- **Insufficient balance** (account mode) — top up with `socialgo add-funds` or in
  the panel.
- **Unsupported action for the service** — e.g. requesting a `refill` or `cancel`
  on a service whose `refill`/`cancel` flag is `false`. Check the flags with
  `socialgo service <id>`.

Run the command with `--json` to see the raw error payload from the panel.

---

## "Invalid `--method`" on guest checkout

Payment methods are **not** a fixed list — they're the gateways your panel has
enabled right now. List them first:

```bash
socialgo guest-gateways
```

Pass the `gateway` value (e.g. `mercadopago`) as `--method`. If omitted, the first
active gateway is used.

---

## Request times out / can't connect

- Confirm `SOCIALGO_API_URL` points at a reachable panel host.
- Requests time out after 30s by default. With the SDK you can raise this via
  `timeoutMs` in `SmmV2Client` options.
- If the panel is behind a private network (e.g. Tailscale), make sure the machine
  running the tool is on that network.

---

## Build fails

- Use **Node ≥ 18** (`node -v`) and **pnpm** (`corepack enable` if needed).
- Run `pnpm install` from the repo root before `pnpm build` — it's a workspace and
  packages depend on each other via `workspace:*`.
- `pnpm typecheck` will point at type errors if a build half-completed.
