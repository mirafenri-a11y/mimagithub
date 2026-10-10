'use strict';

const test = require('node:test');
const assert = require('node:assert');

require('../badminton/lessons.js');
require('../badminton/progress.js');

const D = globalThis.BAD_LESSONS;
const P = globalThis.BAD_PROGRESS;
const STEPS = D.STEPS;

/** 合格ラインを全部埋めてクリアする */
const clear = (state, step) => {
  let s = state;
  step.checks.forEach((_, i) => { s = P.setCheck(s, step, i, true); });
  return P.complete(s, step);
};

/* ---------------- レッスン定義 ---------------- */

test('ステップの id は重複せず、章はすべて定義済み', () => {
  const ids = STEPS.map((s) => s.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  const chapters = new Set(D.CHAPTERS.map((c) => c.key));
  for (const step of STEPS) {
    assert.ok(chapters.has(step.chapter), `${step.id} の章 ${step.chapter} が未定義`);
  }
});

test('章の順番どおりにステップが並んでいる（章が飛び飛びにならない）', () => {
  const order = D.CHAPTERS.map((c) => c.key);
  let last = 0;
  for (const step of STEPS) {
    const at = order.indexOf(step.chapter);
    assert.ok(at >= last, `${step.id} が前の章に戻っている`);
    last = at;
  }
});

test('各ステップに目標・ポイント・練習・合格ラインがある', () => {
  for (const step of STEPS) {
    assert.ok(step.title && step.goal && step.drill, `${step.id} の文言が欠けている`);
    assert.ok(step.points.length >= 1, `${step.id} に見るポイントがない`);
    assert.ok(step.checks.length >= 1, `${step.id} に合格ラインがない`);
    step.points.concat(step.checks).forEach((t) => assert.ok(typeof t === 'string' && t.trim() !== ''));
  }
});

test('すべての動画が再生できる形式で指定されている', () => {
  for (const step of STEPS) {
    assert.ok(step.videos.length >= 1, `${step.id} に動画がない`);
    for (const video of step.videos) {
      assert.ok(P.parseVideo(video), `${step.id} の動画指定が読めない: ${JSON.stringify(video)}`);
      assert.ok(video.title, `${step.id} の動画にタイトルがない`);
    }
  }
});

test('同じ動画を2回使っていない', () => {
  const ids = STEPS.flatMap((s) => s.videos.map((v) => P.parseVideo(v).id));
  assert.strictEqual(new Set(ids).size, ids.length);
});

/* ---------------- 解放と完了 ---------------- */

test('はじめは STEP 1 だけが開いている', () => {
  const s = P.emptyState();
  assert.strictEqual(P.isUnlocked(s, STEPS, 0), true);
  for (let i = 1; i < STEPS.length; i++) assert.strictEqual(P.isUnlocked(s, STEPS, i), false);
  assert.strictEqual(P.currentIndex(s, STEPS), 0);
});

test('合格ラインが全部埋まるまでクリアできない', () => {
  const step = STEPS[0];
  let s = P.emptyState();
  for (let i = 0; i < step.checks.length - 1; i++) {
    s = P.setCheck(s, step, i, true);
    assert.strictEqual(P.canComplete(s, step), false);
  }
  assert.throws(() => P.complete(s, step));
  s = P.setCheck(s, step, step.checks.length - 1, true);
  assert.strictEqual(P.canComplete(s, step), true);
});

test('クリアすると次のステップが開き、その次はまだ閉じている', () => {
  const s = clear(P.emptyState(), STEPS[0]);
  assert.strictEqual(P.isUnlocked(s, STEPS, 1), true);
  assert.strictEqual(P.isUnlocked(s, STEPS, 2), false);
  assert.strictEqual(P.currentIndex(s, STEPS), 1);
});

test('全部クリアすると current は -1、達成率は100%', () => {
  let s = P.emptyState();
  STEPS.forEach((step) => { s = clear(s, step); });
  const sum = P.summary(s, STEPS);
  assert.deepStrictEqual(sum, { done: STEPS.length, total: STEPS.length, percent: 100, current: -1 });
});

test('クリアを取り消すと次のステップが閉じる（チェックは残る）', () => {
  let s = clear(P.emptyState(), STEPS[0]);
  s = P.reopen(s, STEPS[0]);
  assert.strictEqual(P.isDone(s, STEPS[0]), false);
  assert.strictEqual(P.isUnlocked(s, STEPS, 1), false);
  assert.strictEqual(P.canComplete(s, STEPS[0]), true);
});

test('「すべて開く」にすると全ステップが開くが、クリアには合格ラインが必要', () => {
  const s = P.setOpenAll(P.emptyState(), true);
  STEPS.forEach((_, i) => assert.strictEqual(P.isUnlocked(s, STEPS, i), true));
  assert.throws(() => P.complete(s, STEPS[5]));
});

test('状態を更新しても元の状態は書き換わらない', () => {
  const s0 = P.emptyState();
  const s1 = P.setCheck(s0, STEPS[0], 0, true);
  P.setMemo(s1, STEPS[0], 'メモ');
  assert.deepStrictEqual(s0, P.emptyState());
  assert.strictEqual(s1.memo[STEPS[0].id], undefined);
});

test('範囲外の合格ライン番号はエラーになる', () => {
  assert.throws(() => P.setCheck(P.emptyState(), STEPS[0], 99, true));
  assert.throws(() => P.setCheck(P.emptyState(), STEPS[0], -1, true));
});

/* ---------------- 保存と読み込み ---------------- */

test('保存した状態をそのまま読み戻せる', () => {
  let s = clear(P.emptyState(), STEPS[0]);
  s = P.setCheck(s, STEPS[1], 1, true);
  s = P.setMemo(s, STEPS[1], 'ひざを曲げる');
  s = P.setOpenAll(s, true);
  assert.deepStrictEqual(P.load(P.save(s), STEPS), s);
});

test('壊れた保存データからは空の状態で始まる', () => {
  for (const raw of [null, '', '{', 'null', '42', '"text"', '[]']) {
    assert.deepStrictEqual(P.load(raw, STEPS), P.emptyState(), `raw=${raw}`);
  }
});

test('今は無いステップの記録や、おかしな値は読み捨てる', () => {
  const raw = JSON.stringify({
    done: { grip: true, ghost: true, ready: 'yes' },
    checks: { grip: [true, 1, true, true, true], ready: 'all' },
    memo: { grip: 'ok', ghost: 'x', ready: 3 },
    openAll: 'true'
  });
  const s = P.load(raw, STEPS);
  assert.deepStrictEqual(s.done, { grip: true });
  assert.deepStrictEqual(s.checks, { grip: [true, false, true] });
  assert.deepStrictEqual(s.memo, { grip: 'ok' });
  assert.strictEqual(s.openAll, false);
});

test('メモは上限で切り詰め、空にすると消える', () => {
  let s = P.setMemo(P.emptyState(), STEPS[0], 'あ'.repeat(P.MEMO_MAX + 50));
  assert.strictEqual(s.memo[STEPS[0].id].length, P.MEMO_MAX);
  s = P.setMemo(s, STEPS[0], '');
  assert.ok(!(STEPS[0].id in s.memo));
});

/* ---------------- 動画指定 ---------------- */

test('YouTube の ID と各種 URL から動画 ID を取り出せる', () => {
  const id = 'TW4v6E22I-o';
  const cases = [
    id,
    `https://www.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/watch?v=${id}&pp=0gcJCdgAo7VqN5tD`,
    `https://m.youtube.com/watch?feature=share&v=${id}`,
    `https://youtu.be/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/shorts/${id}`
  ];
  for (const c of cases) assert.deepStrictEqual(P.parseVideo({ youtube: c }), { type: 'youtube', id, start: 0 }, c);
});

test('再生開始位置は start か URL の t= から取る', () => {
  assert.strictEqual(P.parseVideo({ youtube: 'TW4v6E22I-o', start: 42.7 }).start, 42);
  assert.strictEqual(P.parseVideo({ youtube: 'https://youtu.be/TW4v6E22I-o?t=90' }).start, 90);
  assert.strictEqual(P.parseVideo({ youtube: 'https://youtu.be/TW4v6E22I-o?t=90', start: 5 }).start, 5);
});

test('自分の動画ファイルも指定できる', () => {
  assert.deepStrictEqual(P.parseVideo({ file: 'videos/grip.mp4' }), { type: 'file', src: 'videos/grip.mp4', start: 0 });
});

test('読めない動画指定は null になる', () => {
  for (const v of [null, {}, { youtube: '' }, { youtube: 'short' }, { youtube: 'https://example.com/watch?v=123' },
    { youtube: 'TW4v6E22I-oX' }, { youtube: 'https://youtu.be/TW4v6E22I-oX' }]) {
    assert.strictEqual(P.parseVideo(v), null, JSON.stringify(v));
  }
});
