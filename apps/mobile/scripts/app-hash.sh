#!/usr/bin/env bash
# Prints the 11 character app signature hash that Google's SMS Retriever and the WhatsApp one-tap button use to
# recognise this app. One hash per signing key: the upload key, the debug key and the Play app-signing key each
# have their own. Hand the result to the person who fills in the Meta template (docs/mobile/whatsapp-autofill.md).
#
# Usage:
#   app-hash.sh <package> --keystore <path> --alias <alias> [--storepass <env var name>]
#   app-hash.sh <package> --cert <path to a DER or PEM certificate>
#
# The store password is read from the environment variable you name, never from an argument.
set -euo pipefail

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

[ $# -ge 3 ] || usage
package="$1"
shift

keystore="" alias_name="" cert="" pass_var=""
while [ $# -gt 0 ]; do
  case "$1" in
    --keystore) keystore="${2:-}"; shift 2 ;;
    --alias) alias_name="${2:-}"; shift 2 ;;
    --storepass) pass_var="${2:-}"; shift 2 ;;
    --cert) cert="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done

if [ -n "$cert" ]; then
  if grep -q 'BEGIN CERTIFICATE' "$cert"; then
    cert_hex=$(openssl x509 -in "$cert" -outform DER | xxd -p | tr -d '[:space:]')
  else
    cert_hex=$(xxd -p "$cert" | tr -d '[:space:]')
  fi
elif [ -n "$keystore" ] && [ -n "$alias_name" ]; then
  args=(-exportcert -alias "$alias_name" -keystore "$keystore")
  if [ -n "$pass_var" ]; then args+=(-storepass "${!pass_var}"); fi
  cert_hex=$(keytool "${args[@]}" | xxd -p | tr -d '[:space:]')
else
  usage
fi

# The package name, a space, the certificate in lower case hex; SHA-256; the first 9 bytes; base64; the first 11 characters.
printf '%s %s' "$package" "$cert_hex" | sha256sum | cut -d' ' -f1 | xxd -r -p | head -c 9 | base64 | cut -c1-11
