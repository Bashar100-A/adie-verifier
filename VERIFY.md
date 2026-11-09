# VERIFY.md — For external auditors

**Purpose:** give an auditor who has never seen ADIE the minimum they need to independently verify a manifest.

## Assumptions

- You have `manifest.json` (signed by an ADIE producer)
- You have a modern browser (Chrome 113+، Firefox 130+، Safari 17+)
- You do NOT have the producer's code، and should not need it

## The 5-step verification

1. Open `index-v6.html` (double-click، drag into browser)
2. Click **Choose File**، select `manifest.json`
3. Click **Verify manifest**
4. If VALID: click **Evaluate witnesses** to see ACCEPT evidence
5. Cross-reference: check the displayed `key_id` against `TRUSTED_KEY_IDS` in the verifier source (line `var TRUSTED_KEY_IDS = new Set([...])`)

## The 3 things to check manually if you don't trust the verifier

1. **Signature scope:** open `manifest.json`، remove the `signature` field، apply RFC 8785 JCS (e.g. `python3 -c "import rfc8785; print(rfc8785.dumps(payload).decode())"`)، then SHA-256. Compare to `signature.signed_payload_sha256`. They must match.

2. **Key ID derivation:** take `signature.public_key_pem`، decode PEM → DER، SHA-256، take first 16 hex chars. Compare to `signature.key_id`.

3. **Ed25519 verify:** with the SPKI public key، verify the base64 signature over the canonical bytes. Any standard Ed25519 library works.

## The reason codes you'll see

See README-QUICK.md table. All 20 reason codes are covered by `test-adversarial/`.

## What this proves

- Byte-level integrity of the manifest
- The signing key was in the verifier's trust set
- For ACCEPT artifacts: the witness assignments satisfy the policy DSL

## What this does NOT prove

- The human identity of the signer (dev_mode=true means test-scope)
- That Z3's UNSAT proofs are sound (DEC-011 §3: proofs not shipped)
- Revocation status if no CRL loaded (fail-open، DEC-013)

## If you want to run the full adversarial suite

```bash
cd adie-verifier
npm install
node test-adversarial/run.cjs    # 23/23 PASS expected
```

This runs 23 attack manifests through the real `verifyManifest()` in `index-v6.html` via jsdom.

---

*VERIFY.md — external auditor deep guide. Written S32-pre.*

