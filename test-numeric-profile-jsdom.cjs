'use strict';
// AP-23 verification: Numeric Profile enforced via combined path
// (validateNumericProfile + JSON.parse). S23 4/8.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { webcrypto } = require('crypto');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index-v6.html'), 'utf-8');

const pass = [], fail = [];

(async () => {
  const dom = new JSDOM(html, {
    url: 'file://' + root + '/',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
  });
  const { window } = dom;

  try {
    Object.defineProperty(window.crypto, 'subtle', { value: webcrypto.subtle, configurable: true });
  } catch (_) {}

  await new Promise(resolve => {
    if (window.document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve);
  });

  const validator = window.validateNumericProfile;
  if (typeof validator !== 'function') {
    console.error('STOP: window.validateNumericProfile not exposed');
    process.exit(2);
  }

  // Combined path: mirrors verifyManifest() in index-v6.html
  function adieParse(text) {
    validator(text);         // numeric token policy
    return JSON.parse(text); // JSON validity
  }

  const cases = [
    // Accepts (valid JSON + Numeric Profile compliant)
    ['{"n":1}',                    false, 'accept 1'],
    ['{"n":-1}',                   false, 'accept -1'],
    ['{"n":0}',                    false, 'accept 0'],
    ['{"n":9007199254740991}',     false, 'accept 2^53-1'],
    ['{"n":-9007199254740991}',    false, 'accept -(2^53-1)'],
    ['{"s":"1.5"}',                false, 'accept string "1.5"'],
    ['{"s":"1e0"}',                false, 'accept string "1e0"'],
    ['{"a":{"b":[9007199254740991]}}', false, 'accept nested safe'],
    // Rejects via validateNumericProfile (decimal/exponent tokens)
    ['{"n":1.0}',                  true,  'reject 1.0 (token: decimal)'],
    ['{"n":1.5}',                  true,  'reject 1.5 (token: decimal)'],
    ['{"n":1e0}',                  true,  'reject 1e0 (token: exponent)'],
    ['{"n":1e10}',                 true,  'reject 1e10 (token: exponent)'],
    // Rejects via validateNumericProfile (out-of-domain int)
    ['{"n":9007199254740992}',     true,  'reject 2^53 (token: unsafe int)'],
    ['{"n":-9007199254740992}',    true,  'reject -(2^53) (token: unsafe int)'],
    // Rejects via JSON.parse (non-JSON tokens)
    ['{"n":NaN}',                  true,  'reject NaN (JSON.parse: invalid)'],
    ['{"n":Infinity}',             true,  'reject Infinity (JSON.parse: invalid)'],
    ['{"n":-Infinity}',            true,  'reject -Infinity (JSON.parse: invalid)'],
    // Rejects via validateNumericProfile (nested)
    ['{"a":{"b":9007199254740992}}', true, 'reject nested 2^53'],
  ];

  for (const [text, expectThrow, label] of cases) {
    try {
      adieParse(text);
      if (expectThrow) fail.push(label + ' (expected throw)');
      else pass.push(label);
    } catch (e) {
      if (expectThrow) pass.push(label);
      else fail.push(label + ': ' + e.message);
    }
  }

  console.log('=== AP-23 Numeric Profile (browser DOM via jsdom, combined path) ===');
  console.log('jsdom: ' + require('jsdom/package.json').version);
  console.log('');
  console.log('PASS: ' + pass.length + ' | FAIL: ' + fail.length);
  pass.forEach(p => console.log('  OK ' + p));
  if (fail.length) { fail.forEach(f => console.log('  X  ' + f)); process.exit(1); }
  console.log('\nALL PASS');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR:', e.stack || e.message); process.exit(2); });
