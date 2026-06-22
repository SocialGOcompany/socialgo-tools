# Security Policy

We take the security of the SocialGO tools (`@socialgo/sdk`, `@socialgo/cli`,
`@socialgo/mcp`) seriously. Thank you for helping keep users safe.

## Supported versions

This project follows the latest release on `main`. Please report issues against the most
recent published version of the affected package.

| Package          | Supported           |
| ---------------- | ------------------- |
| `@socialgo/sdk`  | latest release      |
| `@socialgo/cli`  | latest release      |
| `@socialgo/mcp`  | latest release      |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately using one of the following:

1. **GitHub Security Advisories (preferred):** open a private report at
   [github.com/SocialGOcompany/socialgo-tools/security/advisories/new](https://github.com/SocialGOcompany/socialgo-tools/security/advisories/new).
2. **Email:** `security@usesocialgo.com`.

Please include, as much as you can:

- the affected package and version,
- a description of the vulnerability and its impact,
- steps to reproduce or a proof-of-concept,
- any suggested remediation.

**Do not include real API keys, tokens, or other secrets** in your report. Redact them
from logs and reproductions.

### What to expect

- **Acknowledgement** of your report within **3 business days**.
- An initial **assessment** and severity triage within **7 business days**.
- Coordinated disclosure: we will work with you on a fix and a disclosure timeline, and
  credit you (if you wish) once a patch is released.

Please give us a reasonable window to address the issue before any public disclosure.

## Handling secrets — for users and contributors

The tools are designed so that **no secret is ever embedded in the code**. Credentials
are read only from the environment:

- `SOCIALGO_API_URL` — your panel base URL.
- `SOCIALGO_API_KEY` — your reseller API key (from your panel under **Account › API**).

Guidelines:

- **Never commit API keys, tokens, or `.env` files.** This repo's `.gitignore` excludes
  `.env` and `.env.*` (except `.env.example`); keep it that way.
- Store keys in environment variables or a secrets manager — not in source, config
  checked into git, issues, PRs, or screenshots.
- The CLI accepts `--key`/`--api-url` flags for one-off use; prefer environment variables
  in shared or scripted environments so keys don't land in shell history or process logs.
- **Guest checkout tokens** (`guestToken`) prove ownership of a guest order — treat them
  like receipts and don't share them publicly.
- If a key is ever exposed, **rotate it immediately** from your SocialGO dashboard.
- Keep your dependencies up to date; the CI runs type-checks and tests on every change.

## Scope

In scope: vulnerabilities in this repository's published packages (SDK, CLI, MCP server)
— e.g. credential leakage, injection, SSRF via misused base URLs, or unsafe handling of
guest tokens.

Out of scope: issues in the SocialGO panel/backend itself (report those through the
panel's own security channel), and vulnerabilities in third-party dependencies that
should be reported upstream (still let us know so we can bump them).
