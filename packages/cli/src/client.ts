/**
 * Wrapper de fetch para a API do SocialGO.
 *
 * A CLI fala com a API do SocialGO pelo endpoint de revendedor (SMM API v2,
 * `POST /api/v2`): um único endpoint que recebe `key` + `action` e responde
 * JSON. A chave do revendedor vem de `SOCIALGO_API_KEY` (nunca hard-coded).
 *
 * Tipos reaproveitados do SDK compartilhado (`@socialgo/sdk`) — o mesmo
 * coração usado por api/web/mcp.
 */
import type { SmmService, SmmOrderStatus } from "@socialgo/sdk";

const DEFAULT_BASE = "https://api.usesocialgo.com";

/** Item do catálogo como a reseller API v2 do SocialGO devolve em `services`. */
export interface CatalogService extends SmmService {
  /** id do serviço no SocialGO (o `service` do protocolo v2). */
  service: number | string;
}

export interface CreatedOrder {
  order: number | string;
}

export interface BalanceResult {
  balance: string;
  currency: string;
}

/** Resumo da carteira (saldo + moeda + extrato recente, quando disponível). */
export interface WalletResult {
  balance: string;
  currency: string;
  transactions?: Array<{
    type?: string;
    amount?: string;
    balanceAfter?: string;
    note?: string;
    createdAt?: string;
  }>;
}

export interface SyncResult {
  imported: number;
  suppliers?: number;
}

/** Item do histórico de pedidos (`action=orders`, extensão SocialGO). */
export interface OrderListItem {
  order: number | string;
  charge: string;
  status: string;
  start_count: string;
  remains: string;
  link?: string;
  quantity?: number;
  created_at?: string;
}

/** Resultado de `refill` único (id da reposição) ou erro. */
export interface RefillResult {
  refill: number | string;
}

/** Resultado de `refill_status` (status SMM v2 da reposição). */
export interface RefillStatusResult {
  status: string;
}

/** Item de `cancel` (sempre array no protocolo v2). */
export interface CancelResultItem {
  order: number | string;
  cancel: unknown;
}

/** Resultado de `add_funds` — pagamento pendente a concluir no painel. */
export interface AddFundsResult {
  payment: number | string;
  status: string;
  amount: string;
  currency: string;
  method: string;
  message?: string;
}

/**
 * Parâmetros extras por TIPO de serviço (SMM API v2). Cada serviço aceita só
 * os campos relevantes ao seu tipo; os demais são omitidos do payload.
 */
export interface OrderTypeParams {
  comments?: string; // Custom Comments / Custom Comments Package (1 por linha)
  usernames?: string; // Mentions Custom List / Mentions with Hashtags
  hashtags?: string; // Mentions with Hashtags
  hashtag?: string; // Mentions Hashtag
  username?: string; // Mentions User Followers / Comment Likes
  media?: string; // Mentions Media Likers
  answer_number?: number; // Poll
}

export interface CreateOrderInput extends OrderTypeParams {
  service: number | string;
  link: string;
  quantity?: number;
  runs?: number;
  interval?: number;
}

/** Uma linha de `mass_order` (vários pedidos numa chamada). */
export interface MassOrderLine {
  service: number | string;
  link: string;
  quantity: number;
}

/** Resultado de `mass_order` — pedidos criados + erros por linha (linha que falha não derruba as demais). */
export interface MassOrderResult {
  orders: Array<{ line: number; order: number | string }>;
  errors: Array<{ line: number; reason: string }>;
}

/** Parâmetros de `subscription_create` — assinatura recorrente do próprio usuário. */
export interface SubscriptionCreateInput {
  service: number | string;
  link: string;
  quantity: number;
  runs: number;
  /** Intervalo entre ciclos, em MINUTOS. */
  interval: number;
}

/** Resultado de `subscription_create`. */
export interface SubscriptionCreateResult {
  subscription: string;
  status: string;
  runs: number;
  remaining_runs: number;
  interval: number;
  next_run: string | null;
}

/** Item de `subscriptions` — assinatura do próprio usuário. */
export interface SubscriptionListItem {
  subscription: string;
  service: number | string;
  link: string;
  status: string;
  quantity: number;
  runs: number;
  remaining_runs: number;
  interval: number;
  next_run: string | null;
  created_at: string;
}

/** Resultado de `coupon_validate` — validação/preview (NÃO resgata). */
export interface CouponPreview {
  valid: boolean;
  reason?: string;
  code?: string;
  kind?: "deposit_bonus" | "wallet_credit" | string;
  /** deposit_bonus = percentual; wallet_credit = valor fixo creditado. */
  value?: string;
  minAmount?: string | null;
  expiresAt?: string | null;
}

/** Resultado de `affiliate_stats` — stats + link DO PRÓPRIO user. */
export interface AffiliateStats {
  referral_code: string;
  referral_link: string;
  affiliate_balance: string;
  enabled: boolean;
  commission_percent: number;
  level2_percent: number;
  minimum_payout: number;
  referrals_count: number;
  level2_count: number;
  total_earned: string;
  earned_l1: string;
  earned_l2: string;
}

/** Resultado de `loyalty_status` — tier/pontos DO próprio user. */
export interface LoyaltyStatus {
  tier: string;
  label: string;
  next_threshold: number | null;
  progress_pct: number;
  points_balance: number;
  lifetime_spent: string;
  currency: string;
}

/** Filtros de `recommend` — serviço-âncora e/ou plataforma. */
export interface RecommendFilters {
  service?: number | string;
  platform?: string;
  limit?: number;
}

/** Item recomendado (`recommend`). */
export interface RecommendedService {
  service: number | string;
  name: string;
  category: string;
  platform: string | null;
  rate: string;
  min: string;
  max: string;
  refill: boolean;
  reason: string;
}

/** Parâmetros de `campaign_build` — devolve um PLANO (não cria pedido). */
export interface CampaignBuildInput {
  budget: number;
  /** Janela de entrega gradual, em dias. */
  days: number;
  service?: number | string;
  platform?: string;
  boost_type?: string;
  link?: string;
}

/** Uma execução do cronograma do plano de campanha. */
export interface CampaignScheduleEntry {
  run: number;
  quantity: number;
  dayOffset: number;
}

/** PLANO de campanha (`campaign_build`) — proposta para revisão, não cria pedido. */
export interface CampaignPlan {
  feasible: boolean;
  reason?: string;
  service?: {
    id: number | string;
    name: string;
    platform: string | null;
    serviceTag: string | null;
  };
  totalQuantity?: number;
  totalCost?: number;
  runs?: number;
  intervalMinutes?: number;
  schedule?: CampaignScheduleEntry[];
  params: {
    platform?: string;
    boostType?: string;
    serviceId?: number | string;
    budget: number;
    days: number;
  };
}

/** Pacote público de uma storefront (`storefront`). */
export interface StorefrontPackage {
  id: string;
  title: string;
  description: string | null;
  quantity: number;
  /** Preço EXIBIDO (referência); o cobrado é recalculado no servidor. */
  price: string;
  serviceName: string | null;
}

/** Loja pública resolvida pelo slug (`storefront`). */
export interface Storefront {
  slug: string;
  title: string;
  description: string | null;
  theme: string;
  locale: string;
  packages: StorefrontPackage[];
}

export class SocialGoApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = "SocialGoApiError";
  }
}

export interface SocialGoClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

// ---- Guest checkout (endpoints PÚBLICOS, sem chave) ------------------------

/**
 * Método de checkout do guest (= `gateway` canônico do painel). NÃO é uma união
 * fixa: a lista REAL de métodos válidos é a que o painel devolve em
 * `GET /gateways/active` (campo `gateway`). O tipo é string aberta para refletir
 * que novos gateways podem ser habilitados no painel sem mudar o código.
 */
export type GuestCheckoutMethod = string;

/**
 * Fallback mínimo e seguro de métodos de guest checkout, usado SÓ quando
 * `GET /gateways/active` falha (rede/painel fora). Não é a fonte da verdade —
 * é só um piso para o usuário não ficar travado.
 */
export const FALLBACK_GUEST_METHODS: readonly string[] = ["mercadopago", "stripe", "crypto"];

/**
 * Gateway ATIVO devolvido por `GET /gateways/active`. O painel já normaliza
 * para `{ gateway, label, kind, coins, notice }` (campos NÃO-secretos de UI).
 * O valor enviado de volta no checkout (`method`) é `gateway`.
 */
export interface ActiveGateway {
  /** Nome canônico — é o valor de `method` no guest checkout. */
  gateway: string;
  /** Rótulo amigável para exibição. */
  label: string;
  /** Agrupamento de UI (card | crypto | wallet). */
  kind: "card" | "crypto" | "wallet" | string;
  /** Moedas aceitas (cripto) — array (vazio p/ não-cripto). */
  coins: string[];
  /** Aviso/observação regional (ex.: não aceita cartão de tal país). */
  notice?: string;
}

/** Resposta de `GET /gateways/active` ({ gateways, bonusTiers }). */
export interface ActiveGatewaysResult {
  gateways: ActiveGateway[];
  bonusTiers?: unknown[];
}

/** Item do catálogo público (`GET /guest/services`). */
export interface GuestService {
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

/** Entrada de `POST /guest/order`. */
export interface GuestOrderInput {
  email: string;
  serviceId: string;
  link: string;
  quantity?: number;
  method: GuestCheckoutMethod;
  /** Campos extras por tipo de serviço (comments/usernames/hashtags/...). */
  metadata?: Record<string, unknown>;
}

/** Resposta de `POST /guest/order` (pedido `awaiting_payment` + checkout). */
export interface GuestOrderResult {
  orderId: string;
  guestToken: string;
  url: string;
  amount: number;
  currency: string;
}

/** Status público de um pedido guest (`GET /guest/order/:id`). */
export interface GuestOrderStatus {
  id: string;
  status: string;
  serviceName: string | null;
  link: string;
  quantity: number;
  charge: string;
  startCount: number | null;
  remains: number | null;
  createdAt: string;
}

/** Filtros do catálogo público (`GET /guest/services`). */
export interface GuestServiceFilters {
  platform?: string;
  q?: string;
  limit?: number;
}

/** Resposta paginada do catálogo público ({items,total}). */
export interface GuestServiceListResult {
  items: GuestService[];
  total: number;
}

/** Campos extras por tipo enviados no `add` (mesmos nomes do protocolo v2). */
const ORDER_TYPE_FIELDS: Array<keyof OrderTypeParams> = [
  "comments",
  "usernames",
  "hashtags",
  "hashtag",
  "username",
  "media",
  "answer_number",
];

/**
 * Cliente HTTP da API SocialGO. Encapsula o protocolo SMM API v2 sobre
 * `POST /api/v2` e expõe métodos amigáveis para a CLI.
 */
export class SocialGoClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(opts: SocialGoClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.SOCIALGO_API_URL ?? DEFAULT_BASE).replace(/\/+$/, "");
    this.apiKey = opts.apiKey ?? process.env.SOCIALGO_API_KEY ?? "";
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  /** Base resolvida (para mensagens de diagnóstico). */
  get resolvedBaseUrl(): string {
    return this.baseUrl;
  }

  /** Indica se há chave configurada (sem expô-la). */
  get hasKey(): boolean {
    return Boolean(this.apiKey);
  }

  /** Chamada genérica ao endpoint de revendedor SMM API v2. */
  private async call<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.apiKey) {
      throw new SocialGoApiError(
        "Chave de API ausente. Defina SOCIALGO_API_KEY no ambiente (ou use --key). " +
          "Veja: socialgo config",
      );
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    const url = `${this.baseUrl}/api/v2`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // header opcional, além de body.key — a API aceita key no corpo.
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ key: this.apiKey, action, ...params }),
        signal: ctrl.signal,
      });

      const text = await res.text();
      let data: unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new SocialGoApiError(`Resposta não-JSON da API (HTTP ${res.status})`, res.status, text);
      }

      if (!res.ok) {
        const msg =
          (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) ||
          `HTTP ${res.status}`;
        throw new SocialGoApiError(String(msg), res.status, data);
      }

      // O protocolo v2 sinaliza erro de negócio com `{ error }` mesmo em 200.
      if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) {
        throw new SocialGoApiError(String((data as { error?: unknown }).error), res.status, data);
      }

      return data as T;
    } catch (err) {
      if (err instanceof SocialGoApiError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new SocialGoApiError(`Tempo esgotado ao chamar a API (${action})`);
      }
      throw new SocialGoApiError(`Falha ao chamar a API (${action})`, undefined, err);
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- Serviços / catálogo --------------------------------------------------

  /** Lista o catálogo completo de serviços do SocialGO. */
  async listServices(): Promise<CatalogService[]> {
    const data = await this.call<CatalogService[] | { services: CatalogService[] }>("services");
    return Array.isArray(data) ? data : (data.services ?? []);
  }

  /** Busca serviços no catálogo por termo (nome/categoria/tipo/id). Filtro client-side. */
  async searchServices(query: string): Promise<CatalogService[]> {
    const all = await this.listServices();
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((s) => {
      const haystack = `${s.name ?? ""} ${s.category ?? ""} ${s.type ?? ""} ${s.service ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }

  /** Detalha um serviço específico pelo id (busca no catálogo). */
  async getService(id: number | string): Promise<CatalogService | undefined> {
    const all = await this.listServices();
    return all.find((s) => String(s.service) === String(id));
  }

  // ---- Pedidos --------------------------------------------------------------

  /** Cria um pedido no SocialGO (repassado ao fornecedor após débito da carteira). */
  createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const params: Record<string, unknown> = {
      service: input.service,
      link: input.link,
    };
    if (input.quantity !== undefined) params.quantity = input.quantity;
    if (input.runs !== undefined) params.runs = input.runs;
    if (input.interval !== undefined) params.interval = input.interval;
    // params extras por tipo — só os preenchidos vão pro payload.
    for (const field of ORDER_TYPE_FIELDS) {
      const value = input[field];
      if (value !== undefined && value !== "") params[field] = value;
    }
    return this.call<CreatedOrder>("add", params);
  }

  /** Status de um único pedido. */
  orderStatus(orderId: number | string): Promise<SmmOrderStatus> {
    return this.call<SmmOrderStatus>("status", { order: orderId });
  }

  /**
   * Status de vários pedidos (CSV). Resposta v2: `{ [orderId]: SmmOrderStatus | { error } }`.
   */
  multiOrderStatus(
    orderIds: Array<number | string>,
  ): Promise<Record<string, SmmOrderStatus | { error: string }>> {
    return this.call<Record<string, SmmOrderStatus | { error: string }>>("status", {
      orders: orderIds.join(","),
    });
  }

  /** Histórico de pedidos do revendedor (extensão SocialGO). */
  listOrders(): Promise<OrderListItem[]> {
    return this.call<OrderListItem[]>("orders");
  }

  /** Solicita reposição (refill) de um pedido. */
  refill(orderId: number | string): Promise<RefillResult> {
    return this.call<RefillResult>("refill", { order: orderId });
  }

  /** Status de uma reposição — por id do refill (`refill`) ou do pedido (`order`). */
  refillStatus(ref: { refill?: number | string; order?: number | string }): Promise<RefillStatusResult> {
    const params: Record<string, unknown> = {};
    if (ref.refill !== undefined) params.refill = ref.refill;
    if (ref.order !== undefined) params.order = ref.order;
    return this.call<RefillStatusResult>("refill_status", params);
  }

  /** Cancela um ou mais pedidos (CSV). Resposta v2: array de `{ order, cancel }`. */
  cancel(orderIds: Array<number | string>): Promise<CancelResultItem[]> {
    return this.call<CancelResultItem[]>("cancel", { orders: orderIds.join(",") });
  }

  // ---- Carteira -------------------------------------------------------------

  /** Saldo atual da conta (action `balance` do protocolo v2). */
  balance(): Promise<BalanceResult> {
    return this.call<BalanceResult>("balance");
  }

  /**
   * Resumo da carteira. Tenta a action `wallet` (extrato); se o servidor não a
   * implementar, degrada para apenas o saldo de `balance`.
   */
  async wallet(): Promise<WalletResult> {
    try {
      return await this.call<WalletResult>("wallet");
    } catch (err) {
      if (err instanceof SocialGoApiError && (err.status === 400 || err.status === 404)) {
        const b = await this.balance();
        return { balance: b.balance, currency: b.currency };
      }
      throw err;
    }
  }

  /** Cria um pagamento pendente para recarregar a carteira (conclui no painel). */
  addFunds(amount: number, method: string): Promise<AddFundsResult> {
    return this.call<AddFundsResult>("add_funds", { amount, method });
  }

  // ---- Pedidos em lote ------------------------------------------------------

  /**
   * Vários pedidos numa única chamada (`mass_order`). Aceita uma LISTA
   * estruturada de linhas OU um texto CSV `service|link|quantity` (uma por
   * linha). Cada linha é independente — uma falha não derruba as demais.
   */
  massOrder(orders: MassOrderLine[] | string): Promise<MassOrderResult> {
    const csv =
      typeof orders === "string"
        ? orders
        : orders.map((o) => `${o.service}|${o.link}|${o.quantity}`).join("\n");
    return this.call<MassOrderResult>("mass_order", { orders: csv });
  }

  // ---- Assinaturas ----------------------------------------------------------

  /** Cria uma assinatura recorrente do próprio usuário (`subscription_create`). */
  subscriptionCreate(input: SubscriptionCreateInput): Promise<SubscriptionCreateResult> {
    return this.call<SubscriptionCreateResult>("subscription_create", {
      service: input.service,
      link: input.link,
      quantity: input.quantity,
      runs: input.runs,
      interval: input.interval,
    });
  }

  /** Lista as assinaturas do próprio usuário (`subscriptions`). */
  subscriptions(): Promise<SubscriptionListItem[]> {
    return this.call<SubscriptionListItem[]>("subscriptions");
  }

  // ---- Cupom / afiliados / fidelidade ---------------------------------------

  /** Valida/preview um cupom (`coupon_validate`) — NÃO resgata. */
  couponValidate(code: string): Promise<CouponPreview> {
    return this.call<CouponPreview>("coupon_validate", { code });
  }

  /** Stats + link de afiliado do PRÓPRIO usuário (`affiliate_stats`). */
  affiliateStats(): Promise<AffiliateStats> {
    return this.call<AffiliateStats>("affiliate_stats");
  }

  /** Tier/pontos do PRÓPRIO usuário (`loyalty_status`). */
  loyaltyStatus(): Promise<LoyaltyStatus> {
    return this.call<LoyaltyStatus>("loyalty_status");
  }

  // ---- Recomendação / campanha / storefront ---------------------------------

  /** Serviços recomendados por serviço-âncora e/ou plataforma (`recommend`). */
  recommend(filters: RecommendFilters = {}): Promise<RecommendedService[]> {
    const params: Record<string, unknown> = {};
    if (filters.service !== undefined) params.service = filters.service;
    if (filters.platform !== undefined) params.platform = filters.platform;
    if (filters.limit !== undefined) params.limit = filters.limit;
    return this.call<RecommendedService[]>("recommend", params);
  }

  /** Devolve um PLANO de campanha (`campaign_build`) — não cria pedido sozinho. */
  campaignBuild(input: CampaignBuildInput): Promise<CampaignPlan> {
    const params: Record<string, unknown> = { budget: input.budget, days: input.days };
    if (input.service !== undefined) params.service = input.service;
    if (input.platform !== undefined) params.platform = input.platform;
    if (input.boost_type !== undefined) params.boost_type = input.boost_type;
    if (input.link !== undefined) params.link = input.link;
    return this.call<CampaignPlan>("campaign_build", params);
  }

  /** Resolve uma loja pública pelo slug → pacotes (`storefront`). */
  storefront(slug: string): Promise<Storefront> {
    return this.call<Storefront>("storefront", { slug });
  }

  // ---- Admin ----------------------------------------------------------------

  /** Dispara o sync do catálogo a partir dos fornecedores ativos (requer admin). */
  syncCatalog(): Promise<SyncResult> {
    return this.call<SyncResult>("sync");
  }

  // ---- Guest (endpoints PÚBLICOS REST, SEM chave) ---------------------------

  /**
   * Chamada genérica às rotas PÚBLICAS de guest (`/guest/*`). Diferente de
   * `call()`: usa verbos REST sobre a base configurada, NUNCA envia chave nem
   * Authorization (as rotas são abertas e validam posse por token/email).
   */
  private async guestRequest<T>(
    path: string,
    opts: { method?: "GET" | "POST"; body?: unknown; query?: Record<string, unknown> } = {},
  ): Promise<T> {
    const { method = "GET", body, query } = opts;
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
      }
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {};
      if (body !== undefined) headers["Content-Type"] = "application/json";
      // NB: nenhuma Authorization/key — rota pública.
      const res = await fetch(url.toString(), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });

      const text = await res.text();
      let data: unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new SocialGoApiError(`Resposta não-JSON da API (HTTP ${res.status})`, res.status, text);
      }

      if (!res.ok) {
        const msg =
          (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) ||
          `HTTP ${res.status}`;
        throw new SocialGoApiError(String(msg), res.status, data);
      }

      return data as T;
    } catch (err) {
      if (err instanceof SocialGoApiError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new SocialGoApiError(`Tempo esgotado ao chamar ${path}`);
      }
      throw new SocialGoApiError(`Falha ao chamar ${path}`, undefined, err);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Catálogo público para escolher um serviço sem login (`GET /guest/services`). */
  guestServices(filters: GuestServiceFilters = {}): Promise<GuestServiceListResult> {
    return this.guestRequest<GuestServiceListResult>("/guest/services", {
      query: { platform: filters.platform, q: filters.q, limit: filters.limit },
    });
  }

  /**
   * Gateways de pagamento REALMENTE ativos no painel (`GET /gateways/active`).
   * É a fonte da verdade dos métodos de guest checkout: o seletor de pagamento
   * deve oferecer SÓ os `gateway` retornados aqui (nunca uma lista fixa).
   * O painel já normaliza para `{ gateway, label, kind, coins, notice }`.
   */
  async guestActiveGateways(): Promise<ActiveGateway[]> {
    const res = await this.guestRequest<ActiveGatewaysResult>("/gateways/active");
    return Array.isArray(res?.gateways) ? res.gateways : [];
  }

  /**
   * Lista os métodos de guest checkout VÁLIDOS (campo `gateway` dos ativos).
   * Se a consulta falhar (rede/painel fora), cai no fallback mínimo seguro
   * para não travar o usuário — a UI/validação nunca deve depender de hardcode.
   */
  async guestPaymentMethods(): Promise<string[]> {
    try {
      const gateways = await this.guestActiveGateways();
      const methods = gateways.map((g) => g.gateway).filter(Boolean);
      return methods.length > 0 ? methods : [...FALLBACK_GUEST_METHODS];
    } catch {
      return [...FALLBACK_GUEST_METHODS];
    }
  }

  /**
   * Cria um pedido pay-per-order (`POST /guest/order`). Sem login: devolve
   * `{ orderId, guestToken, url, amount, currency }`. O usuário abre `url` para
   * pagar no gateway escolhido. `input.method` precisa ser um `gateway` ATIVO
   * (ver `guestPaymentMethods()` / `GET /gateways/active`) — não há lista fixa.
   */
  guestCreateOrder(input: GuestOrderInput): Promise<GuestOrderResult> {
    const body: Record<string, unknown> = {
      email: input.email,
      serviceId: input.serviceId,
      link: input.link,
      method: input.method,
    };
    if (input.quantity !== undefined) body.quantity = input.quantity;
    if (input.metadata && Object.keys(input.metadata).length > 0) body.metadata = input.metadata;
    return this.guestRequest<GuestOrderResult>("/guest/order", { method: "POST", body });
  }

  /**
   * Status público de um pedido guest (`GET /guest/order/:id`), validando posse
   * por `token` (preferido) ou `email`.
   */
  guestOrderStatus(id: string, creds: { token?: string; email?: string }): Promise<GuestOrderStatus> {
    return this.guestRequest<GuestOrderStatus>(`/guest/order/${encodeURIComponent(id)}`, {
      query: { token: creds.token, email: creds.email },
    });
  }
}

/** Helper para instanciar o cliente a partir do ambiente. */
export function clientFromEnv(): SocialGoClient {
  return new SocialGoClient();
}
