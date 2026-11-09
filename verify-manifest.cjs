'use strict';
// verify-manifest.cjs — standalone CLI that mirrors index-v6.html verification.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { webcrypto } = require('crypto');

const root = __dirname;
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
    process.exit(2);
  }
  const file = process.argv[2];
  if (!file) { console.error('usage: node verify-manifest.cjs <manifest.json>'); process.exit(2); }
  const text = fs.readFileSync(file, 'utf-8');
  let result;
  try {
    result = await window.verifyManifest(text);
  } catch (e) {
    result = { ok: false, reason: 'THROWN', detail: e.message };
  }
  if (result.ok) {
    console.log('VALID');
    if (result.detail) console.log(result.detail);
    process.exit(0);
  } else {
    console.log('INVALID: ' + (result.reason || 'UNKNOWN'));
    if (result.detail) console.log(result.detail);
    process.exit(1);
  }
})().catch(e => { console.error('TEST ERROR:', e.stack || e.message); process.exit(2); });
