#!/usr/bin/env bash
#
# reseller-curl.sh — The reseller SMM API v2 with nothing but curl.
#
# The reseller protocol is a SINGLE endpoint: POST {SOCIALGO_API_URL}/api/v2
# with an `application/x-www-form-urlencoded` body that always carries your
# `key` and an `action`, plus any params for that action. This script shows
# the four read/write actions you reach for most:
#
#   action=services   list the catalog
#   action=add        place an order
#   action=status     check one order
#   action=balance    read your wallet balance
#
# Unlike guest mode, this requires an API key and debits your prepaid wallet.
#
# Requires: bash, curl, and jq (for parsing JSON).
#
# Usage:
#   SOCIALGO_API_URL=https://usesocialgo.com \
#   SOCIALGO_API_KEY=YOUR_API_KEY \
#   LINK=https://instagram.com/yourprofile \
#   QUANTITY=1000 \
#   ./examples/reseller-curl.sh
#
# Override which service to order with SERVICE_ID; otherwise the script picks
# the first service whose name matches QUERY (default: "followers").
#
set -euo pipefail

API_URL="${SOCIALGO_API_URL:?Set SOCIALGO_API_URL to your panel base URL}"
API_KEY="${SOCIALGO_API_KEY:?Set SOCIALGO_API_KEY to your reseller API key}"
LINK="${LINK:?Set LINK to the target profile/post/video URL}"
QUANTITY="${QUANTITY:-1000}"
QUERY="${QUERY:-followers}"

# The SMM v2 endpoint lives at {base}/api/v2 — strip any trailing slash first.
ENDPOINT="${API_URL%/}/api/v2"

# Tiny helper: POST an action with extra form fields and print the JSON body.
#   smm <action> [curl -d args...]
smm() {
  local action="$1"; shift
  curl -fsS -X POST "${ENDPOINT}" \
    --data-urlencode "key=${API_KEY}" \
    --data-urlencode "action=${action}" \
    "$@"
}

echo "==> action=balance — confirm the key works and read the wallet"
smm balance | jq '.'

echo
echo "==> action=services — list the catalog and find a match for '${QUERY}'"
SERVICES_JSON="$(smm services)"
echo "${SERVICES_JSON}" \
  | jq -r --arg q "${QUERY}" '
      map(select((.name | ascii_downcase) | contains($q | ascii_downcase)))
      | .[0:5][]
      | "  #\(.service)  \(.name)  rate/1k=\(.rate)  min=\(.min) max=\(.max)"'

# Use SERVICE_ID if provided, else the first name match for QUERY.
SERVICE_ID="${SERVICE_ID:-$(echo "${SERVICES_JSON}" \
  | jq -r --arg q "${QUERY}" '
      map(select((.name | ascii_downcase) | contains($q | ascii_downcase)))
      | .[0].service // empty')}"

if [ -z "${SERVICE_ID}" ] || [ "${SERVICE_ID}" = "null" ]; then
  echo "No service matched QUERY='${QUERY}'. Set SERVICE_ID explicitly." >&2
  exit 1
fi
echo "    using serviceId=${SERVICE_ID}"

echo
echo "==> action=add — place the order (debits your wallet)"
ADD_JSON="$(smm add \
  --data-urlencode "service=${SERVICE_ID}" \
  --data-urlencode "link=${LINK}" \
  --data-urlencode "quantity=${QUANTITY}")"
echo "${ADD_JSON}" | jq '.'

ORDER_ID="$(echo "${ADD_JSON}" | jq -r '.order')"
if [ -z "${ORDER_ID}" ] || [ "${ORDER_ID}" = "null" ]; then
  echo "Order was not created (no .order in response)." >&2
  exit 1
fi
echo "    orderId=${ORDER_ID}"

echo
echo "==> action=status — check the order we just created"
smm status --data-urlencode "order=${ORDER_ID}" | jq '.'

# --- Other actions, for reference -------------------------------------------
# Status of MANY orders at once (CSV -> response keyed by order id):
#   smm status --data-urlencode "orders=${ORDER_ID},123,456" | jq '.'
#
# Request a refill (only for refill-enabled services):
#   smm refill --data-urlencode "order=${ORDER_ID}" | jq '.'
#
# Cancel one or more orders (CSV):
#   smm cancel --data-urlencode "orders=${ORDER_ID},123" | jq '.'
#
# Drip-feed order (split delivery into `runs` every `interval` minutes):
#   smm add \
#     --data-urlencode "service=${SERVICE_ID}" \
#     --data-urlencode "link=${LINK}" \
#     --data-urlencode "quantity=${QUANTITY}" \
#     --data-urlencode "runs=10" \
#     --data-urlencode "interval=60" | jq '.'
