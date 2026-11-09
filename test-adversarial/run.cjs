'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { webcrypto } = require('crypto');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index-v6.html'), 'utf-8');

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
  } catch (e) {}
  await new Promise(r => {
    if (window.document.readyState === 'complete') return r();
    window.addEventListener('load', r);
  });
  await new Promise(r => setTimeout(r, 500));

  if (typeof window.verifyManifest !== 'function') {
    console.error('STOP: window.verifyManifest not accessible');
    console.error('Available globals (filtered):',
      Object.keys(window).filter(k => /erify|ADIE|alida/i.test(k)).slice(0, 20));
    process.exit(2);
  }

  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'expected.json'), 'utf-8'));
  const attacksDir = path.join(__dirname, 'attacks');
  let pass = 0, fail = 0;
  const failures = [];

  for (const exp of expected) {
    const file = path.join(attacksDir, exp.name + '.json');
    const text = fs.readFileSync(file, 'utf-8');
    let result;
    try {
      result = await window.verifyManifest(text);
    } catch (e) {
      result = { ok: false, reason: 'THROWN', detail: e.message };
    }
    const actual = result.ok ? 'VALID' : (result.reason || 'UNKNOWN');
    const codeOK = (actual === exp.expected_code);
    const detailOK = !exp.detail_contains || (result.detail || '').includes(exp.detail_contains);
    if (codeOK && detailOK) {
      pass++;
      console.log(`PASS  ${exp.name}  ->  ${actual}`);
    } else {
      fail++;
      const m = `FAIL  ${exp.name}  expected=${exp.expected_code}${exp.detail_contains ? '~"' + exp.detail_contains + '"' : ''}  actual=${actual}  detail=${(result.detail || '').slice(0, 60)}`;
      console.log(m);
      failures.push(m);
    }
  }
  console.log('');
  console.log(`PASS: ${pass} | FAIL: ${fail} | TOTAL: ${expected.length}`);
  if (fail > 0) { process.exit(1); }
  console.log('ALL ADVERSARIAL PASS');
})().catch(e => { console.error('TEST ERROR:', e.stack); process.exit(2); });
