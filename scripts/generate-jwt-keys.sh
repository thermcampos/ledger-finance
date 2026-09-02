#!/usr/bin/env bash
set -euo pipefail

# Where Quarkus/SmallRye JWT expects the keys by convention (classpath resources)
RESOURCES_DIR="backend/src/main/resources"
PRIVATE_KEY="${RESOURCES_DIR}/privateKey.pem"
PUBLIC_KEY="${RESOURCES_DIR}/publicKey.pem"

mkdir -p "${RESOURCES_DIR}"

if [[ -f "${PRIVATE_KEY}" && -f "${PUBLIC_KEY}" ]]; then
  echo "Both ${PRIVATE_KEY} and ${PUBLIC_KEY} already exist. Skipping generation."
  exit 0
fi

if [[ -f "${PRIVATE_KEY}" && ! -f "${PUBLIC_KEY}" ]]; then
  echo "Private key exists but public key is missing — deriving public key from it."
  openssl rsa -in "${PRIVATE_KEY}" -pubout -out "${PUBLIC_KEY}"
  echo "Generated ${PUBLIC_KEY}"
  exit 0
fi

echo "Generating new RSA keypair..."

# Private key: PKCS#8, 2048-bit RSA
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "${PRIVATE_KEY}"

# Public key derived from the private key
openssl rsa -in "${PRIVATE_KEY}" -pubout -out "${PUBLIC_KEY}"

chmod 600 "${PRIVATE_KEY}"
chmod 644 "${PUBLIC_KEY}"

echo "Generated:"
echo "  ${PRIVATE_KEY}"
echo "  ${PUBLIC_KEY}"

