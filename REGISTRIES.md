# Registry & directory listings

Get `@socialgo/mcp` (the first SMM-panel MCP server) discovered by developers and
resellers searching for **"smm panel api / mcp / sdk"**. Most directories index
automatically from npm + GitHub; a few need a one-time submission.

The npm packages are already public:
- [`@socialgo/mcp`](https://www.npmjs.com/package/@socialgo/mcp)
- [`@socialgo/cli`](https://www.npmjs.com/package/@socialgo/cli)
- [`@socialgo/sdk`](https://www.npmjs.com/package/@socialgo/sdk)

## Checklist

| Registry | How | Effort | Auth needed |
|---|---|---|---|
| **Official MCP Registry** (`registry.modelcontextprotocol.io`) | Publish `server.json` (in repo root) with the `mcp-publisher` CLI — see below | one command | GitHub OAuth (namespace `io.github.socialgocompany`) |
| **awesome-mcp-servers** (punkpeye) | PR adding a bullet under the right category | small PR | GitHub fork + PR |
| **Smithery** (`smithery.ai`) | Add a `smithery.yaml` + connect the repo on their site | web form | Smithery login |
| **Glama** (`glama.ai/mcp`) | Auto-indexes public GitHub MCP servers; can claim/boost via their site | mostly automatic | GitHub login (to claim) |
| **mcp.so** | Submit form on the site | web form | none/email |
| **PulseMCP** (`pulsemcp.com`) | Auto-indexes; submit if missing | web form | none |
| **MCP.Directory / mcpservers.org** | Submit form | web form | none |

## Official MCP Registry — publish

The `server.json` in this repo root is ready. To publish (one-time GitHub auth,
then re-run on each release):

```bash
# 1. Install the publisher CLI
brew install mcp-publisher   # or: go install github.com/modelcontextprotocol/registry/cmd/mcp-publisher@latest

# 2. Authenticate (opens GitHub OAuth; proves ownership of the io.github.socialgocompany namespace)
mcp-publisher login github

# 3. Validate + publish server.json
mcp-publisher publish
```

Keep `server.json`'s `version` and the `packages[].version` in sync with the npm
release (currently `0.3.0`). Bump both on each new npm publish and re-run
`mcp-publisher publish`.

## awesome-mcp-servers PR

Fork `github.com/punkpeye/awesome-mcp-servers`, add this line under a fitting
category (e.g. **Marketing** / **Commerce**), and open a PR:

```markdown
- [SocialGOcompany/socialgo-tools](https://github.com/SocialGOcompany/socialgo-tools) 📇 ☁️ - Run an SMM panel from Claude: search services and place SMM orders (Instagram, TikTok, YouTube followers/likes/views), with keyless guest checkout.
```

## Notes

- These listings are backlinks + discovery from high-authority MCP domains — the
  "AI-native SMM" white space no legacy PHP panel occupies.
- Re-run the official-registry publish and refresh directory entries whenever the
  npm packages bump a version.
