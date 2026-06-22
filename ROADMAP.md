# Roadmap

This is a living document of where **SocialGO Tools** is headed. It reflects intent,
not commitments — order and scope may change. Have an idea? Open an
[issue](https://github.com/SocialGOcompany/socialgo-tools/issues) or a discussion.

> **Legend:** ✅ done · 🔜 next · 💡 considering

---

## Near term

- 🔜 **Publish to npm** — ship `@socialgo/sdk`, `@socialgo/cli` and `@socialgo/mcp`
  so installs become `npm i -g @socialgo/cli`, `npx -y @socialgo/mcp` and
  `npm i @socialgo/sdk`. (Today: [build from source](./README.md#installation).)
- 🔜 **Richer catalog filtering** — more precise platform/type/price filters for
  `services search` and the `socialgo_services` MCP tool.
- 🔜 **More examples** — additional end-to-end snippets in [`examples/`](./examples).

## Mid term

- 💡 **Reseller pricing tooling** — bulk repricing helpers and category-level markup
  overrides built on `resolveMarkup`.
- 💡 **Order management ergonomics** — better batch status/refill/cancel workflows in
  the CLI and MCP.
- 💡 **Expanded docs** — more guides under [`docs/`](./docs).

## Done

- ✅ TypeScript SDK for the SMM API v2 protocol, with typed models and pricing helpers.
- ✅ `socialgo` CLI covering catalog, orders, refill/cancel, wallet and guest checkout.
- ✅ MCP server with a search-then-act tool set for AI assistants.
- ✅ Guest (no-account) checkout across CLI and MCP.

---

See the [README](./README.md) for current usage and the
[documentation index](./README.md#documentation) for full references.
