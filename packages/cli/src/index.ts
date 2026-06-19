#!/usr/bin/env node
/**
 * socialgo — CLI para operar o painel SMM SocialGO pelo terminal.
 *
 * Fala com a API do SocialGO pelo endpoint de revendedor (SMM API v2,
 * `POST /api/v2`): `key` + `action`. Cobre o fluxo de revenda completo —
 * catálogo, pedidos (com params por tipo), status, refill, cancel e carteira.
 *
 * Config por ambiente (ou flags globais --api-url / --key):
 *   SOCIALGO_API_URL   base da API (default https://usesocialgo.com)
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

// ---- CLI --------------------------------------------------------------------

const program = new Command();

program
  .name("socialgo")
  .description("CLI do SocialGO — catálogo, pedidos, refill/cancel, saldo e admin de um painel SMM (API v2).")
  .version("0.1.0")
  .option("--json", "saída em JSON cru (para scripts)", false)
  .option("--api-url <url>", "base da API (sobrescreve SOCIALGO_API_URL)")
  .option("--key <key>", "chave de API (sobrescreve SOCIALGO_API_KEY)")
  .addHelpText(
    "after",
    `
Configuração:
  Defina ${c.bold("SOCIALGO_API_URL")} e ${c.bold("SOCIALGO_API_KEY")} no ambiente,
  ou use as flags globais --api-url e --key. Veja: ${c.cyan("socialgo config")}

Exemplos:
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
`,
  );

function getClient(): SocialGoClient {
  const opts = program.opts<{ apiUrl?: string; key?: string }>();
  return new SocialGoClient({ baseUrl: opts.apiUrl, apiKey: opts.key });
}

// config -----------------------------------------------------------------------

program
  .command("config")
  .description("mostra a configuração atual (base da API + se há chave) e como defini-la")
  .action(() => {
    const opts = program.opts<{ apiUrl?: string; key?: string }>();
    const client = getClient();
    if (shouldJson()) {
      return printJson({
        apiUrl: client.resolvedBaseUrl,
        hasKey: client.hasKey,
        source: {
          apiUrl: opts.apiUrl ? "--api-url" : process.env.SOCIALGO_API_URL ? "SOCIALGO_API_URL" : "default",
          key: opts.key ? "--key" : process.env.SOCIALGO_API_KEY ? "SOCIALGO_API_KEY" : "none",
        },
      });
    }
    out(c.bold("Configuração SocialGO CLI"));
    out(`  ${c.bold("API URL")}  ${c.cyan(client.resolvedBaseUrl)}`);
    out(`  ${c.bold("Chave")}    ${client.hasKey ? c.green("definida") : c.red("ausente")}`);
    out();
    if (!client.hasKey) {
      out(c.yellow("Defina sua chave de revendedor para usar a CLI:"));
      out(c.dim('  export SOCIALGO_API_KEY="sua-chave"'));
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
  .requiredOption("--method <metodo>", "método: mercadopago | stripe | crypto | manual")
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

const GUEST_METHODS: readonly GuestCheckoutMethod[] = ["mercadopago", "stripe", "crypto"];

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
  .command("guest-order <serviceId>")
  .description("cria um pedido PÚBLICO (sem conta) e devolve a URL de pagamento")
  .requiredOption("--email <email>", "e-mail do comprador (para rastrear o pedido)")
  .requiredOption("--link <url>", "link de destino (perfil/post/vídeo)")
  .option("--quantity <n>", "quantidade (opcional p/ tipos de lista)", (v) => parseInt(v, 10))
  .option("--method <metodo>", "mercadopago (PIX/cartão) | stripe (cartão) | crypto", "mercadopago")
  .option("--comments <txt|arquivo>", "Custom Comments: 1 comentário por linha (texto ou arquivo)")
  .option("--usernames <txt|arquivo>", "Mentions Custom List / with Hashtags: 1 @usuário por linha")
  .option("--hashtags <txt|arquivo>", "Mentions with Hashtags: hashtags (1 por linha)")
  .option("--hashtag <tag>", "Mentions Hashtag: uma hashtag-alvo")
  .option("--username <user>", "Mentions User Followers / Comment Likes: usuário-alvo")
  .option("--media <url>", "Mentions Media Likers: mídia-alvo")
  .option("--answer-number <n>", "Poll: número da resposta", (v) => parseInt(v, 10))
  .action(
    async (
      serviceId: string,
      opts: {
        email: string;
        link: string;
        quantity?: number;
        method: string;
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
        const method = opts.method as GuestCheckoutMethod;
        if (!GUEST_METHODS.includes(method)) {
          fail(`--method inválido: "${opts.method}". Use: ${GUEST_METHODS.join(" | ")}.`);
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

        const result = await getClient().guestCreateOrder({
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

program.parseAsync(process.argv).catch(handleError);
