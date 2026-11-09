'use strict';
// AP-41 Firefox v5 wire verification: Playwright Firefox headless + real browser DOM.
// S26 2/8. Mirrors Chromium v5 test for cross-engine + v5/v6 parity check.
const path = require('path');
const { firefox } = require('playwright');

const root = __dirname;
const htmlPath = path.join(root, 'index-v5.html');
const fileUrl = 'file://' + htmlPath;

const cases = [
  ['{"n":1}',                 false, 'accept 1'],
  ['{"n":-1}',                false, 'accept -1'],
  ['{"n":0}',                 false, 'accept 0'],
  ['{"n":9007199254740991}',  false, 'accept 2^53-1'],
  ['{"n":-9007199254740991}', false, 'accept -(2^53-1)'],
  ['{"s":"1.5"}',             false, 'accept string "1.5"'],
  ['{"s":"1e0"}',             false, 'accept string "1e0"'],
  ['{"a":{"b":[9007199254740991]}}', false, 'accept nested safe'],
  ['{"n":1.0}',               true,  'reject 1.0 (decimal)'],
  ['{"n":1.5}',               true,  'reject 1.5 (decimal)'],
  ['{"n":1e0}',               true,  'reject 1e0 (exponent)'],
  ['{"n":1e10}',              true,  'reject 1e10 (exponent)'],
  ['{"n":9007199254740992}',  true,  'reject 2^53 (unsafe int)'],
  ['{"n":-9007199254740992}', true,  'reject -(2^53) (unsafe int)'],
  ['{"n":NaN}',               true,  'reject NaN (JSON.parse)'],
  ['{"n":Infinity}',          true,  'reject Infinity (JSON.parse)'],
  ['{"n":-Infinity}',         true,  'reject -Infinity (JSON.parse)'],
  ['{"a":{"b":9007199254740992}}', true, 'reject nested 2^53'],
];

(async () => {
  const browser = await firefox.launch({ headless: true });
  const version = browser.version();
  const context = await browser.newContext();
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(fileUrl);
  console.log('=== AP-41 Playwright Firefox wire test (index-v5.html) ===');
  console.log('Firefox: ' + version);
  console.log('HTML: ' + htmlPath);
  console.log('');

  const hasValidator = await page.evaluate(() => typeof window.validateNumericProfile === 'function');
  if (!hasValidator) {
    console.error('STOP: window.validateNumericProfile not exposed in Firefox v5');
    await browser.close();
    process.exit(2);
  }

  let pass = 0, fail = 0;
  for (const [raw, expectThrow, label] of cases) {
    const result = await page.evaluate((text) => {
      try {
        window.validateNumericProfile(text);
        JSON.parse(text);
        return { ok: true, err: null };
      } catch (e) {
        return { ok: false, err: e.message };
      }
    }, raw);

    const threw = !result.ok;
    if (threw === expectThrow) { pass++; console.log('PASS ' + label); }
    else { fail++; console.log('FAIL ' + label + ': threw=' + threw + ' err=' + result.err); }
  }

  console.log('');
  console.log('page errors: ' + pageErrors.length);
  if (pageErrors.length) pageErrors.forEach(e => console.log('  X ' + e));
  console.log('PASS: ' + pass + ' | FAIL: ' + fail);

  await browser.close();

  if (fail > 0) process.exit(1);
  console.log('ALL PASS');
  process.exit(0);
})().catch(e => { console.error('TEST ERROR:', e.stack || e.message); process.exit(2); });
