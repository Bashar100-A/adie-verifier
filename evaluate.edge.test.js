'use strict';
require('./evaluate.js');
const E = globalThis.ADIE_EVAL;

const pass = [];
const fail = [];
function tryEval(label, fn, expect) {
  try {
    const r = fn();
    if (r === expect) { pass.push(label); return; }
    fail.push(label + ': expected ' + JSON.stringify(expect) + ', got ' + JSON.stringify(r));
  } catch (e) {
    if (expect === 'THROW') { pass.push(label + ' (threw as expected: ' + e.message.slice(0,50) + ')'); return; }
    fail.push(label + ': unexpected throw: ' + e.message.slice(0,80));
  }
}

// --- Category 1: extreme rational values (BigInt precision) ---
const huge = '1' + '0'.repeat(1000);        // 10^1000
const tiny = '1/' + huge;                   // 1/10^1000
const hugeFrac = huge + '/' + huge;         // 10^1000 / 10^1000 = 1

tryEval('huge integer parses', () => E.Rat.parse(huge).n.toString().length, 1001);
tryEval('tiny fraction parses', () => E.Rat.parse(tiny).d.toString().length > 990, true);
tryEval('hugeFrac normalizes to 1', () => E.Rat.parse(hugeFrac).cmp(E.Rat.parse('1')), 0);
tryEval('huge > tiny', () => E.Rat.parse(huge).cmp(E.Rat.parse(tiny)), 1);

// --- Category 2: division by zero, malformed ---
tryEval('1/0 throws', () => { E.Rat.parse('1/0'); return 'no-throw'; }, 'THROW');
tryEval('0/0 throws', () => { E.Rat.parse('0/0'); return 'no-throw'; }, 'THROW');
tryEval('empty string throws', () => { E.Rat.parse(''); return 'no-throw'; }, 'THROW');
tryEval('non-numeric throws', () => { E.Rat.parse('abc'); return 'no-throw'; }, 'THROW');

// --- Category 3: negative rationals ---
tryEval('negative parsed correctly', () => E.Rat.parse('-19/10').n.toString(), '-19');
tryEval('-19/10 < 0', () => E.Rat.parse('-19/10').cmp(E.Rat.parse('0')), -1);
tryEval('-19/-10 = 19/10', () => E.Rat.parse('-19/-10').cmp(E.Rat.parse('19/10')), 0);

// --- Category 4: DSL with extreme values ---
const extremeArtifact = {
  test_id: 'EDGE-001',
  expected_outcome: 'ACCEPT',
  policy_dsl: 'RULE x IF risk_score > 0.5;',
  safety_invariants: [],
  witness_data: { assignment: {
    risk_score: { sort: 'Real', value: '1' + '0'.repeat(500) + '/1' },
    'rule.action': { sort: 'String', value: 'x' }
  } }
};
tryEval('DSL with 10^500 witness', () => E.evaluateWitness(extremeArtifact).derived, 'ACCEPT');

// --- Category 5: invariant with extreme forbidden action (should not crash) ---
const invExtreme = {
  test_id: 'EDGE-002',
  expected_outcome: 'ACCEPT',
  policy_dsl: 'RULE x IF risk_score > 0.5;',
  safety_invariants: ['cannot_isolate_domain_controller'],
  witness_data: { assignment: {
    risk_score: { sort: 'Real', value: '99/100' },
    'rule.action': { sort: 'String', value: 'x'.repeat(10000) }
  } }
};
tryEval('invariant with 10K-char action', () => E.evaluateWitness(invExtreme).derived, 'ACCEPT');

// --- Category 6: sort mismatch (should reject, not crash) ---
const sortMismatch = {
  test_id: 'EDGE-003',
  expected_outcome: 'ACCEPT',
  policy_dsl: 'RULE x IF risk_score > 0.5;',
  safety_invariants: [],
  witness_data: { assignment: {
    risk_score: { sort: 'Bool', value: true },   // wrong sort
    'rule.action': { sort: 'String', value: 'x' }
  } }
};
tryEval('sort mismatch rejects gracefully', () => E.evaluateWitness(sortMismatch).derived, 'REJECT_INVALID');

// --- Category 7: empty DSL ---
tryEval('empty DSL rejects', () => {
  const a = { test_id: 'X', expected_outcome: 'ACCEPT', policy_dsl: '', safety_invariants: [], witness_data: {} };
  return E.evaluateWitness(a).derived;
}, 'REJECT_INVALID');

// --- Category 8: deeply nested AND chain (parser stress) ---
const nested = 'RULE x IF ' + Array(100).fill('True').join(' AND ') + ';';
tryEval('100-deep AND chain parses', () => {
  const a = { test_id: 'X', expected_outcome: 'ACCEPT', policy_dsl: nested, safety_invariants: [], witness_data: { assignment: {} } };
  return E.evaluateWitness(a).derived;
}, 'ACCEPT');

// --- Report ---
console.log('');
console.log('PASS: ' + pass.length);
console.log('FAIL: ' + fail.length);
if (fail.length > 0) {
  fail.forEach(f => console.log('  ❌ ' + f));
  process.exit(1);
}
console.log('ALL EDGE ASSERTIONS PASS');
process.exit(0);
