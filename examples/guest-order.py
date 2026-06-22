#!/usr/bin/env python3
"""
guest-order.py — Guest checkout (no account, no API key) from Python via raw HTTP.

Guest mode uses the public /guest/* endpoints with JSON bodies — no API key is
ever sent. This mirrors examples/guest-order.sh, but in Python with `requests`:

    1. GET  /guest/services        find a service (public catalog)
    2. POST /guest/order           create a pay-per-order, get a payment URL
    3. (open the URL in a browser to pay: card / PIX / crypto)
    4. GET  /guest/order/:id       track the order with the returned token

Config via environment / args:
    SOCIALGO_API_URL   base URL of your panel (e.g. https://usesocialgo.com)

Install the one dependency, then run:
    pip install requests
    SOCIALGO_API_URL=https://usesocialgo.com \\
    python examples/guest-order.py \\
        --email you@example.com \\
        --link https://instagram.com/yourprofile \\
        --quantity 1000 \\
        --method mercadopago
"""
import argparse
import os
import sys

import requests


def main() -> int:
    parser = argparse.ArgumentParser(description="SocialGO guest checkout via raw HTTP.")
    parser.add_argument("--email", required=True, help="buyer email (also used to track)")
    parser.add_argument("--link", required=True, help="target profile/post/video URL")
    parser.add_argument("--quantity", type=int, default=1000)
    parser.add_argument("--method", default="mercadopago",
                        help="mercadopago | stripe | crypto | paypal | paytm (must be enabled)")
    parser.add_argument("--platform", default="instagram")
    parser.add_argument("--query", default="followers", help="catalog search term")
    args = parser.parse_args()

    base_url = os.environ.get("SOCIALGO_API_URL")
    if not base_url:
        print("Set SOCIALGO_API_URL to your panel base URL.", file=sys.stderr)
        return 1
    base_url = base_url.rstrip("/")

    # 1) Browse the public catalog (no API key) and pick the first match.
    print("==> 1. Browsing the public catalog (no API key)")
    resp = requests.get(
        f"{base_url}/guest/services",
        params={"platform": args.platform, "q": args.query, "limit": 5},
        timeout=30,
    )
    resp.raise_for_status()
    items = resp.json().get("items", [])
    for s in items:
        print(f"  #{s['id']}  {s['name']}  rate/1k={s['sellRate']}  min={s['min']} max={s['max']}")
    if not items:
        print(f"No service found for q='{args.query}' platform='{args.platform}'.", file=sys.stderr)
        return 1
    service_id = items[0]["id"]
    print(f"    using serviceId={service_id}")

    # 2) Create the guest order — returns a payment URL.
    print("\n==> 2. Creating the guest order")
    resp = requests.post(
        f"{base_url}/guest/order",
        json={
            "email": args.email,
            "serviceId": service_id,
            "link": args.link,
            "quantity": args.quantity,
            "method": args.method,
        },
        timeout=30,
    )
    resp.raise_for_status()
    order = resp.json()
    order_id = order["orderId"]
    guest_token = order["guestToken"]
    print(f"    orderId={order_id}")
    print(f"    amount={order['amount']} {order['currency']}")
    print(f"    guestToken={guest_token}   (save this — it proves ownership)")

    # 3) Pay by opening the hosted checkout URL.
    print("\n==> 3. Pay by opening this URL in a browser (card / PIX / crypto):")
    print(f"    {order['url']}")
    print("\n    The order stays 'awaiting_payment' until the payment confirms.\n")

    # 4) Track the order — prove ownership with the token (or the email).
    print("==> 4. Tracking the order (validate with the guest token)")
    resp = requests.get(
        f"{base_url}/guest/order/{order_id}",
        params={"token": guest_token},  # or {"email": args.email}
        timeout=30,
    )
    resp.raise_for_status()
    status = resp.json()
    print(f"    status={status.get('status')}")
    print(f"    serviceName={status.get('serviceName')}")
    print(f"    remains={status.get('remains')}  startCount={status.get('startCount')}")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except requests.HTTPError as err:
        body = err.response.text if err.response is not None else ""
        print(f"HTTP error: {err}\n{body}", file=sys.stderr)
        raise SystemExit(1)
