// M1-3: crl-check logic unit tests (Node.js, no deps)
const { checkCRL } = require('./crl-check.js');
const fs = require('fs');

const manifest = JSON.parse(fs.readFileSync('manifest-P12.json', 'utf8'));
const crlRevoked = JSON.parse(fs.readFileSync('crl-revoked.json', 'utf8'));
const crlFuture = JSON.parse(fs.readFileSync('crl-future.json', 'utf8'));
const crlCompromised = JSON.parse(fs.readFileSync('crl-compromised.json', 'utf8'));

let p = 0, f = 0;
function a(name, cond) {
  if (cond) { p++; console.log('  [ok] ' + name); }
  else { f++; console.log('  [FAIL] ' + name); }
}

a('T1 no CRL = OK', checkCRL(manifest, null).status === 'OK');
a('T2 unrelated key = OK', checkCRL(manifest, {revoked: [{key_id: 'other', revoked_at: '2026-01-01T00:00:00Z'}]}).status === 'OK');
a('T3 revoked before = REVOKED', checkCRL(manifest, crlRevoked).status === 'REVOKED');
a('T4 future = SIGNED_BEFORE_COMPROMISE', checkCRL(manifest, crlFuture).status === 'SIGNED_BEFORE_COMPROMISE');
a('T5 compromised-before = SIGNED_AFTER_COMPROMISE', checkCRL(manifest, crlCompromised).status === 'SIGNED_AFTER_COMPROMISE');
a('T6 malformed CRL = OK', checkCRL(manifest, {}).status === 'OK');
a('T7 malformed manifest = OK', checkCRL({}, crlRevoked).status === 'OK');
const revNoComp = {revoked: [{key_id: '28f7e99132838f7a', revoked_at: '2026-10-15T00:00:00Z', compromised_at: null}]};
a('T8 compromised null falls to revoked = REVOKED', checkCRL(manifest, revNoComp).status === 'REVOKED');

console.log('\nPASS: ' + p + ' | FAIL: ' + f);
process.exit(f === 0 ? 0 : 1);
