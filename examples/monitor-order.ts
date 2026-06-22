/**
 * monitor-order.ts — Poll an order until it reaches a terminal state.
 *
 * A small automation building block: given an order id, this watches the order
 * with @socialgo/sdk's `status()` on an interval and exits when the order is
 * Completed / Partial / Canceled (or when a timeout is hit). It also computes
 * a rough "% delivered" from `start_count`, `remains` and the original
 * quantity so you can see progress.
 *
 * Use it as a post-order step in a pipeline (e.g. after place-order.ts), in a
 * cron job, or as a template for a webhook-driven watcher. The exit code is
 * non-zero unless the order completes, so it composes in shell scripts:
 *   node monitor-order.ts --order 98765 && echo "delivered!"
 *
 * Config via environment:
 *   SOCIALGO_API_URL   base URL of your panel (e.g. https://usesocialgo.com)
 *   SOCIALGO_API_KEY   your reseller API key (from /dashboard/api-key)
 *
 * Run (from the repo root, after `pnpm install`):
 *   pnpm --filter @socialgo/sdk build
 *   SOCIALGO_API_URL=https://usesocialgo.com \
 *   SOCIALGO_API_KEY=YOUR_API_KEY \
 *   npx tsx examples/monitor-order.ts --order 98765 --quantity 1000 --interval 15 --timeout 3600
 */
import { SmmV2Client, SmmV2Error } from "@socialgo/sdk";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// Statuses from which an order will never change again.
const TERMINAL = new Set(["Completed", "Partial", "Canceled"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const baseUrl = process.env.SOCIALGO_API_URL;
  const apiKey = process.env.SOCIALGO_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("Set SOCIALGO_API_URL and SOCIALGO_API_KEY in the environment.");
  }

  const order = arg("order");
  if (!order) throw new Error("Pass --order <id>.");
  const quantity = Number(arg("quantity", "0")); // optional, enables % delivered
  const intervalSec = Number(arg("interval", "15")); // seconds between polls
  const timeoutSec = Number(arg("timeout", "3600")); // give up after this long

  const client = new SmmV2Client({
    apiUrl: `${baseUrl.replace(/\/+$/, "")}/api/v2`,
    apiKey,
  });

  const deadline = Date.now() + timeoutSec * 1000;
  let lastStatus = "";

  console.log(`Watching order #${order} every ${intervalSec}s (timeout ${timeoutSec}s)...`);

  while (Date.now() < deadline) {
    let s;
    try {
      s = await client.status(order);
    } catch (err) {
      // Transient failures shouldn't kill the watcher — log and retry.
      const msg = err instanceof SmmV2Error ? err.message : String(err);
      console.warn(`  (transient) status check failed: ${msg} — retrying`);
      await sleep(intervalSec * 1000);
      continue;
    }

    // Derive a progress %, when we know the quantity ordered.
    let pct = "";
    const remains = Number(s.remains);
    if (quantity > 0 && Number.isFinite(remains)) {
      const delivered = Math.max(0, Math.min(quantity, quantity - remains));
      pct = ` (${Math.round((delivered / quantity) * 100)}% delivered)`;
    }

    // Only print when something changes, to keep logs readable.
    const line = `status=${s.status} charge=${s.charge} start=${s.start_count} remains=${s.remains}${pct}`;
    if (line !== lastStatus) {
      console.log(`  [${new Date().toISOString()}] ${line}`);
      lastStatus = line;
    }

    if (TERMINAL.has(s.status)) {
      console.log(`Done: order #${order} is ${s.status}.`);
      // Non-completed terminal states are surfaced as a non-zero exit.
      process.exit(s.status === "Completed" ? 0 : 2);
    }

    await sleep(intervalSec * 1000);
  }

  console.error(`Timed out after ${timeoutSec}s — order #${order} is still "${lastStatus}".`);
  process.exit(1);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
