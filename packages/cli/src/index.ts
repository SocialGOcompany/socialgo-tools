#!/usr/bin/env node
/**
 * socialgo — CLI para operar o painel SMM SocialGO pelo terminal.
 *
 * Fala com a API do SocialGO pelo endpoint de revendedor (SMM API v2,
 * `POST /api/v2`): `key` + `action`. Cobre o fluxo de revenda completo —
 * catálogo, pedidos (com params por tipo), status, refill, cancel e carteira.
 *
 * Config por ambiente (ou flags globais --api-url / --key):
 *   SOCIALGO_API_URL   base da API (default https://api.usesocialgo.com)
 *   SOCIALGO_API_KEY   chave de revendedor (SMM API v2)
 *
 * Exemplos:
 *   socialgo config
 *   socialgo balance
 *   socialgo services search "instagram seguidores"
 *   socialgo service 1234
 *   socialgo order add --service 1234 --link <url> --quantity 1000
 *   socialgo order add --service 55 --link <url> --comments comentarios.txt
 *   socialgo order status 98765 4321
 *   socialgo order refill 98765
 *   socialgo order cancel 98765 4321
 *   socialgo refill-status --order 98765
 *   socialgo orders
 */
import { readFileSync } from "node:fs";
import { Command } from "commander";
import {
  SocialGoApiError,
  SocialGoClient,
  type CancelResultItem,
  type CatalogService,
  type GuestCheckoutMethod,
  type GuestOrderStatus,
  type GuestService,
  type OrderListItem,
  type OrderTypeParams,
  type RecommendedService,
  type StorefrontPackage,
  type SubscriptionListItem,
  UUID_RE,
} from "./client.js";
import type { SmmOrderStatus } from "@socialgo/sdk";

// ---- helpers de saída -------------------------------------------------------

const isTTY = process.stdout.isTTY;
const c = {
  dim: (s: string) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s: string) => (isTTY ? `\x1b[1m${s}\x1b[0m` : s),
  green: (s: string) => (isTTY ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s: string) => (isTTY ? `\x1b[31m${s}\x1b[0m` : s),
  cyan: (s: string) => (isTTY ? `\x1b[36m${s}\x1b[0m` : s),
  yellow: (s: string) => (isTTY ? `\x1b[33m${s}\x1b[0m` : s),
};

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}

function fail(msg: string): never {
  process.stderr.write(`${c.red("✖")} ${msg}\n`);
  process.exit(1);
}

/** Resolve erros de forma amigável e termina com código != 0. */
function handleError(err: unknown): never {
  if (err instanceof SocialGoApiError) {
    const suffix = err.status ? c.dim(` (HTTP ${err.status})`) : "";
    fail(`${err.message}${suffix}`);
  }
  fail(err instanceof Error ? err.message : String(err));
}

function shouldJson(): boolean {
  return Boolean(program.opts().json);
}

function printJson(value: unknown): void {
  out(JSON.stringify(value, null, 2));
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function padStart(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

function bool(v: unknown): string {
  return v ? c.green("sim") : c.dim("não");
}

function colorStatus(s: string): string {
  const v = (s ?? "").toLowerCase();
  if (v.includes("complete")) return c.green(s);
  if (v.includes("cancel") || v.includes("error") || v.includes("fail") || v.includes("reject")) return c.red(s);
  if (v.includes("partial")) return c.yellow(s);
  return c.cyan(s);
}

/**
 * Lê o valor de um param de lista (--comments/--usernames/...). Se o valor for
 * um caminho de arquivo existente, usa o conteúdo; senão usa o texto literal
 * (permitindo passar listas inline separadas por nova linha).
 */
function readListArg(value: string): string {
  try {
    return readFileSync(value, "utf8");
  } catch {
    return value;
  }
}

function renderServicesTable(services: CatalogService[]): void {
  if (services.length === 0) {
    out(c.yellow("Nenhum serviço encontrado."));
    return;
  }
  const rows = services.map((s) => ({
    id: String(s.service ?? ""),
    name: String(s.name ?? ""),
    type: String(s.type ?? ""),
    category: String(s.category ?? ""),
    rate: String(s.rate ?? ""),
    min: String(s.min ?? ""),
    max: String(s.max ?? ""),
  }));

  const w = {
    id: Math.max(2, ...rows.map((r) => r.id.length)),
    name: Math.min(42, Math.max(4, ...rows.map((r) => r.name.length))),
    type: Math.min(18, Math.max(4, ...rows.map((r) => r.type.length))),
    category: Math.min(24, Math.max(8, ...rows.map((r) => r.category.length))),
    rate: Math.max(11, ...rows.map((r) => r.rate.length)),
    min: Math.max(3, ...rows.map((r) => r.min.length)),
    max: Math.max(3, ...rows.map((r) => r.max.length)),
  };

  const header = [
    c.bold(pad("ID", w.id)),
    c.bold(pad("NOME", w.name)),
    c.bold(pad("TIPO", w.type)),
    c.bold(pad("CATEGORIA", w.category)),
    c.bold(padStart("RATE/1k", w.rate)),
    c.bold(padStart("MIN", w.min)),
    c.bold(padStart("MAX", w.max)),
  ].join("  ");
  out(header);

  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  for (const r of rows) {
    out(
      [
        c.cyan(pad(r.id, w.id)),
        pad(clip(r.name, w.name), w.name),
        c.dim(pad(clip(r.type, w.type), w.type)),
        c.dim(pad(clip(r.category, w.category), w.category)),
        padStart(r.rate, w.rate),
        padStart(r.min, w.min),
        padStart(r.max, w.max),
      ].join("  "),
    );
  }
  out();
  out(c.dim(`${services.length} serviço(s).`));
}

function renderOrdersTable(orders: OrderListItem[]): void {
  if (orders.length === 0) {
    out(c.yellow("Nenhum pedido encontrado."));
    return;
  }
  const rows = orders.map((o) => ({
    id: String(o.order ?? ""),
    status: String(o.status ?? ""),
    charge: String(o.charge ?? ""),
    qty: String(o.quantity ?? ""),
    remains: String(o.remains ?? ""),
    link: String(o.link ?? ""),
  }));
  const w = {
    id: Math.max(2, ...rows.map((r) => r.id.length)),
    status: Math.max(8, ...rows.map((r) => r.status.length)),
    charge: Math.max(8, ...rows.map((r) => r.charge.length)),
    qty: Math.max(4, ...rows.map((r) => r.qty.length)),
    remains: Math.max(8, ...rows.map((r) => r.remains.length)),
  };
  out(
    [
      c.bold(pad("ID", w.id)),
      c.bold(pad("STATUS", w.status)),
      c.bold(padStart("CARGA", w.charge)),
      c.bold(padStart("QTD", w.qty)),
      c.bold(padStart("RESTANTE", w.remains)),
      c.bold("LINK"),
    ].join("  "),
  );
  for (const r of rows) {
    const link = r.link.length > 44 ? r.link.slice(0, 43) + "…" : r.link;
    out(
      [
        c.cyan(pad(r.id, w.id)),
        pad(colorStatus(r.status), w.status + (colorStatus(r.status).length - r.status.length)),
        padStart(r.charge, w.charge),
        padStart(r.qty, w.qty),
        padStart(r.remains, w.remains),
        c.dim(link),
      ].join("  "),
    );
  }
  out();
  out(c.dim(`${orders.length} pedido(s).`));
}

function renderGuestServicesTable(services: GuestService[]): void {
  if (services.length === 0) {
    out(c.yellow("Nenhum serviço encontrado."));
    return;
  }
  const rows = services.map((s) => ({
    id: String(s.id ?? ""),
    name: String(s.name ?? ""),
    platform: String(s.platform ?? ""),
    category: String(s.categoryName ?? ""),
    rate: String(s.sellRate ?? ""),
    min: String(s.min ?? ""),
    max: String(s.max ?? ""),
  }));
  const w = {
    id: Math.max(2, ...rows.map((r) => r.id.length)),
    name: Math.min(42, Math.max(4, ...rows.map((r) => r.name.length))),
    platform: Math.min(14, Math.max(8, ...rows.map((r) => r.platform.length))),
    category: Math.min(24, Math.max(8, ...rows.map((r) => r.category.length))),
    rate: Math.max(11, ...rows.map((r) => r.rate.length)),
    min: Math.max(3, ...rows.map((r) => r.min.length)),
    max: Math.max(3, ...rows.map((r) => r.max.length)),
  };
  out(
    [
      c.bold(pad("ID", w.id)),
      c.bold(pad("NOME", w.name)),
      c.bold(pad("PLATAFORMA", w.platform)),
      c.bold(pad("CATEGORIA", w.category)),
      c.bold(padStart("RATE/1k", w.rate)),
      c.bold(padStart("MIN", w.min)),
      c.bold(padStart("MAX", w.max)),
    ].join("  "),
  );
  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  for (const r of rows) {
    out(
      [
        c.cyan(pad(r.id, w.id)),
        pad(clip(r.name, w.name), w.name),
        c.dim(pad(clip(r.platform, w.platform), w.platform)),
        c.dim(pad(clip(r.category, w.category), w.category)),
        padStart(r.rate, w.rate),
        padStart(r.min, w.min),
        padStart(r.max, w.max),
      ].join("  "),
    );
  }
  out();
  out(c.dim(`${services.length} serviço(s). Use o ID em: socialgo guest-order --email <email> <ID>`));
}

function renderGuestStatus(status: GuestOrderStatus): void {
  out(`${c.bold("Pedido")} ${c.cyan(status.id)}`);
  out(`  ${c.bold("Status")}     ${colorStatus(status.status)}`);
  if (status.serviceName) out(`  ${c.bold("Serviço")}    ${status.serviceName}`);
  out(`  ${c.bold("Link")}       ${status.link}`);
  out(`  ${c.bold("Qtd")}        ${status.quantity}`);
  out(`  ${c.bold("Cobrança")}   ${status.charge}`);
  if (status.startCount !== null) out(`  ${c.bold("Início")}     ${status.startCount}`);
  if (status.remains !== null) out(`  ${c.bold("Restante")}   ${status.remains}`);
  out(`  ${c.bold("Criado em")}  ${c.dim(status.createdAt)}`);
}

function renderOrderStatus(id: string, status: SmmOrderStatus): void {
  out(`${c.bold("Pedido")} ${c.cyan(id)}`);
  out(`  ${c.bold("Status")}       ${colorStatus(status.status)}`);
  out(`  ${c.bold("Cobrança")}     ${status.charge} ${status.currency ?? ""}`.trimEnd());
  out(`  ${c.bold("Início")}       ${status.start_count}`);
  out(`  ${c.bold("Restante")}     ${status.remains}`);
}

function renderSubscriptionsTable(subs: SubscriptionListItem[]): void {
  if (subs.length === 0) {
    out(c.yellow("Nenhuma assinatura encontrada."));
    return;
  }
  const rows = subs.map((s) => ({
    id: String(s.subscription ?? ""),
    service: String(s.service ?? ""),
    status: String(s.status ?? ""),
    qty: String(s.quantity ?? ""),
    runs: `${s.remaining_runs ?? "?"}/${s.runs ?? "?"}`,
    interval: `${s.interval ?? "?"}min`,
    next: String(s.next_run ?? ""),
  }));
  const w = {
    id: Math.max(2, ...rows.map((r) => r.id.length)),
    service: Math.max(7, ...rows.map((r) => r.service.length)),
    status: Math.max(8, ...rows.map((r) => r.status.length)),
    qty: Math.max(3, ...rows.map((r) => r.qty.length)),
    runs: Math.max(5, ...rows.map((r) => r.runs.length)),
    interval: Math.max(8, ...rows.map((r) => r.interval.length)),
  };
  out(
    [
      c.bold(pad("ID", w.id)),
      c.bold(pad("SERVIÇO", w.service)),
      c.bold(pad("STATUS", w.status)),
      c.bold(padStart("QTD", w.qty)),
      c.bold(padStart("RUNS", w.runs)),
      c.bold(padStart("INTERVALO", w.interval)),
      c.bold("PRÓXIMO"),
    ].join("  "),
  );
  for (const r of rows) {
    out(
      [
        c.cyan(pad(r.id, w.id)),
        c.dim(pad(r.service, w.service)),
        pad(colorStatus(r.status), w.status + (colorStatus(r.status).length - r.status.length)),
        padStart(r.qty, w.qty),
        padStart(r.runs, w.runs),
        padStart(r.interval, w.interval),
        c.dim(r.next || "—"),
      ].join("  "),
    );
  }
  out();
  out(c.dim(`${subs.length} assinatura(s). (runs = restantes/total)`));
}

function renderRecommendTable(items: RecommendedService[]): void {
  if (items.length === 0) {
    out(c.yellow("Nenhuma recomendação encontrada."));
    return;
  }
  const rows = items.map((s) => ({
    id: String(s.service ?? ""),
    name: String(s.name ?? ""),
    platform: String(s.platform ?? ""),
    rate: String(s.rate ?? ""),
    reason: String(s.reason ?? ""),
  }));
  const w = {
    id: Math.max(2, ...rows.map((r) => r.id.length)),
    name: Math.min(42, Math.max(4, ...rows.map((r) => r.name.length))),
    platform: Math.min(14, Math.max(9, ...rows.map((r) => r.platform.length))),
    rate: Math.max(7, ...rows.map((r) => r.rate.length)),
  };
  out(
    [
      c.bold(pad("ID", w.id)),
      c.bold(pad("NOME", w.name)),
      c.bold(pad("PLATAFORMA", w.platform)),
      c.bold(padStart("RATE/1k", w.rate)),
      c.bold("MOTIVO"),
    ].join("  "),
  );
  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  for (const r of rows) {
    out(
      [
        c.cyan(pad(r.id, w.id)),
        pad(clip(r.name, w.name), w.name),
        c.dim(pad(clip(r.platform || "—", w.platform), w.platform)),
        padStart(r.rate, w.rate),
        c.dim(r.reason),
      ].join("  "),
    );
  }
  out();
  out(c.dim(`${items.length} recomendação(ões).`));
}

function renderStorefrontPackages(pkgs: StorefrontPackage[]): void {
  if (pkgs.length === 0) {
    out(c.yellow("Esta loja não tem pacotes publicados."));
    return;
  }
  for (const p of pkgs) {
    out(`  ${c.cyan(p.id)}  ${c.bold(p.title)}`);
    const line = [
      p.serviceName ? c.dim(p.serviceName) : "",
      `qtd ${p.quantity}`,
      c.green(p.price),
    ]
      .filter(Boolean)
      .join("  ·  ");
    out(`      ${line}`);
    if (p.description) out(`      ${c.dim(p.description)}`);
  }
  out();
  out(c.dim(`${pkgs.length} pacote(s). Preço exibido é referência; o cobrado é recalculado no servidor.`));
}

// ---- CLI --------------------------------------------------------------------

const program = new Command();

program
  .name("socialgo")
  .description("CLI do SocialGO — catálogo, pedidos, refill/cancel, saldo e admin de um painel SMM (API v2).")
  .version("0.2.0")
  .option("--json", "saída em JSON cru (para scripts)", false)
  .option("--api-url <url>", "base da API (sobrescreve SOCIALGO_API_URL)")
  .option("--key <key>", "chave de API SMM (sobrescreve SOCIALGO_API_KEY)")
  .option(
    "--token <jwt>",
    "token de SESSÃO do usuário, JWT (sobrescreve SOCIALGO_TOKEN) — só p/ comandos de gestão (sub-reseller/points)",
  )
  .addHelpText(
    "after",
    `
Caminho PRINCIPAL — GUEST (sem conta, sem cadastro, sem chave):
  ${c.bold("Qualquer um compra sem ter conta.")} NÃO precisa de SOCIALGO_API_KEY.
    Comandos guest-*: ${c.cyan("guest-services")} → ${c.cyan("guest-gateways")} → ${c.cyan("guest-order")} → ${c.cyan("guest-status")}.
    Cross-sell keyless (próximos passos): ${c.cyan("guest-recommend")} — sem conta, sem chave.
    O e-mail no guest-order é só CONTATO (recibo/rastreio) — não cria conta nem senha.

Opcional — REVENDEDOR (com conta + chave), para MELHOR ACOMPANHAMENTO:
  Histórico de pedidos, carteira/saldo, refill, assinaturas. Requer SOCIALGO_API_KEY.
    Demais comandos (balance, services, order, wallet, …). Só use se já tiver conta.

Gestão/acompanhamento AUTENTICADA (requer SOCIALGO_TOKEN — JWT de usuário logado):
  Painel de sub-revenda e gamificação. NÃO usa a SOCIALGO_API_KEY; é um token de sessão.
    ${c.cyan("sub-reseller")} (dashboard/clients/create-client/markup/recharge/orders/profit/invite)
    ${c.cyan("points")} (rewards/claim-streak/missions/claim-mission/roulette/spin/badges/leaderboard/perks/referrals/milestones/redeem)
    ${c.cyan("reseller-checkout")} (compra o plano de revendedor)

Configuração:
  ${c.bold("SOCIALGO_API_URL")} aponta a base da API (default https://api.usesocialgo.com).
  ${c.bold("SOCIALGO_API_KEY")} é OPCIONAL: só os comandos de REVENDEDOR a usam. Os guest-* são keyless.
  Use as flags globais --api-url e --key, ou veja: ${c.cyan("socialgo config")}

Exemplos (GUEST — sem conta, sem chave) — caminho principal:
  socialgo guest-services --platform instagram --q seguidores   # <serviceId> = UUID na coluna ID
  socialgo guest-gateways
  socialgo guest-order <serviceId> --email voce@ex.com --link https://insta.com/seuperfil --quantity 1000
  socialgo guest-recommend --platform instagram          # cross-sell sem chave
  socialgo guest-status <orderId> --token <guestToken>

Exemplos (REVENDEDOR — requer chave):
  socialgo config
  socialgo balance
  socialgo services search "instagram seguidores"
  socialgo service 1234
  socialgo order add --service 1234 --link https://insta.com/p/x --quantity 1000
  socialgo order add --service 55 --link <url> --comments ./comentarios.txt
  socialgo order add --service 70 --link <url> --runs 10 --interval 30
  socialgo order status 98765 4321
  socialgo order refill 98765
  socialgo order cancel 98765 4321
  socialgo refill-status --order 98765
  socialgo orders
  socialgo mass-order --line "1234|https://insta.com/p/a|1000" --line "55|https://insta.com/p/b|500"
  socialgo subscription create --service 70 --link <url> --quantity 100 --runs 30 --interval 1440
  socialgo subscription list
  socialgo coupon validate PROMO10
  socialgo affiliate stats
  socialgo affiliate request-payout --amount 50 --method pix --yes   # SACA (requer token)
  socialgo loyalty
  socialgo recommend 1234
  socialgo campaign build --budget 100 --days 30 --platform instagram --goal followers
  socialgo storefront minha-loja
`,
  );

function getClient(): SocialGoClient {
  const opts = program.opts<{ apiUrl?: string; key?: string; token?: string }>();
  return new SocialGoClient({ baseUrl: opts.apiUrl, apiKey: opts.key, token: opts.token });
}

// config -----------------------------------------------------------------------

program
  .command("config")
  .description("mostra a configuração atual (base da API + se há chave) e como defini-la")
  .action(() => {
    const opts = program.opts<{ apiUrl?: string; key?: string; token?: string }>();
    const client = getClient();
    if (shouldJson()) {
      return printJson({
        apiUrl: client.resolvedBaseUrl,
        hasKey: client.hasKey,
        hasToken: client.hasToken,
        source: {
          apiUrl: opts.apiUrl ? "--api-url" : process.env.SOCIALGO_API_URL ? "SOCIALGO_API_URL" : "default",
          key: opts.key ? "--key" : process.env.SOCIALGO_API_KEY ? "SOCIALGO_API_KEY" : "none",
          token: opts.token
            ? "--token"
            : process.env.SOCIALGO_TOKEN
              ? "SOCIALGO_TOKEN"
              : process.env.SOCIALGO_USER_TOKEN
                ? "SOCIALGO_USER_TOKEN"
                : "none",
        },
      });
    }
    out(c.bold("Configuração SocialGO CLI"));
    out(`  ${c.bold("API URL")}  ${c.cyan(client.resolvedBaseUrl)}`);
    out(
      `  ${c.bold("Chave")}    ${client.hasKey ? c.green("definida") : c.yellow("ausente (opcional)")}`,
    );
    out(
      `  ${c.bold("Token")}    ${client.hasToken ? c.green("definido") : c.yellow("ausente (só p/ gestão: sub-reseller/points)")}`,
    );
    out();
    if (!client.hasKey) {
      out(c.green("Sem chave você JÁ pode comprar sem conta (modo guest, pay-per-order):"));
      out(c.dim("  socialgo guest-services --platform instagram --q seguidores"));
      out(c.dim("  socialgo guest-order <serviceId> --email voce@ex.com --link <url> --quantity 1000"));
      out();
      out(c.dim("A chave SÓ é necessária para os comandos de REVENDEDOR (saldo/pedidos da conta):"));
      out(c.dim('  export SOCIALGO_API_KEY="sua-chave"   # opcional — só para modo conta'));
      out(c.dim('  export SOCIALGO_API_URL="https://seu-painel.com"   # opcional'));
      out(c.dim("  # ou por execução: socialgo --key <chave> --api-url <url> balance"));
    }
  });

// services ---------------------------------------------------------------------

const services = program.command("services").description("catálogo de serviços");

services
  .command("list")
  .description("lista o catálogo completo")
  .action(async () => {
    try {
      const all = await getClient().listServices();
      if (shouldJson()) return printJson(all);
      renderServicesTable(all);
    } catch (err) {
      handleError(err);
    }
  });

services
  .command("search <query>")
  .description("busca serviços por termo (nome, categoria, tipo ou id)")
  .action(async (query: string) => {
    try {
      const found = await getClient().searchServices(query);
      if (shouldJson()) return printJson(found);
      out(c.dim(`Busca: "${query}"`));
      renderServicesTable(found);
    } catch (err) {
      handleError(err);
    }
  });

// service <id> (detalhe) -------------------------------------------------------

program
  .command("service <id>")
  .description("detalha um serviço do catálogo pelo id")
  .action(async (id: string) => {
    try {
      const svc = await getClient().getService(id);
      if (!svc) fail(`Serviço ${id} não encontrado no catálogo.`);
      if (shouldJson()) return printJson(svc);
      out(`${c.bold("Serviço")} ${c.cyan(String(svc.service))}`);
      out(`  ${c.bold("Nome")}       ${svc.name}`);
      out(`  ${c.bold("Tipo")}       ${svc.type}`);
      out(`  ${c.bold("Categoria")}  ${svc.category}`);
      out(`  ${c.bold("Rate/1k")}    ${svc.rate}`);
      out(`  ${c.bold("Min / Max")}  ${svc.min} / ${svc.max}`);
      out(`  ${c.bold("Refill")}     ${bool(svc.refill)}`);
      out(`  ${c.bold("Cancel")}     ${bool(svc.cancel)}`);
      out(`  ${c.bold("Dripfeed")}   ${bool(svc.dripfeed)}`);
    } catch (err) {
      handleError(err);
    }
  });

// order ------------------------------------------------------------------------

const order = program.command("order").description("pedidos: criar, status, refill, cancel");

order
  .command("add")
  .alias("create")
  .description("cria um pedido (suporta drip-feed e params por tipo de serviço)")
  .requiredOption("--service <id>", "id do serviço")
  .requiredOption("--link <url>", "link de destino (perfil/post/vídeo)")
  .option("--quantity <n>", "quantidade (opcional p/ tipos derivados de lista, ex.: comments)", (v) => parseInt(v, 10))
  .option("--runs <n>", "drip-feed: número de execuções", (v) => parseInt(v, 10))
  .option("--interval <min>", "drip-feed: intervalo em minutos", (v) => parseInt(v, 10))
  .option("--comments <txt|arquivo>", "Custom Comments: 1 comentário por linha (texto ou caminho de arquivo)")
  .option("--usernames <txt|arquivo>", "Mentions Custom List / with Hashtags: 1 @usuário por linha")
  .option("--hashtags <txt|arquivo>", "Mentions with Hashtags: hashtags (1 por linha)")
  .option("--hashtag <tag>", "Mentions Hashtag: uma hashtag-alvo")
  .option("--username <user>", "Mentions User Followers / Comment Likes: usuário-alvo")
  .option("--media <url>", "Mentions Media Likers: mídia-alvo")
  .option("--answer-number <n>", "Poll: número da resposta", (v) => parseInt(v, 10))
  .addHelpText(
    "after",
    `
Params por tipo de serviço (envie só os que o tipo exige):
  Default / Package         --quantity
  Drip-feed                 --quantity --runs --interval
  Custom Comments           --comments (arquivo ou texto, 1 por linha)
  Mentions Custom List      --usernames
  Mentions with Hashtags    --usernames --hashtags
  Mentions Hashtag          --hashtag
  Mentions User Followers   --username
  Mentions Media Likers     --media
  Comment Likes             --username
  Poll                      --answer-number
`,
  )
  .action(
    async (opts: {
      service: string;
      link: string;
      quantity?: number;
      runs?: number;
      interval?: number;
      comments?: string;
      usernames?: string;
      hashtags?: string;
      hashtag?: string;
      username?: string;
      media?: string;
      answerNumber?: number;
    }) => {
      try {
        if (opts.quantity !== undefined && (!Number.isFinite(opts.quantity) || opts.quantity <= 0)) {
          fail("--quantity precisa ser um número inteiro positivo.");
        }
        // params por tipo: --comments/--usernames/--hashtags aceitam arquivo.
        const typeParams: OrderTypeParams = {};
        if (opts.comments !== undefined) typeParams.comments = readListArg(opts.comments);
        if (opts.usernames !== undefined) typeParams.usernames = readListArg(opts.usernames);
        if (opts.hashtags !== undefined) typeParams.hashtags = readListArg(opts.hashtags);
        if (opts.hashtag !== undefined) typeParams.hashtag = opts.hashtag;
        if (opts.username !== undefined) typeParams.username = opts.username;
        if (opts.media !== undefined) typeParams.media = opts.media;
        if (opts.answerNumber !== undefined) typeParams.answer_number = opts.answerNumber;

        const created = await getClient().createOrder({
          service: opts.service,
          link: opts.link,
          quantity: Number.isFinite(opts.quantity as number) ? opts.quantity : undefined,
          runs: Number.isFinite(opts.runs as number) ? opts.runs : undefined,
          interval: Number.isFinite(opts.interval as number) ? opts.interval : undefined,
          ...typeParams,
        });
        if (shouldJson()) return printJson(created);
        out(`${c.green("✔")} Pedido criado.`);
        out(`  ${c.bold("Order ID")}  ${c.cyan(String(created.order))}`);
        out(`  ${c.bold("Serviço")}   ${opts.service}`);
        out(`  ${c.bold("Link")}      ${opts.link}`);
        if (opts.quantity) out(`  ${c.bold("Qtd")}       ${opts.quantity}`);
        if (opts.runs) out(`  ${c.bold("Runs")}      ${opts.runs}`);
        if (opts.interval) out(`  ${c.bold("Intervalo")} ${opts.interval} min`);
        out();
        out(c.dim(`Acompanhe: socialgo order status ${created.order}`));
      } catch (err) {
        handleError(err);
      }
    },
  );

order
  .command("status <ids...>")
  .description("status de um ou mais pedidos (vários ids = consulta em lote)")
  .action(async (ids: string[]) => {
    try {
      const client = getClient();
      if (ids.length === 1) {
        const status = await client.orderStatus(ids[0]);
        if (shouldJson()) return printJson(status);
        renderOrderStatus(ids[0], status);
        return;
      }
      const result = await client.multiOrderStatus(ids);
      if (shouldJson()) return printJson(result);
      let first = true;
      for (const id of ids) {
        const entry = result[id];
        if (!first) out();
        first = false;
        if (entry && "error" in entry) {
          out(`${c.bold("Pedido")} ${c.cyan(id)}  ${c.red(entry.error)}`);
        } else if (entry) {
          renderOrderStatus(id, entry as SmmOrderStatus);
        } else {
          out(`${c.bold("Pedido")} ${c.cyan(id)}  ${c.red("sem resposta")}`);
        }
      }
    } catch (err) {
      handleError(err);
    }
  });

order
  .command("refill <id>")
  .description("solicita refill (reposição) de um pedido")
  .action(async (id: string) => {
    try {
      const r = await getClient().refill(id);
      if (shouldJson()) return printJson(r);
      out(`${c.green("✔")} Refill solicitado para o pedido ${c.cyan(id)}.`);
      out(`  ${c.bold("Refill ID")}  ${c.cyan(String(r.refill))}`);
      out();
      out(c.dim(`Acompanhe: socialgo refill-status --refill ${r.refill}`));
    } catch (err) {
      handleError(err);
    }
  });

order
  .command("cancel <ids...>")
  .description("cancela um ou mais pedidos")
  .action(async (ids: string[]) => {
    try {
      const result = await getClient().cancel(ids);
      if (shouldJson()) return printJson(result);
      for (const item of result as CancelResultItem[]) {
        const cancel = item.cancel;
        if (cancel && typeof cancel === "object" && "error" in (cancel as Record<string, unknown>)) {
          out(`${c.red("✖")} Pedido ${c.cyan(String(item.order))}: ${String((cancel as { error: unknown }).error)}`);
        } else {
          out(`${c.green("✔")} Pedido ${c.cyan(String(item.order))} marcado para cancelamento.`);
        }
      }
    } catch (err) {
      handleError(err);
    }
  });

// refill-status ----------------------------------------------------------------

program
  .command("refill-status")
  .description("status de uma reposição — por id do refill (--refill) ou do pedido (--order)")
  .option("--refill <id>", "id da reposição (refill)")
  .option("--order <id>", "id do pedido (usa a reposição mais recente)")
  .action(async (opts: { refill?: string; order?: string }) => {
    try {
      if (!opts.refill && !opts.order) {
        fail("Informe --refill <id> ou --order <id>.");
      }
      const r = await getClient().refillStatus({ refill: opts.refill, order: opts.order });
      if (shouldJson()) return printJson(r);
      const ref = opts.refill ? `refill ${opts.refill}` : `pedido ${opts.order}`;
      out(`${c.bold("Reposição")} (${ref})`);
      out(`  ${c.bold("Status")}  ${colorStatus(r.status)}`);
    } catch (err) {
      handleError(err);
    }
  });

// orders (histórico) -----------------------------------------------------------

program
  .command("orders")
  .description("lista o histórico de pedidos do revendedor")
  .action(async () => {
    try {
      const list = await getClient().listOrders();
      if (shouldJson()) return printJson(list);
      renderOrdersTable(list);
    } catch (err) {
      handleError(err);
    }
  });

// mass-order -------------------------------------------------------------------

program
  .command("mass-order")
  .description("cria vários pedidos numa única chamada (cada linha é independente)")
  .option("--file <arquivo>", "arquivo CSV com uma linha por pedido: service|link|quantity")
  .option(
    "--line <s|l|q...>",
    "linha inline service|link|quantity (repita --line por pedido)",
    (val: string, acc: string[]) => {
      acc.push(val);
      return acc;
    },
    [] as string[],
  )
  .addHelpText(
    "after",
    `
Formato de cada linha (pipe-separado): ${c.bold("service|link|quantity")}

Exemplos:
  socialgo mass-order --line "1234|https://insta.com/p/a|1000" --line "55|https://insta.com/p/b|500"
  socialgo mass-order --file ./pedidos.csv
  # pedidos.csv:
  #   1234|https://insta.com/p/a|1000
  #   55|https://insta.com/p/b|500
`,
  )
  .action(async (opts: { file?: string; line: string[] }) => {
    try {
      let csv: string;
      if (opts.file) {
        csv = readFileSync(opts.file, "utf8");
      } else if (opts.line.length > 0) {
        csv = opts.line.join("\n");
      } else {
        fail("Informe --file <arquivo> ou ao menos uma --line \"service|link|quantity\".");
      }
      const result = await getClient().massOrder(csv);
      if (shouldJson()) return printJson(result);
      const created = result.orders ?? [];
      const errors = result.errors ?? [];
      if (created.length > 0) {
        out(c.bold(`${c.green("✔")} ${created.length} pedido(s) criado(s):`));
        for (const o of created) {
          out(`  ${c.dim(`linha ${o.line}`)}  Order ID ${c.cyan(String(o.order))}`);
        }
      }
      if (errors.length > 0) {
        if (created.length > 0) out();
        out(c.bold(`${c.red("✖")} ${errors.length} linha(s) com erro:`));
        for (const e of errors) {
          out(`  ${c.dim(`linha ${e.line}`)}  ${c.red(e.reason)}`);
        }
      }
      if (created.length === 0 && errors.length === 0) {
        out(c.yellow("Nenhum pedido processado."));
      }
    } catch (err) {
      handleError(err);
    }
  });

// subscription -----------------------------------------------------------------

const subscription = program
  .command("subscription")
  .description("assinaturas recorrentes (drip-feed agendado) do seu usuário");

subscription
  .command("create")
  .description("cria uma assinatura recorrente: entrega N execuções a cada X minutos")
  .requiredOption("--service <id>", "id do serviço")
  .requiredOption("--link <url>", "link de destino (perfil/post/vídeo)")
  .requiredOption("--quantity <n>", "quantidade por execução", (v) => parseInt(v, 10))
  .requiredOption("--runs <n>", "número total de execuções", (v) => parseInt(v, 10))
  .requiredOption("--interval <min>", "intervalo entre execuções, em minutos", (v) => parseInt(v, 10))
  .addHelpText(
    "after",
    `
Exemplo:
  socialgo subscription create --service 70 --link https://insta.com/u --quantity 100 --runs 30 --interval 1440
`,
  )
  .action(
    async (opts: { service: string; link: string; quantity: number; runs: number; interval: number }) => {
      try {
        for (const [flag, val] of [
          ["--quantity", opts.quantity],
          ["--runs", opts.runs],
          ["--interval", opts.interval],
        ] as const) {
          if (!Number.isFinite(val) || (val as number) <= 0) {
            fail(`${flag} precisa ser um número inteiro positivo.`);
          }
        }
        const r = await getClient().subscriptionCreate({
          service: opts.service,
          link: opts.link,
          quantity: opts.quantity,
          runs: opts.runs,
          interval: opts.interval,
        });
        if (shouldJson()) return printJson(r);
        out(`${c.green("✔")} Assinatura criada (${c.yellow(r.status)}).`);
        out(`  ${c.bold("Subscription ID")}  ${c.cyan(String(r.subscription))}`);
        out(`  ${c.bold("Execuções")}        ${r.remaining_runs}/${r.runs} restantes`);
        out(`  ${c.bold("Intervalo")}        ${r.interval} min`);
        if (r.next_run) out(`  ${c.bold("Próxima")}          ${c.dim(r.next_run)}`);
        out();
        out(c.dim("Acompanhe: socialgo subscription list"));
      } catch (err) {
        handleError(err);
      }
    },
  );

subscription
  .command("list")
  .description("lista as assinaturas do seu usuário")
  .action(async () => {
    try {
      const list = await getClient().subscriptions();
      if (shouldJson()) return printJson(list);
      renderSubscriptionsTable(list);
    } catch (err) {
      handleError(err);
    }
  });

// coupon -----------------------------------------------------------------------

const coupon = program.command("coupon").description("cupons");

coupon
  .command("validate <code>")
  .description("valida/preview um cupom (NÃO resgata)")
  .action(async (code: string) => {
    try {
      const r = await getClient().couponValidate(code);
      if (shouldJson()) return printJson(r);
      if (!r.valid) {
        out(`${c.red("✖")} Cupom ${c.cyan(code)} inválido.`);
        if (r.reason) out(`  ${c.dim(r.reason)}`);
        return;
      }
      out(`${c.green("✔")} Cupom ${c.cyan(r.code ?? code)} válido.`);
      if (r.kind) {
        const label = r.kind === "deposit_bonus" ? "bônus em depósito" : r.kind === "wallet_credit" ? "crédito na carteira" : r.kind;
        out(`  ${c.bold("Tipo")}        ${label}`);
      }
      if (r.value) {
        const suffix = r.kind === "deposit_bonus" ? "%" : "";
        out(`  ${c.bold("Valor")}       ${r.value}${suffix}`);
      }
      if (r.minAmount) out(`  ${c.bold("Mínimo")}      ${r.minAmount}`);
      if (r.expiresAt) out(`  ${c.bold("Expira em")}   ${c.dim(r.expiresAt)}`);
      out();
      out(c.dim("Preview apenas — o cupom é resgatado no momento do depósito/pedido."));
    } catch (err) {
      handleError(err);
    }
  });

// affiliate --------------------------------------------------------------------

const affiliate = program
  .command("affiliate")
  .description("programa de afiliados: stats/link (requer chave) · request-payout (requer token)");

affiliate
  .command("stats")
  .description("seus números de afiliado (indicações, comissões, saldo)")
  .action(async () => {
    try {
      const s = await getClient().affiliateStats();
      if (shouldJson()) return printJson(s);
      out(c.bold("Afiliado"));
      out(`  ${c.bold("Status")}        ${s.enabled ? c.green("ativo") : c.dim("inativo")}`);
      out(`  ${c.bold("Código")}        ${c.cyan(s.referral_code)}`);
      out(`  ${c.bold("Link")}          ${c.cyan(s.referral_link)}`);
      out(`  ${c.bold("Saldo")}         ${c.green(s.affiliate_balance)}`);
      out(`  ${c.bold("Comissão")}      ${s.commission_percent}% (nível 1) · ${s.level2_percent}% (nível 2)`);
      out(`  ${c.bold("Indicações")}    ${s.referrals_count} (nível 1) · ${s.level2_count} (nível 2)`);
      out(`  ${c.bold("Total ganho")}   ${s.total_earned}  ${c.dim(`(L1 ${s.earned_l1} · L2 ${s.earned_l2})`)}`);
      out(`  ${c.bold("Saque mínimo")}  ${s.minimum_payout}`);
    } catch (err) {
      handleError(err);
    }
  });

affiliate
  .command("link")
  .description("mostra apenas seu link de indicação (e o código)")
  .action(async () => {
    try {
      const s = await getClient().affiliateStats();
      if (shouldJson()) return printJson({ referral_code: s.referral_code, referral_link: s.referral_link });
      out(s.referral_link);
      out(c.dim(`código: ${s.referral_code}`));
    } catch (err) {
      handleError(err);
    }
  });

affiliate
  .command("request-payout")
  .description("[gestão · requer token] SOLICITA um saque do seu saldo de afiliado (move dinheiro)")
  .requiredOption("--amount <valor>", "valor a sacar (>= saque mínimo)", (v) => parseFloat(v))
  .option("--method <metodo>", "método de saque preferido (ex.: pix, usdt)")
  .option("--note <obs>", "observação (ex.: chave PIX/endereço)")
  .option("--yes", "confirma o saque sem prompt (operação financeira)", false)
  .option("--dry-run", "só mostra o que faria, sem sacar", false)
  .action(
    async (opts: { amount: number; method?: string; note?: string; yes: boolean; dryRun: boolean }) => {
      try {
        if (!Number.isFinite(opts.amount) || opts.amount <= 0) {
          fail("--amount precisa ser um número positivo.");
        }
        const preview = { action: "request-payout", amount: opts.amount, method: opts.method ?? null };
        if (opts.dryRun || !opts.yes) {
          if (shouldJson()) return printJson({ willExecute: false, preview });
          out(c.yellow("Saque NÃO executado (operação financeira)."));
          out(`  Sacaria ${c.bold(String(opts.amount))}${opts.method ? ` via ${opts.method}` : ""}.`);
          out(c.dim("  Confirme com --yes para sacar de verdade."));
          return;
        }
        const r = await getClient().affiliateRequestPayout({
          amount: opts.amount,
          method: opts.method,
          note: opts.note,
        });
        if (shouldJson()) return printJson(r);
        out(`${c.green("✔")} Saque solicitado.`);
        out(`  ${c.bold("ID")}      ${c.cyan(r.id)}`);
        out(`  ${c.bold("Valor")}   ${r.amount}`);
        out(`  ${c.bold("Status")}  ${r.status}`);
      } catch (err) {
        handleError(err);
      }
    },
  );

// loyalty ----------------------------------------------------------------------

program
  .command("loyalty")
  .description("seu tier e pontos de fidelidade")
  .action(async () => {
    try {
      const l = await getClient().loyaltyStatus();
      if (shouldJson()) return printJson(l);
      out(c.bold("Fidelidade"));
      out(`  ${c.bold("Tier")}          ${c.cyan(l.label)} ${c.dim(`(${l.tier})`)}`);
      out(`  ${c.bold("Pontos")}        ${l.points_balance}`);
      out(`  ${c.bold("Gasto total")}   ${l.lifetime_spent} ${l.currency}`);
      if (l.next_threshold !== null) {
        out(`  ${c.bold("Progresso")}     ${l.progress_pct}% para o próximo tier (${l.next_threshold})`);
      } else {
        out(`  ${c.bold("Progresso")}     ${c.green("tier máximo")}`);
      }
    } catch (err) {
      handleError(err);
    }
  });

// recommend --------------------------------------------------------------------

program
  .command("recommend [serviceIdOrPlatform]")
  .description("serviços recomendados a partir de um serviço-âncora e/ou plataforma")
  .option("--service <id>", "serviço-âncora (id)")
  .option("--platform <plataforma>", "plataforma (instagram, tiktok, …)")
  .option("--limit <n>", "limite de resultados", (v) => parseInt(v, 10))
  .addHelpText(
    "after",
    `
O argumento posicional é um atalho: se for numérico vira --service, senão --platform.

Exemplos:
  socialgo recommend 1234
  socialgo recommend instagram
  socialgo recommend --service 1234 --limit 5
  socialgo recommend --platform tiktok
`,
  )
  .action(
    async (arg: string | undefined, opts: { service?: string; platform?: string; limit?: number }) => {
      try {
        let service = opts.service;
        let platform = opts.platform;
        if (arg !== undefined) {
          if (/^\d+$/.test(arg)) service = service ?? arg;
          else platform = platform ?? arg;
        }
        if (!service && !platform) {
          fail("Informe um serviço-âncora ou plataforma: socialgo recommend <serviceId|platform> (ou --service/--platform).");
        }
        const items = await getClient().recommend({
          service,
          platform,
          limit: Number.isFinite(opts.limit as number) ? opts.limit : undefined,
        });
        if (shouldJson()) return printJson(items);
        renderRecommendTable(items);
      } catch (err) {
        handleError(err);
      }
    },
  );

// campaign ---------------------------------------------------------------------

const campaign = program.command("campaign").description("planejamento de campanha");

campaign
  .command("build")
  .description("monta um PLANO de campanha a partir de budget/objetivo/dias (não cria pedido)")
  .requiredOption("--budget <valor>", "orçamento total", (v) => parseFloat(v))
  .requiredOption("--days <n>", "janela de entrega gradual, em dias", (v) => parseInt(v, 10))
  .option("--service <id>", "serviço-âncora (id)")
  .option("--platform <plataforma>", "plataforma (instagram, tiktok, …)")
  .option("--goal <objetivo>", "tipo de impulsionamento (ex.: followers, views, likes)")
  .option("--link <url>", "link de destino (opcional, vai no plano)")
  .addHelpText(
    "after",
    `
Devolve um PLANO (cronograma + custo + quantidade). NÃO cria pedido — revise e
execute depois (ex.: socialgo subscription create / socialgo order add).

Exemplos:
  socialgo campaign build --budget 100 --days 30 --platform instagram --goal followers
  socialgo campaign build --budget 50 --days 7 --service 1234
`,
  )
  .action(
    async (opts: { budget: number; days: number; service?: string; platform?: string; goal?: string; link?: string }) => {
      try {
        if (!Number.isFinite(opts.budget) || opts.budget <= 0) fail("--budget precisa ser um número positivo.");
        if (!Number.isFinite(opts.days) || opts.days <= 0) fail("--days precisa ser um inteiro positivo.");
        const plan = await getClient().campaignBuild({
          budget: opts.budget,
          days: opts.days,
          service: opts.service,
          platform: opts.platform,
          boost_type: opts.goal,
          link: opts.link,
        });
        if (shouldJson()) return printJson(plan);
        if (!plan.feasible) {
          out(`${c.red("✖")} Plano inviável.`);
          if (plan.reason) out(`  ${c.dim(plan.reason)}`);
          return;
        }
        out(`${c.green("✔")} Plano de campanha (proposta — nada foi cobrado).`);
        if (plan.service) {
          out(`  ${c.bold("Serviço")}       ${c.cyan(String(plan.service.id))} ${plan.service.name}`);
          if (plan.service.platform) out(`  ${c.bold("Plataforma")}    ${plan.service.platform}`);
        }
        if (plan.totalQuantity !== undefined) out(`  ${c.bold("Qtd total")}     ${plan.totalQuantity}`);
        if (plan.totalCost !== undefined) out(`  ${c.bold("Custo total")}   ${c.green(String(plan.totalCost))}`);
        if (plan.runs !== undefined) out(`  ${c.bold("Execuções")}     ${plan.runs}`);
        if (plan.intervalMinutes !== undefined) out(`  ${c.bold("Intervalo")}     ${plan.intervalMinutes} min`);
        const schedule = plan.schedule ?? [];
        if (schedule.length > 0) {
          out();
          out(c.bold("  Cronograma:"));
          for (const s of schedule) {
            out(`    ${c.dim(`run ${padStart(String(s.run), 3)}`)}  dia +${padStart(String(s.dayOffset), 2)}  qtd ${s.quantity}`);
          }
        }
        out();
        out(c.dim("Revise e execute com: socialgo subscription create / socialgo order add"));
      } catch (err) {
        handleError(err);
      }
    },
  );

// storefront -------------------------------------------------------------------

program
  .command("storefront <slug>")
  .description("resolve uma loja pública pelo slug e lista seus pacotes")
  .action(async (slug: string) => {
    try {
      const store = await getClient().storefront(slug);
      if (shouldJson()) return printJson(store);
      out(`${c.bold(store.title)} ${c.dim(`(${store.slug})`)}`);
      if (store.description) out(`  ${c.dim(store.description)}`);
      out(c.dim(`  tema ${store.theme} · locale ${store.locale}`));
      out();
      renderStorefrontPackages(store.packages ?? []);
    } catch (err) {
      handleError(err);
    }
  });

// balance ----------------------------------------------------------------------

program
  .command("balance")
  .description("mostra o saldo da conta")
  .action(async () => {
    try {
      const b = await getClient().balance();
      if (shouldJson()) return printJson(b);
      out(`${c.bold("Saldo")}  ${c.green(b.balance)} ${b.currency}`);
    } catch (err) {
      handleError(err);
    }
  });

// wallet -----------------------------------------------------------------------

program
  .command("wallet")
  .description("resumo da carteira (saldo + extrato recente)")
  .action(async () => {
    try {
      const w = await getClient().wallet();
      if (shouldJson()) return printJson(w);
      out(`${c.bold("Carteira")}`);
      out(`  ${c.bold("Saldo")}  ${c.green(w.balance)} ${w.currency}`);
      const txs = w.transactions ?? [];
      if (txs.length > 0) {
        out();
        out(c.bold("  Extrato recente:"));
        for (const t of txs) {
          const amount = String(t.amount ?? "");
          const signed = amount.startsWith("-") ? c.red(amount) : c.green(amount);
          const when = t.createdAt ? c.dim(` ${t.createdAt}`) : "";
          out(`    ${pad(String(t.type ?? ""), 12)} ${padStart(signed, 12)}  ${t.note ?? ""}${when}`);
        }
      } else {
        out(c.dim("  (extrato indisponível por esta chave — exibindo apenas saldo)"));
      }
    } catch (err) {
      handleError(err);
    }
  });

program
  .command("add-funds")
  .description("cria um pagamento pendente para recarregar a carteira (conclui no painel)")
  .requiredOption("--amount <valor>", "valor a adicionar", (v) => parseFloat(v))
  .requiredOption(
    "--method <metodo>",
    "gateway de pagamento ativo (veja 'socialgo guest-gateways') ou 'manual'",
  )
  .action(async (opts: { amount: number; method: string }) => {
    try {
      if (!Number.isFinite(opts.amount) || opts.amount <= 0) {
        fail("--amount precisa ser um número positivo.");
      }
      const r = await getClient().addFunds(opts.amount, opts.method);
      if (shouldJson()) return printJson(r);
      out(`${c.green("✔")} Pagamento criado (${c.yellow(r.status)}).`);
      out(`  ${c.bold("Payment ID")}  ${c.cyan(String(r.payment))}`);
      out(`  ${c.bold("Valor")}       ${r.amount} ${r.currency}`);
      out(`  ${c.bold("Método")}      ${r.method}`);
      if (r.message) {
        out();
        out(c.dim(`  ${r.message}`));
      }
    } catch (err) {
      handleError(err);
    }
  });

// admin ------------------------------------------------------------------------

const admin = program.command("admin").description("operações administrativas");

admin
  .command("sync-catalog")
  .description("sincroniza o catálogo a partir dos fornecedores ativos (requer admin)")
  .action(async () => {
    try {
      out(c.dim("Sincronizando catálogo dos fornecedores ativos…"));
      const r = await getClient().syncCatalog();
      if (shouldJson()) return printJson(r);
      out(`${c.green("✔")} Catálogo sincronizado. ${c.bold(String(r.imported))} serviço(s) importado(s).`);
    } catch (err) {
      handleError(err);
    }
  });

// guest (pay-per-order PÚBLICO, SEM chave) -------------------------------------
//
// Estes comandos NÃO usam SOCIALGO_API_KEY: batem nos endpoints públicos /guest
// (POST /guest/order, GET /guest/order/:id, GET /guest/services). O cliente HTTP
// é o mesmo, mas a chamada de guest nunca envia Authorization. A base é a mesma
// (--api-url / SOCIALGO_API_URL) — aponte para o host onde a API roda.

// Os métodos de pagamento NÃO são hardcoded: a fonte da verdade é o painel
// (GET /gateways/active, via client.guestPaymentMethods()). O fallback mínimo
// seguro (FALLBACK_GUEST_METHODS) só entra dentro do client quando a consulta
// falha — a CLI nunca depende de uma lista fixa aqui.

program
  .command("guest-gateways")
  .description("métodos de pagamento ATIVOS do painel (consulta /gateways/active)")
  .action(async () => {
    try {
      const gateways = await getClient().guestActiveGateways();
      if (shouldJson()) return printJson(gateways);
      if (gateways.length === 0) {
        out(c.yellow("Nenhum gateway ativo no painel no momento."));
        return;
      }
      out(c.bold("Métodos de pagamento ativos (use o valor de 'method' no guest-order):"));
      out();
      for (const g of gateways) {
        const coins = g.coins?.length ? c.dim(` — moedas: ${g.coins.join(", ")}`) : "";
        const notice = g.notice ? c.dim(`\n      ⚠ ${g.notice}`) : "";
        out(`  ${c.cyan(g.gateway)}  ${c.bold(g.label)} ${c.dim(`(${g.kind})`)}${coins}${notice}`);
      }
    } catch (err) {
      handleError(err);
    }
  });

program
  .command("guest-services")
  .description("catálogo PÚBLICO (sem chave) — ache o serviceId para o guest-order")
  .option("--platform <plataforma>", "filtra por plataforma (instagram, tiktok, …)")
  .option("--q <termo>", "busca por termo no nome do serviço")
  .option("--limit <n>", "limite de resultados", (v) => parseInt(v, 10))
  .action(async (opts: { platform?: string; q?: string; limit?: number }) => {
    try {
      const { items } = await getClient().guestServices({
        platform: opts.platform,
        q: opts.q,
        limit: Number.isFinite(opts.limit as number) ? opts.limit : undefined,
      });
      if (shouldJson()) return printJson(items);
      renderGuestServicesTable(items);
    } catch (err) {
      handleError(err);
    }
  });

program
  .command("guest-recommend [serviceIdOrPlatform]")
  .description("cross-sell PÚBLICO (sem chave): próximos serviços a partir de um serviço/plataforma")
  .option("--service <uuid>", "serviço-âncora (UUID de guest-services)")
  .option("--platform <plataforma>", "plataforma (instagram, tiktok, …)")
  .option("--limit <n>", "limite de resultados (1-24)", (v) => parseInt(v, 10))
  .addHelpText(
    "after",
    `
Par guest-first de ${c.cyan("socialgo recommend")} (que exige chave). Aqui é keyless.
O argumento posicional é um atalho: se parece UUID vira --service, senão --platform.
O ${c.bold("id")} retornado serve direto como <serviceId> em ${c.cyan("socialgo guest-order")}.

Exemplos:
  socialgo guest-recommend --platform instagram
  socialgo guest-recommend <serviceUuid> --limit 5
`,
  )
  .action(
    async (arg: string | undefined, opts: { service?: string; platform?: string; limit?: number }) => {
      try {
        let serviceId = opts.service;
        let platform = opts.platform;
        if (arg !== undefined) {
          // Atalho: UUID → --service; qualquer outra coisa → --platform.
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(arg)) {
            serviceId = serviceId ?? arg;
          } else {
            platform = platform ?? arg;
          }
        }
        const items = await getClient().guestRecommend({
          serviceId,
          platform,
          limit: Number.isFinite(opts.limit as number) ? opts.limit : undefined,
        });
        if (shouldJson()) return printJson(items);
        if (items.length === 0) {
          out(c.yellow("Nenhuma recomendação encontrada."));
          return;
        }
        out(c.bold(`${items.length} recomendação(ões) — use o ID em 'socialgo guest-order':`));
        out();
        for (const s of items) {
          const reason = s.reason ? c.dim(` [${s.reason}]`) : "";
          const plat = s.platform ? c.dim(` · ${s.platform}`) : "";
          out(`  ${c.cyan(s.id)}  ${c.bold(s.name)}${plat}${reason}`);
        }
      } catch (err) {
        handleError(err);
      }
    },
  );

program
  .command("guest-order <serviceId>")
  .description("cria um pedido PÚBLICO (sem conta / sem chave) e devolve a URL de pagamento")
  .requiredOption(
    "--email <email>",
    "e-mail de CONTATO (recibo/rastreio do pedido — NÃO cria conta nem senha)",
  )
  .requiredOption("--link <url>", "link de destino (perfil/post/vídeo)")
  .option("--quantity <n>", "quantidade (opcional p/ tipos de lista)", (v) => parseInt(v, 10))
  .option(
    "--method <metodo>",
    "gateway de pagamento ATIVO (veja 'socialgo guest-gateways'). Default: 1º ativo do painel.",
  )
  .option("--comments <txt|arquivo>", "Custom Comments: 1 comentário por linha (texto ou arquivo)")
  .option("--usernames <txt|arquivo>", "Mentions Custom List / with Hashtags: 1 @usuário por linha")
  .option("--hashtags <txt|arquivo>", "Mentions with Hashtags: hashtags (1 por linha)")
  .option("--hashtag <tag>", "Mentions Hashtag: uma hashtag-alvo")
  .option("--username <user>", "Mentions User Followers / Comment Likes: usuário-alvo")
  .option("--media <url>", "Mentions Media Likers: mídia-alvo")
  .option("--answer-number <n>", "Poll: número da resposta", (v) => parseInt(v, 10))
  .addHelpText(
    "after",
    `
O <serviceId> é o ID (UUID) listado por ${c.cyan("socialgo guest-services")}. NÃO precisa de
conta nem de chave: o e-mail é só contato (recibo/rastreio), não cria cadastro.
Quem quiser histórico/carteira/refill pode (opcional) usar o modo conta (com chave).

Exemplo:
  socialgo guest-services --platform instagram --q seguidores   # pega o <serviceId>
  socialgo guest-order <serviceId> --email voce@ex.com --link https://insta.com/seuperfil --quantity 1000
`,
  )
  .action(
    async (
      serviceId: string,
      opts: {
        email: string;
        link: string;
        quantity?: number;
        method?: string;
        comments?: string;
        usernames?: string;
        hashtags?: string;
        hashtag?: string;
        username?: string;
        media?: string;
        answerNumber?: number;
      },
    ) => {
      try {
        const client = getClient();
        // Métodos válidos = gateways REALMENTE ativos no painel (não hardcoded).
        // Se a consulta falhar, cai no fallback mínimo seguro.
        const validMethods = await client.guestPaymentMethods();
        if (validMethods.length === 0) {
          fail("Nenhum método de pagamento ativo no painel no momento.");
        }
        // Sem --method: usa o 1º gateway ativo do painel como padrão.
        const method = (opts.method ?? validMethods[0]) as GuestCheckoutMethod;
        if (!validMethods.includes(method)) {
          fail(
            `--method inválido: "${opts.method}". Métodos ativos: ${validMethods.join(" | ")}. ` +
              `(veja 'socialgo guest-gateways')`,
          );
        }
        if (opts.quantity !== undefined && (!Number.isFinite(opts.quantity) || opts.quantity <= 0)) {
          fail("--quantity precisa ser um número inteiro positivo.");
        }
        // Campos extras por tipo vão em metadata (mesmos nomes do protocolo v2).
        const metadata: OrderTypeParams = {};
        if (opts.comments !== undefined) metadata.comments = readListArg(opts.comments);
        if (opts.usernames !== undefined) metadata.usernames = readListArg(opts.usernames);
        if (opts.hashtags !== undefined) metadata.hashtags = readListArg(opts.hashtags);
        if (opts.hashtag !== undefined) metadata.hashtag = opts.hashtag;
        if (opts.username !== undefined) metadata.username = opts.username;
        if (opts.media !== undefined) metadata.media = opts.media;
        if (opts.answerNumber !== undefined) metadata.answer_number = opts.answerNumber;

        const result = await client.guestCreateOrder({
          email: opts.email,
          serviceId,
          link: opts.link,
          quantity: Number.isFinite(opts.quantity as number) ? opts.quantity : undefined,
          method,
          metadata:
            Object.keys(metadata).length > 0 ? (metadata as Record<string, unknown>) : undefined,
        });
        if (shouldJson()) return printJson(result);
        out(`${c.green("✔")} Pedido criado (aguardando pagamento).`);
        out(`  ${c.bold("Order ID")}      ${c.cyan(result.orderId)}`);
        out(`  ${c.bold("Guest Token")}   ${c.cyan(result.guestToken)}`);
        out(`  ${c.bold("Valor")}         ${result.amount} ${result.currency}`);
        out(`  ${c.bold("Método")}        ${method}`);
        out();
        out(c.bold("  Pague abrindo esta URL no navegador:"));
        out(`  ${c.cyan(result.url)}`);
        out();
        out(
          c.dim(
            `  Após pagar (cartão/PIX/cripto), acompanhe: socialgo guest-status ${result.orderId} --token ${result.guestToken}`,
          ),
        );
      } catch (err) {
        handleError(err);
      }
    },
  );

program
  .command("guest-status <id>")
  .description("status PÚBLICO de um pedido guest (valide com --token ou --email)")
  .option("--token <t>", "guest token devolvido no guest-order (preferido)")
  .option("--email <e>", "e-mail usado no pedido (alternativa ao token)")
  .action(async (id: string, opts: { token?: string; email?: string }) => {
    try {
      if (!opts.token && !opts.email) {
        fail("Informe --token <t> ou --email <e> para validar a posse do pedido.");
      }
      const status = await getClient().guestOrderStatus(id, { token: opts.token, email: opts.email });
      if (shouldJson()) return printJson(status);
      renderGuestStatus(status);
    } catch (err) {
      handleError(err);
    }
  });

// ════════════════════════════════════════════════════════════════════════════
//  AUTENTICADOS — para GESTÃO/ACOMPANHAMENTO (precisam de SOCIALGO_TOKEN, o JWT
//  de usuário logado — NÃO da SOCIALGO_API_KEY do protocolo SMM, NEM do guest).
//  Cobrem rotas REST do painel sob requireUser:
//    • sub-reseller  → painel-filho do revendedor (clientes, markup, saldo, lucro, convite)
//    • points        → gamificação (recompensas, streak, missões, roleta, badges, …)
//    • reseller-checkout → onboarding (compra do plano de revendedor)
//  Comprar segue keyless via guest-* — estes comandos NÃO mudam o guest-first.
// ════════════════════════════════════════════════════════════════════════════

// sub-reseller (painel-filho do revendedor) -----------------------------------

const subReseller = program
  .command("sub-reseller")
  .description("[gestão · requer token] painel-filho do revendedor: clientes, markup, saldo, lucro, convite");

subReseller
  .command("dashboard")
  .description("resumo do painel-filho (saldo, markup, teto, nº de clientes/pedidos)")
  .action(async () => {
    try {
      const d = await getClient().subDashboard();
      if (shouldJson()) return printJson(d);
      out(c.bold("Painel de sub-revenda"));
      if (d.balance !== undefined) out(`  ${c.bold("Saldo")}        ${c.green(String(d.balance))}`);
      if (d.markupPercent !== undefined) out(`  ${c.bold("Markup")}       ${d.markupPercent}%`);
      if (d.markupCap !== undefined) out(`  ${c.bold("Teto markup")}  ${d.markupCap}%`);
      if (d.clientCount !== undefined) out(`  ${c.bold("Clientes")}     ${d.clientCount}`);
      if (d.orderCount !== undefined) out(`  ${c.bold("Pedidos")}      ${d.orderCount}`);
    } catch (err) {
      handleError(err);
    }
  });

subReseller
  .command("markup <percent>")
  .description("define o PRÓPRIO markup (%, clampado pelo teto do painel)")
  .action(async (percent: string) => {
    try {
      const value = parseFloat(percent);
      if (!Number.isFinite(value) || value < 0) fail("O markup precisa ser um número >= 0.");
      const r = await getClient().subSetMarkup(value);
      if (shouldJson()) return printJson(r);
      out(`${c.green("✔")} Markup definido: ${c.bold(`${r.markupPercent}%`)} ${c.dim("(efetivo, após teto)")}`);
    } catch (err) {
      handleError(err);
    }
  });

subReseller
  .command("clients")
  .description("lista seus clientes vinculados (escopado)")
  .action(async () => {
    try {
      const items = await getClient().subClients();
      if (shouldJson()) return printJson(items);
      if (items.length === 0) {
        out(c.yellow("Nenhum cliente vinculado ainda."));
        return;
      }
      for (const cl of items) {
        out(`  ${c.cyan(cl.id)}  ${c.bold(cl.email)}${cl.name ? c.dim(`  (${cl.name})`) : ""}`);
      }
      out();
      out(c.dim(`${items.length} cliente(s). Recarregue um: socialgo sub-reseller recharge <clientId> --amount <v>`));
    } catch (err) {
      handleError(err);
    }
  });

subReseller
  .command("create-client")
  .description("cria um cliente vinculado a você (cria credenciais)")
  .requiredOption("--email <email>", "e-mail (login) do cliente")
  .requiredOption("--password <senha>", "senha inicial (mín. 8 caracteres)")
  .option("--name <nome>", "nome do cliente (opcional)")
  .option("--yes", "confirma a criação sem prompt (cria credenciais)", false)
  .option("--dry-run", "só mostra o que faria, sem criar", false)
  .action(
    async (opts: { email: string; password: string; name?: string; yes: boolean; dryRun: boolean }) => {
      try {
        if (opts.password.length < 8) fail("--password precisa ter ao menos 8 caracteres.");
        const preview = { action: "create-client", email: opts.email, name: opts.name ?? null };
        if (opts.dryRun || !opts.yes) {
          if (shouldJson()) return printJson({ willExecute: false, preview });
          out(c.yellow("Cliente NÃO criado (cria credenciais)."));
          out(`  Criaria o cliente ${c.bold(opts.email)}${opts.name ? ` (${opts.name})` : ""} com a senha informada.`);
          out(c.dim("  Confirme com --yes para criar de verdade."));
          return;
        }
        const cl = await getClient().subCreateClient({
          email: opts.email,
          password: opts.password,
          name: opts.name,
        });
        if (shouldJson()) return printJson(cl);
        out(`${c.green("✔")} Cliente criado.`);
        out(`  ${c.bold("ID")}     ${c.cyan(cl.id)}`);
        out(`  ${c.bold("E-mail")} ${cl.email}`);
        if (cl.name) out(`  ${c.bold("Nome")}   ${cl.name}`);
      } catch (err) {
        handleError(err);
      }
    },
  );

subReseller
  .command("orders")
  .description("pedidos dos seus clientes (escopado)")
  .action(async () => {
    try {
      const items = await getClient().subOrders();
      if (shouldJson()) return printJson(items);
      renderOrdersTable(items);
    } catch (err) {
      handleError(err);
    }
  });

subReseller
  .command("recharge <clientId>")
  .description("recarrega a carteira de um cliente seu (sai do seu saldo · move dinheiro)")
  .requiredOption("--amount <valor>", "valor a creditar no cliente", (v) => parseFloat(v))
  .option("--idempotency-key <chave>", "chave idempotente (default: gerada automaticamente p/ evitar recarga dupla)")
  .option("--yes", "confirma a recarga sem prompt (operação financeira)", false)
  .option("--dry-run", "só mostra o que faria, sem recarregar", false)
  .action(
    async (
      clientId: string,
      opts: { amount: number; idempotencyKey?: string; yes: boolean; dryRun: boolean },
    ) => {
      try {
        if (!Number.isFinite(opts.amount) || opts.amount <= 0) {
          fail("--amount precisa ser um número positivo.");
        }
        // Casa com a coluna UUID do Postgres e com o que o MCP já exige
        // (z.string().uuid()): falha limpa ANTES da API, sem 22P02 → 500 cru.
        if (!UUID_RE.test(clientId)) {
          fail(
            `clientId inválido: "${clientId}" não é um UUID. ` +
              `Pegue o id em 'socialgo sub-reseller clients' (campo id).`,
          );
        }
        const preview = { action: "recharge", clientId, amount: opts.amount };
        if (opts.dryRun || !opts.yes) {
          if (shouldJson()) return printJson({ willExecute: false, preview });
          out(c.yellow("Recarga NÃO executada (operação financeira)."));
          out(`  Creditaria ${c.bold(String(opts.amount))} na carteira de ${c.cyan(clientId)} (sai do seu saldo).`);
          out(c.dim("  Confirme com --yes para recarregar de verdade."));
          return;
        }
        const r = await getClient().rechargeClient({
          clientId,
          amount: opts.amount,
          idempotencyKey: opts.idempotencyKey,
        });
        if (shouldJson()) return printJson(r);
        out(`${c.green("✔")} Carteira do cliente ${c.cyan(clientId)} recarregada em ${c.green(String(opts.amount))}.`);
      } catch (err) {
        handleError(err);
      }
    },
  );

subReseller
  .command("profit")
  .description("relatório de lucro (custo × receita × lucro), escopado a você")
  .action(async () => {
    try {
      const r = await getClient().subProfit();
      printJson(r);
    } catch (err) {
      handleError(err);
    }
  });

subReseller
  .command("invite")
  .description("link de convite self-service (use --rotate para gerar um novo e invalidar o antigo)")
  .option("--rotate", "rotaciona o código (invalida o link anterior)", false)
  .action(async (opts: { rotate: boolean }) => {
    try {
      const client = getClient();
      const r = opts.rotate ? await client.subRotateInvite() : await client.subInvite();
      if (shouldJson()) return printJson(r);
      out(`${c.bold("Convite")} ${opts.rotate ? c.yellow("(rotacionado — link antigo invalidado)") : ""}`);
      out(`  ${c.bold("Código")}  ${c.cyan(r.code)}`);
      out(`  ${c.bold("URL")}     ${c.cyan(r.url)}`);
    } catch (err) {
      handleError(err);
    }
  });

// points (gamificação) --------------------------------------------------------

const points = program
  .command("points")
  .description("[gestão · requer token] gamificação: recompensas, streak, missões, roleta, badges, resgate");

points
  .command("rewards")
  .description("estado consolidado: tier + multiplicador (tier/campanha) + streak")
  .action(async () => {
    try {
      printJson(await getClient().pointsRewardsState());
    } catch (err) {
      handleError(err);
    }
  });

points
  .command("claim-streak")
  .description("reivindica o bônus de streak do dia (1/dia-UTC)")
  .action(async () => {
    try {
      printJson(await getClient().pointsClaimStreak());
    } catch (err) {
      handleError(err);
    }
  });

points
  .command("missions")
  .description("estado das missões semanais (progresso derivado)")
  .action(async () => {
    try {
      printJson(await getClient().pointsMissions());
    } catch (err) {
      handleError(err);
    }
  });

points
  .command("claim-mission <missionId>")
  .description("reivindica os pontos de UMA missão (idempotente por user+missão+semana)")
  .action(async (missionId: string) => {
    try {
      printJson(await getClient().pointsClaimMission(missionId));
    } catch (err) {
      handleError(err);
    }
  });

points
  .command("roulette")
  .description("estado da roleta diária (habilitada?, já girou?, prêmios)")
  .action(async () => {
    try {
      printJson(await getClient().pointsRoulette());
    } catch (err) {
      handleError(err);
    }
  });

points
  .command("spin")
  .description("gira a roleta do dia (1/dia-UTC)")
  .action(async () => {
    try {
      printJson(await getClient().pointsSpinRoulette());
    } catch (err) {
      handleError(err);
    }
  });

points
  .command("badges")
  .description("suas conquistas/badges")
  .action(async () => {
    try {
      printJson(await getClient().pointsBadges());
    } catch (err) {
      handleError(err);
    }
  });

points
  .command("leaderboard")
  .description("ranking anonimizado com sua posição")
  .action(async () => {
    try {
      printJson(await getClient().pointsLeaderboard());
    } catch (err) {
      handleError(err);
    }
  });

points
  .command("perks")
  .description("perks de todos os níveis + seu tier atual")
  .action(async () => {
    try {
      printJson(await getClient().pointsPerks());
    } catch (err) {
      handleError(err);
    }
  });

points
  .command("referrals")
  .description("progresso de indicações gamificadas")
  .action(async () => {
    try {
      printJson(await getClient().pointsReferralProgress());
    } catch (err) {
      handleError(err);
    }
  });

points
  .command("milestones")
  .description("marco mais próximo + countdown da campanha ativa")
  .action(async () => {
    try {
      printJson(await getClient().pointsMilestones());
    } catch (err) {
      handleError(err);
    }
  });

points
  .command("redeem <amount>")
  .description("resgata pontos creditando o valor na carteira")
  .action(async (amount: string) => {
    try {
      const value = parseFloat(amount);
      if (!Number.isFinite(value) || value <= 0) fail("O valor a resgatar precisa ser positivo.");
      printJson(await getClient().pointsRedeem(value));
    } catch (err) {
      handleError(err);
    }
  });

// reseller-checkout (onboarding revendedor) -----------------------------------

program
  .command("reseller-checkout")
  .description("[gestão · requer token] cria o checkout de compra do PLANO de revendedor (gera cobrança)")
  .requiredOption(
    "--method <metodo>",
    "gateway de pagamento ativo (veja 'socialgo guest-gateways')",
  )
  .option("--yes", "confirma a criação do checkout sem prompt (gera cobrança)", false)
  .option("--dry-run", "só mostra o que faria, sem criar o checkout", false)
  .action(async (opts: { method: string; yes: boolean; dryRun: boolean }) => {
    try {
      const preview = { action: "reseller-checkout", method: opts.method };
      if (opts.dryRun || !opts.yes) {
        if (shouldJson()) return printJson({ willExecute: false, preview });
        out(c.yellow("Checkout NÃO criado (gera cobrança do plano de revendedor)."));
        out(`  Criaria o checkout via ${c.bold(opts.method)} (preço forçado no servidor).`);
        out(c.dim("  Confirme com --yes para criar de verdade."));
        return;
      }
      const r = await getClient().resellerCheckout(opts.method);
      if (shouldJson()) return printJson(r);
      out(`${c.green("✔")} Checkout do plano de revendedor criado.`);
      out(`  ${c.bold("Payment ID")}  ${c.cyan(String(r.paymentId))}`);
      out(`  ${c.bold("Valor")}       ${r.amount} ${r.currency}`);
      out();
      out(c.bold("  Pague abrindo esta URL no navegador:"));
      out(`  ${c.cyan(r.url)}`);
      out();
      out(c.dim("  Após o pagamento confirmar, sua conta vira revendedor."));
    } catch (err) {
      handleError(err);
    }
  });

program.parseAsync(process.argv).catch(handleError);
