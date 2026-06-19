#!/usr/bin/env node
/**
 * Servidor MCP do SocialGO (binário `socialgo-mcp`).
 *
 * Expõe o painel SMM como um pequeno conjunto de tools para assistentes de IA,
 * comunicando-se via stdio (StdioServerTransport) — o transporte padrão para
 * MCP servers locais lançados por um cliente (Claude Desktop, etc).
 *
 * Toda configuração sensível vem do ambiente (ver src/tools.ts):
 *   - SOCIALGO_API_URL  base do painel SocialGO
 *   - SOCIALGO_API_KEY  chave de API do usuário/revendedor
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

async function main(): Promise<void> {
  const server = new McpServer({
    name: "socialgo-mcp",
    version: "0.1.0",
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout é reservado ao protocolo MCP; logs vão pra stderr.
  console.error("[socialgo-mcp] servidor MCP pronto (stdio).");
}

main().catch((err) => {
  console.error("[socialgo-mcp] falha ao iniciar:", err);
  process.exit(1);
});
