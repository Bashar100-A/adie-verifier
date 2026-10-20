# ADIE Verifier

Offline verifier for ADIE decision artifacts. Two independent verifiers,
two protocol versions. No installation. No network. No external dependencies.

## Quick start

Open either file directly in a modern browser (double-click or drag into window).

| File | Verifies | Protocol | Signature | Browser |
|---|---|---|---|---|
| `index.html` | `certificate-*.json` + `public-key-001.pem` | ADIE v1.0 (DCP-Profile-1) | RSA-2048 | Any modern |
| `index-v5.html` | `manifest-*.json` (self-verifying) | manifest_version 1.0 (ADIE v2.0.0) | Ed25519 | Chrome 113+, Firefox 130+, Safari 17+ |

## v4 - Decision Certificates (RSA-2048, protocol v1.0)

Try it:
1. Open `index.html`
2. Drag `certificate-001.json` + `public-key-001.pem` -> expect `VALID`
3. Drag `certificate-001-TAMPERED.json` + `public-key-001.pem` -> expect `INVALID: E002_HASH_MISMATCH`

Standards: RFC 8785, RFC 6962, RSA-2048, SHA-256.

## v5 - ADIE v2.0.0 Manifests (Ed25519, manifest_version 1.0)

Try it:
1. Open `index-v5.html`
2. Drag `manifest-P12.json` -> expect `VALID`
3. Drag `manifest-P13.json` -> expect `VALID`
4. Drag `manifest-P14.json` -> expect `VALID`
5. Drag `manifest-P12-TAMPERED.json` -> expect `INVALID: PAYLOAD_HASH_MISMATCH`

Checks performed by v5:
1. **Structural validation** - manifest_version, claim_id, outcome, signature.* present
2. **Key identity pinning** - key_id == SHA256(SPKI DER)[:16]; must be in TRUSTED_KEY_IDS
   (default: 28f7e99132838f7a). Mitigates manifest-substitution attacks.
3. **RFC 8785 JCS canonicalization** - signature key excluded, keys ASCII-sorted
4. **SHA-256(canonical)** == signature.signed_payload_sha256
5. **Ed25519(signature.value, canonical, public_key_pem)** == valid

Error states: MALFORMED_JSON, UNSUPPORTED_MANIFEST_VERSION, MISSING_SIGNATURE,
UNSUPPORTED_ALG, KEY_ID_MISMATCH, UNTRUSTED_KEY, PAYLOAD_HASH_MISMATCH,
SIGNATURE_INVALID, CRYPTO_ERROR.

Standards: RFC 8785, RFC 8032 (Ed25519), SHA-256.

## Security notes

Warning - Trust model: Both verifiers display dev_mode: true as a warning only.
Production deployments should replace dev keys with HSM/TEE-stored keys and
pin them out-of-band.

Warning - Key pinning: The v5 verifier rejects manifests whose key_id is not in
TRUSTED_KEY_IDS. Add new keys to that set only after explicit approval.

Warning - Browser support: Ed25519 in Web Crypto API requires Chrome 113+,
Firefox 130+, or Safari 17+. The v5 page checks this on load and displays a
clear error if unsupported (it does not silently fail).

License: MIT.
Project: https://github.com/Bashar100-A/EnterpriseGuard
