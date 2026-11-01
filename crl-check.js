/* M1-3: CRL revocation check (pure JS, no deps, no network).
 * Mirrors Core's adie/trust/crl.py semantics (schema crl-v1).
 * Returns {status, reason}; permissive on malformed inputs (backward compat).
 * Status values: OK, REVOKED, SIGNED_AFTER_COMPROMISE, SIGNED_BEFORE_COMPROMISE.
 */
(function (root) {
  'use strict';

  function parseISO(s) {
    if (typeof s !== 'string') return null;
    var t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  }

  function pickCompromised(entry) {
    var comp = parseISO(entry.compromised_at);
    if (comp !== null) return comp;
    return parseISO(entry.revoked_at);
  }

  function checkCRL(manifest, crl) {
    if (!manifest || typeof manifest !== 'object') return { status: 'OK', reason: 'no manifest' };
    if (!crl || typeof crl !== 'object') return { status: 'OK', reason: 'no CRL' };
    var sig = manifest.signature;
    if (!sig || typeof sig !== 'object') return { status: 'OK', reason: 'no signature' };
    var keyId = sig.key_id;
    if (typeof keyId !== 'string' || !keyId) return { status: 'OK', reason: 'no key_id' };
    var signedAt = parseISO(sig.signed_at);
    if (signedAt === null) return { status: 'OK', reason: 'no signed_at' };
    var revoked = crl.revoked;
    if (!Array.isArray(revoked)) return { status: 'OK', reason: 'no revoked[]' };

    for (var i = 0; i < revoked.length; i++) {
      var entry = revoked[i];
      if (!entry || entry.key_id !== keyId) continue;
      var revokedAt = parseISO(entry.revoked_at);
      if (revokedAt === null) continue;
      var compromisedAt = pickCompromised(entry);
      if (signedAt >= revokedAt) {
        return { status: 'REVOKED',
                 reason: 'signed ' + sig.signed_at + ' >= revoked ' + entry.revoked_at };
      }
      if (compromisedAt !== null && signedAt >= compromisedAt) {
        return { status: 'SIGNED_AFTER_COMPROMISE',
                 reason: 'signed ' + sig.signed_at + ' in [compromised ' +
                         (entry.compromised_at || entry.revoked_at) + ', revoked ' + entry.revoked_at + ')' };
      }
      return { status: 'SIGNED_BEFORE_COMPROMISE',
               reason: 'signed ' + sig.signed_at + ' < compromised ' +
                       (entry.compromised_at || entry.revoked_at) };
    }
    return { status: 'OK', reason: 'key_id ' + keyId + ' not in revoked[]' };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { checkCRL: checkCRL };
  } else if (root) {
    root.ADIE_CRL = { checkCRL: checkCRL };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
