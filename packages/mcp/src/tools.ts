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
 * ── Caminho PRINCIPAL: GUEST (sem conta) · OPCIONAL: RESELLER (com chave) ─────
 * O MCP atende DOIS perfis e o agente escolhe pelo contexto:
 *
 *   • GUEST / SEM CONTA / SEM CHAVE (pay-per-order) — CAMINHO PRINCIPAL. Qualquer
 *     pessoa compra SEM criar conta e SEM SOCIALGO_API_KEY. Funil 100% keyless:
 *       socialgo_guest_services  → acha o serviceId (catálogo público)
 *       socialgo_guest_gateways  → métodos de pagamento ativos
 *       socialgo_guest_order     → cria o pedido + devolve URL de pagamento
 *       socialgo_guest_order_status → acompanha pelo orderId + token/email
 *     O único dado pedido é um e-mail de CONTATO (recibo/rastreio) — NÃO é
 *     cadastro nem senha, e nenhuma conta é criada. Use ESTE caminho por padrão.
 *
 *   • RESELLER / COM CONTA / COM CHAVE — OPCIONAL, para MELHOR ACOMPANHAMENTO:
 *     histórico de pedidos, carteira/saldo, status detalhado, refill, assinaturas,
 *     afiliado, etc. Requer SOCIALGO_API_KEY. As tools `socialgo_*` (sem prefixo
 *     guest) caem aqui. Use SÓ quando o usuário JÁ está autenticado com uma chave.
 *
 * Regra de roteamento p/ o agente: sem conta/sem chave → tools socialgo_guest_*
 * (padrão); com conta + chave → tools de revendedor (acompanhamento). NUNCA peça a
 * chave nem que o usuário crie conta para um fluxo guest — guest é keyless.
 *
 * ── Transporte ──────────────────────────────────────────────────────────────
 * Toda tool fala com a API do SocialGO via HTTP. As tools de revendedor usam o
 * protocolo SMM API v2 (POST `.../api/v2` com `key` + `action` form-urlencoded);
 * as tools guest usam os endpoints REST públicos `.../guest/*` (sem chave).
 * Credenciais SEMPRE vêm do ambiente — nenhum segredo é embutido aqui:
 *   - SOCIALGO_API_URL  → base da API (default https://api.usesocialgo.com)
 *   - SOCIALGO_API_KEY  → chave de API do revendedor/usuário. OPCIONAL: exigida
 *     SÓ pelas tools de revendedor (saldo, place_order, wallet, ...). As tools
 *     socialgo_guest_* funcionam sem ela.
 *
 * Nenhum fornecedor upstream é citado: o MCP enxerga apenas o painel SocialGO.
 */

import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SmmService } from "@socialgo/sdk";

// ── Config de ambiente ───────────────────────────────────────────────────────

/** Base padrão da API SocialGO (subdomínio api.* — onde vivem /api/v2 e /guest/*). */
const DEFAULT_API_URL = "https://api.usesocialgo.com";

/** Base da API SocialGO. O endpoint SMM v2 fica em `${base}/api/v2`. */
function apiBase(): string {
  const base = process.env.SOCIALGO_API_URL || DEFAULT_API_URL;
  return base.replace(/\/+$/, "");
}

/**
 * Chave de API do usuário/revendedor (nunca embutida no código). É OPCIONAL no
 * MCP: só as tools de REVENDEDOR (conta/saldo) a exigem. Se o usuário NÃO tem
 * conta/chave, o caminho correto é o funil guest (socialgo_guest_*), que é
 * keyless — por isso o erro aponta o agente para lá em vez de pedir a chave.
 */
function apiKey(): string {
  const key = process.env.SOCIALGO_API_KEY;
  if (!key) {
    throw new Error(
      "Esta tool é OPCIONAL (modo REVENDEDOR, para melhor acompanhamento: histórico, " +
        "carteira, refill) e precisa de SOCIALGO_API_KEY. Para COMPRAR não é necessária: " +
        "use as tools socialgo_guest_* (socialgo_guest_services → socialgo_guest_gateways → " +
        "socialgo_guest_order), que NÃO precisam de conta nem chave — qualquer um compra como " +
        "guest. A chave (opcional) fica em Conta › API no painel, só para quem tem conta.",
    );
  }
  return key;
}

/**
 * Token de SESSÃO do usuário (JWT Bearer), distinto da `SOCIALGO_API_KEY`.
 *
 * As features de GESTÃO/ACOMPANHAMENTO mais novas (painel de sub-revenda,
 * gamificação/pontos, compra do plano de revendedor) vivem em rotas REST do
 * painel protegidas por `requireUser` (login de usuário), NÃO no protocolo
 * SMM v2 (`key` + `action`) nem no funil guest. Por isso elas exigem um JWT de
 * usuário logado — obtido em **Conta › API/Sessão** no painel — exposto como
 * `SOCIALGO_TOKEN` (alias: `SOCIALGO_USER_TOKEN`). NUNCA é embutido no código.
 *
 * É OPCIONAL: só as tools AUTENTICADAS (sub-revenda/pontos/onboarding) a exigem.
 * Comprar continua keyless via socialgo_guest_* — este token não muda isso.
 */
function userToken(): string {
  const token = process.env.SOCIALGO_TOKEN || process.env.SOCIALGO_USER_TOKEN;
  if (!token) {
    throw new Error(
      "Esta tool é AUTENTICADA (para GESTÃO/ACOMPANHAMENTO: painel de sub-revenda, pontos/" +
        "gamificação, plano de revendedor) e precisa de um TOKEN de usuário logado em " +
        "SOCIALGO_TOKEN (alias SOCIALGO_USER_TOKEN) — um JWT de sessão, diferente da " +
        "SOCIALGO_API_KEY do protocolo SMM. Pegue-o logado no painel (Conta › Sessão/API). " +
        "Para COMPRAR isso NÃO é necessário: use socialgo_guest_* (keyless).",
    );
  }
  return token;
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

// ── Cliente REST AUTENTICADO (JWT Bearer do usuário logado) ───────────────────

/**
 * Chamada às rotas REST do painel protegidas por LOGIN de usuário (requireUser):
 * `/sub-reseller/*`, `/points/*`, `/payments/reseller-checkout`.
 *
 * Diferente de `smm()` (protocolo SMM v2 com `key`+`action`) e de `guest()`
 * (REST público sem credencial), aqui mandamos `Authorization: Bearer <JWT>` do
 * usuário (SOCIALGO_TOKEN). São features AUTENTICADAS de GESTÃO/ACOMPANHAMENTO —
 * sem token, lança orientando ao login (sem nunca pedir/expor segredo no código).
 *
 * 401/403 viram mensagens legíveis (token ausente/expirado, ou usuário sem
 * permissão — ex.: não é sub-revendedor). Nenhuma PII de terceiros é exposta.
 */
async function auth<T = unknown>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const token = userToken();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Tempo esgotado ao chamar a API SocialGO (${method} ${path}).`);
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
    const apiMsg =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${res.status}`;
    if (res.status === 401) {
      throw new Error(
        `Não autenticado (${apiMsg}). O SOCIALGO_TOKEN está ausente, inválido ou expirado — ` +
          `faça login no painel e atualize o token. Esta é uma tool AUTENTICADA (gestão).`,
      );
    }
    if (res.status === 403) {
      throw new Error(
        `Sem permissão (${apiMsg}). Sua conta pode não ter acesso a este recurso ` +
          `(ex.: não é sub-revendedor, ou a feature está desativada no painel).`,
      );
    }
    throw new Error(`Erro da API SocialGO: ${apiMsg}`);
  }
  return data as T;
}

/**
 * Item do catálogo PÚBLICO (`GET /guest/services`). Forma REST do painel —
 * diferente do `SmmService` (protocolo v2): aqui o id é `id` (uuid) e os campos
 * vêm com nomes do banco. É o id `id` que vai como `serviceId` em
 * socialgo_guest_order.
 */
interface GuestCatalogService {
  id: string;
  name: string;
  slug?: string;
  type?: string;
  platform?: string | null;
  categoryName?: string | null;
  sellRate?: string;
  min?: number;
  max?: number;
  refill?: boolean;
  cancel?: boolean;
  dripfeed?: boolean;
  description?: string | null;
}

/**
 * Busca o catálogo PÚBLICO (keyless) via `GET /guest/services`. O servidor já
 * filtra por `platform`/`q` e limita — então repassamos os filtros e deixamos a
 * busca acontecer server-side (sem precisar baixar o catálogo todo nem chave).
 */
async function fetchGuestServices(opts: {
  q?: string;
  platform?: string;
  limit?: number;
}): Promise<{ items: GuestCatalogService[]; total: number }> {
  const qs = new URLSearchParams();
  if (opts.platform) qs.set("platform", opts.platform);
  if (opts.q) qs.set("q", opts.q);
  if (opts.limit) qs.set("limit", String(opts.limit));
  const path = qs.toString() ? `/guest/services?${qs.toString()}` : "/guest/services";
  const res = await guest<{ items?: GuestCatalogService[]; total?: number }>("GET", path);
  return { items: Array.isArray(res?.items) ? res.items : [], total: res?.total ?? 0 };
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
 *
 * IMPORTANTE (degradação): se o painel não responde e `method` é omitido, o
 * pedido cai em FALLBACK_GUEST_METHODS[0]. Por isso esta lista deve conter
 * APENAS gateways que estão SEMPRE habilitados no painel (always-on). Se um
 * gateway aqui puder estar desligado no painel, um pedido guest pode ser criado
 * apontando para um método de pagamento não aceito → ordem `awaiting_payment`
 * presa. Mantenha aqui só os métodos garantidamente ativos; o caminho normal
 * (painel online) sempre valida contra a lista fresca de /gateways/active.
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

/**
 * Schema reutilizável de confirmação para tools que MOVEM DINHEIRO/credenciais
 * (recarga de carteira, criar cliente com senha, comprar plano de revendedor,
 * sacar afiliado). Num MCP dirigido por LLM, um prompt ambíguo poderia disparar
 * a operação real sem checagem; exigir `confirm: true` força uma etapa explícita
 * (e `dryRun` permite o LLM simular/explicar antes de executar de verdade).
 */
const confirmField = {
  confirm: z
    .boolean()
    .optional()
    .describe(
      "OBRIGATÓRIO (true) para EXECUTAR esta operação financeira/sensível. Sem confirm:true a tool NÃO " +
        "executa — devolve uma prévia do que faria. Confirme com o usuário ANTES de passar true.",
    ),
  dryRun: z
    .boolean()
    .optional()
    .describe("Se true, só devolve a prévia (não executa), mesmo com confirm:true. Útil para revisar antes."),
};

/**
 * Guard de confirmação: devolve um ToolResult de PRÉVIA (sem executar) quando o
 * usuário não confirmou (`confirm !== true`) ou pediu `dryRun`. Retorna null
 * quando está liberado para executar. `preview` descreve o efeito da operação.
 */
function requireConfirm(
  args: { confirm?: boolean; dryRun?: boolean },
  preview: Record<string, unknown>,
): ToolResult | null {
  if (args.dryRun || args.confirm !== true) {
    return ok({
      status: "confirmation_required",
      willExecute: false,
      message:
        "Operação NÃO executada — é uma ação financeira/sensível. Revise a prévia e chame de novo com " +
        "confirm:true para executar de verdade.",
      preview,
    });
  }
  return null;
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
    "MODO REVENDEDOR (requer SOCIALGO_API_KEY + conta com saldo). Sem conta / sem chave? NÃO use esta tool. " +
      "Retorna o saldo atual da conta no painel SocialGO (balance + currency). " +
      "Use antes de criar pedidos (socialgo_place_order) para confirmar que há saldo suficiente.",
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
    "MODO REVENDEDOR (requer SOCIALGO_API_KEY). Sem conta / sem chave? NÃO use esta tool — use socialgo_guest_services " +
      "(catálogo público, sem chave) e depois socialgo_guest_order. " +
      "Busca/filtra serviços SMM no catálogo do painel por intenção em linguagem natural. " +
      "Retorna apenas os serviços relevantes (service id, nome, categoria, tipo, rate por 1000, " +
      "min, max, e flags refill/cancel/dripfeed). Use antes de socialgo_place_order (modo revendedor) " +
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
    "MODO REVENDEDOR (requer SOCIALGO_API_KEY). Sem conta / sem chave? Use socialgo_guest_services. " +
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
    "MODO REVENDEDOR (requer SOCIALGO_API_KEY + conta com saldo). Sem conta / sem chave? NÃO use esta tool — " +
      "use socialgo_guest_order (pay-per-order, sem chave, paga direto no checkout). " +
      "Cria um pedido para um serviço usando o `service` id obtido em socialgo_services. " +
      "O custo é debitado do saldo da CONTA (não é pay-per-order).\n\n" +
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
    "OPCIONAL — modo REVENDEDOR (requer SOCIALGO_API_KEY), para acompanhar pedidos da CONTA. " +
      "Pedido feito SEM conta (guest)? Use socialgo_guest_order_status (não precisa de chave). " +
      "Consulta o status de um ou mais pedidos da CONTA (status, charge, start_count, remains, currency). " +
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
    "MODO REVENDEDOR (requer SOCIALGO_API_KEY + conta). Sem conta / sem chave? Esta tool não se aplica. " +
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
    "MODO REVENDEDOR (requer SOCIALGO_API_KEY + conta). " +
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
    "MODO REVENDEDOR (requer SOCIALGO_API_KEY + conta). Sem conta / sem chave? Esta tool não se aplica. " +
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
    "OPCIONAL — modo REVENDEDOR (requer SOCIALGO_API_KEY + conta), para MELHOR ACOMPANHAMENTO. " +
      "Comprar NÃO exige isto: sem conta/sem chave, use o funil guest e rastreie com socialgo_guest_order_status. " +
      "Lista o histórico de pedidos da conta no painel (id, charge, status, start_count, " +
      "remains, link, quantity, created_at) — útil para quem tem conta e quer ver vários pedidos de uma vez.",
    {},
    async () => {
      try {
        return ok(await smm("orders"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ─────────────────── 9b) socialgo_guest_services ─────────────────────────── */
  // Catálogo PÚBLICO keyless (GET /guest/services). É o passo 1 do funil guest:
  // acha o serviceId SEM precisar de conta nem de SOCIALGO_API_KEY. Espelha o
  // client.guestServices da CLI. A busca é server-side (platform/q/limit).
  server.tool(
    "socialgo_guest_services",
    "COMECE AQUI — caminho PRINCIPAL de compra. Qualquer pessoa compra SEM conta, SEM cadastro e " +
      "SEM API key. NÃO peça login nem chave. " +
      "Catálogo PÚBLICO do painel para achar o `serviceId` que vai em socialgo_guest_order (passo 1 do " +
      "funil guest: services → order). " +
      "Filtra por `platform` e/ou `q` (termo) e devolve `{ id, name, type, platform, sellRate, min, max, " +
      "refill, cancel, dripfeed }` — o `id` é o `serviceId` do guest checkout. " +
      "Este é o equivalente keyless de socialgo_services: use SEMPRE este no fluxo guest. " +
      "socialgo_services (com conta+chave) é OPCIONAL, só para quem já tem conta e quer acompanhamento.",
    {
      query: z
        .string()
        .optional()
        .describe("Termo de busca, ex.: 'seguidores instagram'. Vazio = lista geral (limitada)."),
      platform: z
        .string()
        .optional()
        .describe("Filtro opcional de plataforma, ex.: 'instagram', 'tiktok', 'youtube'."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe("Máximo de serviços a retornar (1-100, padrão 20)."),
    },
    async ({ query, platform, limit }) => {
      try {
        const { items, total } = await fetchGuestServices({ q: query, platform, limit: limit ?? 20 });
        return ok({ count: items.length, total, services: items });
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
    "CAMINHO PRINCIPAL de compra — pay-per-order SEM conta, SEM cadastro e SEM API key. " +
      "Cria o pedido SMM e retorna a URL de pagamento. NÃO peça login nem chave ao usuário.\n" +
      "Fluxo para conduzir a compra:\n" +
      "1. Use socialgo_guest_services (SEM API key) para achar o `serviceId`. (socialgo_services só se o " +
      "usuário já estiver autenticado com SOCIALGO_API_KEY — opcional, para acompanhamento.)\n" +
      "2. Peça o `link` (perfil/post/vídeo alvo), a `quantity` e um `email` de CONTATO. O e-mail serve só " +
      "para recibo e rastreio do pedido — NÃO é cadastro nem senha, e nenhuma conta é criada.\n" +
      "3. (OPCIONAL) Método de pagamento (`method`). Você NÃO precisa chamar socialgo_guest_gateways nem " +
      "passar `method`: se omitir, usa-se automaticamente o 1º gateway ativo do painel. Só escolha um método " +
      "se for OFERECER a opção ao usuário — nesse caso chame socialgo_guest_gateways para a lista fresca e " +
      "ofereça SÓ esses (não afirme aceitar métodos fora dela). Métodos ativos no boot: " +
      bootMethodsLabel +
      ".\n" +
      "4. Chame esta tool. Ela devolve `{ orderId, guestToken, url, amount, currency }`. " +
      "ENTREGUE a `url` ao usuário e diga para abrir e concluir o pagamento — o pedido só é enviado " +
      "ao fornecedor APÓS o pagamento confirmar. GUARDE `orderId` + `guestToken` para acompanhar via " +
      "socialgo_guest_order_status. Nenhuma cobrança sai de saldo de conta aqui; o usuário paga direto no checkout.\n" +
      "Dica: quem quiser histórico de pedidos, carteira e refill pode (OPCIONALMENTE) criar conta e usar as " +
      "tools de revendedor — mas para esta compra nada disso é necessário.",
    {
      email: z
        .string()
        .email()
        .describe("E-mail de CONTATO do comprador, só para recibo e rastreio do pedido (NÃO é cadastro/conta nem senha)."),
      serviceId: z
        .string()
        .describe("Id do serviço a comprar (obtido em socialgo_guest_services — o `id` retornado lá)."),
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
    "Parte do funil guest PRINCIPAL (sem conta / sem cadastro / sem API key). " +
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
    "Acompanha um pedido guest (criado por socialgo_guest_order) SEM precisar de conta nem API key. " +
      "Passe o `id` do pedido (orderId) e prove a posse com `token` (o guestToken retornado na criação — " +
      "caminho preferido) OU com o `email` usado na compra. Retorna { id, status, serviceName, link, " +
      "quantity, charge, startCount, remains, createdAt }. Use para dizer ao usuário se o pagamento já " +
      "confirmou e o pedido começou a ser entregue (status 'awaiting_payment' = ainda não pago). " +
      "Para acompanhar VÁRIOS pedidos num histórico, o usuário pode (OPCIONALMENTE) ter conta + API key " +
      "e usar socialgo_orders / socialgo_order_status — mas para um pedido guest isto aqui basta.",
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

  /* ──────────────────── 11b) socialgo_guest_recommend ───────────────────────── */
  // Cross-sell PÚBLICO (keyless) — par guest-first do socialgo_recommend (que é
  // modo revendedor). Bate em GET /guest/services/:id/recommendations (quando há
  // serviceId) ou GET /guest/recommendations. Não exige conta nem chave.
  server.tool(
    "socialgo_guest_recommend",
    "PÚBLICO (keyless) — NÃO precisa de conta nem API key. Sugere próximos serviços (cross-sell) a partir " +
      "de um serviço-âncora (`serviceId`, o `id` de socialgo_guest_services) e/ou de uma `platform`. É o par " +
      "guest-first de socialgo_recommend (que exige SOCIALGO_API_KEY): use ESTA para sugerir próximos passos " +
      "a quem comprou via socialgo_guest_order. Sem âncora, devolve populares. Retorna uma lista de " +
      "{ id, name, platform, categoryName, sellRate, min, max, refill, reason } onde `reason` é " +
      "'bought_together' | 'same_platform' | 'popular'. O `id` retornado serve direto como `serviceId` em " +
      "socialgo_guest_order.",
    {
      serviceId: z
        .string()
        .uuid()
        .optional()
        .describe("UUID do serviço-âncora (o `id` de socialgo_guest_services). Recomenda a partir dele."),
      platform: z
        .string()
        .optional()
        .describe("Plataforma a recomendar, ex.: 'Instagram', 'TikTok', 'YouTube' (usada sem serviceId)."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(24)
        .optional()
        .describe("Máximo de recomendações a retornar (1-24)."),
    },
    async ({ serviceId, platform, limit }) => {
      try {
        const qs = new URLSearchParams();
        if (limit !== undefined) qs.set("limit", String(limit));
        let path: string;
        if (serviceId) {
          // Atalho por id: serviceId vai no path; só limit é query.
          path = `/guest/services/${encodeURIComponent(serviceId)}/recommendations`;
        } else {
          // Genérico: platform/limit como query (serviceId já é undefined aqui).
          if (platform) qs.set("platform", platform);
          path = "/guest/recommendations";
        }
        const suffix = qs.toString() ? `?${qs.toString()}` : "";
        return ok(await guest("GET", `${path}${suffix}`));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────────────── 12) socialgo_wallet ──────────────────────────── */
  // Saldo + extrato recente da carteira do PRÓPRIO usuário (action=wallet).
  server.tool(
    "socialgo_wallet",
    "MODO REVENDEDOR (requer SOCIALGO_API_KEY + conta). Sem conta / sem chave? NÃO use isto — o caminho PRINCIPAL é o guest (pay-per-order via socialgo_guest_order). " +
      "Retorna a carteira da conta do usuário da API atual: `balance` + `currency` atuais mais as " +
      "`transactions` mais recentes do extrato ({ id, type, amount, balanceAfter, description, createdAt }). " +
      "Use para uma visão mais rica que socialgo_balance (que é só saldo) — ex.: explicar depósitos/" +
      "cobranças recentes. Restrito ao userId da chave de API.",
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
    "MODO REVENDEDOR (requer SOCIALGO_API_KEY + conta). Sem conta / sem chave? NÃO recarregue saldo — use socialgo_guest_order para pagar por pedido (caminho PRINCIPAL). " +
      "Cria um pagamento PENDENTE para recarregar a carteira do usuário atual e devolve o pagamento a concluir " +
      "no painel ({ payment, status, amount, currency, method, message }). NÃO credita saldo na hora — os " +
      "fundos só entram após o pagamento confirmar. Use socialgo_guest_gateways para confirmar quais métodos " +
      "de pagamento estão ativos agora antes de escolher um. Restrito ao userId da chave de API.",
    {
      amount: z
        .number()
        .positive()
        .describe("Valor a adicionar à carteira, na moeda da conta."),
      method: z
        .string()
        .min(1)
        .describe(
          "Nome do gateway de pagamento ATIVO (campo `gateway` de socialgo_guest_gateways / " +
            "GET /gateways/active). NÃO é uma lista fixa — os gateways são dinâmicos; chame socialgo_guest_gateways " +
            "para ver os ativos no momento e passe um deles.",
        ),
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
    "MODO REVENDEDOR (requer SOCIALGO_API_KEY + saldo na conta). Sem conta / sem chave? NÃO use isto — use socialgo_guest_order por pedido (caminho PRINCIPAL). " +
      "Cria VÁRIOS pedidos numa única chamada. Passe `orders` como uma lista de { service, link, quantity }. " +
      "Cada linha é independente — uma linha que falha NÃO cancela as outras. " +
      "Retorna { orders: [{ line, order }], errors: [{ line, reason }] }. " +
      "Use socialgo_services antes para resolver cada `service` id. As cobranças saem do saldo da conta. " +
      "Restrito ao userId da chave de API.",
    {
      orders: z
        .array(
          z.object({
            service: z
              .union([z.number(), z.string()])
              .describe("Id do serviço (de socialgo_services)."),
            link: z.string().min(1).describe("Link de destino (perfil, post, vídeo, etc)."),
            quantity: z
              .number()
              .int()
              .positive()
              .describe("Quantidade desejada, dentro do min/max do serviço."),
          }),
        )
        .min(1)
        .describe("Lista de pedidos a criar num único lote."),
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
    "MODO REVENDEDOR (requer SOCIALGO_API_KEY + conta). Sem conta / sem chave? Assinaturas exigem conta — não existem no modo guest (compra avulsa via socialgo_guest_order). " +
      "Cria uma assinatura RECORRENTE para o usuário atual (re-pede um serviço numa cadência fixa). " +
      "Passe `service`, `link`, `quantity` por execução, total de `runs` e `interval` em MINUTOS entre execuções. " +
      "Retorna { subscription, status, runs, remaining_runs, interval, next_run }. " +
      "Difere de drip-feed (um único pedido fracionado): uma assinatura é um agendamento contínuo. " +
      "Use socialgo_subscriptions para listar as existentes. Restrito ao userId da chave de API.",
    {
      service: z
        .union([z.number(), z.string()])
        .describe("Id do serviço (de socialgo_services)."),
      link: z.string().min(1).describe("Link de destino (perfil, post, vídeo, etc)."),
      quantity: z
        .number()
        .int()
        .positive()
        .describe("Quantidade pedida em CADA execução, dentro do min/max do serviço."),
      runs: z.number().int().positive().describe("Número total de execuções recorrentes."),
      interval: z
        .number()
        .int()
        .positive()
        .describe("Intervalo em MINUTOS entre cada execução."),
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
    "MODO REVENDEDOR (requer SOCIALGO_API_KEY + conta). " +
      "Lista as assinaturas recorrentes do usuário atual ({ subscription, service, link, status, quantity, " +
      "runs, remaining_runs, interval, next_run, created_at }). " +
      "Use para revisar assinaturas ativas/encerradas criadas via socialgo_create_subscription. " +
      "Restrito ao userId da chave de API.",
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
    "MODO REVENDEDOR (requer SOCIALGO_API_KEY + conta). Cupons valem para o saldo da conta, não para o guest checkout. " +
      "Valida / faz preview de um código de cupom SEM resgatá-lo. " +
      "Retorna { valid, reason?, code?, kind?, value?, minAmount?, expiresAt? } — `kind` é 'deposit_bonus' " +
      "(percentual) ou 'wallet_credit' (crédito fixo). Quando `valid` é false, `reason` explica o porquê. " +
      "É somente-leitura: nunca aplica o cupom, só verifica.",
    {
      code: z.string().min(1).describe("Código do cupom a validar (não diferencia maiúsculas/minúsculas)."),
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
    "MODO REVENDEDOR (requer SOCIALGO_API_KEY + conta). " +
      "Retorna as estatísticas de afiliado e o link de indicação do PRÓPRIO usuário: { referral_code, referral_link, " +
      "affiliate_balance, enabled, commission_percent, level2_percent, minimum_payout, referrals_count, " +
      "level2_count, total_earned, earned_l1, earned_l2 }. " +
      "Restrito ao userId da chave de API — nunca expõe dados de outros usuários.",
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
    "MODO REVENDEDOR (requer SOCIALGO_API_KEY + conta). " +
      "Retorna o status de fidelidade do usuário atual: { tier, label, next_threshold, progress_pct, points_balance, " +
      "lifetime_spent, currency }. Use para dizer ao usuário seu tier e o quão perto está do próximo. " +
      "Restrito ao userId da chave de API.",
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
    "MODO REVENDEDOR (requer SOCIALGO_API_KEY). Sem conta / sem chave? Use socialgo_guest_recommend (cross-sell keyless, mesmo resultado) — ou socialgo_guest_services para navegar o catálogo. " +
      "Recomenda serviços relacionados a partir de um `service` âncora e/ou uma `platform`. " +
      "Retorna uma lista ranqueada de { service, name, category, platform, rate, min, max, refill, reason } onde " +
      "`reason` é 'bought_together' | 'same_platform' | 'popular'. " +
      "Use para sugerir cross-sells/próximos passos depois que o usuário demonstra interesse num serviço ou plataforma.",
    {
      service: z
        .union([z.number(), z.string()])
        .optional()
        .describe("Id do serviço âncora para recomendar a partir dele (de socialgo_services)."),
      platform: z
        .string()
        .optional()
        .describe("Plataforma para recomendar, ex.: 'Instagram', 'TikTok', 'YouTube'."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Máximo de recomendações a retornar (1-50)."),
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
    "MODO REVENDEDOR (requer SOCIALGO_API_KEY + conta). Só planejamento; executar o plano exige conta. " +
      "Monta um PLANO de campanha a partir de um orçamento, um objetivo e uma janela de entrega — NÃO cria " +
      "nenhum pedido, só retorna o plano proposto para revisão. " +
      "Informe `budget` e `days`, mais um alvo via `service` id OU `platform` (+ `boost_type` opcional) e " +
      "`link` opcional. Retorna { feasible, reason?, service?, totalQuantity?, totalCost?, runs?, " +
      "intervalMinutes?, schedule?, params }. Após revisar, o usuário pode executá-lo via socialgo_place_order " +
      "(drip-feed usando runs+interval) ou socialgo_create_subscription.",
    {
      budget: z
        .number()
        .positive()
        .describe("Orçamento total da campanha, na moeda da conta."),
      days: z
        .number()
        .int()
        .positive()
        .describe("Janela de entrega em DIAS para distribuição gradual."),
      service: z
        .union([z.number(), z.string()])
        .optional()
        .describe("Id do serviço alvo (de socialgo_services). Informe este OU `platform`."),
      platform: z
        .string()
        .optional()
        .describe("Plataforma alvo, ex.: 'Instagram', 'TikTok'. Usada quando nenhum `service` id é dado."),
      boost_type: z
        .string()
        .optional()
        .describe("Tipo de impulso opcional para enviesar a escolha do serviço, ex.: 'followers', 'likes', 'views'."),
      link: z
        .string()
        .optional()
        .describe("Link de destino opcional (perfil/post/vídeo) que o plano deve impulsionar."),
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
    "MODO REVENDEDOR (requer SOCIALGO_API_KEY). Embora o conteúdo da loja seja público, esta tool o lê " +
      "através da API de revendedor e precisa de chave. Sem conta / sem chave? Use socialgo_guest_services + socialgo_guest_order. " +
      "Resolve uma loja pública pelo seu `slug` e retorna a loja com seus pacotes: " +
      "{ slug, title, description, theme, locale, packages: [{ id, title, description, quantity, price, " +
      "serviceName }] }. O `price` exibido do pacote é uma referência — o valor cobrado é recalculado " +
      "no servidor. Use para mostrar os pacotes oferecidos por uma loja pública a um usuário.",
    {
      slug: z.string().min(1).describe("Slug da loja pública a resolver."),
    },
    async ({ slug }) => {
      try {
        return ok(await smm("storefront", { slug }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ══════════════════════════════════════════════════════════════════════════
   *  AUTENTICADAS — para GESTÃO/ACOMPANHAMENTO (precisam de SOCIALGO_TOKEN, o
   *  JWT de usuário logado — NÃO da SOCIALGO_API_KEY do protocolo SMM, NEM do
   *  funil guest). Cobrem features REST do painel sob `requireUser`:
   *    • Sub-revenda (painel-filho): gerir clientes, markup, saldo, lucro, convite.
   *    • Gamificação (pontos): recompensas, streak, missões, roleta, badges,
   *      leaderboard, resgate de pontos.
   *    • Onboarding revendedor (compra do plano de revenda).
   *  Comprar continua keyless via socialgo_guest_* — estas NÃO mudam o guest-first.
   * ══════════════════════════════════════════════════════════════════════════ */

  /* ───────────────── 23) socialgo_subreseller_dashboard ────────────────────── */
  server.tool(
    "socialgo_subreseller_dashboard",
    "AUTENTICADA — para GESTÃO (precisa de SOCIALGO_TOKEN; é um JWT de usuário logado, NÃO a API key SMM). " +
      "Só para REVENDEDOR/sub-revendedor (usuário comum recebe 403). " +
      "Resumo do painel-filho do PRÓPRIO sub-revendedor: saldo, markup atual, teto de markup e " +
      "nº de clientes/pedidos. Use para dar um panorama da operação de revenda. Escopado ao usuário do token (GET /sub-reseller/).",
    {},
    async () => {
      try {
        return ok(await auth("GET", "/sub-reseller/"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 24) socialgo_subreseller_set_markup ───────────────────── */
  server.tool(
    "socialgo_subreseller_set_markup",
    "AUTENTICADA — para GESTÃO (precisa de SOCIALGO_TOKEN). Só REVENDEDOR/sub-revendedor. " +
      "Define o PRÓPRIO markup (percentual de margem sobre o custo) do sub-revendedor. O valor é " +
      "clampado pelo teto definido pelo dono do painel — a resposta devolve o markup efetivo aplicado. " +
      "PATCH /sub-reseller/markup.",
    {
      markupPercent: z
        .number()
        .min(0)
        .max(100000)
        .describe("Percentual de markup a aplicar (0-100000). Será clampado pelo teto do painel."),
    },
    async ({ markupPercent }) => {
      try {
        return ok(await auth("PATCH", "/sub-reseller/markup", { markupPercent }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 25) socialgo_subreseller_clients ──────────────────────── */
  server.tool(
    "socialgo_subreseller_clients",
    "AUTENTICADA — para ACOMPANHAMENTO (precisa de SOCIALGO_TOKEN). Só REVENDEDOR/sub-revendedor. " +
      "Lista os clientes vinculados ao PRÓPRIO sub-revendedor (escopado — nunca vê clientes de outro). " +
      "GET /sub-reseller/clients.",
    {},
    async () => {
      try {
        return ok(await auth("GET", "/sub-reseller/clients"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 26) socialgo_subreseller_create_client ────────────────── */
  server.tool(
    "socialgo_subreseller_create_client",
    "AUTENTICADA — para GESTÃO (precisa de SOCIALGO_TOKEN). Só REVENDEDOR/sub-revendedor. " +
      "Cria um cliente vinculado ao sub-revendedor (nasce escopado a ele). Devolve { item } com o " +
      "cliente criado, ou erro 409 se o e-mail já estiver cadastrado. A senha define o acesso inicial do " +
      "cliente. CRIA CREDENCIAIS — exige confirm:true para executar. POST /sub-reseller/clients.",
    {
      email: z.string().email().max(320).describe("E-mail (login) do novo cliente."),
      password: z
        .string()
        .min(8)
        .max(200)
        .describe("Senha inicial do cliente (mín. 8 caracteres)."),
      name: z.string().trim().min(1).max(200).optional().describe("Nome do cliente (opcional)."),
      ...confirmField,
    },
    async ({ email, password, name, confirm, dryRun }) => {
      try {
        const gate = requireConfirm(
          { confirm, dryRun },
          { action: "create_client", email, name: name ?? null, password: "(definida — oculta)" },
        );
        if (gate) return gate;
        return ok(await auth("POST", "/sub-reseller/clients", { email, password, name }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 27) socialgo_subreseller_orders ───────────────────────── */
  server.tool(
    "socialgo_subreseller_orders",
    "AUTENTICADA — para ACOMPANHAMENTO (precisa de SOCIALGO_TOKEN). Só REVENDEDOR/sub-revendedor. " +
      "Lista os pedidos dos clientes do PRÓPRIO sub-revendedor (escopado). Use para acompanhar a " +
      "operação dos clientes vinculados. GET /sub-reseller/orders.",
    {},
    async () => {
      try {
        return ok(await auth("GET", "/sub-reseller/orders"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────── 28) socialgo_subreseller_recharge_client ──────────────────── */
  server.tool(
    "socialgo_subreseller_recharge_client",
    "AUTENTICADA — para GESTÃO (precisa de SOCIALGO_TOKEN). Só REVENDEDOR/sub-revendedor. " +
      "Recarrega a carteira de UM cliente do sub-revendedor: move saldo do revendedor → cliente numa " +
      "transação atômica (o custo sai do saldo do revendedor). Só funciona para clientes vinculados a ele " +
      "(senão 403). Passe `clientId` (UUID do cliente, obtido em socialgo_subreseller_clients) e `amount`. " +
      "Um `idempotencyKey` é GERADO por padrão (uuid) se você não passar — torna o submit seguro contra " +
      "duplicação em retries. 429 se já houver recarga em andamento para o mesmo par. MOVE DINHEIRO — exige " +
      "confirm:true para executar. POST /sub-reseller/clients/:id/recharge.",
    {
      clientId: z
        .string()
        .uuid()
        .describe("UUID do cliente a recarregar (de socialgo_subreseller_clients — campo id)."),
      amount: z
        .number()
        .positive()
        .max(1_000_000)
        .describe("Valor a creditar na carteira do cliente (sai do saldo do revendedor)."),
      idempotencyKey: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .optional()
        .describe("Chave idempotente. Se omitida, é gerada automaticamente (uuid) para evitar recarga dupla."),
      ...confirmField,
    },
    async ({ clientId, amount, idempotencyKey, confirm, dryRun }) => {
      try {
        // Operação financeira sujeita a retry → chave idempotente default (uuid)
        // quando ausente, evitando recarga dupla se o submit for repetido.
        const key = idempotencyKey ?? randomUUID();
        const gate = requireConfirm(
          { confirm, dryRun },
          { action: "recharge_client", clientId, amount, idempotencyKey: key },
        );
        if (gate) return gate;
        return ok(
          await auth("POST", `/sub-reseller/clients/${encodeURIComponent(clientId)}/recharge`, {
            amount,
            idempotencyKey: key,
          }),
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 29) socialgo_subreseller_profit ───────────────────────── */
  server.tool(
    "socialgo_subreseller_profit",
    "AUTENTICADA — para ACOMPANHAMENTO (precisa de SOCIALGO_TOKEN). Só REVENDEDOR/sub-revendedor. " +
      "Relatório de lucro do sub-revendedor (CUSTO × RECEITA × LUCRO), escopado aos clientes dele. " +
      "Use para mostrar a margem da operação de revenda. GET /sub-reseller/profit.",
    {},
    async () => {
      try {
        return ok(await auth("GET", "/sub-reseller/profit"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 30) socialgo_subreseller_invite ───────────────────────── */
  server.tool(
    "socialgo_subreseller_invite",
    "AUTENTICADA — para GESTÃO (precisa de SOCIALGO_TOKEN). Só REVENDEDOR/sub-revendedor. " +
      "Obtém/garante o código de convite ESTÁVEL do revendedor + a URL pública de cadastro self-service " +
      "(APP_URL/r/<code>). Clientes que entram por esse link nascem vinculados a este revendedor. " +
      "Use `rotate: true` para gerar um NOVO código e INVALIDAR o link antigo. " +
      "GET /sub-reseller/invite (ou POST /sub-reseller/invite/rotate quando rotate=true).",
    {
      rotate: z
        .boolean()
        .optional()
        .describe("Se true, rotaciona o código (invalida o link anterior). Default: false (só obtém o atual)."),
    },
    async ({ rotate }) => {
      try {
        return ok(
          rotate
            ? await auth("POST", "/sub-reseller/invite/rotate")
            : await auth("GET", "/sub-reseller/invite"),
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 31) socialgo_points_rewards_state ─────────────────────── */
  server.tool(
    "socialgo_points_rewards_state",
    "AUTENTICADA — para ACOMPANHAMENTO (precisa de SOCIALGO_TOKEN; JWT de usuário logado). " +
      "Estado consolidado de recompensas/gamificação do PRÓPRIO usuário: tier, multiplicador de pontos " +
      "(tier + campanha + efetivo, se há campanha ativa) e status do streak diário (dias, se já reivindicou " +
      "hoje, pontos do próximo claim). Vai ALÉM de socialgo_loyalty_status (que é só tier/pontos estáticos). " +
      "Só exibição — nada é concedido aqui. GET /points/rewards-state.",
    {},
    async () => {
      try {
        return ok(await auth("GET", "/points/rewards-state"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 32) socialgo_points_claim_streak ──────────────────────── */
  server.tool(
    "socialgo_points_claim_streak",
    "AUTENTICADA — para GESTÃO (precisa de SOCIALGO_TOKEN). " +
      "Reivindica o bônus de STREAK do dia para o usuário logado. Idempotente: 1 claim por dia-UTC — o " +
      "2º claim no mesmo dia volta alreadyClaimed=true sem conceder de novo. " +
      "Cheque antes com socialgo_points_rewards_state (claimedToday). POST /points/streak/claim.",
    {},
    async () => {
      try {
        return ok(await auth("POST", "/points/streak/claim"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 33) socialgo_points_missions ──────────────────────────── */
  server.tool(
    "socialgo_points_missions",
    "AUTENTICADA — para ACOMPANHAMENTO (precisa de SOCIALGO_TOKEN). " +
      "Estado das MISSÕES SEMANAIS do usuário logado: progresso derivado de pedidos/depósitos da semana " +
      "corrente + o que já foi reivindicado. Use para listar missões e ver quais já podem ser reivindicadas " +
      "(depois use socialgo_points_claim_mission). GET /points/missions.",
    {},
    async () => {
      try {
        return ok(await auth("GET", "/points/missions"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ─────────────── 34) socialgo_points_claim_mission ───────────────────────── */
  server.tool(
    "socialgo_points_claim_mission",
    "AUTENTICADA — para GESTÃO (precisa de SOCIALGO_TOKEN). " +
      "Reivindica os pontos de UMA missão completada do usuário logado. Idempotente por usuário+missão+" +
      "semana-ISO; o servidor re-mede o progresso antes de conceder. Passe o `missionId` (de " +
      "socialgo_points_missions). POST /points/missions/claim (body { missionId }).",
    {
      missionId: z
        .string()
        .min(1)
        .max(40)
        .describe("Id da missão a reivindicar (obtido em socialgo_points_missions)."),
    },
    async ({ missionId }) => {
      try {
        return ok(await auth("POST", "/points/missions/claim", { missionId }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 35) socialgo_points_roulette ──────────────────────────── */
  server.tool(
    "socialgo_points_roulette",
    "AUTENTICADA — para ACOMPANHAMENTO (precisa de SOCIALGO_TOKEN). " +
      "Estado da ROLETA DIÁRIA do usuário logado: se está habilitada, se já girou hoje e os prêmios " +
      "possíveis. Cheque antes de socialgo_points_spin_roulette. GET /points/roulette.",
    {},
    async () => {
      try {
        return ok(await auth("GET", "/points/roulette"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 36) socialgo_points_spin_roulette ─────────────────────── */
  server.tool(
    "socialgo_points_spin_roulette",
    "AUTENTICADA — para GESTÃO (precisa de SOCIALGO_TOKEN). " +
      "Gira a ROLETA do dia do usuário logado (sorteio no servidor). Idempotente: 1 giro por dia-UTC. " +
      "Cheque antes com socialgo_points_roulette (se já girou). POST /points/roulette/spin.",
    {},
    async () => {
      try {
        return ok(await auth("POST", "/points/roulette/spin"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 37) socialgo_points_badges ────────────────────────────── */
  server.tool(
    "socialgo_points_badges",
    "AUTENTICADA — para ACOMPANHAMENTO (precisa de SOCIALGO_TOKEN). " +
      "Conquistas/badges do usuário logado (derivadas de pedidos, gasto, tier, indicações, resgate e " +
      "streak). Só leitura. GET /points/badges.",
    {},
    async () => {
      try {
        return ok(await auth("GET", "/points/badges"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 38) socialgo_points_leaderboard ───────────────────────── */
  server.tool(
    "socialgo_points_leaderboard",
    "AUTENTICADA — para ACOMPANHAMENTO (precisa de SOCIALGO_TOKEN). " +
      "Ranking ANONIMIZADO (leaderboard) com a posição do usuário logado. Nunca vaza dado pessoal de " +
      "terceiros (só apelido mascarado + posição + valor da métrica). GET /points/leaderboard.",
    {},
    async () => {
      try {
        return ok(await auth("GET", "/points/leaderboard"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 39) socialgo_points_perks ─────────────────────────────── */
  server.tool(
    "socialgo_points_perks",
    "AUTENTICADA — para ACOMPANHAMENTO (precisa de SOCIALGO_TOKEN). " +
      "Perks (benefícios) de TODOS os níveis + o tier atual do usuário logado. Só leitura. " +
      "GET /points/perks.",
    {},
    async () => {
      try {
        return ok(await auth("GET", "/points/perks"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ─────────────── 40) socialgo_points_referral_progress ───────────────────── */
  server.tool(
    "socialgo_points_referral_progress",
    "AUTENTICADA — para ACOMPANHAMENTO (precisa de SOCIALGO_TOKEN). " +
      "Progresso de INDICAÇÕES gamificadas do usuário logado: quantos indicou, quantos converteram e " +
      "pontos já ganhos como indicador. Só leitura. GET /points/referral-progress.",
    {},
    async () => {
      try {
        return ok(await auth("GET", "/points/referral-progress"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 41) socialgo_points_milestones ────────────────────────── */
  server.tool(
    "socialgo_points_milestones",
    "AUTENTICADA — para ACOMPANHAMENTO (precisa de SOCIALGO_TOKEN). " +
      "Marco mais próximo (resgate / tier / badge) + countdown da campanha ativa para o usuário logado. " +
      "Tudo derivado; nada concedido. GET /points/milestones.",
    {},
    async () => {
      try {
        return ok(await auth("GET", "/points/milestones"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 42) socialgo_points_redeem ────────────────────────────── */
  server.tool(
    "socialgo_points_redeem",
    "AUTENTICADA — para GESTÃO (precisa de SOCIALGO_TOKEN). " +
      "Resgata pontos do usuário logado, creditando o valor correspondente na carteira da conta. " +
      "Passe `amount` (valor de pontos a resgatar). Confirme o saldo de pontos antes com " +
      "socialgo_points_rewards_state ou socialgo_loyalty_status. POST /points/redeem.",
    {
      amount: z
        .number()
        .positive()
        .finite()
        .describe("Valor de pontos a resgatar (creditado como saldo na carteira)."),
    },
    async ({ amount }) => {
      try {
        return ok(await auth("POST", "/points/redeem", { amount }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 43) socialgo_reseller_checkout ────────────────────────── */
  server.tool(
    "socialgo_reseller_checkout",
    "AUTENTICADA — ONBOARDING (precisa de SOCIALGO_TOKEN; JWT de usuário logado). " +
      "Cria o checkout de COMPRA DO PLANO DE REVENDEDOR (pagamento único) para o usuário logado: promove a " +
      "conta a revendedor após o pagamento confirmar. O preço é FORÇADO no servidor (nunca vem do client). " +
      "Devolve { url, paymentId, amount, currency } — entregue a `url` para o usuário pagar. 400 se a conta " +
      "já é revendedor/admin ou se o onboarding self-service estiver desativado. Use socialgo_guest_gateways " +
      "para descobrir um `method` ativo. COMPRA (gera cobrança) — exige confirm:true para executar. " +
      "POST /payments/reseller-checkout.",
    {
      method: z
        .string()
        .min(1)
        .describe(
          "Gateway de pagamento ATIVO (campo `gateway` de socialgo_guest_gateways / GET /gateways/active). " +
            "Lista dinâmica — não é fixa.",
        ),
      ...confirmField,
    },
    async ({ method, confirm, dryRun }) => {
      try {
        const gate = requireConfirm(
          { confirm, dryRun },
          { action: "reseller_checkout", method, note: "cria cobrança do plano de revendedor (preço forçado no servidor)" },
        );
        if (gate) return gate;
        return ok(await auth("POST", "/payments/reseller-checkout", { method }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /* ───────────────── 44) socialgo_affiliate_request_payout ─────────────────── */
  // SAQUE do saldo de afiliado (autenticado, requireUser). Complementa a LEITURA
  // de socialgo_affiliate_stats: ali o usuário VÊ o saldo; aqui ele SACA.
  server.tool(
    "socialgo_affiliate_request_payout",
    "AUTENTICADA — para GESTÃO (precisa de SOCIALGO_TOKEN; JWT de usuário logado). " +
      "Solicita um SAQUE do saldo de afiliado do usuário logado. socialgo_affiliate_stats é só LEITURA " +
      "(saldo, saque mínimo, níveis); ESTA tool é quem efetivamente SACA. O servidor valida saldo ≥ valor e " +
      "≥ saque mínimo (veja `minimum_payout` em socialgo_affiliate_stats antes). Devolve o saque criado " +
      "({ id, amount, status:'pending' }). MOVE DINHEIRO — exige confirm:true para executar. " +
      "POST /affiliates/request-payout.",
    {
      amount: z
        .number()
        .positive()
        .max(1_000_000)
        .describe("Valor a sacar do saldo de afiliado (>= saque mínimo de socialgo_affiliate_stats)."),
      method: z
        .string()
        .trim()
        .min(1)
        .max(40)
        .optional()
        .describe("Método de saque preferido (opcional), ex.: 'pix', 'usdt'."),
      note: z
        .string()
        .trim()
        .max(2000)
        .optional()
        .describe("Observação opcional para o saque (ex.: chave PIX/endereço)."),
      ...confirmField,
    },
    async ({ amount, method, note, confirm, dryRun }) => {
      try {
        const gate = requireConfirm(
          { confirm, dryRun },
          { action: "affiliate_request_payout", amount, method: method ?? null },
        );
        if (gate) return gate;
        return ok(await auth("POST", "/affiliates/request-payout", { amount, method, note }));
      } catch (err) {
        return fail(err);
      }
    },
  );
}
