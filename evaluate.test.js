/* M0-5: evaluate.js unit tests. Run with: node evaluate.test.js */
require('./evaluate.js');
var E = globalThis.ADIE_EVAL;

var pass = 0, fail = 0, failures = [];

function assertEq(actual, expected, label) {
  if (actual === expected) { pass++; return; }
  fail++;
  failures.push(label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

function baseArtifact(over) {
  var a = {
    test_id: 'T',
    expected_outcome: 'ACCEPT',
    policy_dsl: 'RULE isolate_ip IF risk_score > 0.90 AND NOT is_critical_infra;',
    safety_invariants: ['cannot_isolate_domain_controller'],
    witness_data: { assignment: {
      risk_score: { sort: 'Real', value: '19/10' },
      is_critical_infra: { sort: 'Bool', value: false },
      'rule.action': { sort: 'String', value: 'isolate_subnet' },
      'rule.name': { sort: 'String', value: 'isolate_ip' }
    } }
  };
  for (var k in over) a[k] = over[k];
  return a;
}

// ---------- Bucket classification ----------
assertEq(E.classifyBucket('ACCEPT', null), 'accept', 'bucket ACCEPT');
assertEq(E.classifyBucket('REJECT_UNPROVABLE', 'SOLVER_TIMEOUT'), 'boundary', 'bucket UNPROVABLE');
assertEq(E.classifyBucket('REJECT_POLICY', 'SMT_UNSATISFIABLE'), 'boundary', 'bucket UNSAT->boundary');
assertEq(E.classifyBucket('REJECT_INVALID', 'DSL_SYNTAX_ERROR'), 'pregate', 'bucket INVALID->pregate');
assertEq(E.classifyBucket('REJECT_POLICY', 'SAFETY_INVARIANT_VIOLATION'), 'pregate', 'bucket POLICY->pregate');
assertEq(E.classifyBucket('REJECT_BINDING', 'HASH_MISMATCH'), 'pregate', 'bucket BINDING->pregate');
assertEq(E.classifyBucket('SOMETHING', null), 'unknown', 'bucket unknown');

// ---------- ACCEPT: pass ----------
(function () {
  var r = E.evaluateWitness(baseArtifact({}));
  assertEq(r.bucket, 'accept', 'accept: bucket');
  assertEq(r.derived, 'ACCEPT', 'accept: derived');
  assertEq(r.match, true, 'accept: match');
})();

// ---------- ACCEPT: fail (tampered witness_data) — signed-inconsistent scenario ----------
(function () {
  var a = baseArtifact({});
  a.witness_data.assignment.risk_score = { sort: 'Real', value: '1/10' };
  var r = E.evaluateWitness(a);
  assertEq(r.bucket, 'accept', 'inconsistent: bucket');
  assertEq(r.derived, 'REJECT_POLICY', 'inconsistent: derived');
  assertEq(r.match, false, 'inconsistent: match');
})();

// ---------- ACCEPT: forbidden action (should be caught, derived != ACCEPT) ----------
(function () {
  var a = baseArtifact({});
  a.witness_data.assignment['rule.action'] = { sort: 'String', value: 'isolate_domain_controller' };
  var r = E.evaluateWitness(a);
  assertEq(r.bucket, 'accept', 'forbidden: bucket');
  assertEq(r.derived, 'REJECT_POLICY', 'forbidden: derived');
  assertEq(r.match, false, 'forbidden: match');
})();

// ---------- ACCEPT: DSL parse error ----------
(function () {
  var a = baseArtifact({ policy_dsl: 'NOT_A_RULE' });
  var r = E.evaluateWitness(a);
  assertEq(r.bucket, 'accept', 'parse-err: bucket');
  assertEq(r.derived, 'REJECT_INVALID', 'parse-err: derived');
  assertEq(r.match, false, 'parse-err: match');
})();

// ---------- PRE-GATE: not evaluated ----------
(function () {
  var a = { test_id: 'X', expected_outcome: 'REJECT_INVALID', failure_class: 'DSL_SYNTAX_ERROR',
            policy_dsl: 'INVALID_RULE', safety_invariants: [], witness_data: {} };
  var r = E.evaluateWitness(a);
  assertEq(r.bucket, 'pregate', 'pregate: bucket');
  assertEq(r.derived, null, 'pregate: derived null');
  assertEq(r.match, null, 'pregate: match null');
})();

// ---------- BOUNDARY: REJECT_UNPROVABLE ----------
(function () {
  var a = { test_id: 'X', expected_outcome: 'REJECT_UNPROVABLE', failure_class: 'SOLVER_TIMEOUT',
            policy_dsl: 'RULE x IF True;', safety_invariants: [], witness_data: {} };
  var r = E.evaluateWitness(a);
  assertEq(r.bucket, 'boundary', 'boundary: bucket');
  assertEq(r.derived, null, 'boundary: derived null');
})();

// ---------- BOUNDARY: SMT_UNSATISFIABLE ----------
(function () {
  var a = { test_id: 'X', expected_outcome: 'REJECT_POLICY', failure_class: 'SMT_UNSATISFIABLE',
            policy_dsl: 'RULE x IF a > 1 AND a < 0;', safety_invariants: [], witness_data: {} };
  var r = E.evaluateWitness(a);
  assertEq(r.bucket, 'boundary', 'unsat: bucket');
})();

// ---------- Rational parsing ----------
(function () {
  assertEq(E.Rat.parse('19/10').cmp(E.Rat.parse('1.9')), 0, 'rat 19/10 == 1.9');
  assertEq(E.Rat.parse('0.90').cmp(E.Rat.parse('9/10')), 0, 'rat 0.90 == 9/10');
  assertEq(E.Rat.parse('1/3').cmp(E.Rat.parse('1/3')), 0, 'rat 1/3 == 1/3');
  assertEq(E.Rat.parse('2').cmp(E.Rat.parse('1/10')), 1, 'rat 2 > 0.1');
})();

// ---------- DSL: OR operator (N04-like) ----------
(function () {
  var a = {
    test_id: 'OR-test',
    expected_outcome: 'ACCEPT',
    policy_dsl: 'RULE x IF risk_a > risk_b OR risk_c < 0.5;',
    safety_invariants: [],
    witness_data: { assignment: {
      risk_a: { sort: 'Real', value: '1/10' },
      risk_b: { sort: 'Real', value: '2/10' },
      risk_c: { sort: 'Real', value: '3/10' },
      'rule.action': { sort: 'String', value: 'x' }
    } }
  };
  // risk_a > risk_b: false. risk_c < 0.5: 3/10 < 5/10: true. OR: true
  var r = E.evaluateWitness(a);
  assertEq(r.derived, 'ACCEPT', 'OR: derived');
  assertEq(r.match, true, 'OR: match');
})();

// ---------- M0-6: manifest with failure_class (end-to-end) ----------
(function () {
  var fs = require('fs');
  var path = require('path');
  var mf = path.join(__dirname, 'manifest-P12-v6-m0-6.json');
  var m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  var ws = m.artifacts.filter(function (a) { return a.role === 'witness'; });
  assertEq(ws.length, 13, 'm0-6: witness_count');
  var byId = {};
  ws.forEach(function (w) { byId[w.test_id] = w; });
  assertEq(byId['P12-001'].failure_class, null, 'm0-6: P12-001 fc=null');
  assertEq(byId['P12-N03'].failure_class, 'SMT_UNSATISFIABLE', 'm0-6: N03 fc');
  assertEq(byId['P12-N05'].failure_class, 'SOLVER_TIMEOUT', 'm0-6: N05 fc');
  assertEq(byId['P12-N05R'].failure_class, 'SOLVER_TIMEOUT', 'm0-6: N05R fc');
  var rP001 = E.evaluateWitness(byId['P12-001']);
  var rN03 = E.evaluateWitness(byId['P12-N03']);
  var rN05 = E.evaluateWitness(byId['P12-N05']);
  var rN05R = E.evaluateWitness(byId['P12-N05R']);
  assertEq(rP001.bucket, 'accept', 'm0-6: P12-001 bucket');
  assertEq(rN03.bucket, 'boundary', 'm0-6: N03 bucket');
  assertEq(rN05.bucket, 'boundary', 'm0-6: N05 bucket');
  assertEq(rN05R.bucket, 'boundary', 'm0-6: N05R bucket');
  var counts = { accept: 0, pregate: 0, boundary: 0, unknown: 0 };
  ws.forEach(function (w) {
    var b = E.evaluateWitness(w).bucket;
    if (b in counts) counts[b]++;
  });
  assertEq(counts.accept, 3, 'm0-6: counts.accept');
  assertEq(counts.pregate, 7, 'm0-6: counts.pregate');
  assertEq(counts.boundary, 3, 'm0-6: counts.boundary');
  assertEq(counts.unknown, 0, 'm0-6: counts.unknown');
})();

// ---------- Report ----------
console.log('---');
console.log('PASS: ' + pass + ' | FAIL: ' + fail);
if (fail > 0) {
  console.log('Failures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
process.exit(0);
