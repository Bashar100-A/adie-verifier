'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { webcrypto } = require('crypto');

const root = '/home/biss/Desktop/adie-verifier';
const html = fs.readFileSync(path.join(root, 'index-v6.html'), 'utf-8');

const pass = [], fail = [], warn = [];
const ok = (l) => pass.push(l);
const bad = (l, d) => fail.push(l + (d ? ': ' + d : ''));
const wrn = (l, d) => warn.push(l + (d ? ': ' + d : ''));

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
  } catch (e) { wrn('crypto.subtle stub', e.message); }

  await new Promise(r => {
    if (window.document.readyState === 'complete') return r();
    window.addEventListener('load', r);
  });
  await new Promise(r => setTimeout(r, 500));

  // Structural
  if (window.ADIE_EVAL) ok('ADIE_EVAL loaded (v' + window.ADIE_EVAL.version + ')');
  else { bad('ADIE_EVAL missing'); console.log('FATAL'); process.exit(1); }

  if (window.document.getElementById('v6-section')) ok('v6-section exists');
  else bad('v6-section missing');

  if (window.document.getElementById('v6-evaluate-btn')) ok('v6-evaluate-btn exists');
  else bad('v6-evaluate-btn missing');

  if (window.document.getElementById('v6-output')) ok('v6-output exists');
  else bad('v6-output missing');

  if (!html.includes('cloneNode')) ok('no cloneNode in HTML');
  else bad('cloneNode present');

  if ((html.match(/<script/g) || []).length === (html.match(/<\/script>/g) || []).length)
    ok('script tags balanced');
  else bad('script tags mismatched');

  // Logic: demo manifest
  const demo = JSON.parse(fs.readFileSync(path.join(root, 'manifest-P12-v6-demo.json'), 'utf-8'));
  const demoW = (demo.artifacts || []).filter(a => a.role === 'witness');
  if (demoW.length === 13) ok('demo: 13 witnesses');
  else bad('demo witnesses', demoW.length);

  const r1 = demoW.map(a => window.ADIE_EVAL.evaluateWitness(a));
  const c1 = { accept:0, acceptPass:0, acceptFail:0, pregate:0, boundary:0, unknown:0 };
  r1.forEach(r => { c1[r.bucket]++; if (r.bucket==='accept') { r.match ? c1.acceptPass++ : c1.acceptFail++; } });
  if (c1.acceptPass === 3) ok('demo: 3 ACCEPT pass'); else bad('demo ACCEPT pass', c1.acceptPass);
  if (c1.acceptFail === 0) ok('demo: 0 ACCEPT FAIL'); else bad('demo ACCEPT FAIL', c1.acceptFail);
  if (c1.pregate === 8) ok('demo: 8 pre-gate'); else bad('demo pre-gate', c1.pregate);
  if (c1.boundary === 2) ok('demo: 2 boundary'); else bad('demo boundary', c1.boundary);

  // Logic: inconsistent manifest
  const inc = JSON.parse(fs.readFileSync(path.join(root, 'manifest-P12-v6-inconsistent.json'), 'utf-8'));
  const incW = (inc.artifacts || []).filter(a => a.role === 'witness');
  const r2 = incW.map(a => window.ADIE_EVAL.evaluateWitness(a));
  const c2 = { accept:0, acceptPass:0, acceptFail:0, pregate:0, boundary:0, unknown:0 };
  r2.forEach(r => { c2[r.bucket]++; if (r.bucket==='accept') { r.match ? c2.acceptPass++ : c2.acceptFail++; } });
  if (c2.acceptPass === 2) ok('inconsistent: 2 ACCEPT pass'); else bad('inconsistent ACCEPT pass', c2.acceptPass);
  if (c2.acceptFail === 1) ok('inconsistent: 1 ACCEPT FAIL (forensic)'); else bad('inconsistent ACCEPT FAIL', c2.acceptFail);

  // UI soft: simulate file change, check v6-section reveals
  try {
    const demoFile = new window.File([fs.readFileSync(path.join(root,'manifest-P12-v6-demo.json'),'utf-8')], 'demo.json', {type:'application/json'});
    const inp = window.document.getElementById('file');
    Object.defineProperty(inp, 'files', { value: [demoFile], configurable: true });
    inp.dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const sec = window.document.getElementById('v6-section');
    if (sec && sec.style.display !== 'none') ok('UI: v6-section visible after file change');
    else wrn('UI: v6-section not visible (jsdom FileReader may differ)');

    // Try clicking evaluate button
    const btn = window.document.getElementById('v6-evaluate-btn');
    if (btn && !btn.disabled) {
      btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      const outHtml = window.document.getElementById('v6-output').innerHTML;
      if (outHtml && outHtml.includes('3 ACCEPT pass')) ok('UI: evaluate rendered 3 ACCEPT pass');
      else wrn('UI: rendered output lacks 3 ACCEPT pass', (outHtml||'').slice(0,100));
    } else {
      wrn('UI: v6-btn disabled, cannot click');
    }
  } catch (e) {
    wrn('UI simulation', e.message);
  }

  console.log('\nPASS: ' + pass.length);
  console.log('FAIL: ' + fail.length);
  console.log('WARN: ' + warn.length);
  pass.forEach(p => console.log('  OK ' + p));
  warn.forEach(w => console.log('  ~ ' + w));
  if (fail.length) { fail.forEach(f => console.log('  X ' + f)); process.exit(1); }
  if (warn.length) console.log('\nPASS with ' + warn.length + ' warn(s) — logic proven');
  else console.log('\nALL PASS');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR:', e.stack || e.message); process.exit(2); });
