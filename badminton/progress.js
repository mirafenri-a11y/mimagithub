/**
 * バドミントン動画レッスン - 進み具合のロジック
 * ステップの解放・合格ライン・保存形式・動画指定の解釈を扱う。
 * DOM には触らない。ブラウザ・Node の両方から読み込める。
 */
(function (root) {
  'use strict';

  var VERSION = 1;
  var MEMO_MAX = 2000;

  function emptyState() {
    return { v: VERSION, done: {}, checks: {}, memo: {}, openAll: false };
  }

  function clone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  /**
   * 保存データを読み込む。壊れたデータや、今は無いステップの記録は捨てる。
   * @param {string|null} raw localStorage に入っていた文字列
   * @param {Array} steps BAD_LESSONS.STEPS
   */
  function load(raw, steps) {
    var s = emptyState();
    if (!raw) return s;

    var data;
    try { data = JSON.parse(raw); } catch (e) { return s; }
    if (!data || typeof data !== 'object') return s;

    var done = data.done || {};
    var checks = data.checks || {};
    var memo = data.memo || {};

    steps.forEach(function (step) {
      if (done[step.id] === true) s.done[step.id] = true;
      if (Array.isArray(checks[step.id])) {
        s.checks[step.id] = step.checks.map(function (_, i) { return checks[step.id][i] === true; });
      }
      if (typeof memo[step.id] === 'string' && memo[step.id] !== '') {
        s.memo[step.id] = memo[step.id].slice(0, MEMO_MAX);
      }
    });
    s.openAll = data.openAll === true;
    return s;
  }

  function save(state) {
    return JSON.stringify(state);
  }

  function isDone(state, step) {
    return state.done[step.id] === true;
  }

  /** 1つ前のステップが完了していれば開く。最初のステップと、完了済みのステップは常に開く */
  function isUnlocked(state, steps, index) {
    if (index < 0 || index >= steps.length) return false;
    if (index === 0 || state.openAll) return true;
    return isDone(state, steps[index]) || isDone(state, steps[index - 1]);
  }

  function checksOf(state, step) {
    var saved = state.checks[step.id];
    return step.checks.map(function (_, i) { return !!(saved && saved[i]); });
  }

  function setCheck(state, step, i, value) {
    if (i < 0 || i >= step.checks.length) throw new Error('合格ラインの番号が範囲外です: ' + i);
    var next = clone(state);
    var list = checksOf(state, step);
    list[i] = !!value;
    next.checks[step.id] = list;
    return next;
  }

  /** 合格ラインがすべて埋まっているか */
  function canComplete(state, step) {
    return checksOf(state, step).every(Boolean);
  }

  function complete(state, step) {
    if (!canComplete(state, step)) throw new Error('合格ラインがまだ埋まっていません: ' + step.id);
    var next = clone(state);
    next.done[step.id] = true;
    return next;
  }

  /** 完了を取り消す（チェックは残す） */
  function reopen(state, step) {
    var next = clone(state);
    delete next.done[step.id];
    return next;
  }

  function setMemo(state, step, text) {
    var next = clone(state);
    var t = String(text || '').slice(0, MEMO_MAX);
    if (t === '') delete next.memo[step.id];
    else next.memo[step.id] = t;
    return next;
  }

  function setOpenAll(state, value) {
    var next = clone(state);
    next.openAll = !!value;
    return next;
  }

  /** いま取り組むステップの index。全部終わっていれば -1 */
  function currentIndex(state, steps) {
    for (var i = 0; i < steps.length; i++) {
      if (!isDone(state, steps[i])) return i;
    }
    return -1;
  }

  function summary(state, steps) {
    var done = steps.filter(function (s) { return isDone(state, s); }).length;
    return {
      done: done,
      total: steps.length,
      percent: steps.length ? Math.round((done / steps.length) * 100) : 0,
      current: currentIndex(state, steps)
    };
  }

  /**
   * 動画の指定を再生できる形にする。
   * youtube には ID（11文字）か URL（watch / youtu.be / embed / shorts）を書ける。
   * @returns {{type:'youtube', id:string, start:number}|{type:'file', src:string, start:number}|null}
   */
  function parseVideo(video) {
    if (!video) return null;
    var start = Math.max(0, Math.floor(Number(video.start) || 0));

    if (typeof video.file === 'string' && video.file !== '') {
      return { type: 'file', src: video.file, start: start };
    }

    var v = typeof video.youtube === 'string' ? video.youtube.trim() : '';
    var ID = /^[A-Za-z0-9_-]{11}$/;
    if (ID.test(v)) return { type: 'youtube', id: v, start: start };

    var m = v.match(/(?:[?&]v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
    if (m) {
      if (!start) {
        var t = v.match(/[?&](?:t|start)=(\d+)/);
        if (t) start = Number(t[1]);
      }
      return { type: 'youtube', id: m[1], start: start };
    }
    return null;
  }

  root.BAD_PROGRESS = {
    VERSION: VERSION,
    MEMO_MAX: MEMO_MAX,
    emptyState: emptyState,
    load: load,
    save: save,
    isDone: isDone,
    isUnlocked: isUnlocked,
    checksOf: checksOf,
    setCheck: setCheck,
    canComplete: canComplete,
    complete: complete,
    reopen: reopen,
    setMemo: setMemo,
    setOpenAll: setOpenAll,
    currentIndex: currentIndex,
    summary: summary,
    parseVideo: parseVideo
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
