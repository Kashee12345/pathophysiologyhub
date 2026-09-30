/* Exam Suite · shared helpers + progress store
   Every tool records per-exam results here so the HQ dashboard can show readiness.

   NOTE: this key MUST differ from other hubs'. Both sites are served from
   kashee12345.github.io, so they share one localStorage origin, and this course's
   exam keys "1".."7" would otherwise collide with other hubs' keys. */
(function (w) {
  "use strict";

  var KEY = "patho_exam_v1";

  function blank() { return { weeks: {}, tools: {} }; }

  function load() {
    try {
      var s = localStorage.getItem(KEY);
      if (!s) return blank();
      var d = JSON.parse(s);
      if (!d || typeof d !== "object") return blank();
      d.weeks = d.weeks || {}; d.tools = d.tools || {};
      return d;
    } catch (e) { return blank(); }
  }

  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
  }

  var Progress = {
    /* record one answered item. "week" here is the EXAM key ("1".."7").
       Tool stats are namespaced per exam so one exam's run cannot skew another's. */
    hit: function (tool, week, correct) {
      tool = examKey + ":" + tool;
      /* `correct` may be a boolean OR a 0..1 score. Select-all-that-apply items are
         graded with partial credit, so the running tallies carry fractions. */
      var pts = (typeof correct === "number") ? correct : (correct ? 1 : 0);
      if (pts < 0) pts = 0; if (pts > 1) pts = 1;
      var d = load();
      if (week != null) {
        var k = String(week);
        var wk = d.weeks[k] || { c: 0, n: 0 };
        wk.n += 1; wk.c += pts;
        d.weeks[k] = wk;
      }
      var t = d.tools[tool] || { c: 0, n: 0, runs: 0, best: null };
      t.n += 1; t.c += pts;
      d.tools[tool] = t;
      save(d);
    },
    /* record a completed run (simulator score, drill session) */
    run: function (tool, pct) {
      tool = examKey + ":" + tool;
      var d = load();
      var t = d.tools[tool] || { c: 0, n: 0, runs: 0, best: null };
      t.runs = (t.runs || 0) + 1;
      if (t.best == null || pct > t.best) t.best = pct;
      t.last = pct;
      d.tools[tool] = t;
      save(d);
    },
    all: load,
    weekPct: function (week) {
      var wk = load().weeks[String(week)];
      if (!wk || !wk.n) return null;
      return Math.round((wk.c / wk.n) * 100);
    },
    reset: function () { try { localStorage.removeItem(KEY); } catch (e) {} }
  };

  /* ---------- helpers ---------- */
  function shuffle(a) {
    var arr = a.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- question shape ----------
     A question with an `m` array is SELECT ALL THAT APPLY: `m` lists every correct
     option index. Anything without `m` is ordinary single-answer, keyed by `c`. */
  function isMulti(q) { return !!(q && q.m && q.m.length); }

  /* shuffle a question's options while keeping track of the right answer(s) */
  function shuffleQ(q) {
    var idx = q.a.map(function (_, i) { return i; });
    idx = shuffle(idx);
    var o = {
      q: q.q,
      a: idx.map(function (i) { return q.a[i]; }),
      c: idx.indexOf(q.c),
      t: q.t, fb: q.fb, d: q.d, week: q.week
    };
    /* remap every correct index through the same shuffle */
    if (isMulti(q)) {
      o.m = q.m.map(function (i) { return idx.indexOf(i); })
               .sort(function (a, b) { return a - b; });
    }
    return o;
  }

  /* ---------- grading ----------
     Single-answer: 1 point or 0.
     Select-all-that-apply: PARTIAL CREDIT. Each correct box ticked earns a share of the
     point; each wrong box ticked gives one back. Ticking everything therefore scores
     poorly, and leaving it blank scores zero — you cannot coast on a SATA item.
         points = (correct ticked - incorrect ticked) / (number of correct options)
     clamped to 0..1.                                                                  */
  function gradeQ(q, ans) {
    if (isMulti(q)) {
      var sel = ans || [], hit = 0, miss = 0;
      for (var i = 0; i < sel.length; i++) {
        if (q.m.indexOf(sel[i]) >= 0) hit++; else miss++;
      }
      var pts = (hit - miss) / q.m.length;
      if (pts < 0) pts = 0;
      return { pts: pts, full: (hit === q.m.length && miss === 0), multi: true,
               hit: hit, miss: miss, need: q.m.length, answered: sel.length > 0 };
    }
    var ok = (ans !== null && ans !== undefined && ans === q.c);
    return { pts: ok ? 1 : 0, full: ok, multi: false,
             answered: (ans !== null && ans !== undefined) };
  }

  /* flatten FINAL_BANK into one array, tagging each question with its week */
  function bankAll() {
    var out = [];
    if (!w.FINAL_BANK) return out;
    Object.keys(w.FINAL_BANK).forEach(function (k) {
      w.FINAL_BANK[k].questions.forEach(function (q) {
        var o = {}; for (var p in q) o[p] = q[p];
        if (q.m) o.m = q.m.slice();
        o.week = k;
        out.push(o);
      });
    });
    return out;
  }

  function weekTitle(k) {
    return (w.FINAL_BANK && w.FINAL_BANK[k] && w.FINAL_BANK[k].title) || ("Exam " + k);
  }

  /* Bank titles look like
     "HOMEOSTASIS UNDER SIEGE — Ch 1 Fluids/Lytes/ABGs · Ch 2 Immunity & Infection"
     -> "Exam 1 · Homeostasis Under Siege"                                        */
  function titleCase(s) {
    return s.toLowerCase().replace(/\b([a-z])/g, function (m, c) { return c.toUpperCase(); });
  }
  function weekShort(k) {
    var full = weekTitle(k);
    var head = full.split(/\s+[—–-]\s+/)[0].trim();
    if (head === head.toUpperCase()) head = titleCase(head);
    return (k === "7" ? "Final" : "Exam " + k) + " · " + head;
  }
  /* the chapters an exam covers, for subtitles */
  function weekScope(k) {
    var full = weekTitle(k);
    var parts = full.split(/\s+[—–-]\s+/);
    return parts.length > 1 ? parts.slice(1).join(" — ").trim() : "";
  }

  var topbar = function (title, meta) {
    return '<div class="tbar"><div class="ti">' +
      '<a class="back" href="' + w.FinalSuite.hq + '">‹ ' + esc(EXAM.label) + ' HQ</a>' +
      '<span class="tt">' + esc(title) + '</span>' +
      '<span class="spacer"></span>' +
      '<span class="meta" id="tbMeta">' + (meta || "") + '</span>' +
      '</div></div>';
  };

  /* ---------- which exam is this? ----------
     The course has six unit exams plus a cumulative final. The bank and the drills
     are both keyed "1".."7", so an exam IS the unit of progress here.
     ?exam=1..7 picks one; ?exam=all draws from everything.            */
  var ALL_KEYS = ["1", "2", "3", "4", "5", "6", "7"];
  var EXAMS = { all: { label: "All Exams", span: "Whole course", weeks: ALL_KEYS, abgWeek: "1" } };
  ALL_KEYS.forEach(function (k) {
    EXAMS[k] = {
      label: (k === "7" ? "Final Exam" : "Exam " + k),
      span: (k === "7" ? "Cumulative" : "Exam " + k),
      weeks: [k],
      abgWeek: k            /* ABGs belong to Exam 1 but drilling them counts for whichever exam you are in */
    };
  });
  var examKey = (function () {
    var m = /[?&]exam=([a-z0-9]+)/i.exec(w.location.search);
    if (m && EXAMS[m[1].toLowerCase()]) return m[1].toLowerCase();
    return "all";
  })();
  var EXAM = EXAMS[examKey];

  /* everything lives in this one folder; drills are keyed by exam */
  function loadData(cb) {
    var files = ["bank.js", "drills.js"];
    var i = 0;
    (function next() {
      if (i >= files.length) {
        var all = w.FINAL_DRILLS_BY_EXAM;
        if (all) {
          if (examKey === "all") {                       /* merge every exam's drills */
            var merged = { labs: [], pairs: [], redflags: [], chains: [] };
            ALL_KEYS.forEach(function (k) {
              var d = all[k]; if (!d) return;
              ["labs", "pairs", "redflags", "chains"].forEach(function (kind) {
                (d[kind] || []).forEach(function (item) { merged[kind].push(item); });
              });
            });
            w.FINAL_DRILLS = merged;
          } else {
            w.FINAL_DRILLS = all[examKey] || { labs: [], pairs: [], redflags: [], chains: [] };
          }
        }
        return cb();
      }
      var s = document.createElement("script");
      s.src = files[i++];
      s.onload = next;
      s.onerror = function () { next(); };
      document.head.appendChild(s);
    })();
  }

  w.FinalSuite = {
    Progress: Progress, shuffle: shuffle, esc: esc, shuffleQ: shuffleQ,
    isMulti: isMulti, gradeQ: gradeQ,
    bankAll: bankAll, weekTitle: weekTitle, weekShort: weekShort, weekScope: weekScope,
    topbar: topbar, ALL_KEYS: ALL_KEYS,
    exam: examKey, EXAM: EXAM, loadData: loadData, span: EXAM.span,
    hq: "index.html",
    link: function (page) { return page + "?exam=" + examKey; },
    get WEEKS() { return EXAM.weeks; }
  };

  /* back-links and any [data-span] placeholders resolve once the DOM is up */
  function wire() {
    var a = document.querySelectorAll('[data-hq]');
    for (var i = 0; i < a.length; i++) a[i].setAttribute("href", w.FinalSuite.hq);
    var t = document.querySelectorAll("[data-span]");
    for (var j = 0; j < t.length; j++) t[j].textContent = EXAM.span;
    var l = document.querySelectorAll("[data-label]");
    for (var k = 0; k < l.length; k++) l[k].textContent = EXAM.label;
    if (document.title.indexOf("Pathophysiology") >= 0)
      document.title = document.title.replace(/Pathophysiology(?:\s+\S+)?/, "Pathophysiology " + EXAM.label);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})(window);
