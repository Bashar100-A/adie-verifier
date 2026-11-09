# Verify ADIE in 5 minutes

**Audience:** anyone who wants to independently check an ADIE manifest without trusting the producer's code.

## What you have

- `manifest.json` - a signed decision artifact from an ADIE producer
- `index-v6.html` - a standalone HTML verifier (no server, no network, no install)

## Three ways to verify

### Option 1: Browser (easiest، 30 seconds)

1. Open `index-v6.html` in Chrome 113+، Firefox 130+، or Safari 17+
2. Click **Choose File**، select `manifest.json`
3. Click **Verify manifest**
4. Read the result table

Expected if valid: `VALID` with reason `claim_id=<id> outcome=<PASS|FAIL> run_id=<id>`

### Option 2: Node CLI (no browser)

```bash
cd adie-verifier
npm install                          # one time
ADIE_VERIFIER_PATH=. ADIE_CORE_PATH=/path/to/core \
  node spec/m4/e2e/verify_rc_manifest.js manifest.json
```

Note: `verify_rc_manifest.js` is in the Core repo (`spec/m4/e2e/`). If you only have the verifier، use the browser option instead.

### Option 3: check what the verifier checks (source read)

`index-v6.html:215-290` - the `verifyManifest()` function. 11 steps in order:

1. `JSON.parse(text)` + `rejectUnsafeIntegers()` (S32 fix)
2. Check `manifest_version == "1.0"`
3. Check `signature` block present with `alg, key_id, signed_payload_sha256, value, public_key_pem`
4. Check `signature.alg == "Ed25519"`
5. Compute `key_id = SHA256(SPKI DER)[:16]` from `public_key_pem`، compare to declared
6. Check `key_id in TRUSTED_KEY_IDS`
7. `jcsCanonicalize(payload without signature)` - RFC 8785
8. `SHA-256(canonical) == signed_payload_sha256`
9. `crypto.subtle.verify('Ed25519', key, signature, canonicalBytes)`
10. If ACCEPT artifacts present: `evaluateWitness()` on each
11. Return VALID or INVALID with reason

## What you can trust after verification

- The manifest bytes are exactly what the signer signed (Ed25519 over JCS)
- The signing key matches `key_id`، and that `key_id` is in the verifier's `TRUSTED_KEY_IDS`
- For ACCEPT decisions، each witness evaluates to ACCEPT under the ADIE policy DSL

## What you CANNOT trust after verification

- The identity of the human behind the signing key (dev_mode=true is test-scope)
- The soundness of the SMT solver (Z3 proofs are not shipped; DEC-011)
- CRL revocation status if no CRL was loaded (fail-open، see DEC-013 draft)
- That the decision was correct in the real world; only that the formal statement was proven to the producer's satisfaction

## If verification fails

The reason code tells you why:

| Reason | Meaning |
|---|---|
| `MALFORMED_JSON` | Not valid JSON، or contains unsafe integer |
| `UNSUPPORTED_MANIFEST_VERSION` | manifest_version not "1.0" |
| `MISSING_SIGNATURE` | No signature block، or missing required field |
| `UNSUPPORTED_ALG` | alg != "Ed25519" |
| `KEY_ID_MISMATCH` | computed key_id != declared key_id |
| `UNTRUSTED_KEY` | key_id not in TRUSTED_KEY_IDS |
| `PAYLOAD_HASH_MISMATCH` | SHA-256(JCS(payload)) != signed_payload_sha256 (manifest was tampered) |
| `SIGNATURE_INVALID` | Ed25519 verify returned false |
| `CRYPTO_ERROR` | Malformed PEM or base64 |

## Getting help

See `VERIFY.md` for the deep technical guide، or `test-adversarial/` for 23 attack scenarios that verify these reasons.

---

*README-QUICK — 5-minute external verification guide. Written S32-pre.*

