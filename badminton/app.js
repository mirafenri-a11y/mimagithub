/**
 * バドミントン動画レッスン - 画面制御
 */
(function () {
  'use strict';

  var D = window.BAD_LESSONS;
  var P = window.BAD_PROGRESS;
  var STEPS = D.STEPS;
  var STORE_KEY = 'badminton-lesson:v1';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- 保存 ---------------- */

  function readStore() {
    try { return window.localStorage.getItem(STORE_KEY); } catch (e) { return null; }
  }

  function writeStore(state) {
    try { window.localStorage.setItem(STORE_KEY, P.save(state)); } catch (e) { /* 保存できない環境でも動かす */ }
  }

  var state = P.load(readStore(), STEPS);

  function commit(next) {
    state = next;
    writeStore(state);
  }

  /* ---------------- 共通 ---------------- */

  var SCREENS = ['home', 'step', 'finish'];

  function show(name) {
    SCREENS.forEach(function (s) { $('screen-' + s).hidden = (s !== name); });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  var toastTimer = null;
  function toast(text) {
    var el = $('toast');
    el.textContent = text;
    el.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-shown'); }, 2600);
  }

  function chapterOf(step) {
    return D.CHAPTERS.find(function (c) { return c.key === step.chapter; });
  }

  function stepHref(index) { return '#/step/' + (index + 1); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderMeter() {
    var sum = P.summary(state, STEPS);
    $('sum-done').textContent = sum.done;
    $('sum-total').textContent = sum.total;
    $('meter-fill').style.width = sum.percent + '%';
  }

  /* ---------------- 一覧 ---------------- */

  function renderHome() {
    var sum = P.summary(state, STEPS);
    var cont = $('btn-continue');
    if (sum.current === -1) {
      cont.textContent = '全ステップ クリア！ふり返る';
      cont.href = '#/finish';
    } else if (sum.done === 0) {
      cont.textContent = 'STEP 1 からはじめる';
      cont.href = stepHref(0);
    } else {
      cont.textContent = '続きから　STEP ' + (sum.current + 1) + '：' + STEPS[sum.current].title;
      cont.href = stepHref(sum.current);
    }

    var box = $('chapters');
    box.textContent = '';
    D.CHAPTERS.forEach(function (ch) {
      var sec = el('section', 'chapter');
      sec.appendChild(el('h2', 'chapter-title', ch.title));
      sec.appendChild(el('p', 'chapter-lead', ch.lead));
      var list = el('ol', 'step-list');

      STEPS.forEach(function (step, i) {
        if (step.chapter !== ch.key) return;
        var done = P.isDone(state, step);
        var open = P.isUnlocked(state, STEPS, i);
        var isCurrent = i === sum.current;

        var li = el('li');
        var item = el(open ? 'a' : 'button',
          'step-item' + (done ? ' is-done' : '') + (isCurrent ? ' is-current' : '') + (open ? '' : ' is-locked'));
        if (open) {
          item.href = stepHref(i);
        } else {
          item.type = 'button';
          item.setAttribute('aria-disabled', 'true');
          item.addEventListener('click', function () { toast('STEP ' + i + ' をクリアすると開きます'); });
        }

        item.appendChild(el('span', 'step-num', String(i + 1)));
        var body = el('span', 'step-body');
        body.appendChild(el('span', 'step-name', step.title));
        body.appendChild(el('span', 'step-goal', step.goal));
        item.appendChild(body);

        var status;
        if (done) status = '✓';
        else if (!open) status = '🔒';
        else {
          var n = P.checksOf(state, step).filter(Boolean).length;
          status = isCurrent && n === 0 ? 'いまここ' : n + '/' + step.checks.length;
        }
        item.appendChild(el('span', 'step-status', status));

        li.appendChild(item);
        list.appendChild(li);
      });

      sec.appendChild(list);
      box.appendChild(sec);
    });

    $('opt-open-all').checked = state.openAll;
    show('home');
  }

  /* ---------------- 動画プレイヤー ---------------- */

  var rate = 1;
  var player = null;   // { setRate, back, destroy }
  var mountSeq = 0;    // 古い読み込みが後から完了しても無視するための番号
  var ytPromise = null;

  function loadYouTubeApi() {
    if (ytPromise) return ytPromise;
    ytPromise = new Promise(function (resolve, reject) {
      if (window.YT && window.YT.Player) { resolve(window.YT); return; }
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof prev === 'function') prev();
        resolve(window.YT);
      };
      var s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = function () { reject(new Error('YouTube の読み込みに失敗しました')); };
      document.head.appendChild(s);
      setTimeout(function () { reject(new Error('YouTube の読み込みがタイムアウトしました')); }, 8000);
    });
    return ytPromise;
  }

  function watchUrl(v) {
    return 'https://www.youtube.com/watch?v=' + v.id + (v.start ? '&t=' + v.start + 's' : '');
  }

  function setTools(visible) {
    $('player-tools').hidden = !visible;
    var chips = document.querySelectorAll('[data-rate]');
    Array.prototype.forEach.call(chips, function (b) {
      var on = Number(b.getAttribute('data-rate')) === rate;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function showUnplayable(slot, v) {
    slot.textContent = '';
    var box = el('div', 'player-fallback');
    box.appendChild(el('p', null, 'この動画はアプリ内で再生できません。'));
    if (v.type === 'youtube') {
      var a = el('a', 'btn btn-primary', 'YouTubeで見る ↗');
      a.href = watchUrl(v);
      a.target = '_blank';
      a.rel = 'noopener';
      box.appendChild(a);
    }
    slot.appendChild(box);
    setTools(false);
  }

  function destroyPlayer() {
    if (player) { try { player.destroy(); } catch (e) { /* 何もしない */ } }
    player = null;
  }

  function mountVideo(video) {
    destroyPlayer();
    var seq = ++mountSeq;
    var slot = $('player-slot');
    slot.textContent = '';
    setTools(false);

    var v = P.parseVideo(video);
    var link = $('s-video-link');
    $('s-video-title').textContent = video.title || '';

    if (!v) {
      link.hidden = true;
      showUnplayable(slot, { type: 'none' });
      return;
    }

    if (v.type === 'file') {
      link.hidden = true;
      var media = el('video', 'player-media');
      media.src = v.src;
      media.controls = true;
      media.playsInline = true;
      media.preload = 'metadata';
      media.addEventListener('loadedmetadata', function () {
        if (v.start) media.currentTime = v.start;
        media.playbackRate = rate;
      });
      media.addEventListener('error', function () { if (seq === mountSeq) showUnplayable(slot, v); });
      slot.appendChild(media);
      player = {
        setRate: function (r) { media.playbackRate = r; },
        back: function (sec) { media.currentTime = Math.max(0, media.currentTime - sec); },
        destroy: function () { media.pause(); media.removeAttribute('src'); media.load(); }
      };
      setTools(true);
      return;
    }

    link.hidden = false;
    link.href = watchUrl(v);

    var target = el('div', 'player-media');
    target.id = 'yt-player-' + seq;
    slot.appendChild(target);

    loadYouTubeApi().then(function (YT) {
      if (seq !== mountSeq) return;
      var yt = new YT.Player(target.id, {
        videoId: v.id,
        host: 'https://www.youtube-nocookie.com',
        playerVars: { playsinline: 1, rel: 0, start: v.start || undefined },
        events: {
          onReady: function () {
            if (seq !== mountSeq) return;
            if (rate !== 1) yt.setPlaybackRate(rate);
            setTools(true);
          },
          onError: function () {
            if (seq === mountSeq) showUnplayable(slot, v);
          }
        }
      });
      player = {
        setRate: function (r) { yt.setPlaybackRate(r); },
        back: function (sec) { yt.seekTo(Math.max(0, yt.getCurrentTime() - sec), true); },
        destroy: function () { yt.destroy(); }
      };
    }).catch(function () {
      // API が読めない環境でも、ふつうの埋め込みで見られるようにする（速さ切り替えは無し）
      if (seq !== mountSeq) return;
      slot.textContent = '';
      var frame = el('iframe', 'player-media');
      frame.src = 'https://www.youtube-nocookie.com/embed/' + v.id + '?playsinline=1&rel=0' + (v.start ? '&start=' + v.start : '');
      frame.title = video.title || 'レッスン動画';
      frame.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
      frame.allowFullscreen = true;
      slot.appendChild(frame);
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-rate]'), function (b) {
    b.addEventListener('click', function () {
      rate = Number(b.getAttribute('data-rate'));
      if (player) player.setRate(rate);
      setTools(true);
    });
  });

  $('btn-back5').addEventListener('click', function () {
    if (player) player.back(5);
  });

  /* ---------------- ステップ ---------------- */

  var current = -1;   // 表示中のステップ index
  var memoTimer = null;

  function renderTabs(step, active) {
    var tabs = $('s-tabs');
    tabs.textContent = '';
    tabs.hidden = step.videos.length < 2;
    step.videos.forEach(function (video, i) {
      var b = el('button', 'tab' + (i === active ? ' is-on' : ''), i === 0 ? 'メイン解説' : '別の解説 ' + i);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', i === active ? 'true' : 'false');
      b.addEventListener('click', function () {
        if (i === active) return;
        renderTabs(step, i);
        mountVideo(video);
      });
      tabs.appendChild(b);
    });
  }

  function renderChecks(step) {
    var list = $('s-checks');
    list.textContent = '';
    var values = P.checksOf(state, step);
    var done = P.isDone(state, step);

    step.checks.forEach(function (text, i) {
      var li = el('li');
      var label = el('label', 'check' + (values[i] ? ' is-on' : ''));
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = values[i];
      box.disabled = done;
      box.addEventListener('change', function () {
        commit(P.setCheck(state, step, i, box.checked));
        label.classList.toggle('is-on', box.checked);
        renderCompleteButton(step);
      });
      label.appendChild(box);
      label.appendChild(el('span', null, text));
      li.appendChild(label);
      list.appendChild(li);
    });
    renderCompleteButton(step);
  }

  function renderCompleteButton(step) {
    var done = P.isDone(state, step);
    var isLast = current === STEPS.length - 1;
    var btn = $('btn-complete');
    btn.hidden = done;
    btn.disabled = !P.canComplete(state, step);
    btn.textContent = isLast ? 'できた！全ステップ クリア' : 'できた！次のステップへ';

    var next = $('btn-next-done');
    next.hidden = !done;
    next.href = isLast ? '#/finish' : stepHref(current + 1);
    next.textContent = isLast ? 'ふり返りへ →' : '次のステップへ →';

    $('btn-reopen').hidden = !done;
    $('s-cleared').hidden = !done;
  }

  function renderPager() {
    var prev = $('s-prev');
    var next = $('s-next');
    prev.hidden = current === 0;
    prev.href = stepHref(current - 1);
    var canNext = current < STEPS.length - 1 && P.isUnlocked(state, STEPS, current + 1);
    next.hidden = !canNext;
    next.href = stepHref(current + 1);
  }

  function renderStep(index) {
    var step = STEPS[index];
    current = index;

    $('s-pos').textContent = 'STEP ' + (index + 1) + ' / ' + STEPS.length;
    $('s-chapter').textContent = chapterOf(step).title;
    $('s-title').textContent = step.title;
    $('s-goal').textContent = step.goal;

    var points = $('s-points');
    points.textContent = '';
    step.points.forEach(function (p) { points.appendChild(el('li', null, p)); });

    $('s-drill').textContent = step.drill;
    $('s-memo').value = state.memo[step.id] || '';

    renderTabs(step, 0);
    renderChecks(step);
    renderPager();
    show('step');
    mountVideo(step.videos[0]);
    document.title = 'STEP ' + (index + 1) + ' ' + step.title + ' | ' + D.TITLE;
  }

  $('s-memo').addEventListener('input', function () {
    var step = STEPS[current];
    var text = this.value;
    clearTimeout(memoTimer);
    memoTimer = setTimeout(function () { commit(P.setMemo(state, step, text)); }, 400);
  });

  $('btn-complete').addEventListener('click', function () {
    var step = STEPS[current];
    if (!P.canComplete(state, step)) return;
    commit(P.complete(state, step));
    renderMeter();
    if (current === STEPS.length - 1) {
      location.hash = '#/finish';
    } else {
      toast('STEP ' + (current + 1) + ' クリア！ 次は「' + STEPS[current + 1].title + '」');
      location.hash = stepHref(current + 1);
    }
  });

  $('btn-reopen').addEventListener('click', function () {
    commit(P.reopen(state, STEPS[current]));
    renderMeter();
    renderChecks(STEPS[current]);
    renderPager();
  });

  /* ---------------- 全部クリア ---------------- */

  function renderFinish() {
    destroyPlayer();
    var list = $('finish-memo-list');
    list.textContent = '';
    var any = false;
    STEPS.forEach(function (step, i) {
      var memo = state.memo[step.id];
      if (!memo) return;
      any = true;
      list.appendChild(el('dt', null, 'STEP ' + (i + 1) + ' ' + step.title));
      list.appendChild(el('dd', null, memo));
    });
    $('finish-memos').hidden = !any;
    show('finish');
  }

  /* ---------------- 下の設定 ---------------- */

  $('opt-open-all').addEventListener('change', function () {
    commit(P.setOpenAll(state, this.checked));
    renderHome();
  });

  $('btn-reset').addEventListener('click', function () {
    if (!window.confirm('チェック・メモ・クリア記録をすべて消します。よろしいですか？')) return;
    commit(P.emptyState());
    renderMeter();
    location.hash = '#/';
    route();
  });

  /* ---------------- 画面の切り替え ---------------- */

  function route() {
    var hash = location.hash;
    var m = hash.match(/^#\/step\/(\d+)$/);
    renderMeter();

    if (m) {
      var index = Number(m[1]) - 1;
      if (index >= 0 && index < STEPS.length && P.isUnlocked(state, STEPS, index)) {
        renderStep(index);
        return;
      }
      if (index >= 0 && index < STEPS.length) toast('STEP ' + index + ' をクリアすると開きます');
      location.replace('#/');
      return;
    }

    if (hash === '#/finish' && P.summary(state, STEPS).current === -1) {
      document.title = D.TITLE;
      renderFinish();
      return;
    }

    destroyPlayer();
    current = -1;
    document.title = D.TITLE;
    renderHome();
  }

  window.addEventListener('hashchange', route);
  route();
})();
