#!/usr/bin/env node
/**
 * Servidor MCP do SocialGO (binário `socialgo-mcp`).
 *
 * Expõe o painel SMM como um pequeno conjunto de tools para assistentes de IA,
 * comunicando-se via stdio (StdioServerTransport) — o transporte padrão para
 * MCP servers locais lançados por um cliente (Claude Desktop, etc).
 *
 * Caminho PRINCIPAL é o GUEST (sem conta, sem API key): qualquer um compra pelo
 * funil socialgo_guest_services → socialgo_guest_order. A conta + API key é
 * OPCIONAL e serve só para MELHOR ACOMPANHAMENTO (histórico, carteira, refill).
 *
 * Toda configuração sensível vem do ambiente (ver src/tools.ts):
 *   - SOCIALGO_API_URL  base do painel SocialGO
 *   - SOCIALGO_API_KEY  chave de API. OPCIONAL: só as tools de revendedor
 *     (saldo, place_order, wallet, ...) a exigem. O funil GUEST
 *     (socialgo_guest_services → socialgo_guest_order) funciona SEM chave.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

async function main(): Promise<void> {
  const server = new McpServer(
    {
      name: "socialgo-mcp",
      version: "0.2.0",
    },
    {
      // Instruções de NÍVEL-SERVIDOR: o assistant lê isto antes/ao invés de
      // varrer todas as descrições de tools. Fixa a regra de roteamento
      // guest-first (caminho PRINCIPAL) e deixa claro que conta/API key é
      // OPCIONAL — serve só para quem quer melhor acompanhamento.
      instructions:
        "SocialGO — comprar serviços SMM (seguidores, curtidas, views, etc.).\n\n" +
        "CAMINHO PRINCIPAL — GUEST (sem conta, sem API key, sem cadastro):\n" +
        "  Qualquer pessoa compra SEM criar conta e SEM API key. Não peça login nem chave.\n" +
        "  Funil mínimo: socialgo_guest_services (achar o serviceId) → socialgo_guest_order\n" +
        "  (cria o pedido + devolve a URL de pagamento) → socialgo_guest_order_status (acompanhar).\n" +
        "  socialgo_guest_gateways é um passo OPCIONAL: só chame se for OFERECER ao usuário a\n" +
        "  escolha do método de pagamento. Se você omitir `method` em socialgo_guest_order, ele\n" +
        "  usa automaticamente o 1º gateway ativo do painel — NÃO é obrigatório chamar gateways\n" +
        "  antes de criar o pedido. É pay-per-order: o usuário\n" +
        "  paga direto no checkout. O único dado pedido é um e-mail de contato (para recibo e\n" +
        "  rastreio do pedido) — NÃO é cadastro nem senha, e nenhuma conta é criada.\n\n" +
        "OPCIONAL — CONTA + API key (modo revendedor), para MELHOR ACOMPANHAMENTO:\n" +
        "  Quem JÁ tem conta e configurou SOCIALGO_API_KEY ganha histórico de pedidos, carteira/\n" +
        "  saldo, status detalhado, refill, assinaturas, etc. (tools socialgo_* sem prefixo guest).\n" +
        "  É opcional: só use quando o usuário estiver autenticado com uma chave. Sem chave, NÃO\n" +
        "  peça que o usuário crie conta — siga pelo funil guest.\n\n" +
        "Regra: sem conta/sem chave → tools socialgo_guest_*. Com chave → tools de revendedor.",
    },
  );

  await registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout é reservado ao protocolo MCP; logs vão pra stderr.
  console.error("[socialgo-mcp] servidor MCP pronto (stdio).");
}

main().catch((err) => {
  console.error("[socialgo-mcp] falha ao iniciar:", err);
  process.exit(1);
});
