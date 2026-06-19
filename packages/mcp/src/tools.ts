/**
 * Tools do servidor MCP do SocialGO.
 *
 * ── Design "search-then-act" ────────────────────────────────────────────────
 * Um painel SMM expõe MILHARES de serviços (cada combinação de plataforma x
 * tipo x fornecedor). Registrar uma tool por serviço estouraria a janela de
 * contexto do modelo e tornaria a seleção impossível. Em vez disso expomos um
 * conjunto PEQUENO e FIXO de tools, sendo a chave delas a `socialgo_services`:
 *
 *   1. SEARCH — o modelo chama `socialgo_services` com uma intenção em linguagem
 *      natural (ex.: "seguidores instagram baratos"). Devolvemos só os serviços
 *      relevantes, já com id/preço/min/max — sob demanda, nunca o catálogo todo.
 *   2. ACT — de posse de um `service` id, o modelo chama `socialgo_place_order`,
 *      `socialgo_order_status`, `socialgo_refill`, `socialgo_cancel`, etc.
 *
 * Assim o número de tools é constante independente do tamanho do catálogo.
 *
 * ── Cobertura do SMM API v2 ─────────────────────────────────────────────────
 * As tools cobrem 1:1 o que o endpoint `${SOCIALGO_API_URL}/api/v2` expõe hoje:
 *   - services       → socialgo_services / socialgo_service_details
 *   - add            → socialgo_place_order (com params por TIPO de serviço)
 *   - status         → socialgo_order_status (1 pedido ou vários via CSV)
 *   - balance        → socialgo_balance
 *   - refill         → socialgo_refill
 *   - refill_status  → socialgo_refill_status
 *   - cancel         → socialgo_cancel
 *   - orders (ext.)  → socialgo_orders
 *
 * ── Transporte ──────────────────────────────────────────────────────────────
 * Toda tool fala com a API do SocialGO via HTTP, no MESMO protocolo SMM API v2
 * que o painel expõe a revendedores (endpoint único POST `.../api/v2` recebendo
 * `key` + `action` em form-urlencoded). Credenciais SEMPRE vêm do ambiente —
 * nenhum segredo é embutido aqui:
 *   - SOCIALGO_API_URL  → base do painel (default https://usesocialgo.com)
 *   - SOCIALGO_API_KEY  → chave de API do revendedor/usuário (obrigatória)
 *
 * Nenhum fornecedor upstream é citado: o MCP enxerga apenas o painel SocialGO.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SmmService } from "@socialgo/sdk";

// ── Config de ambiente ───────────────────────────────────────────────────────

/** Base padrão do painel SocialGO (Mac Mini via Tailscale). */
const DEFAULT_API_URL = "https://usesocialgo.com";

/** Base da API SocialGO. O endpoint SMM v2 fica em `${base}/api/v2`. */
function apiBase(): string {
  const base = process.env.SOCIALGO_API_URL || DEFAULT_API_URL;
  return base.replace(/\/+$/, "");
}

/** Chave de API do usuário/revendedor (nunca embutida no código). */
function apiKey(): string {
  const key = process.env.SOCIALGO_API_KEY;
  if (!key) {
    throw new Error(
      "SOCIALGO_API_KEY não definido. Use a chave de API do seu painel SocialGO " +
        "(disponível em Conta › API no painel).",
    );
  }
  return key;
}

// ── Cliente SMM v2 contra o próprio painel ────────────────────────────────────

/**
 * Chamada genérica ao endpoint SMM v2 do painel. `key` é injetada do ambiente;
 * o chamador passa `action` + parâmetros. Resposta é o JSON cru do painel.
 */
async function smm<T = unknown>(
  action: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const body = new URLSearchParams({ key: apiKey(), action });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) body.set(k, String(v));
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/v2`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Tempo esgotado ao chamar a API SocialGO (action=${action}).`);
    }
    throw new Error(
      `Não foi possível conectar à API SocialGO em ${apiBase()} ` +
        `(action=${action}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  clearTimeout(timer);

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Resposta não-JSON da API (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(`Erro da API SocialGO: ${msg}`);
  }
  if (data && typeof data === "object" && "error" in data && (data as { error: unknown }).error) {
    throw new Error(`Erro da API SocialGO: ${String((data as { error: unknown }).error)}`);
  }
  return data as T;
}

// ── Cliente REST do guest checkout (público, sem API key) ─────────────────────

/**
 * Chamada aos endpoints PÚBLICOS de guest checkout do painel (`/guest/...`).
 *
 * Diferente de `smm()` (protocolo SMM v2 com `key` + `action` form-urlencoded),
 * o guest checkout é REST/JSON e NÃO usa SOCIALGO_API_KEY: ele permite comprar
 * SEM conta (pay-per-order), achando/criando um usuário guest pelo e-mail. Por
 * isso essas tools funcionam mesmo sem chave de revendedor configurada.
 *
 * Erros do servidor vêm como `{ error }` (HTTP 400/404/429) e são repassados
 * de forma legível pro modelo, sem vazar stack nem PII.
 */
async function guest<T = unknown>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Tempo esgotado ao chamar o guest checkout (${method} ${path}).`);
    }
    throw new Error(
      `Não foi possível conectar à API SocialGO em ${apiBase()} ` +
        `(${method} ${path}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  clearTimeout(timer);

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Resposta não-JSON da API (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(`Erro da API SocialGO: ${msg}`);
  }
  return data as T;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resultado padrão de uma tool MCP (texto). */
type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/** Empacota um valor como conteúdo de texto JSON da tool. */
function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** Empacota um erro de forma legível pro modelo (sem vazar stack). */
function fail(err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: `Erro: ${message}` }], isError: true };
}

/** Normaliza uma lista de ids (number|string) para CSV limpo, sem vazios. */
function toCsv(ids: Array<number | string>): string {
  return ids
    .map((id) => String(id).trim())
    .filter(Boolean)
    .join(",");
}

/**
 * Filtra/rankeia o catálogo localmente para o `socialgo_services`.
 * Match por substring (case-insensitive) em name/category/type, com filtros
 * opcionais de plataforma e tipo. Limita a saída para não estourar contexto.
 */
function filterServices(
  services: SmmService[],
  opts: { query?: string; platform?: string; type?: string; limit: number },
): SmmService[] {
  const q = opts.query?.trim().toLowerCase();
  const platform = opts.platform?.trim().toLowerCase();
  const type = opts.type?.trim().toLowerCase();
  const terms = q ? q.split(/\s+/).filter(Boolean) : [];

  const matches = services.filter((s) => {
    const hay = `${s.name} ${s.category} ${s.type}`.toLowerCase();
    if (platform && !hay.includes(platform)) return false;
    if (type && !String(s.type).toLowerCase().includes(type)) return false;
    // todos os termos da query precisam aparecer em algum campo
    return terms.every((t) => hay.includes(t));
  });

  // ranking simples: mais termos casados primeiro, depois menor preço
  const scored = matches
    .map((s) => {
      const hay = `${s.name} ${s.category} ${s.type}`.toLowerCase();
      const hits = terms.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
      return { s, hits, rate: Number(s.rate) || Number.POSITIVE_INFINITY };
    })
    .sort((a, b) => b.hits - a.hits || a.rate - b.rate);

  return scored.slice(0, opts.limit).map((x) => x.s);
}

// ── Registro das tools ─────────────────────────────────────────────────────────

export function registerTools(server: McpServer): void {
  /* ───────────────────────── 1) socialgo_balance ──────────────────────────── */
  server.tool(
    "socialgo_balance",
    "Retorna o saldo atual da conta no painel SocialGO (balance + currency). " +
      "Use antes de criar pedidos para confirmar que há saldo suficiente.",
    {},
    async () => {
      try {
        return ok(await smm("balance"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────────────── 2) socialgo_services ─────────────────────────── */
  // Coração do design search-then-act. Busca o catálogo do painel e devolve só
  // os serviços relevantes sob demanda (NUNCA o catálogo inteiro).
  server.tool(
    "socialgo_services",
    "Busca/filtra serviços SMM no catálogo do painel por intenção em linguagem natural. " +
      "Retorna apenas os serviços relevantes (service id, nome, categoria, tipo, rate por 1000, " +
      "min, max, e flags refill/cancel/dripfeed). Use SEMPRE antes de socialgo_place_order " +
      "para descobrir o `service` id correto.",
    {
      query: z
        .string()
        .optional()
        .describe("Intenção da busca, ex.: 'seguidores instagram brasileiros'. Vazio = lista geral (limitada)."),
      platform: z
        .string()
        .optional()
        .describe("Filtro opcional de plataforma, ex.: 'Instagram', 'TikTok', 'YouTube'."),
      type: z
        .string()
        .optional()
        .describe("Filtro opcional de tipo do serviço, ex.: 'Default', 'Package', 'Custom Comments', 'Poll'."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(20)
        .describe("Máximo de serviços a retornar (1-50, padrão 20)."),
    },
    async ({ query, platform, type, limit }) => {
      try {
        const all = await smm<SmmService[]>("services");
        const list = Array.isArray(all) ? all : [];
        const found = filterServices(list, { query, platform, type, limit: limit ?? 20 });
        return ok({ count: found.length, total: list.length, services: found });
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ─────────────────────── 3) socialgo_service_details ────────────────────── */
  server.tool(
    "socialgo_service_details",
    "Retorna os detalhes completos de um serviço específico do catálogo pelo seu id " +
      "(rate, min, max, type, e flags refill/cancel/dripfeed). " +
      "Use para confirmar limites e tipo antes de socialgo_place_order.",
    {
      service: z
        .union([z.number(), z.string()])
        .describe("Id do serviço no painel (obtido em socialgo_services)."),
    },
    async ({ service }) => {
      try {
        const all = await smm<SmmService[]>("services");
        const list = Array.isArray(all) ? all : [];
        const svc = list.find((s) => String(s.service) === String(service));
        if (!svc) return fail(new Error(`Serviço ${service} não encontrado no catálogo.`));
        return ok(svc);
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────────────── 4) socialgo_place_order ──────────────────────── */
  // Cria um pedido. Suporta drip-feed (runs/interval) E os parâmetros extras por
  // TIPO de serviço definidos pelo SMM API v2. A API valida o obrigatório por
  // tipo e deriva a quantity quando aplicável (ex.: nº de linhas das listas).
  server.tool(
    "socialgo_place_order",
    "Cria um pedido para um serviço. Use o `service` id obtido em socialgo_services. " +
      "O custo é debitado do saldo da conta.\n\n" +
      "PARÂMETROS POR TIPO DE SERVIÇO (SMM API v2):\n" +
      "- Default: informe `quantity` (dentro de min/max).\n" +
      "- Drip-feed: `quantity` + `runs` (execuções) + `interval` (min entre execuções).\n" +
      "- Custom Comments / Comments Package: `comments` (1 comentário por linha).\n" +
      "- Mentions Custom List / Mentions with Hashtags: `usernames` (1 por linha) e, p/ hashtags, `hashtags`.\n" +
      "- Mentions Hashtag: `hashtag`.\n" +
      "- Mentions User Followers / Comment Likes: `username`.\n" +
      "- Mentions Media Likers: `media`.\n" +
      "- Poll: `answer_number`.\n" +
      "Informe apenas os campos relevantes ao tipo do serviço escolhido.",
    {
      service: z
        .union([z.number(), z.string()])
        .describe("Id do serviço (de socialgo_services)."),
      link: z.string().min(1).describe("Link/alvo do pedido (perfil, post, vídeo, etc)."),
      quantity: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Quantidade desejada, dentro de min/max do serviço. Para tipos com lista (comments/usernames) a quantity é derivada das linhas."),
      runs: z.number().int().positive().optional().describe("Drip-feed: número de execuções."),
      interval: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Drip-feed: intervalo em minutos entre execuções."),
      comments: z
        .string()
        .optional()
        .describe("Custom Comments / Comments Package: um comentário por linha."),
      usernames: z
        .string()
        .optional()
        .describe("Mentions Custom List / Mentions with Hashtags: um @username por linha."),
      hashtags: z
        .string()
        .optional()
        .describe("Mentions with Hashtags: uma hashtag por linha."),
      hashtag: z.string().optional().describe("Mentions Hashtag: a hashtag-alvo."),
      username: z
        .string()
        .optional()
        .describe("Mentions User Followers / Comment Likes: o username de referência."),
      media: z.string().optional().describe("Mentions Media Likers: link/id da mídia de referência."),
      answer_number: z
        .number()
        .int()
        .optional()
        .describe("Poll: número da opção de resposta a votar."),
    },
    async (params) => {
      try {
        // Repassa apenas os campos definidos; `smm` omite undefined/null.
        return ok(await smm("add", params as Record<string, unknown>));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────────────── 5) socialgo_order_status ─────────────────────── */
  // Aceita 1 pedido (`order`) OU vários (`orders` em array → CSV no protocolo).
  server.tool(
    "socialgo_order_status",
    "Consulta o status de um ou mais pedidos (status, charge, start_count, remains, currency). " +
      "Passe `order` para um único pedido OU `orders` (lista) para vários de uma vez.",
    {
      order: z
        .union([z.number(), z.string()])
        .optional()
        .describe("Id de um único pedido."),
      orders: z
        .array(z.union([z.number(), z.string()]))
        .optional()
        .describe("Lista de ids de pedidos para consulta em lote."),
    },
    async ({ order, orders }) => {
      try {
        if (orders && orders.length > 0) {
          return ok(await smm("status", { orders: toCsv(orders) }));
        }
        if (order !== undefined) {
          return ok(await smm("status", { order }));
        }
        return fail(new Error("Informe `order` (único) ou `orders` (lista)."));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────────────── 6) socialgo_refill ───────────────────────────── */
  // Aceita 1 pedido (`order`) OU vários (`orders` em array → CSV).
  server.tool(
    "socialgo_refill",
    "Solicita refill (reposição) de um ou mais pedidos, quando o serviço suporta refill. " +
      "Passe `order` para um único pedido OU `orders` (lista) para vários. " +
      "Retorna o(s) id(s) de refill, usados em socialgo_refill_status.",
    {
      order: z
        .union([z.number(), z.string()])
        .optional()
        .describe("Id de um único pedido a repor."),
      orders: z
        .array(z.union([z.number(), z.string()]))
        .optional()
        .describe("Lista de ids de pedidos a repor em lote."),
    },
    async ({ order, orders }) => {
      try {
        if (orders && orders.length > 0) {
          return ok(await smm("refill", { orders: toCsv(orders) }));
        }
        if (order !== undefined) {
          return ok(await smm("refill", { order }));
        }
        return fail(new Error("Informe `order` (único) ou `orders` (lista)."));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ─────────────────────── 7) socialgo_refill_status ──────────────────────── */
  server.tool(
    "socialgo_refill_status",
    "Consulta o status de uma reposição (Pending/Completed/Rejected). " +
      "Passe o `refill` id (retornado por socialgo_refill) OU o `order` id " +
      "(pega a reposição mais recente daquele pedido).",
    {
      refill: z
        .union([z.number(), z.string()])
        .optional()
        .describe("Id da reposição (retornado por socialgo_refill)."),
      order: z
        .union([z.number(), z.string()])
        .optional()
        .describe("Id do pedido — consulta a reposição mais recente dele."),
    },
    async ({ refill, order }) => {
      try {
        if (refill !== undefined) {
          return ok(await smm("refill_status", { refill }));
        }
        if (order !== undefined) {
          return ok(await smm("refill_status", { order }));
        }
        return fail(new Error("Informe `refill` (id da reposição) ou `order` (id do pedido)."));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────────────── 8) socialgo_cancel ───────────────────────────── */
  server.tool(
    "socialgo_cancel",
    "Cancela um ou mais pedidos pelos seus ids (quando o serviço permite cancelamento). " +
      "Retorna, por pedido, se o cancelamento foi aceito ou o erro.",
    {
      orders: z
        .array(z.union([z.number(), z.string()]))
        .min(1)
        .describe("Lista de ids de pedidos a cancelar."),
    },
    async ({ orders }) => {
      try {
        // O protocolo SMM v2 recebe os ids em CSV.
        return ok(await smm("cancel", { orders: toCsv(orders) }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────────────── 9) socialgo_orders ───────────────────────────── */
  server.tool(
    "socialgo_orders",
    "Lista o histórico de pedidos da conta no painel (id, charge, status, start_count, " +
      "remains, link, quantity, created_at).",
    {},
    async () => {
      try {
        return ok(await smm("orders"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ─────────────────────── 10) socialgo_guest_order ────────────────────────── */
  // Compra SEM conta (pay-per-order). Cria um pedido `awaiting_payment` para um
  // e-mail e devolve a URL de checkout do gateway escolhido. NÃO usa a API key —
  // bate no endpoint público /guest/order. O pedido só é despachado ao fornecedor
  // depois que o pagamento confirma (webhook), então a IA deve entregar a `url`
  // ao usuário e instruí-lo a pagar para o pedido seguir.
  server.tool(
    "socialgo_guest_order",
    "Cria um pedido SMM SEM precisar de conta (pay-per-order) e retorna a URL de pagamento. " +
      "Fluxo para conduzir a compra com o usuário:\n" +
      "1. Use socialgo_services para achar o `serviceId` (use o id do serviço do painel).\n" +
      "2. Peça ao usuário o e-mail (para rastreio/recibo), o `link` (perfil/post/vídeo alvo) e a `quantity`.\n" +
      "3. Pergunte o método de pagamento (`method`): mercadopago oferece PIX + cartão + boleto; " +
      "stripe cartão; crypto/paypal/paytm conforme habilitados no painel.\n" +
      "4. Chame esta tool. Ela devolve `{ orderId, guestToken, url, amount, currency }`. " +
      "ENTREGUE a `url` ao usuário e diga para abrir e concluir o pagamento — o pedido só é enviado " +
      "ao fornecedor APÓS o pagamento confirmar. GUARDE `orderId` + `guestToken` para acompanhar via " +
      "socialgo_guest_order_status. Nenhuma cobrança sai de saldo de conta aqui; o usuário paga direto no checkout.",
    {
      email: z
        .string()
        .email()
        .describe("E-mail do comprador. Usado para achar/criar um usuário guest e para rastrear o pedido."),
      serviceId: z
        .string()
        .describe("Id do serviço a comprar (obtido em socialgo_services)."),
      link: z
        .string()
        .min(1)
        .describe("Link/alvo do pedido (perfil, post, vídeo, etc)."),
      quantity: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Quantidade desejada, dentro de min/max do serviço. Para tipos com lista (comments/usernames) é derivada das linhas em metadata."),
      method: z
        .enum(["stripe", "mercadopago", "crypto", "paypal", "paytm"])
        .describe("Método de pagamento. 'mercadopago' = PIX + cartão + boleto; 'stripe' = cartão; 'crypto'/'paypal'/'paytm' conforme habilitados. Só métodos ativos no painel funcionam."),
      metadata: z
        .record(z.unknown())
        .optional()
        .describe("Campos extras por tipo de serviço (comments, usernames, hashtags, hashtag, username, media, answer_number, runs, interval). Informe só os relevantes ao tipo do serviço."),
    },
    async ({ email, serviceId, link, quantity, method, metadata }) => {
      try {
        return ok(
          await guest("POST", "/guest/order", {
            email,
            serviceId,
            link,
            quantity,
            method,
            metadata,
          }),
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ──────────────────── 11) socialgo_guest_order_status ─────────────────────── */
  // Rastreio público de um pedido guest. Valida a posse por `token` (guestToken
  // devolvido por socialgo_guest_order) OU pelo `email` do comprador. Devolve só
  // campos seguros do próprio pedido — nunca PII de terceiros.
  server.tool(
    "socialgo_guest_order_status",
    "Consulta o status de um pedido guest (criado por socialgo_guest_order), sem precisar de conta. " +
      "Passe o `id` do pedido (orderId) e prove a posse com `token` (o guestToken retornado na criação — " +
      "caminho preferido) OU com o `email` usado na compra. Retorna { id, status, serviceName, link, " +
      "quantity, charge, startCount, remains, createdAt }. Use para dizer ao usuário se o pagamento já " +
      "confirmou e o pedido começou a ser entregue (status 'awaiting_payment' = ainda não pago).",
    {
      id: z.string().describe("Id do pedido guest (orderId retornado por socialgo_guest_order)."),
      token: z
        .string()
        .optional()
        .describe("guestToken retornado na criação do pedido (forma preferida de provar a posse)."),
      email: z
        .string()
        .email()
        .optional()
        .describe("E-mail usado na compra (alternativa ao token para provar a posse)."),
    },
    async ({ id, token, email }) => {
      try {
        if (!token && !email) {
          return fail(new Error("Informe `token` (guestToken) ou `email` para rastrear o pedido."));
        }
        const qs = new URLSearchParams();
        if (token) qs.set("token", token);
        else if (email) qs.set("email", email);
        return ok(
          await guest("GET", `/guest/order/${encodeURIComponent(id)}?${qs.toString()}`),
        );
      } catch (err) {
        return fail(err);
      }
    },
  );
}
