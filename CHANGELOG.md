# Changelog

All notable changes to **SocialGO Tools** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This is a monorepo; the three packages (`@socialgo/sdk`, `@socialgo/cli`,
`@socialgo/mcp`) are versioned together for now.

## [Unreleased]

### Planned

- Publish `@socialgo/sdk`, `@socialgo/cli` and `@socialgo/mcp` to npm so installs
  become `npm i -g @socialgo/cli`, `npx -y @socialgo/mcp` and `npm i @socialgo/sdk`.
  Until then, install by [building from source](./README.md#installation).

See [ROADMAP.md](./ROADMAP.md) for the broader direction.

## [0.2.0] - 2026-06-22

Adds recurring delivery, wallet top-ups, batch ordering, coupons, affiliate and
loyalty read-outs, intent-based recommendations, budget-driven campaign planning,
and public storefront lookups — across all three surfaces (SDK, CLI, MCP).

### Added

#### `@socialgo/sdk`

- `SmmV2Client` gains `wallet` (balance + recent ledger transactions), `addFunds`
  (create a pending wallet top-up), `massOrder` (place several orders in one call),
  `subscriptionCreate` and `subscriptions` (recurring scheduled delivery),
  `couponValidate` (preview a coupon without redeeming it), `affiliateStats` and
  `loyaltyStatus` (the current user's referral and loyalty figures), `recommend`
  (related services from an anchor service and/or platform), `campaignBuild`
  (turn a budget + window + goal into a delivery plan, no order placed) and
  `storefront` (resolve a public store by slug with its packages).
- Typed models for the new responses: wallet/transactions, add-funds result,
  mass-order result, subscription create/list, coupon preview, affiliate stats,
  loyalty status, recommended service, campaign plan and storefront/packages.

#### `@socialgo/cli`

- New commands: `wallet`, `add-funds`, `order mass-order` (batch from a list or
  file), `subscription create`, `subscription list`, `coupon validate`,
  `affiliate stats`, `affiliate link`, `loyalty`, `recommend`, `campaign build`
  and `storefront <slug>`. All accept `--json` for script-friendly output.

#### `@socialgo/mcp`

- New tools: `socialgo_wallet`, `socialgo_add_funds`, `socialgo_mass_order`,
  `socialgo_create_subscription`, `socialgo_subscriptions`,
  `socialgo_validate_coupon`, `socialgo_affiliate_stats`,
  `socialgo_loyalty_status`, `socialgo_recommend`, `socialgo_build_campaign`
  and `socialgo_storefront`.
- `socialgo_recommend` suggests next services from an anchor or platform;
  `socialgo_build_campaign` returns a reviewable delivery plan from a budget and
  window without placing an order; `socialgo_storefront` reads a public store's
  packages; `socialgo_add_funds` starts a pending wallet top-up. The conversation
  works in any language — the assistant reads the data back in the user's own
  language.

### Security

- Credentials are still read only from the environment; no upstream supplier is
  referenced. New wallet and affiliate read-outs are scoped to the API key's user.

## [0.1.0] - 2026-06-22

Initial public release of the SocialGO open-source toolkit: a typed core plus three
surfaces (library, CLI, AI tools) over the standard SMM API v2 protocol
(`POST {SOCIALGO_API_URL}/api/v2`) and the public guest-checkout endpoints.

> Not yet on npm — see [Installation](./README.md#installation) for building from source.

### Added

#### `@socialgo/sdk`

- `SmmV2Client` — a `fetch`-based client for the SMM API v2 protocol, covering
  `services`, `add`, `status`, `multiStatus`, `refill`, `cancel` and `balance`,
  with a configurable request timeout and an injectable `fetch` implementation.
- Typed protocol models: `SmmService`, `SmmAddOrderParams`, `SmmOrderStatus`,
  `SmmBalance`, plus per-service-type order params (comments, mentions, hashtags,
  polls, drip-feed).
- `SmmV2Error` for surfacing protocol and transport failures.
- Dependency-free reseller pricing helpers: `applyMarkup`, `orderCost` and
  `resolveMarkup` (supplier-rate-per-1000 → sell rate, with category-level overrides).

#### `@socialgo/cli`

- The `socialgo` command, built on the shared SDK types.
- Account / reseller commands: `config`, `balance`, `wallet`, `add-funds`,
  `services list`, `services search`, `service <id>`, `order add`, `order status`,
  `order refill`, `order cancel`, `refill-status`, `orders` and `admin sync-catalog`.
- Per-service-type order parameters on `order add` (`--comments`, `--usernames`,
  `--hashtags`, `--hashtag`, `--username`, `--media`, `--answer-number`) plus
  drip-feed (`--runs`, `--interval`); list params accept inline text or a file path.
- Guest (no-account) commands: `guest-gateways`, `guest-services`, `guest-order`
  and `guest-status`.
- Global `--json` flag for raw, script-friendly output, and `--api-url` / `--key`
  overrides; configuration via `SOCIALGO_API_URL` and `SOCIALGO_API_KEY`.

#### `@socialgo/mcp`

- The `socialgo-mcp` Model Context Protocol server (stdio transport) for AI
  assistants, using a *search-then-act* design so the catalog is queried on demand
  rather than dumped into context.
- Tools: `socialgo_balance`, `socialgo_services`, `socialgo_service_details`,
  `socialgo_place_order`, `socialgo_order_status`, `socialgo_refill`,
  `socialgo_refill_status`, `socialgo_cancel` and `socialgo_orders`.
- Guest-checkout tools: `socialgo_guest_gateways`, `socialgo_guest_order` and
  `socialgo_guest_order_status`.

#### Repository

- pnpm workspace with shared TypeScript build, type-checking and tests.
- Documentation under [`docs/`](./docs) (getting started, SDK / CLI / MCP references,
  guest checkout, API reference, troubleshooting, FAQ) and runnable
  [`examples/`](./examples).
- CI workflow (type-check, build, test) and a tag-triggered release workflow.

### Security

- Credentials are read only from the environment (`SOCIALGO_API_URL`,
  `SOCIALGO_API_KEY`) — never hardcoded. Guest-checkout endpoints never send a key.
- No upstream SMM supplier is referenced anywhere in the code.

[Unreleased]: https://github.com/SocialGOcompany/socialgo-tools/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/SocialGOcompany/socialgo-tools/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/SocialGOcompany/socialgo-tools/releases/tag/v0.1.0
