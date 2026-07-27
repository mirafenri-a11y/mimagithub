/**
 * 共創仲間診断 - スコア計算・共有コード・相性ロジック
 * data.js に依存する。ブラウザ・Node の両方から読み込める。
 */
(function (root) {
  'use strict';

  var DATA = root.CCP_DATA;
  if (!DATA) throw new Error('CCP_DATA が読み込まれていません（data.js を先に読み込んでください）');

  var AXES = DATA.AXES;
  var QUESTIONS = DATA.QUESTIONS;
  var CHOICES = DATA.CHOICES;

  /** 1軸あたりの最大スコア（設問数 × 最大重み） */
  function maxScore(axisKey) {
    var n = QUESTIONS.filter(function (q) { return q.axis === axisKey; }).length;
    return n * 2;
  }

  /**
   * 回答からスコアとタイプコードを算出する。
   * @param {Array<number|null>} answers CHOICES の index（0..3）の配列
   * @returns {{axes: Object, code: string, detail: Array}}
   */
  function score(answers) {
    if (!Array.isArray(answers) || answers.length !== QUESTIONS.length) {
      throw new Error('回答数が設問数と一致しません');
    }

    var sums = {};
    AXES.forEach(function (a) { sums[a.key] = 0; });

    QUESTIONS.forEach(function (q, i) {
      var choice = CHOICES[answers[i]];
      if (!choice) throw new Error('未回答の設問があります: ' + (i + 1));
      sums[q.axis] += choice.weight * q.sign;
    });

    var detail = AXES.map(function (axis) {
      var raw = sums[axis.key];
      var max = maxScore(axis.key);
      // 0 は plus 側に倒す（バランス型として別途表示する）
      var pole = raw >= 0 ? axis.plus : axis.minus;
      return {
        axis: axis,
        raw: raw,
        max: max,
        /** plus 側に何%寄っているか（0..100） */
        percent: Math.round(((raw + max) / (max * 2)) * 100),
        /** 強さ（0..100）。0 に近いほどバランス型 */
        strength: Math.round((Math.abs(raw) / max) * 100),
        balanced: Math.abs(raw) <= 1,
        pole: pole
      };
    });

    return {
      axes: sums,
      detail: detail,
      code: detail.map(function (d) { return d.pole.code; }).join('')
    };
  }

  /** 回答配列を共有用の短い文字列にする（例: "302113021302"） */
  function encode(answers) {
    return answers.map(function (a) {
      return a === null || a === undefined ? '-' : String(a);
    }).join('');
  }

  /** 共有文字列を回答配列に戻す。不正なら null */
  function decode(str) {
    if (typeof str !== 'string' || str.length !== QUESTIONS.length) return null;
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var n = str.charCodeAt(i) - 48; // '0' = 48
      if (n < 0 || n >= CHOICES.length) return null;
      out.push(n);
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 相性診断
   * ------------------------------------------------------------------ */
  var COMPAT_RULES = {
    spark: {
      diff: { point: 30, text: '構想する人と、形にする人。役割が自然に分かれます。もっとも噛み合う組み合わせです。' },
      VV: { point: 10, text: 'アイデアは無限に出ますが、手を動かす人が不在になりがち。誰が作るかを最初に決めてください。' },
      BB: { point: 14, text: '実行力は十分。ただし「なぜやるか」が曖昧なまま進みやすいので、目的を言葉にする時間を取ってください。' }
    },
    drive: {
      diff: { point: 30, text: '引っ張る人と、整える人。速度と納得のバランスが取れた、崩れにくい関係です。' },
      DD: { point: 8, text: '二人とも前に出るタイプ。勢いは最大ですが、意見が割れたとき正面衝突します。決定権の分担を先に決めてください。' },
      HH: { point: 14, text: '衝突はまず起きません。ただし誰も決めないまま時間が過ぎがち。締め切りを外から入れると動きます。' }
    },
    range: {
      diff: { point: 30, text: '外へ広げる人と、内を深める人。集めたご縁が、ちゃんと中身になっていきます。' },
      OO: { point: 12, text: '広がりは抜群。ただし関係が浅いまま増え続けるので、深める相手を絞る話し合いを。' },
      CC: { point: 12, text: '中身は濃くなります。ただし二人だけで完結しやすいので、意識的に外の人を呼んでください。' }
    }
  };

  var LABELS = [
    { min: 90, label: '補完しあう相棒', note: 'ほぼ理想形。役割が重ならず、片方の弱点をもう片方が自然に埋めます。' },
    { min: 72, label: '噛み合う共犯者', note: '強い組み合わせ。1点だけ重なる部分を意識すれば、長く続きます。' },
    { min: 54, label: '意識すれば強い', note: '放っておくと同じ場所を取り合います。役割分担を言葉にしてください。' },
    { min: 0, label: '似すぎている二人', note: '話は合いますが、二人だけでは足りません。違うタイプを一人、輪に入れてください。' }
  ];

  /**
   * 2つのタイプコードの相性を算出する。
   * @param {string} a 例 'VDO'
   * @param {string} b 例 'BHC'
   */
  function compat(a, b) {
    if (!DATA.TYPES[a] || !DATA.TYPES[b]) throw new Error('不正なタイプコードです: ' + a + ' / ' + b);

    var total = 10;
    var lines = AXES.map(function (axis, i) {
      var pa = a[i];
      var pb = b[i];
      var rules = COMPAT_RULES[axis.key];
      var rule = pa === pb ? rules[pa + pb] : rules.diff;
      total += rule.point;
      return {
        axis: axis.label,
        same: pa === pb,
        text: rule.text
      };
    });

    var band = LABELS.find(function (l) { return total >= l.min; });

    return {
      a: a,
      b: b,
      score: total,
      label: band.label,
      note: band.note,
      lines: lines
    };
  }

  root.CCP_LOGIC = {
    score: score,
    encode: encode,
    decode: decode,
    compat: compat,
    maxScore: maxScore
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
