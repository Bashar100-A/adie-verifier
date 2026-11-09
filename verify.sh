#!/usr/bin/env bash
# verify.sh — ADIE verifier CLI wrapper
# Verifies any manifest.json via index-v6.html (jsdom). Matches browser behavior exactly.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 <manifest.json>" >&2
  echo "  Uses index-v6.html verification pipeline (same as browser)" >&2
  exit 2
fi

MANIFEST="$1"
VERIFIER_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f "$MANIFEST" ]; then
  echo "ERROR: manifest not found: $MANIFEST" >&2
  exit 2
fi

if [ ! -f "$VERIFIER_DIR/verify-manifest.cjs" ]; then
  echo "ERROR: verify-manifest.cjs missing in $VERIFIER_DIR" >&2
  exit 2
fi

node "$VERIFIER_DIR/verify-manifest.cjs" "$MANIFEST"
