'use strict';

const test = require('node:test');
const assert = require('node:assert');

require('../assets/data.js');
require('../assets/logic.js');

const D = globalThis.CCP_DATA;
const L = globalThis.CCP_LOGIC;

const fill = (v) => new Array(D.QUESTIONS.length).fill(v);

test('設問は3軸に4問ずつ、計12問ある', () => {
  assert.strictEqual(D.QUESTIONS.length, 12);
  for (const axis of D.AXES) {
    const n = D.QUESTIONS.filter((q) => q.axis === axis.key).length;
    assert.strictEqual(n, 4, `${axis.label} の設問数`);
  }
});

test('タイプは8種類あり、コードは軸の極の組み合わせと一致する', () => {
  const codes = Object.keys(D.TYPES);
  assert.strictEqual(codes.length, 8);
  for (const code of codes) {
    assert.strictEqual(D.TYPES[code].code, code);
    D.AXES.forEach((axis, i) => {
      assert.ok(
        code[i] === axis.plus.code || code[i] === axis.minus.code,
        `${code} の ${i + 1} 文字目が ${axis.label} の極ではない`
      );
    });
  }
});

test('すべて「とてもそう思う」なら VDO になる', () => {
  const res = L.score(fill(0));
  assert.strictEqual(res.code, 'VDO');
  res.detail.forEach((d) => assert.strictEqual(d.raw, 4));
});

test('すべて「まったく思わない」なら BHC になる', () => {
  const res = L.score(fill(3));
  assert.strictEqual(res.code, 'BHC');
  res.detail.forEach((d) => assert.strictEqual(d.raw, -4));
});

test('スコアは常に定義済みのタイプに着地する', () => {
  // 全パターンは 4^12 と多いので、擬似乱数で広く走査する
  let seed = 20260727;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 3000; i++) {
    const answers = D.QUESTIONS.map(() => Math.floor(rnd() * D.CHOICES.length));
    const res = L.score(answers);
    assert.ok(D.TYPES[res.code], `未定義のタイプ: ${res.code}`);
    res.detail.forEach((d) => {
      assert.ok(d.percent >= 0 && d.percent <= 100);
      assert.ok(d.strength >= 0 && d.strength <= 100);
    });
  }
});

test('未回答があるとエラーになる', () => {
  const answers = fill(0);
  answers[5] = null;
  assert.throws(() => L.score(answers), /未回答/);
});

test('回答数が合わないとエラーになる', () => {
  assert.throws(() => L.score([0, 1, 2]), /設問数/);
});

test('共有コードは往復して元の回答に戻る', () => {
  const answers = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3];
  const encoded = L.encode(answers);
  assert.strictEqual(encoded, '012301230123');
  assert.deepStrictEqual(L.decode(encoded), answers);
});

test('不正な共有コードは null を返す', () => {
  assert.strictEqual(L.decode('short'), null);
  assert.strictEqual(L.decode('012301230129'), null); // 9 は選択肢外
  assert.strictEqual(L.decode(null), null);
  assert.strictEqual(L.decode('01230123012x'), null);
});

test('相性スコアは 0〜100 の範囲で、順序を入れ替えても同じ', () => {
  const codes = Object.keys(D.TYPES);
  for (const a of codes) {
    for (const b of codes) {
      const r1 = L.compat(a, b);
      const r2 = L.compat(b, a);
      assert.strictEqual(r1.score, r2.score, `${a} × ${b}`);
      assert.ok(r1.score >= 0 && r1.score <= 100);
      assert.strictEqual(r1.lines.length, D.AXES.length);
      assert.ok(r1.label && r1.note);
    }
  }
});

test('3軸すべてが逆のペアが最高点、同一タイプが最低点', () => {
  assert.strictEqual(L.compat('VDO', 'BHC').score, 100);
  const self = L.compat('VDO', 'VDO').score;
  const codes = Object.keys(D.TYPES);
  for (const a of codes) {
    for (const b of codes) {
      assert.ok(L.compat(a, b).score >= self - 6);
    }
  }
  assert.ok(self < 50);
});

test('不正なタイプコードの相性診断はエラーになる', () => {
  assert.throws(() => L.compat('VDO', 'XXX'), /不正なタイプコード/);
});

test('各タイプの相性相手は実在するタイプを指している', () => {
  for (const [code, t] of Object.entries(D.TYPES)) {
    assert.ok(t.matches.length >= 2, `${code} の相性相手が少ない`);
    for (const m of t.matches) {
      assert.ok(D.TYPES[m.code], `${code} が未定義タイプ ${m.code} を参照している`);
      assert.notStrictEqual(m.code, code, `${code} が自分自身を相性相手にしている`);
      assert.ok(m.why.length > 10);
    }
  }
});

test('各タイプに必要な文言がそろっている', () => {
  for (const [code, t] of Object.entries(D.TYPES)) {
    for (const key of ['icon', 'name', 'reading', 'tagline', 'summary', 'role']) {
      assert.ok(t[key] && t[key].length > 0, `${code}.${key} が空`);
    }
    assert.strictEqual(t.strengths.length, 3, `${code}.strengths`);
    assert.strictEqual(t.traps.length, 3, `${code}.traps`);
    assert.ok(t.tips.length >= 2, `${code}.tips`);
  }
});
