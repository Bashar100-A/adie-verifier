# ADIE Verifier

Offline verifier for ADIE decision certificates.

Open `index.html` in any browser. No installation. No server.
After the page loads, verification requires no network.

## Try it

1. Drag `certificate-001.json` and `public-key-001.pem` → expect `VALID`
2. Drag `certificate-001-TAMPERED.json` and `public-key-001.pem` → expect `INVALID: E002_HASH_MISMATCH`

Standards: RFC 8785, RFC 6962, RSA-2048, SHA-256.
License: MIT.
Project: https://github.com/Bashar100-A/EnterpriseGuard
