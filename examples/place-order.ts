/**
 * place-order.ts — Place a reseller order with the SocialGO SDK.
 *
 * This uses @socialgo/sdk's SmmV2Client, the typed client for the SMM API v2
 * protocol (single endpoint, `key` + `action`). It:
 *   1. lists the catalog and finds a matching service,
 *   2. estimates the cost locally with the markup/cost helpers,
 *   3. checks the account balance,
 *   4. places the order,
 *   5. polls the order status until it leaves "Pending".
 *
 * Config via environment:
 *   SOCIALGO_API_URL   base URL of your panel (e.g. https://api.usesocialgo.com)
 *   SOCIALGO_API_KEY   your reseller API key (from /dashboard/api-key)
 *
 * Run (from the repo root, after `pnpm install`):
 *   SOCIALGO_API_URL=https://api.usesocialgo.com \
 *   SOCIALGO_API_KEY=your-key \
 *   pnpm --filter @socialgo/sdk build && \
 *   node --experimental-strip-types examples/place-order.ts \
 *     --query "instagram followers" --link https://instagram.com/yourprofile --quantity 1000
 *
 * (Node 18+ works with a loader such as tsx: `npx tsx examples/place-order.ts ...`.)
 */
import { SmmV2Client, orderCost, type SmmService } from "@socialgo/sdk";

// --- tiny arg parser (no deps) ----------------------------------------------
function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  const baseUrl = process.env.SOCIALGO_API_URL;
  const apiKey = process.env.SOCIALGO_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("Set SOCIALGO_API_URL and SOCIALGO_API_KEY in the environment.");
  }

  const query = arg("query", "instagram followers")!;
  const link = arg("link");
  const quantity = Number(arg("quantity", "1000"));
  if (!link) throw new Error("Pass --link <target-url>.");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("--quantity must be a positive number.");

  // The SmmV2Client talks to the single SMM v2 endpoint at `${base}/api/v2`.
  const client = new SmmV2Client({ apiUrl: `${baseUrl.replace(/\/+$/, "")}/api/v2`, apiKey });

  // 1) Find a service by a free-text query (matched against name/category/type).
  const services = await client.services();
  const q = query.toLowerCase();
  const match: SmmService | undefined = services.find((s) =>
    `${s.name} ${s.category} ${s.type}`.toLowerCase().includes(q),
  );
  if (!match) throw new Error(`No service matched "${query}".`);

  console.log(`Service #${match.service} — ${match.name}`);
  console.log(`  rate/1k: ${match.rate}  min: ${match.min}  max: ${match.max}`);

  // 2) Estimate the cost locally before spending anything.
  const estimate = orderCost(Number(match.rate), quantity);
  console.log(`  estimated cost for ${quantity}: ${estimate}`);

  // 3) Confirm there is balance to cover it.
  const { balance, currency } = await client.balance();
  console.log(`Balance: ${balance} ${currency}`);
  if (Number(balance) < estimate) {
    throw new Error(`Insufficient balance (${balance} ${currency}) for estimated cost ${estimate}.`);
  }

  // 4) Place the order.
  const { order } = await client.add({ service: match.service, link, quantity });
  console.log(`Order created: #${order}`);

  // 5) Poll status a few times.
  for (let i = 0; i < 5; i++) {
    const status = await client.status(order);
    console.log(`  [${i}] status=${status.status} charge=${status.charge} remains=${status.remains}`);
    if (status.status !== "Pending") break;
    await new Promise((r) => setTimeout(r, 3000));
  }
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
