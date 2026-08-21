#!/usr/bin/env bash
# Extrae PEM (cert + cadena + PKCS#8) de un CDT PKCS#12. Pass solo por tty.
# Nunca imprime la pass ni commitea PEM (*.pem gitignored).
set -euo pipefail
P12="${1:-certificado.p12}"
OUT="${2:-tmp-staff/cdt-rosa-negra}"
mkdir -p "$OUT"
if [[ ! -r "$P12" ]]; then
  echo "missing p12: $P12" >&2
  exit 1
fi
if [[ -z "${P12_PASS:-}" ]]; then
  echo "PKCS#12 password (not echoed):" >&2
  read -rs P12_PASS
  echo >&2
  export P12_PASS
fi
extract() {
  openssl pkcs12 -in "$P12" "$@" -passin "env:P12_PASS"
}
set +e
extract -nokeys -clcerts -out "$OUT/leaf.pem"
leaf_ok=$?
extract -nokeys -cacerts -out "$OUT/chain.pem"
extract -nocerts -nodes -out "$OUT/private.pem"
pk_ok=$?
if [[ $leaf_ok -ne 0 || $pk_ok -ne 0 ]]; then
  extract -nokeys -clcerts -legacy -out "$OUT/leaf.pem"
  extract -nokeys -cacerts -legacy -out "$OUT/chain.pem"
  extract -nocerts -nodes -legacy -out "$OUT/private.pem"
fi
set -e
unset P12_PASS
cat "$OUT/leaf.pem" "$OUT/chain.pem" > "$OUT/cert-chain.pem"
openssl x509 -in "$OUT/leaf.pem" -noout -fingerprint -sha256 -enddate
echo "wrote $OUT/{leaf,chain,cert-chain,private}.pem" >&2
