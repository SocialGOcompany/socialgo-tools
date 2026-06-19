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
  | "balance";

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

  /** Cria um pedido. Retorna `{ order }`. */
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
}
