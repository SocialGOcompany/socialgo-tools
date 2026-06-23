#!/usr/bin/env bash
#
# guest-order.sh — Guest checkout end-to-end with plain curl.
#
# Walks the public /guest endpoints with no account and no API key:
#   1. GET  /guest/services        find a service
#   2. POST /guest/order           create a pay-per-order, get a payment URL
#   3. (open the URL in a browser to pay: card / PIX / crypto)
#   4. GET  /guest/order/:id       track the order with the returned token
#
# Requires: bash, curl, and jq (for parsing JSON).
#
# Usage:
#   SOCIALGO_API_URL=https://api.usesocialgo.com \
#   EMAIL=you@example.com \
#   LINK=https://instagram.com/yourprofile \
#   QUANTITY=1000 \
#   METHOD=mercadopago \
#   ./examples/guest-order.sh
#
set -euo pipefail

API_URL="${SOCIALGO_API_URL:?Set SOCIALGO_API_URL to your panel base URL}"
EMAIL="${EMAIL:?Set EMAIL to the buyer email}"
LINK="${LINK:?Set LINK to the target profile/post/video URL}"
QUANTITY="${QUANTITY:-1000}"
METHOD="${METHOD:-mercadopago}"   # mercadopago | stripe | crypto | paypal | paytm (must be enabled on the panel)
QUERY="${QUERY:-followers}"
PLATFORM="${PLATFORM:-instagram}"

# strip any trailing slash from the base URL
API_URL="${API_URL%/}"

echo "==> 1. Browsing the public catalog (no API key)"
SERVICES_JSON="$(curl -fsS "${API_URL}/guest/services?platform=${PLATFORM}&q=${QUERY}&limit=5")"
echo "${SERVICES_JSON}" | jq -r '.items[] | "  #\(.id)  \(.name)  rate/1k=\(.sellRate)  min=\(.min) max=\(.max)"'

# pick the first service id from the result
SERVICE_ID="$(echo "${SERVICES_JSON}" | jq -r '.items[0].id')"
if [ -z "${SERVICE_ID}" ] || [ "${SERVICE_ID}" = "null" ]; then
  echo "No service found for q='${QUERY}' platform='${PLATFORM}'." >&2
  exit 1
fi
echo "    using serviceId=${SERVICE_ID}"

echo "==> 2. Creating the guest order"
ORDER_JSON="$(curl -fsS -X POST "${API_URL}/guest/order" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n \
        --arg email "${EMAIL}" \
        --arg serviceId "${SERVICE_ID}" \
        --arg link "${LINK}" \
        --argjson quantity "${QUANTITY}" \
        --arg method "${METHOD}" \
        '{email:$email, serviceId:$serviceId, link:$link, quantity:$quantity, method:$method}')")"

ORDER_ID="$(echo "${ORDER_JSON}" | jq -r '.orderId')"
GUEST_TOKEN="$(echo "${ORDER_JSON}" | jq -r '.guestToken')"
PAY_URL="$(echo "${ORDER_JSON}" | jq -r '.url')"
AMOUNT="$(echo "${ORDER_JSON}" | jq -r '.amount')"
CURRENCY="$(echo "${ORDER_JSON}" | jq -r '.currency')"

echo "    orderId=${ORDER_ID}"
echo "    amount=${AMOUNT} ${CURRENCY}"
echo "    guestToken=${GUEST_TOKEN}   (save this — it proves ownership)"
echo
echo "==> 3. Pay by opening this URL in a browser (card / PIX / crypto):"
echo "    ${PAY_URL}"
echo
echo "    The order stays 'awaiting_payment' until the payment confirms."
echo

echo "==> 4. Tracking the order (validate with the guest token)"
curl -fsS "${API_URL}/guest/order/${ORDER_ID}?token=${GUEST_TOKEN}" | jq '.'

# Alternatively, validate ownership with the email instead of the token:
#   curl -fsS "${API_URL}/guest/order/${ORDER_ID}?email=${EMAIL}" | jq '.'
