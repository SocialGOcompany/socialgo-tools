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
 *   - wallet (ext.)  → socialgo_wallet
 *   - add_funds      → socialgo_add_funds
 *   - mass_order     → socialgo_mass_order
 *   - subscription_create → socialgo_create_subscription
 *   - subscriptions  → socialgo_subscriptions
 *   - coupon_validate → socialgo_validate_coupon
 *   - affiliate_stats → socialgo_affiliate_stats
 *   - loyalty_status → socialgo_loyalty_status
 *   - recommend      → socialgo_recommend
 *   - campaign_build → socialgo_build_campaign
 *   - storefront     → socialgo_storefront
 *
 * Cada tool dispara o `action` correspondente do protocolo SMM v2 — o MESMO que o
 * `@socialgo/sdk` (SmmV2Client) expõe método a método (massOrder, subscriptionCreate,
 * couponValidate, affiliateStats, loyaltyStatus, recommend, campaignBuild, storefront…).
 * Todas as extensões são ESCOPADAS ao userId da `key` (dados do PRÓPRIO usuário).
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

// ── Gateways de pagamento ativos (fonte da verdade do guest checkout) ─────────

/**
 * Gateway ATIVO devolvido por `GET /gateways/active`. O painel já normaliza
 * para `{ gateway, label, kind, coins, notice }` (campos NÃO-secretos). O valor
 * enviado de volta no checkout (`method`) é `gateway`.
 */
interface ActiveGateway {
  gateway: string;
  label: string;
  kind: string;
  coins: string[];
  notice?: string;
}

/**
 * Fallback mínimo e seguro de métodos de guest checkout. Usado SÓ quando
 * `GET /gateways/active` falha (rede/painel fora) — não é a fonte da verdade,
 * é só um piso para a tool não travar. A lista REAL vem sempre do painel.
 */
const FALLBACK_GUEST_METHODS: readonly string[] = ["mercadopago", "stripe", "crypto"];

/**
 * Consulta os gateways REALMENTE ativos no painel (`GET /gateways/active`).
 * É a fonte da verdade dos métodos de guest checkout — o seletor deve oferecer
 * só estes `gateway`, nunca uma lista fixa. Não lança: em falha, devolve [].
 */
async function fetchActiveGateways(): Promise<ActiveGateway[]> {
  try {
    const res = await guest<{ gateways?: ActiveGateway[] }>("GET", "/gateways/active");
    return Array.isArray(res?.gateways) ? res.gateways : [];
  } catch {
    return [];
  }
}

/**
 * Nomes (`gateway`) dos métodos de pagamento válidos. Cai no fallback mínimo
 * seguro só se o painel não responder/estiver sem gateways ativos.
 */
async function activeGatewayMethods(): Promise<string[]> {
  const gateways = await fetchActiveGateways();
  const methods = gateways.map((g) => g.gateway).filter(Boolean);
  return methods.length > 0 ? methods : [...FALLBACK_GUEST_METHODS];
}

/**
 * Monta uma frase humana descrevendo os métodos ativos (para a descrição da
 * tool de compra). Ex.: "mercadopago (PIX + cartão + boleto), stripe (Cartão)".
 */
function describeActiveGateways(gateways: ActiveGateway[]): string {
  if (gateways.length === 0) {
    return `(painel não respondeu /gateways/active — fallback: ${FALLBACK_GUEST_METHODS.join(", ")})`;
  }
  return gateways
    .map((g) => {
      const extra = g.coins?.length ? ` — moedas: ${g.coins.slice(0, 6).join(", ")}` : "";
      return `${g.gateway} (${g.label}${extra})`;
    })
    .join("; ");
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

export async function registerTools(server: McpServer): Promise<void> {
  // Snapshot dos gateways ativos no boot, só para DESCREVER dinamicamente a tool
  // de compra (a descrição é montada uma vez no registro). A VALIDAÇÃO em runtime
  // reconsulta o painel a cada chamada — então mesmo que isto fique velho, a
  // compra usa sempre a lista fresca. Best-effort: não trava o boot se falhar.
  const bootGateways = await fetchActiveGateways();
  const bootMethodsLabel = describeActiveGateways(bootGateways);

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
      "3. Escolha o método de pagamento (`method`). Os métodos REALMENTE ativos no painel agora são: " +
      bootMethodsLabel +
      ". NÃO afirme que aceita métodos fora dessa lista — chame socialgo_guest_gateways para a lista fresca " +
      "e ofereça SÓ esses ao usuário.\n" +
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
        .string()
        .optional()
        .describe(
          "Gateway de pagamento ATIVO no painel (campo `gateway` de socialgo_guest_gateways / GET /gateways/active). " +
            "NÃO é uma lista fixa — use só os ativos. Se omitido, usa o 1º gateway ativo do painel.",
        ),
      metadata: z
        .record(z.unknown())
        .optional()
        .describe("Campos extras por tipo de serviço (comments, usernames, hashtags, hashtag, username, media, answer_number, runs, interval). Informe só os relevantes ao tipo do serviço."),
    },
    async ({ email, serviceId, link, quantity, method, metadata }) => {
      try {
        // Fonte da verdade dos métodos: gateways ATIVOS do painel (reconsultado
        // a cada compra). Sem `method` → usa o 1º ativo. Valida contra a lista
        // fresca; só cai em fallback mínimo se o painel não responder.
        const validMethods = await activeGatewayMethods();
        const chosen = method ?? validMethods[0];
        if (!chosen) {
          return fail(new Error("Nenhum método de pagamento ativo no painel no momento."));
        }
        if (!validMethods.includes(chosen)) {
          return fail(
            new Error(
              `Método "${chosen}" não está ativo no painel. Métodos ativos: ${validMethods.join(", ")}. ` +
                `Use socialgo_guest_gateways para conferir e ofereça só esses.`,
            ),
          );
        }
        return ok(
          await guest("POST", "/guest/order", {
            email,
            serviceId,
            link,
            quantity,
            method: chosen,
            metadata,
          }),
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ─────────────────── 10b) socialgo_guest_gateways ────────────────────────── */
  // Lista os métodos de pagamento REALMENTE ativos no painel (GET /gateways/active).
  // É o que o modelo deve consultar para oferecer SÓ os métodos válidos no guest
  // checkout — nunca uma lista fixa. Não usa API key (rota pública).
  server.tool(
    "socialgo_guest_gateways",
    "Lista os métodos de pagamento ATUALMENTE ativos no painel para o guest checkout (pay-per-order). " +
      "Retorna `{ gateways: [{ gateway, label, kind, coins, notice }] }`, onde `gateway` é o valor a passar " +
      "como `method` em socialgo_guest_order. Consulte ANTES de oferecer formas de pagamento: ofereça SÓ os " +
      "métodos retornados aqui — não afirme aceitar gateways que não estão na lista. Sem conta/sem API key.",
    {},
    async () => {
      try {
        const gateways = await fetchActiveGateways();
        if (gateways.length === 0) {
          return ok({
            gateways: [],
            note:
              "Painel não respondeu /gateways/active. Fallback mínimo seguro: " +
              FALLBACK_GUEST_METHODS.join(", "),
          });
        }
        return ok({ gateways });
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

  /* ───────────────────────── 12) socialgo_wallet ──────────────────────────── */
  // Saldo + extrato recente da carteira do PRÓPRIO usuário (action=wallet).
  server.tool(
    "socialgo_wallet",
    "Returns the account wallet for the current API user: current `balance` + `currency` plus the most " +
      "recent ledger `transactions` ({ id, type, amount, balanceAfter, description, createdAt }). " +
      "Use this for a richer view than socialgo_balance (which is balance-only) — e.g. to explain recent " +
      "deposits/charges. Scoped to the userId of the API key.",
    {},
    async () => {
      try {
        return ok(await smm("wallet"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────────────── 13) socialgo_add_funds ───────────────────────── */
  // Cria um pagamento PENDENTE para recarregar a carteira (action=add_funds).
  // Não credita saldo direto — devolve o pagamento a concluir no painel.
  server.tool(
    "socialgo_add_funds",
    "Creates a PENDING payment to top up the current user's wallet and returns the payment to be completed " +
      "in the panel ({ payment, status, amount, currency, method, message }). This does NOT add balance " +
      "immediately — funds only land after the payment confirms. Use socialgo_guest_gateways to confirm which " +
      "payment methods are currently active before choosing one. Scoped to the userId of the API key.",
    {
      amount: z
        .number()
        .positive()
        .describe("Amount to add to the wallet, in the account currency."),
      method: z
        .enum([
          "mercadopago",
          "stripe",
          "crypto",
          "manual",
          "paypal",
          "paytm",
          "cryptomus",
          "cardinity",
          "binance_pay",
        ])
        .describe("Payment gateway to use. Prefer one returned active by socialgo_guest_gateways."),
    },
    async ({ amount, method }) => {
      try {
        return ok(await smm("add_funds", { amount, method }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────────────── 14) socialgo_mass_order ──────────────────────── */
  // Vários pedidos numa única chamada (action=mass_order). Cada linha é
  // independente — uma falha não derruba as demais. Transporte CSV
  // `service|link|quantity` (uma linha por pedido), como o SDK serializa.
  server.tool(
    "socialgo_mass_order",
    "Places SEVERAL orders in a single call. Pass `orders` as a list of { service, link, quantity }. " +
      "Each line is independent — a failing line does NOT cancel the others. " +
      "Returns { orders: [{ line, order }], errors: [{ line, reason }] }. " +
      "Use socialgo_services first to resolve each `service` id. Charges are debited from the account balance. " +
      "Scoped to the userId of the API key.",
    {
      orders: z
        .array(
          z.object({
            service: z
              .union([z.number(), z.string()])
              .describe("Service id (from socialgo_services)."),
            link: z.string().min(1).describe("Target link (profile, post, video, etc)."),
            quantity: z
              .number()
              .int()
              .positive()
              .describe("Desired quantity, within the service min/max."),
          }),
        )
        .min(1)
        .describe("List of orders to create in one batch."),
    },
    async ({ orders }) => {
      try {
        // Serializa para o CSV `service|link|quantity` que o protocolo aceita
        // (transporte form-urlencoded). O servidor faz o parse linha a linha.
        const csv = orders.map((o) => `${o.service}|${o.link}|${o.quantity}`).join("\n");
        return ok(await smm("mass_order", { orders: csv }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 15) socialgo_create_subscription ──────────────────────── */
  // Assinatura recorrente do PRÓPRIO usuário (action=subscription_create).
  server.tool(
    "socialgo_create_subscription",
    "Creates a RECURRING subscription for the current user (auto re-orders a service on a fixed cadence). " +
      "Pass `service`, `link`, `quantity` per run, total `runs`, and `interval` in MINUTES between runs. " +
      "Returns { subscription, status, runs, remaining_runs, interval, next_run }. " +
      "Differs from drip-feed (a single fractioned order): a subscription is an ongoing schedule. " +
      "Use socialgo_subscriptions to list existing ones. Scoped to the userId of the API key.",
    {
      service: z
        .union([z.number(), z.string()])
        .describe("Service id (from socialgo_services)."),
      link: z.string().min(1).describe("Target link (profile, post, video, etc)."),
      quantity: z
        .number()
        .int()
        .positive()
        .describe("Quantity ordered on EACH run, within the service min/max."),
      runs: z.number().int().positive().describe("Total number of recurring runs."),
      interval: z
        .number()
        .int()
        .positive()
        .describe("Interval in MINUTES between each run."),
    },
    async ({ service, link, quantity, runs, interval }) => {
      try {
        return ok(await smm("subscription_create", { service, link, quantity, runs, interval }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────────────── 16) socialgo_subscriptions ───────────────────── */
  server.tool(
    "socialgo_subscriptions",
    "Lists the current user's recurring subscriptions ({ subscription, service, link, status, quantity, " +
      "runs, remaining_runs, interval, next_run, created_at }). " +
      "Use to review active/finished subscriptions created via socialgo_create_subscription. " +
      "Scoped to the userId of the API key.",
    {},
    async () => {
      try {
        return ok(await smm("subscriptions"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────────────── 17) socialgo_validate_coupon ─────────────────── */
  // Apenas valida/preview — NÃO resgata o cupom (action=coupon_validate).
  server.tool(
    "socialgo_validate_coupon",
    "Validates / previews a coupon code WITHOUT redeeming it. " +
      "Returns { valid, reason?, code?, kind?, value?, minAmount?, expiresAt? } — `kind` is 'deposit_bonus' " +
      "(percentage) or 'wallet_credit' (fixed credit). When `valid` is false, `reason` explains why. " +
      "This is read-only: it never applies the coupon, only checks it.",
    {
      code: z.string().min(1).describe("Coupon code to validate (case-insensitive)."),
    },
    async ({ code }) => {
      try {
        return ok(await smm("coupon_validate", { code }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────────────── 18) socialgo_affiliate_stats ─────────────────── */
  server.tool(
    "socialgo_affiliate_stats",
    "Returns the current user's OWN affiliate stats and referral link: { referral_code, referral_link, " +
      "affiliate_balance, enabled, commission_percent, level2_percent, minimum_payout, referrals_count, " +
      "level2_count, total_earned, earned_l1, earned_l2 }. " +
      "Scoped to the userId of the API key — never exposes other users' data.",
    {},
    async () => {
      try {
        return ok(await smm("affiliate_stats"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────────────── 19) socialgo_loyalty_status ──────────────────── */
  server.tool(
    "socialgo_loyalty_status",
    "Returns the current user's loyalty status: { tier, label, next_threshold, progress_pct, points_balance, " +
      "lifetime_spent, currency }. Use to tell the user their tier and how close they are to the next one. " +
      "Scoped to the userId of the API key.",
    {},
    async () => {
      try {
        return ok(await smm("loyalty_status"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────────────── 20) socialgo_recommend ───────────────────────── */
  // Recomendações por serviço-âncora e/ou plataforma (action=recommend).
  server.tool(
    "socialgo_recommend",
    "Recommends related services given an anchor `service` id and/or a `platform`. " +
      "Returns a ranked list of { service, name, category, platform, rate, min, max, refill, reason } where " +
      "`reason` is 'bought_together' | 'same_platform' | 'popular'. " +
      "Use to suggest cross-sells/next steps after a user shows interest in a service or platform.",
    {
      service: z
        .union([z.number(), z.string()])
        .optional()
        .describe("Anchor service id to recommend around (from socialgo_services)."),
      platform: z
        .string()
        .optional()
        .describe("Platform to recommend for, e.g. 'Instagram', 'TikTok', 'YouTube'."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max recommendations to return (1-50)."),
    },
    async ({ service, platform, limit }) => {
      try {
        return ok(await smm("recommend", { service, platform, limit }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────────────── 21) socialgo_build_campaign ──────────────────── */
  // Devolve um PLANO de campanha — NÃO cria pedido sozinho (action=campaign_build).
  server.tool(
    "socialgo_build_campaign",
    "Builds a campaign PLAN from a budget, a goal and a delivery window — it does NOT place any order, it only " +
      "returns the proposed plan for review. " +
      "Provide `budget` and `days`, plus a target via `service` id OR `platform` (+ optional `boost_type`) and " +
      "optional `link`. Returns { feasible, reason?, service?, totalQuantity?, totalCost?, runs?, " +
      "intervalMinutes?, schedule?, params }. After reviewing, the user can execute it via socialgo_place_order " +
      "(drip-feed using runs+interval) or socialgo_create_subscription.",
    {
      budget: z
        .number()
        .positive()
        .describe("Total budget for the campaign, in the account currency."),
      days: z
        .number()
        .int()
        .positive()
        .describe("Delivery window in DAYS for gradual rollout."),
      service: z
        .union([z.number(), z.string()])
        .optional()
        .describe("Target service id (from socialgo_services). Provide this OR `platform`."),
      platform: z
        .string()
        .optional()
        .describe("Target platform, e.g. 'Instagram', 'TikTok'. Used when no `service` id is given."),
      boost_type: z
        .string()
        .optional()
        .describe("Optional boost type to bias service selection, e.g. 'followers', 'likes', 'views'."),
      link: z
        .string()
        .optional()
        .describe("Optional target link (profile/post/video) the plan should boost."),
    },
    async ({ budget, days, service, platform, boost_type, link }) => {
      try {
        return ok(await smm("campaign_build", { budget, days, service, platform, boost_type, link }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────────────── 22) socialgo_storefront ──────────────────────── */
  // Resolve uma loja pública pelo slug → pacotes (action=storefront).
  server.tool(
    "socialgo_storefront",
    "Resolves a public storefront by its `slug` and returns the store with its packages: " +
      "{ slug, title, description, theme, locale, packages: [{ id, title, description, quantity, price, " +
      "serviceName }] }. The displayed package `price` is a reference — the charged amount is recomputed " +
      "server-side. Use to show a public store's offered packages to a user.",
    {
      slug: z.string().min(1).describe("Public storefront slug to resolve."),
    },
    async ({ slug }) => {
      try {
        return ok(await smm("storefront", { slug }));
      } catch (err) {
        return fail(err);
      }
    },
  );
}
