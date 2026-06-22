#!/usr/bin/env python3
"""
reseller.py — Talk to the SocialGO reseller SMM API v2 from Python, with no SDK.

There is no Python package — and you don't need one. The reseller protocol is a
single endpoint, POST {SOCIALGO_API_URL}/api/v2, with a form-urlencoded body that
always carries `key` and `action`. This script wraps the actions you use most
(services, add, status, balance) with the `requests` library.

Config via environment:
    SOCIALGO_API_URL   base URL of your panel (e.g. https://usesocialgo.com)
    SOCIALGO_API_KEY   your reseller API key (from /dashboard/api-key)

Install the one dependency, then run:
    pip install requests
    SOCIALGO_API_URL=https://usesocialgo.com \\
    SOCIALGO_API_KEY=YOUR_API_KEY \\
    python examples/reseller.py \\
        --query "instagram followers" \\
        --link https://instagram.com/yourprofile \\
        --quantity 1000
"""
import argparse
import os
import sys
import time

import requests


class SmmError(Exception):
    """Raised on a transport error or an `error` field in the response body."""


class SmmV2Client:
    """Minimal client for the SMM API v2 single-endpoint protocol."""

    def __init__(self, api_url: str, api_key: str, timeout: float = 30.0):
        # The SMM v2 endpoint lives at {base}/api/v2.
        self.endpoint = api_url.rstrip("/") + "/api/v2"
        self.api_key = api_key
        self.timeout = timeout

    def _call(self, action: str, **params):
        # Drop None params; everything is sent as form-urlencoded strings.
        body = {"key": self.api_key, "action": action}
        body.update({k: v for k, v in params.items() if v is not None})
        try:
            resp = requests.post(self.endpoint, data=body, timeout=self.timeout)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as exc:
            raise SmmError(f"request to {action} failed: {exc}") from exc
        # SMM panels return errors as { "error": "..." } with a 200 status.
        if isinstance(data, dict) and data.get("error"):
            raise SmmError(str(data["error"]))
        return data

    def services(self):
        return self._call("services")

    def add(self, service, link, quantity=None, **extra):
        return self._call("add", service=service, link=link, quantity=quantity, **extra)

    def status(self, order):
        return self._call("status", order=order)

    def balance(self):
        return self._call("balance")


def main() -> int:
    parser = argparse.ArgumentParser(description="SocialGO reseller order via raw HTTP.")
    parser.add_argument("--query", default="instagram followers",
                        help="free-text match against the catalog (name)")
    parser.add_argument("--link", required=True, help="target profile/post/video URL")
    parser.add_argument("--quantity", type=int, default=1000)
    args = parser.parse_args()

    base_url = os.environ.get("SOCIALGO_API_URL")
    api_key = os.environ.get("SOCIALGO_API_KEY")
    if not base_url or not api_key:
        print("Set SOCIALGO_API_URL and SOCIALGO_API_KEY in the environment.", file=sys.stderr)
        return 1

    client = SmmV2Client(base_url, api_key)

    # 1) Find a service by a free-text query over the catalog.
    services = client.services()
    q = args.query.lower()
    match = next((s for s in services if q in str(s.get("name", "")).lower()), None)
    if not match:
        print(f'No service matched "{args.query}".', file=sys.stderr)
        return 1
    print(f"Service #{match['service']} — {match['name']}")
    print(f"  rate/1k: {match['rate']}  min: {match['min']}  max: {match['max']}")

    # 2) Estimate the cost locally (rates are per 1000 units).
    estimate = round(float(match["rate"]) / 1000 * args.quantity, 2)
    print(f"  estimated cost for {args.quantity}: {estimate}")

    # 3) Check the wallet balance.
    bal = client.balance()
    print(f"Balance: {bal['balance']} {bal['currency']}")
    if float(bal["balance"]) < estimate:
        print(f"Insufficient balance for estimated cost {estimate}.", file=sys.stderr)
        return 1

    # 4) Place the order.
    created = client.add(service=match["service"], link=args.link, quantity=args.quantity)
    order_id = created["order"]
    print(f"Order created: #{order_id}")

    # 5) Poll the status a few times.
    for i in range(5):
        st = client.status(order_id)
        print(f"  [{i}] status={st['status']} charge={st['charge']} remains={st['remains']}")
        if st["status"] != "Pending":
            break
        time.sleep(3)

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SmmError as err:
        print(f"SMM API error: {err}", file=sys.stderr)
        raise SystemExit(1)
