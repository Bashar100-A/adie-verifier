#!/usr/bin/env node
// scripts/verify-manifests.js
// Replicates index-v5.html verification pipeline for CI.
// No external dependencies. Node 20+ required.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO_ROOT = path.join(__dirname, '..');
const TRUSTED_KEY_IDS = new Set(['28f7e99132838f7a']);
const SUPPORTED_MANIFEST_VERSIONS = new Set(['1.0']);

// --- JCS canonicalize (verbatim port of index-v5.html) ---
function jcsCanonicalize(v) {
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(v)) throw new Error('non-finite number');
    if (Object.is(v, -0)) return '0';
    return v.toString();
  }
  if (t === 'string') {
    let out = '"';
    for (let i = 0; i < v.length; i++) {
      const c = v.charCodeAt(i);
      if (c === 0x22) out += '\\"';
      else if (c === 0x5c) out += '\\\\';
      else if (c === 0x08) out += '\\b';
      else if (c === 0x09) out += '\\t';
      else if (c === 0x0a) out += '\\n';
      else if (c === 0x0c) out += '\\f';
      else if (c === 0x0d) out += '\\r';
      else if (c < 0x20) out += '\\u' + c.toString(16).padStart(4, '0');
      else out += v[i];
    }
    return out + '"';
  }
  if (Array.isArray(v)) return '[' + v.map(jcsCanonicalize).join(',') + ']';
  if (t === 'object') {
    const keys = Object.keys(v).sort();
    return '{' + keys.map(k => jcsCanonicalize(k) + ':' + jcsCanonicalize(v[k])).join(',') + '}';
  }
  throw new Error('unsupported type: ' + t);
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function pemToDer(pem) {
  const m = pem.match(/-----BEGIN PUBLIC KEY-----([\s\S]+?)-----END PUBLIC KEY-----/);
  if (!m) throw new Error('invalid PEM');
  return Buffer.from(m[1].replace(/\s+/g, ''), 'base64');
}

function computeKeyIdFromPem(pem) {
  return sha256Hex(pemToDer(pem)).slice(0, 16);
}

function fail(reason, detail) { return { ok: false, reason, detail: detail || '' }; }
function pass(detail) { return { ok: true, reason: 'VALID', detail: detail || '' }; }

function verifyManifest(text) {
  let m;
  try { m = JSON.parse(text); } catch (e) { return fail('MALFORMED_JSON', e.message); }
  if (!m || typeof m !== 'object') return fail('MALFORMED_JSON', 'not an object');
  if (!SUPPORTED_MANIFEST_VERSIONS.has(String(m.manifest_version)))
    return fail('UNSUPPORTED_MANIFEST_VERSION', String(m.manifest_version));
  if (!m.signature || typeof m.signature !== 'object')
    return fail('MISSING_SIGNATURE', 'no signature block');

  const sig = m.signature;
  if (sig.alg !== 'Ed25519') return fail('UNSUPPORTED_ALG', String(sig.alg));
  for (const k of ['key_id', 'signed_payload_sha256', 'value', 'public_key_pem']) {
    if (!sig[k] || typeof sig[k] !== 'string')
      return fail('MISSING_SIGNATURE', 'missing signature.' + k);
  }

  let computedKeyId;
  try { computedKeyId = computeKeyIdFromPem(sig.public_key_pem); }
  catch (e) { return fail('CRYPTO_ERROR', 'PEM parse: ' + e.message); }
  if (computedKeyId !== sig.key_id)
    return fail('KEY_ID_MISMATCH', 'computed=' + computedKeyId + ' declared=' + sig.key_id);
  if (!TRUSTED_KEY_IDS.has(computedKeyId))
    return fail('UNTRUSTED_KEY', 'key_id=' + computedKeyId + ' not in TRUSTED_KEY_IDS');

  const payload = Object.assign({}, m);
  delete payload.signature;
  let canonical;
  try { canonical = jcsCanonicalize(payload); }
  catch (e) { return fail('CRYPTO_ERROR', 'canonicalize: ' + e.message); }
  const canonicalBytes = Buffer.from(canonical, 'utf8');

  const payloadHash = sha256Hex(canonicalBytes);
  if (payloadHash !== sig.signed_payload_sha256)
    return fail('PAYLOAD_HASH_MISMATCH', 'computed=' + payloadHash + ' declared=' + sig.signed_payload_sha256);

  let publicKey, signature;
  try {
    const der = pemToDer(sig.public_key_pem);
    publicKey = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
    signature = Buffer.from(sig.value.replace(/\s+/g, ''), 'base64');
  } catch (e) { return fail('CRYPTO_ERROR', 'importKey/decode: ' + e.message); }

  let valid;
  try { valid = crypto.verify(null, canonicalBytes, publicKey, signature); }
  catch (e) { return fail('CRYPTO_ERROR', 'verify: ' + e.message); }
  if (!valid) return fail('SIGNATURE_INVALID', 'Ed25519 verify returned false');

  return pass('claim_id=' + m.claim_id + ' outcome=' + m.outcome + ' run_id=' + m.run_id);
}

const MANIFESTS = ['manifest-P12.json', 'manifest-P13.json', 'manifest-P14.json'];
let allOk = true;
const results = [];
for (const name of MANIFESTS) {
  const full = path.join(REPO_ROOT, name);
  if (!fs.existsSync(full)) {
    results.push({ name, ok: false, reason: 'FILE_NOT_FOUND' });
    allOk = false; continue;
  }
  const r = verifyManifest(fs.readFileSync(full, 'utf8'));
  results.push({ name, ...r });
  if (!r.ok) allOk = false;
}

console.log('=== ADIE v2.0.0 manifest verification ===');
for (const r of results)
  console.log('  ' + (r.ok ? 'VALID' : 'INVALID') + '  ' + r.name + '  ' + r.reason + '  ' + (r.detail || ''));
console.log('=== ' + results.filter(r => r.ok).length + '/' + results.length + ' valid ===');
process.exit(allOk ? 0 : 1);
