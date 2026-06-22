/**
 * mass-order.mjs — Place many orders in one run, then read their status in
 * a single batched call, with @socialgo/sdk.
 *
 * This is the bread-and-butter reseller workflow: you have a list of targets
 * (one link per row) for the same service, and you want to:
 *   1. estimate the total cost up front and check the balance,
 *   2. place every order (with limited concurrency, so you don't hammer the API),
 *   3. fetch the status of all created orders at once via `multiStatus`.
 *
 * It is plain ESM JavaScript (no TypeScript loader needed) — it imports the
 * compiled SDK, so build the SDK first (see "Run" below).
 *
 * Config via environment:
 *   SOCIALGO_API_URL   base URL of your panel (e.g. https://usesocialgo.com)
 *   SOCIALGO_API_KEY   your reseller API key (from /dashboard/api-key)
 *
 * Run (from the repo root):
 *   pnpm install
 *   pnpm --filter @socialgo/sdk build
 *   SOCIALGO_API_URL=https://usesocialgo.com \
 *   SOCIALGO_API_KEY=YOUR_API_KEY \
 *   node examples/mass-order.mjs --service 1234 --quantity 500 \
 *     --links https://instagram.com/a,https://instagram.com/b,https://instagram.com/c
 *
 * Or read links from a file (one per line):
 *   node examples/mass-order.mjs --service 1234 --quantity 500 --links-file ./targets.txt
 */
import { readFileSync } from "node:fs";
import { SmmV2Client, SmmV2Error, orderCost } from "@socialgo/sdk";

// --- tiny arg parser (no deps) ----------------------------------------------
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// Run `worker` over `items` with at most `limit` in flight at a time.
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

async function main() {
  const baseUrl = process.env.SOCIALGO_API_URL;
  const apiKey = process.env.SOCIALGO_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("Set SOCIALGO_API_URL and SOCIALGO_API_KEY in the environment.");
  }

  const service = arg("service");
  const quantity = Number(arg("quantity", "1000"));
  if (!service) throw new Error("Pass --service <id>.");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("--quantity must be positive.");

  // Collect target links from --links (CSV) and/or --links-file (one per line).
  const links = [];
  const csv = arg("links");
  if (csv) links.push(...csv.split(",").map((s) => s.trim()).filter(Boolean));
  const file = arg("links-file");
  if (file) {
    links.push(
      ...readFileSync(file, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
    );
  }
  if (links.length === 0) throw new Error("Pass --links a,b,c or --links-file path.");

  const client = new SmmV2Client({
    apiUrl: `${baseUrl.replace(/\/+$/, "")}/api/v2`,
    apiKey,
  });

  // 1) Find the service so we can estimate cost, then confirm there's balance.
  const services = await client.services();
  const svc = services.find((s) => String(s.service) === String(service));
  if (!svc) throw new Error(`Service #${service} not found in the catalog.`);

  const perOrder = orderCost(Number(svc.rate), quantity);
  const totalEstimate = Math.round(perOrder * links.length * 100) / 100;
  console.log(`Service #${svc.service} — ${svc.name}`);
  console.log(`  ${links.length} orders x ${quantity} @ ${perOrder} each = ~${totalEstimate} estimated`);

  const { balance, currency } = await client.balance();
  console.log(`Balance: ${balance} ${currency}`);
  if (Number(balance) < totalEstimate) {
    throw new Error(`Insufficient balance (${balance} ${currency}) for ~${totalEstimate}.`);
  }

  // 2) Place every order, max 4 in flight. Collect the ids we manage to create.
  console.log(`\nPlacing ${links.length} orders...`);
  const placed = await mapWithConcurrency(links, 4, async (link) => {
    try {
      const { order } = await client.add({ service, link, quantity });
      console.log(`  ok    ${link} -> order #${order}`);
      return { link, order };
    } catch (err) {
      const msg = err instanceof SmmV2Error ? err.message : String(err);
      console.log(`  FAIL  ${link} -> ${msg}`);
      return { link, error: msg };
    }
  });

  const orderIds = placed.filter((p) => p.order != null).map((p) => p.order);
  if (orderIds.length === 0) {
    throw new Error("No orders were created.");
  }

  // 3) One batched status call for everything that was created.
  console.log(`\nFetching status for ${orderIds.length} orders in one call...`);
  const statuses = await client.multiStatus(orderIds);
  for (const id of orderIds) {
    const s = statuses[String(id)];
    if (s) console.log(`  #${id}  status=${s.status}  charge=${s.charge}  remains=${s.remains}`);
    else console.log(`  #${id}  (no status returned)`);
  }
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
