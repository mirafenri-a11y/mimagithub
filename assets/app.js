/**
 * 共創仲間診断 - 画面制御
 */
(function () {
  'use strict';

  var D = window.CCP_DATA;
  var L = window.CCP_LOGIC;
  var Q = D.QUESTIONS;

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    answers: new Array(Q.length).fill(null),
    index: 0,
    result: null
  };

  var SCREENS = ['intro', 'quiz', 'result', 'compat'];

  function show(name) {
    SCREENS.forEach(function (s) {
      $('screen-' + s).hidden = (s !== name);
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ---------------- 設問 ---------------- */

  function renderQuestion() {
    var q = Q[state.index];
    $('q-index').textContent = state.index + 1;
    $('q-total').textContent = Q.length;
    $('progress-fill').style.width = (state.index / Q.length) * 100 + '%';
    $('q-text').textContent = q.text;
    $('btn-back').hidden = state.index === 0;

    var box = $('q-choices');
    box.textContent = '';
    D.CHOICES.forEach(function (c, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice' + (state.answers[state.index] === i ? ' is-selected' : '');
      b.innerHTML = '<span class="mark">' + c.short + '</span>';
      b.appendChild(document.createTextNode(c.label));
      b.addEventListener('click', function () { answer(i); });
      box.appendChild(b);
    });
  }

  function answer(choiceIndex) {
    state.answers[state.index] = choiceIndex;
    if (state.index < Q.length - 1) {
      state.index++;
      renderQuestion();
    } else {
      finish();
    }
  }

  function back() {
    if (state.index > 0) {
      state.index--;
      renderQuestion();
    }
  }

  function startQuiz() {
    state.answers = new Array(Q.length).fill(null);
    state.index = 0;
    renderQuestion();
    show('quiz');
  }

  /* ---------------- 結果 ---------------- */

  function finish() {
    state.result = L.score(state.answers);
    var url = new URL(window.location.href);
    url.searchParams.set('a', L.encode(state.answers));
    history.replaceState(null, '', url.toString());
    renderResult(state.result);
    show('result');
  }

  function li(text) {
    var el = document.createElement('li');
    el.textContent = text;
    return el;
  }

  function fillList(id, items) {
    var ul = $(id);
    ul.textContent = '';
    items.forEach(function (t) { ul.appendChild(li(t)); });
  }

  function renderResult(res) {
    var t = D.TYPES[res.code];

    $('r-icon').textContent = t.icon;
    $('r-name').textContent = t.name + '型';
    $('r-reading').textContent = t.reading + ' / ' + t.code;
    $('r-tagline').textContent = t.tagline;
    $('r-summary').textContent = t.summary;

    var bars = $('r-bars');
    bars.textContent = '';
    res.detail.forEach(function (d) {
      var row = document.createElement('div');
      row.className = 'bar-row';

      var top = document.createElement('div');
      top.className = 'bar-top';
      top.innerHTML =
        '<span>' + d.axis.minus.name + '</span>' +
        '<b>' + d.axis.label + '：' + d.pole.name + '</b>' +
        '<span>' + d.axis.plus.name + '</span>';

      var track = document.createElement('div');
      track.className = 'bar-track';
      var dot = document.createElement('span');
      dot.className = 'bar-dot';
      dot.style.left = Math.min(96, Math.max(4, d.percent)) + '%';
      track.appendChild(dot);

      var note = document.createElement('p');
      note.className = 'bar-note';
      note.textContent = d.balanced
        ? 'ほぼ中間。状況に合わせて両方に振れるバランス型です。'
        : d.pole.desc + '（強さ ' + d.strength + '%）';

      row.appendChild(top);
      row.appendChild(track);
      row.appendChild(note);
      bars.appendChild(row);
    });

    fillList('r-strengths', t.strengths);
    fillList('r-traps', t.traps);
    fillList('r-tips', t.tips);
    $('r-role').textContent = t.role;

    var m = $('r-matches');
    m.textContent = '';
    t.matches.forEach(function (mt) {
      var other = D.TYPES[mt.code];
      var card = document.createElement('div');
      card.className = 'match';

      var head = document.createElement('div');
      head.className = 'match-head';
      head.innerHTML =
        '<span class="ic">' + other.icon + '</span>' +
        '<b>' + other.name + '型</b>' +
        '<span>' + other.reading + '</span>';

      var p = document.createElement('p');
      p.textContent = mt.why;

      card.appendChild(head);
      card.appendChild(p);
      m.appendChild(card);
    });

    $('share-note').textContent = '';
  }

  /* ---------------- 共有 ---------------- */

  function share() {
    var text = window.location.href;
    var note = $('share-note');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        note.textContent = 'リンクをコピーしました。仲間に送ってみてください。';
      }, function () {
        note.textContent = 'コピーできませんでした。アドレスバーのURLをそのまま共有してください。';
      });
    } else {
      note.textContent = 'このブラウザでは自動コピーできません。アドレスバーのURLを共有してください。';
    }
  }

  /* ---------------- 相性 ---------------- */

  function buildSelects() {
    var codes = Object.keys(D.TYPES);
    [['sel-a', 0], ['sel-b', 1]].forEach(function (pair) {
      var sel = $(pair[0]);
      sel.textContent = '';
      codes.forEach(function (c, i) {
        var o = document.createElement('option');
        o.value = c;
        o.textContent = D.TYPES[c].icon + ' ' + D.TYPES[c].name + '型（' + D.TYPES[c].reading + '）';
        if (i === pair[1]) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', renderCompat);
    });
  }

  function renderCompat() {
    var a = $('sel-a').value;
    var b = $('sel-b').value;
    var r = L.compat(a, b);
    var out = $('compat-out');
    out.textContent = '';

    var head = document.createElement('div');
    head.className = 'compat-score';
    head.innerHTML =
      '<div class="num">' + r.score + '<small> / 100</small></div>' +
      '<p class="band">' + r.label + '</p>' +
      '<p class="note">' + r.note + '</p>';
    out.appendChild(head);

    r.lines.forEach(function (line) {
      var el = document.createElement('div');
      el.className = 'compat-line';
      el.innerHTML =
        '<span class="tag ' + (line.same ? 'tag-same' : 'tag-diff') + '">' +
        line.axis + '：' + (line.same ? '同じ' : '補いあう') + '</span>';
      var p = document.createElement('p');
      p.textContent = line.text;
      el.appendChild(p);
      out.appendChild(el);
    });
  }

  function openCompat(preselect) {
    if (preselect && D.TYPES[preselect]) $('sel-a').value = preselect;
    renderCompat();
    show('compat');
  }

  /* ---------------- 起動 ---------------- */

  function boot() {
    buildSelects();

    $('btn-start').addEventListener('click', startQuiz);
    $('btn-retry').addEventListener('click', function () {
      var url = new URL(window.location.href);
      url.searchParams.delete('a');
      history.replaceState(null, '', url.toString());
      startQuiz();
    });
    $('btn-back').addEventListener('click', back);
    $('btn-share').addEventListener('click', share);
    $('btn-compat').addEventListener('click', function () {
      openCompat(state.result && state.result.code);
    });
    $('btn-goto-compat').addEventListener('click', function () { openCompat(null); });
    $('btn-compat-back').addEventListener('click', function () {
      show(state.result ? 'result' : 'intro');
    });

    document.addEventListener('keydown', function (e) {
      if ($('screen-quiz').hidden) return;
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= D.CHOICES.length) answer(n - 1);
      if (e.key === 'Backspace') { e.preventDefault(); back(); }
    });

    // URL に回答が入っていれば、その結果を復元して表示する
    var shared = new URLSearchParams(window.location.search).get('a');
    var restored = shared ? L.decode(shared) : null;
    if (restored) {
      state.answers = restored;
      state.result = L.score(restored);
      renderResult(state.result);
      show('result');
    } else {
      show('intro');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
