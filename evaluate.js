/* M0-5: ADIE witness evaluator. Offline, no network. IIFE exposing window.ADIE_EVAL. */
(function (global) {
  'use strict';

  // ---------- Rat (BigInt rational) ----------
  function gcd(a, b) { while (b) { var t = a % b; a = b; b = t; } return a < 0n ? -a : a; }
  function Rat(n, d) {
    if (d === 0n) throw new Error('zero denominator');
    if (d < 0n) { n = -n; d = -d; }
    var g = gcd(n < 0n ? -n : n, d);
    this.n = n / g; this.d = d / g;
  }
  Rat.parse = function (s) {
    if (typeof s !== 'string') s = String(s);
    s = s.trim();
    if (s.length === 0) throw new Error('empty rational');
    if (!/^-?[0-9]+(\.[0-9]+)?(\/-?[0-9]+)?$/.test(s)) {
      throw new Error('malformed rational: ' + s);
    }
    if (s.indexOf('/') !== -1) {
      var p = s.split('/'); return new Rat(BigInt(p[0]), BigInt(p[1]));
    }
    if (s.indexOf('.') !== -1) {
      var q = s.split('.');
      var denom = 10n ** BigInt(q[1].length);
      return new Rat(BigInt(q[0]) * denom + BigInt(q[1]), denom);
    }
    return new Rat(BigInt(s), 1n);
  };
  Rat.prototype.cmp = function (o) {
    var l = this.n * o.d, r = o.n * this.d;
    return l < r ? -1 : l > r ? 1 : 0;
  };

  // ---------- Tokenizer ----------
  function tokenize(src) {
    var t = [], i = 0;
    while (i < src.length) {
      var c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === ';') { t.push({ k: 'SEMI' }); i++; continue; }
      if (c === '(') { t.push({ k: 'LPAREN' }); i++; continue; }
      if (c === ')') { t.push({ k: 'RPAREN' }); i++; continue; }
      if (c === '>' || c === '<') {
        if (src[i + 1] === '=') { t.push({ k: 'OP', v: c + '=' }); i += 2; }
        else { t.push({ k: 'OP', v: c }); i++; }
        continue;
      }
      if (c === '=') {
        if (src[i + 1] === '=') { t.push({ k: 'OP', v: '==' }); i += 2; continue; }
        throw new Error('bare = unsupported');
      }
      if (c === '!') {
        if (src[i + 1] === '=') { t.push({ k: 'OP', v: '!=' }); i += 2; continue; }
        throw new Error('bare ! unsupported');
      }
      if (/[0-9]/.test(c)) {
        var j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++;
        t.push({ k: 'NUM', v: src.slice(i, j) }); i = j; continue;
      }
      if (/[a-zA-Z_]/.test(c)) {
        var m = i; while (m < src.length && /[a-zA-Z0-9_.]/.test(src[m])) m++;
        var w = src.slice(i, m);
        if (['RULE','IF','AND','OR','NOT','ACTION','True','False'].indexOf(w) !== -1) t.push({ k: w });
        else t.push({ k: 'IDENT', v: w });
        i = m; continue;
      }
      throw new Error('unexpected ' + c + ' at ' + i);
    }
    t.push({ k: 'EOF' });
    return t;
  }

  // ---------- Parser (recursive descent) ----------
  function Parser(t) { this.t = t; this.i = 0; }
  Parser.prototype.peek = function () { return this.t[this.i]; };
  Parser.prototype.eat = function (k) {
    var tok = this.t[this.i];
    if (k && tok.k !== k) throw new Error('expected ' + k + ', got ' + tok.k);
    this.i++; return tok;
  };
  Parser.prototype.parse = function () {
    this.eat('RULE');
    var name = this.eat('IDENT').v;
    this.eat('IF');
    var expr = this.parseOr();
    var action = null;
    if (this.peek().k === 'ACTION') { this.eat('ACTION'); action = this.eat('IDENT').v; }
    this.eat('SEMI');
    if (this.peek().k !== 'EOF') throw new Error('trailing tokens after ;');
    return { name: name, action: action, expr: expr };
  };
  Parser.prototype.parseOr = function () {
    var l = this.parseAnd();
    while (this.peek().k === 'OR') { this.eat('OR'); l = { k: 'or', l: l, r: this.parseAnd() }; }
    return l;
  };
  Parser.prototype.parseAnd = function () {
    var l = this.parseNot();
    while (this.peek().k === 'AND') { this.eat('AND'); l = { k: 'and', l: l, r: this.parseNot() }; }
    return l;
  };
  Parser.prototype.parseNot = function () {
    if (this.peek().k === 'NOT') { this.eat('NOT'); return { k: 'not', x: this.parseNot() }; }
    return this.parseAtom();
  };
  Parser.prototype.parseAtom = function () {
    var tok = this.peek();
    if (tok.k === 'LPAREN') { this.eat('LPAREN'); var e = this.parseOr(); this.eat('RPAREN'); return e; }
    if (tok.k === 'True') { this.eat('True'); return { k: 'lit', v: true }; }
    if (tok.k === 'False') { this.eat('False'); return { k: 'lit', v: false }; }
    if (tok.k === 'IDENT') {
      var name = this.eat('IDENT').v;
      if (this.peek().k === 'OP') {
        var op = this.eat('OP').v;
        var nx = this.peek();
        var lit;
        if (nx.k === 'NUM') { this.eat('NUM'); lit = { k: 'num', v: Rat.parse(nx.v) }; }
        else if (nx.k === 'True') { this.eat('True'); lit = { k: 'lit', v: true }; }
        else if (nx.k === 'False') { this.eat('False'); lit = { k: 'lit', v: false }; }
        else if (nx.k === 'IDENT') { this.eat('IDENT'); lit = { k: 'ident', v: nx.v }; }
        else throw new Error('bad literal after op: ' + nx.k);
        return { k: 'cmp', name: name, op: op, lit: lit };
      }
      return { k: 'bool_var', name: name };
    }
    throw new Error('unexpected ' + tok.k + ' in atom');
  };

  // ---------- Evaluator ----------
  function evalExpr(e, asg) {
    switch (e.k) {
      case 'lit': return e.v;
      case 'bool_var': {
        var v = asg[e.name];
        if (!v) throw new Error(e.name + ' not in witness');
        if (v.sort !== 'Bool') throw new Error(e.name + ' sort=' + v.sort + ' expected Bool');
        return v.value;
      }
      case 'and': return evalExpr(e.l, asg) && evalExpr(e.r, asg);
      case 'or': return evalExpr(e.l, asg) || evalExpr(e.r, asg);
      case 'not': return !evalExpr(e.x, asg);
      case 'cmp': {
        var lv = asg[e.name];
        if (!lv) throw new Error(e.name + ' not in witness');
        var right;
        if (e.lit.k === 'num') right = { sort: 'Real', value: e.lit.v };
        else if (e.lit.k === 'lit') right = { sort: 'Bool', value: e.lit.v };
        else if (e.lit.k === 'ident') {
          var rv = asg[e.lit.v];
          if (!rv) throw new Error(e.lit.v + ' not in witness');
          right = rv;
        }
        if (lv.sort === 'Real' && right.sort === 'Real') {
          var lr = lv.value instanceof Rat ? lv.value : Rat.parse(lv.value);
          var rr = right.value instanceof Rat ? right.value : Rat.parse(right.value);
          var c = lr.cmp(rr);
          switch (e.op) {
            case '>': return c > 0; case '<': return c < 0;
            case '>=': return c >= 0; case '<=': return c <= 0;
            case '==': return c === 0; case '!=': return c !== 0;
          }
        }
        if (lv.sort === 'Bool' && right.sort === 'Bool') {
          switch (e.op) { case '==': return lv.value === right.value; case '!=': return lv.value !== right.value; }
        }
        if (lv.sort === 'String' && right.sort === 'String') {
          switch (e.op) { case '==': return lv.value === right.value; case '!=': return lv.value !== right.value; }
        }
        throw new Error('unsupported cmp: ' + lv.sort + ' ' + e.op + ' ' + right.sort);
      }
      default: throw new Error('unknown expr kind: ' + e.k);
    }
  }

  // ---------- Invariant map ----------
  var INVARIANTS = {
    cannot_isolate_domain_controller: { forbidden: 'isolate_domain_controller' },
    cannot_revoke_root_authority: { forbidden: 'revoke_root_authority' }
  };
  function checkInvariants(effAction, names, asg) {
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var spec = INVARIANTS[name];
      if (!spec) return { ok: false, unknown: true, reason: "unknown invariant '" + name + "'" };
      // Fast-path: DSL declared action (mirrors kernel _explicit_forbidden).
      if (effAction && spec.forbidden === effAction) {
        return { ok: false, reason: "DSL action '" + effAction + "' forbidden by '" + name + "'" };
      }
      // Semantic: witness rule.action (what the rule actually does).
      if (asg && asg['rule.action'] && asg['rule.action'].value === spec.forbidden) {
        return { ok: false, reason: "witness rule.action '" + spec.forbidden + "' forbidden by '" + name + "'" };
      }
    }
    return { ok: true };
  }

  // ---------- Bucket classification (amended: uses expected_outcome + failure_class) ----------
  function classifyBucket(expected_outcome, failure_class) {
    if (expected_outcome === 'ACCEPT') return 'accept';
    if (expected_outcome === 'REJECT_UNPROVABLE') return 'boundary';
    if (failure_class && /UNSAT|TIMEOUT/.test(failure_class)) return 'boundary';
    if (/^REJECT_/.test(expected_outcome || '')) return 'pregate';
    return 'unknown';
  }

  // ---------- Public: evaluate one witness artifact ----------
  function evaluateWitness(artifact) {
    var expected = artifact.expected_outcome;
    var dsl = artifact.policy_dsl || '';
    var invs = artifact.safety_invariants || [];
    var wd = artifact.witness_data || {};
    var bucket = classifyBucket(expected, artifact.failure_class);
    var r = {
      test_id: artifact.test_id,
      expected: expected,
      bucket: bucket,
      derived: null,
      match: null,
      reason: null
    };

    if (bucket === 'pregate' || bucket === 'boundary') {
      r.reason = (bucket === 'pregate')
        ? 'pre-gate rejection: ' + expected
        : 'trusted boundary: ' + expected;
      return r;
    }
    if (bucket === 'unknown') {
      r.reason = 'unknown bucket: ' + expected;
      return r;
    }

    // ACCEPT bucket
    var parsed;
    try {
      parsed = new Parser(tokenize(dsl)).parse();
    } catch (e) {
      r.derived = 'REJECT_INVALID';
      r.match = false;
      r.reason = 'parse: ' + e.message;
      return r;
    }
    var asg = wd.assignment || {};
    var eff = parsed.action || parsed.name;
    var inv = checkInvariants(eff, invs, asg);
    if (!inv.ok) {
      r.derived = 'REJECT_POLICY';
      r.match = false;
      r.reason = inv.reason;
      return r;
    }
    var fires;
    try {
      fires = evalExpr(parsed.expr, asg);
    } catch (e) {
      r.derived = 'REJECT_INVALID';
      r.match = false;
      r.reason = 'eval: ' + e.message;
      return r;
    }
    r.derived = fires ? 'ACCEPT' : 'REJECT_POLICY';
    r.match = (r.derived === expected);
    r.reason = fires ? 'policy fires; invariants hold' : 'policy does not fire';
    return r;
  }

  // ---------- Expose ----------
  global.ADIE_EVAL = {
    Rat: Rat, tokenize: tokenize, Parser: Parser, evalExpr: evalExpr,
    classifyBucket: classifyBucket, evaluateWitness: evaluateWitness,
    INVARIANTS: INVARIANTS, version: '1.0.0'
  };
}(typeof window !== 'undefined' ? window : globalThis));
