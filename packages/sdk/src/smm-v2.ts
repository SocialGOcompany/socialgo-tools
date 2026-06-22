/**
 * Protocolo SMM API v2 — tipos e cliente.
 *
 * Padrão de fato dos painéis SMM: um único endpoint POST que recebe
 * `key` + `action` (form-urlencoded) e responde JSON. Usado nos dois sentidos:
 *  - consumir: SocialGO bate no fornecedor upstream  (SmmV2Client)
 *  - expor:    SocialGO atende revendedores no mesmo formato (apps/api reseller)
 */

export type SmmAction =
  | "services"
  | "add"
  | "status"
  | "refill"
  | "refill_status"
  | "cancel"
  | "balance"
  // extensões SocialGO (além do SMM v2 padrão) — mesmo endpoint POST {key, action}
  | "orders"
  | "wallet"
  | "add_funds"
  | "mass_order"
  | "subscription_create"
  | "subscriptions"
  | "coupon_validate"
  | "affiliate_stats"
  | "loyalty_status"
  | "recommend"
  | "campaign_build"
  | "storefront";

/** Item de serviço como o fornecedor devolve em `action=services`. */
export interface SmmService {
  service: number | string;
  name: string;
  type: string; // "Default" | "Package" | "Custom Comments" | "Subscriptions" ...
  category: string;
  rate: string; // preço por 1000 (no currency do fornecedor)
  min: string;
  max: string;
  refill?: boolean;
  cancel?: boolean;
  dripfeed?: boolean;
}

export interface SmmAddOrderParams {
  service: number | string;
  link: string;
  quantity?: number;
  // drip-feed
  runs?: number;
  interval?: number;
  // params extras por TIPO de serviço (SMM API v2). Só os relevantes ao tipo
  // são enviados; os `undefined` são omitidos do payload pelo cliente.
  comments?: string; // Custom Comments / Custom Comments Package (1 por linha)
  usernames?: string; // Mentions Custom List / Mentions with Hashtags
  hashtags?: string; // Mentions with Hashtags
  hashtag?: string; // Mentions Hashtag
  username?: string; // Mentions User Followers / Comment Likes
  media?: string; // Mentions Media Likers
  answer_number?: number; // Poll
  keywords?: string;
}

export interface SmmOrderStatus {
  charge: string;
  start_count: string;
  status: "Pending" | "In progress" | "Processing" | "Completed" | "Partial" | "Canceled" | string;
  remains: string;
  currency: string;
}

export interface SmmBalance {
  balance: string;
  currency: string;
}

/* ─────────────── tipos das extensões SocialGO (aditivos) ─────────────── */

/** Item do histórico de pedidos (`action=orders`). */
export interface SmmOrderListItem {
  order: number | string;
  charge: string;
  status: SmmOrderStatus["status"];
  start_count: string;
  remains: string;
  link: string;
  quantity: number;
  created_at: string;
}

/** Lançamento do extrato da carteira (`action=wallet`). */
export interface SmmWalletTransaction {
  id: string;
  type: string;
  amount: string;
  balanceAfter: string;
  description: string | null;
  createdAt: string;
}

/** Saldo + extrato recente do revendedor (`action=wallet`). */
export interface SmmWallet {
  balance: string;
  currency: string;
  transactions: SmmWalletTransaction[];
}

/** Parâmetros de `action=add_funds` — cria um pagamento pendente. */
export interface SmmAddFundsParams {
  amount: number;
  method:
    | "mercadopago"
    | "stripe"
    | "crypto"
    | "manual"
    | "paypal"
    | "paytm"
    | "cryptomus"
    | "cardinity"
    | "binance_pay";
}

/** Resposta de `action=add_funds`. */
export interface SmmAddFundsResult {
  payment: string;
  status: string;
  amount: string;
  currency: string;
  method: SmmAddFundsParams["method"];
  message: string;
}

/** Uma linha estruturada do `action=mass_order`. */
export interface SmmMassOrderLine {
  service: number | string;
  link: string;
  quantity: number;
}

/**
 * Resposta de `action=mass_order` — pedidos criados + erros por linha.
 * Uma linha que falha não derruba as demais.
 */
export interface SmmMassOrderResult {
  orders: Array<{ line: number; order: number | string }>;
  errors: Array<{ line: number; reason: string }>;
}

/** Parâmetros de `action=subscription_create` — assinatura recorrente do user. */
export interface SmmSubscriptionCreateParams {
  service: number | string;
  link: string;
  quantity: number;
  runs: number;
  /** Intervalo entre ciclos em MINUTOS. */
  interval: number;
}

/** Resposta de `action=subscription_create`. */
export interface SmmSubscriptionCreateResult {
  subscription: string;
  status: string;
  runs: number;
  remaining_runs: number;
  interval: number;
  next_run: string | null;
}

/** Item de `action=subscriptions` — assinatura do próprio usuário. */
export interface SmmSubscriptionListItem {
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

/**
 * Resposta de `action=coupon_validate` — validação/preview (NÃO resgata).
 * Quando `valid=false`, `reason` traz o motivo legível.
 */
export interface SmmCouponPreview {
  valid: boolean;
  reason?: string;
  code?: string;
  kind?: "deposit_bonus" | "wallet_credit";
  /** deposit_bonus = percentual; wallet_credit = valor fixo creditado. */
  value?: string;
  minAmount?: string | null;
  expiresAt?: string | null;
}

/** Resposta de `action=affiliate_stats` — stats + link DO PRÓPRIO user. */
export interface SmmAffiliateStats {
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

/** Resposta de `action=loyalty_status` — tier/pontos DO próprio user. */
export interface SmmLoyaltyStatus {
  tier: "new" | "frequent" | "vip" | "elite" | string;
  label: string;
  next_threshold: number | null;
  progress_pct: number;
  points_balance: number;
  lifetime_spent: string;
  currency: string;
}

/** Parâmetros de `action=recommend` — serviço-âncora e/ou plataforma. */
export interface SmmRecommendParams {
  service?: number | string;
  platform?: string;
  limit?: number;
}

/** Item recomendado (`action=recommend`). */
export interface SmmRecommendedService {
  service: number | string;
  name: string;
  category: string;
  platform: string | null;
  rate: string;
  min: string;
  max: string;
  refill: boolean;
  reason: "bought_together" | "same_platform" | "popular" | string;
}

/** Parâmetros de `action=campaign_build` — devolve um PLANO (não cria pedido). */
export interface SmmCampaignBuildParams {
  service?: number | string;
  platform?: string;
  boost_type?: string;
  link?: string;
  budget: number;
  /** Janela de entrega gradual em dias. */
  days: number;
}

/** Uma execução do cronograma do plano de campanha. */
export interface SmmCampaignScheduleEntry {
  run: number;
  quantity: number;
  dayOffset: number;
}

/** PLANO de campanha (`action=campaign_build`) — proposta para revisão. */
export interface SmmCampaignPlan {
  feasible: boolean;
  reason?: "no_service" | "budget_too_low" | "invalid_input" | string;
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
  schedule?: SmmCampaignScheduleEntry[];
  params: {
    platform?: string;
    boostType?: string;
    serviceId?: number | string;
    budget: number;
    days: number;
  };
}

/** Pacote público de uma storefront (`action=storefront`). */
export interface SmmStorefrontPackage {
  id: string;
  title: string;
  description: string | null;
  quantity: number;
  /** Preço de campanha EXIBIDO (referência); o cobrado é recalculado no servidor. */
  price: string;
  serviceName: string | null;
}

/** Loja pública resolvida pelo slug (`action=storefront`). */
export interface SmmStorefront {
  slug: string;
  title: string;
  description: string | null;
  theme: string;
  locale: string;
  packages: SmmStorefrontPackage[];
}

export interface SmmV2ClientOptions {
  apiUrl: string;
  apiKey: string;
  /** timeout em ms (default 30000) */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class SmmV2Error extends Error {
  constructor(message: string, readonly raw?: unknown) {
    super(message);
    this.name = "SmmV2Error";
  }
}

/** Cliente para consumir QUALQUER fornecedor SMM API v2. */
export class SmmV2Client {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: SmmV2ClientOptions) {
    this.apiUrl = opts.apiUrl;
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async call<T>(action: SmmAction, params: Record<string, unknown> = {}): Promise<T> {
    const body = new URLSearchParams({ key: this.apiKey, action });
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) body.set(k, String(v));
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: ctrl.signal,
      });
      if (!res.ok) throw new SmmV2Error(`HTTP ${res.status} do fornecedor`);
      const data = (await res.json()) as T & { error?: string };
      if (data && typeof data === "object" && "error" in data && data.error) {
        throw new SmmV2Error(String(data.error), data);
      }
      return data as T;
    } catch (err) {
      if (err instanceof SmmV2Error) throw err;
      throw new SmmV2Error(`Falha ao chamar fornecedor (${action})`, err);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Lista todos os serviços do fornecedor. */
  services(): Promise<SmmService[]> {
    return this.call<SmmService[]>("services");
  }

  /**
   * Cria um pedido. Retorna `{ order }`.
   *
   * Drip-feed: passe `runs` + `interval` (intervalo em minutos) para fracionar a
   * entrega em N execuções — só em serviços com `dripfeed: true`.
   */
  add(params: SmmAddOrderParams): Promise<{ order: number }> {
    return this.call<{ order: number }>("add", params as unknown as Record<string, unknown>);
  }

  /** Status de 1 pedido. */
  status(order: number | string): Promise<SmmOrderStatus> {
    return this.call<SmmOrderStatus>("status", { order });
  }

  /** Status de vários pedidos (CSV). Resposta: `{ [orderId]: SmmOrderStatus }`. */
  multiStatus(orders: Array<number | string>): Promise<Record<string, SmmOrderStatus>> {
    return this.call<Record<string, SmmOrderStatus>>("status", { orders: orders.join(",") });
  }

  /** Pede refill de 1 pedido. */
  refill(order: number | string): Promise<{ refill: number | string }> {
    return this.call<{ refill: number | string }>("refill", { order });
  }

  /** Cancela pedidos (CSV). */
  cancel(orders: Array<number | string>): Promise<Array<{ order: number; cancel: unknown }>> {
    return this.call<Array<{ order: number; cancel: unknown }>>("cancel", { orders: orders.join(",") });
  }

  /** Saldo atual no fornecedor. */
  balance(): Promise<SmmBalance> {
    return this.call<SmmBalance>("balance");
  }

  /**
   * Status de UMA reposição. Aceita o id da linha de refill (`refill`) OU o id do
   * pedido (`order`, pega a reposição mais recente daquele pedido). Resposta:
   * `{ status }` ou `{ error }`.
   */
  refillStatus(ref: { refill: number | string } | { order: number | string }): Promise<
    { status: string } | { error: string }
  > {
    return this.call<{ status: string } | { error: string }>(
      "refill_status",
      ref as Record<string, unknown>,
    );
  }

  /* ─────────────── extensões SocialGO (escopadas ao userId da key) ─────────────── */

  /** Histórico de pedidos do próprio revendedor. */
  orders(): Promise<SmmOrderListItem[]> {
    return this.call<SmmOrderListItem[]>("orders");
  }

  /** Saldo + extrato recente da carteira do revendedor. */
  wallet(): Promise<SmmWallet> {
    return this.call<SmmWallet>("wallet");
  }

  /** Cria um pagamento pendente para recarregar a carteira (conclui no painel). */
  addFunds(params: SmmAddFundsParams): Promise<SmmAddFundsResult> {
    return this.call<SmmAddFundsResult>("add_funds", params as unknown as Record<string, unknown>);
  }

  /**
   * Vários pedidos numa chamada. Aceita uma LISTA estruturada de linhas OU um
   * texto CSV (`service|link|quantity`, uma linha por pedido). Cada linha é
   * independente — uma falha não derruba as demais.
   *
   * A lista estruturada é serializada para o formato CSV `service|link|quantity`
   * (uma linha por pedido) porque o transporte é form-urlencoded; o servidor faz
   * o parse linha a linha (linhas inválidas viram erros, sem derrubar as demais).
   */
  massOrder(orders: SmmMassOrderLine[] | string): Promise<SmmMassOrderResult> {
    const csv =
      typeof orders === "string"
        ? orders
        : orders.map((o) => `${o.service}|${o.link}|${o.quantity}`).join("\n");
    return this.call<SmmMassOrderResult>("mass_order", { orders: csv });
  }

  /** Cria uma assinatura recorrente do próprio usuário. */
  subscriptionCreate(
    params: SmmSubscriptionCreateParams,
  ): Promise<SmmSubscriptionCreateResult> {
    return this.call<SmmSubscriptionCreateResult>(
      "subscription_create",
      params as unknown as Record<string, unknown>,
    );
  }

  /** Lista as assinaturas do próprio usuário. */
  subscriptions(): Promise<SmmSubscriptionListItem[]> {
    return this.call<SmmSubscriptionListItem[]>("subscriptions");
  }

  /** Valida/preview um cupom (NÃO resgata). */
  couponValidate(code: string): Promise<SmmCouponPreview> {
    return this.call<SmmCouponPreview>("coupon_validate", { code });
  }

  /** Stats + link de afiliado do PRÓPRIO usuário. */
  affiliateStats(): Promise<SmmAffiliateStats> {
    return this.call<SmmAffiliateStats>("affiliate_stats");
  }

  /** Tier/pontos do PRÓPRIO usuário. */
  loyaltyStatus(): Promise<SmmLoyaltyStatus> {
    return this.call<SmmLoyaltyStatus>("loyalty_status");
  }

  /** Serviços recomendados por serviço-âncora e/ou plataforma. */
  recommend(params: SmmRecommendParams = {}): Promise<SmmRecommendedService[]> {
    return this.call<SmmRecommendedService[]>(
      "recommend",
      params as unknown as Record<string, unknown>,
    );
  }

  /** Devolve um PLANO de campanha (não cria pedido sozinho). */
  campaignBuild(params: SmmCampaignBuildParams): Promise<SmmCampaignPlan> {
    return this.call<SmmCampaignPlan>(
      "campaign_build",
      params as unknown as Record<string, unknown>,
    );
  }

  /** Resolve uma loja pública pelo slug → pacotes. */
  storefront(slug: string): Promise<SmmStorefront> {
    return this.call<SmmStorefront>("storefront", { slug });
  }
}
