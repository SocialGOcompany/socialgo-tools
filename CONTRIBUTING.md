# Contributing to socialgo-tools

Thanks for your interest in improving the official SocialGO tools. This repository is a
pnpm monorepo with three packages (not yet published to npm — installed by
[building from source](README.md#installation)):

| Package          | Path             | What it is                                        |
| ---------------- | ---------------- | ------------------------------------------------- |
| `@socialgo/sdk`  | `packages/sdk`   | Typed client for the SMM API v2 + pricing helpers |
| `@socialgo/cli`  | `packages/cli`   | The `socialgo` command-line client                |
| `@socialgo/mcp`  | `packages/mcp`   | The `socialgo-mcp` Model Context Protocol server  |

By participating you agree to follow our [Code of Conduct](#code-of-conduct) and to
license your contributions under the project's [MIT License](LICENSE).

---

## Getting started

Prerequisites:

- **Node.js >= 18**
- **pnpm 9** (the repo pins `pnpm@9.12.0` via `packageManager`)

Install and build everything from the repo root:

```bash
pnpm install
pnpm build        # builds all packages (pnpm -r build)
pnpm typecheck    # type-checks all packages
pnpm test         # runs package tests (pnpm -r test)
```

Work on a single package with pnpm's filter, e.g.:

```bash
pnpm --filter @socialgo/cli dev        # tsx watch on the CLI
pnpm --filter @socialgo/sdk typecheck
```

The `cli` and `mcp` packages depend on `sdk` via `workspace:*`, so build or watch the
SDK when you change shared types.

---

## Project layout

```
packages/
  sdk/   src/{index,smm-v2,markup}.ts   protocol types, SmmV2Client, markup/cost helpers
  cli/   src/{index,client}.ts          commander program + SocialGoClient (HTTP wrapper)
  mcp/   src/{index,tools}.ts           MCP server + tool registrations
docs/                                   guides (e.g. guest-checkout.md)
examples/                               runnable examples
```

Two transport surfaces exist and should not be conflated:

- **Reseller / SMM API v2** — single endpoint `POST {SOCIALGO_API_URL}/api/v2` with
  `key` + `action`. Requires `SOCIALGO_API_KEY`.
- **Guest checkout** — public REST routes under `/guest/*`. **No API key is sent.**

When adding behavior, keep these consistent across the SDK, CLI, and MCP so the same
capability is available everywhere it makes sense.

---

## Making changes

1. **Fork** the repo and create a branch off `main`:
   ```bash
   git checkout -b feat/short-description
   ```
2. **Read the source before documenting or wiring new flags/tools.** The CLI commands
   live in `packages/cli/src/index.ts`, the MCP tools in `packages/mcp/src/tools.ts`,
   and the SDK surface in `packages/sdk/src/`. Don't invent flags, tools, or fields that
   don't exist.
3. **Keep types shared.** Prefer reusing types from `@socialgo/sdk` over redefining them
   in the CLI or MCP.
4. **Write or update tests** when you change behavior (`pnpm test`).
5. **Type-check and build clean** before opening a PR:
   ```bash
   pnpm typecheck && pnpm build && pnpm test
   ```

### Coding style

- TypeScript, ESM (`"type": "module"`), Node 18+ APIs.
- Match the existing style: small focused functions, descriptive names, and comments
  that explain *why* (the existing files are a good reference).
- No new runtime dependencies unless clearly justified.
- **Never** read secrets from anything other than the environment
  (`SOCIALGO_API_URL`, `SOCIALGO_API_KEY`). No hard-coded URLs that leak internal hosts,
  no embedded keys.
- Do not reference upstream SMM providers by name anywhere in code, docs, or comments.

### Commit messages

Use clear, conventional-style messages where practical:

```
feat(cli): add --interval validation to guest-order
fix(sdk): omit empty list params from the add payload
docs(guest): clarify awaiting_payment lifecycle
```

---

## Opening a pull request

- Keep PRs focused; one logical change per PR.
- Describe **what** changed and **why**, and how you verified it.
- Link any related issue.
- Make sure CI is green (`typecheck`, `build`, `test`). See `.github/workflows/ci.yml`.
- Update `docs/` and `examples/` when you change user-facing behavior.

---

## Reporting bugs and requesting features

Open a [GitHub issue](https://github.com/SocialGOcompany/socialgo-tools/issues) with:

- what you expected vs. what happened,
- steps to reproduce (commands, minimal code),
- package + version, Node version, and OS.

**Do not** include API keys, tokens, or other secrets in issues or reproductions. If you
found a security vulnerability, do **not** open a public issue — follow
[SECURITY.md](SECURITY.md) instead.

---

## Code of Conduct

Be respectful and constructive. Harassment, discrimination, and abusive behavior are not
tolerated. Maintainers may remove comments, commits, and contributions that violate this
spirit.

---

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
