/* Team Maker — Fisher-Yates shuffle driven by crypto.getRandomValues (rejection sampling, no modulo bias). */
(function () {
  "use strict";
  var $ = S3.$, $$ = S3.$$;
  var PALETTE = ["#3dd6d0", "#f5b971", "#ff7b9c", "#8ea2ff", "#6ee7a8", "#c084fc", "#facc15", "#38bdf8", "#fb7185", "#a3e635", "#f59e6b", "#f0abfc"];
  var NAMES = {
    colors: ["Red", "Blue", "Green", "Yellow", "Purple", "Orange", "Pink", "Teal", "Black", "White", "Silver", "Gold"],
    animals: ["Lions", "Falcons", "Wolves", "Eagles", "Tigers", "Sharks", "Bears", "Panthers", "Foxes", "Hawks", "Cobras", "Rhinos"]
  };

  function uniformFrom(n, next) { var lim = Math.floor(0x100000000 / n) * n, x; do x = next(); while (x >= lim); return x % n; }
  function randInt(n) { return uniformFrom(n, function () { var b = new Uint32Array(1); crypto.getRandomValues(b); return b[0]; }); }
  function shuffle(a, rng) { for (var i = a.length - 1; i > 0; i--) { var j = rng(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // "Name", "Name, 4", "Name: 4", "Name;4", "Name<TAB>4"
  function parsePeople(text) {
    return text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).slice(0, 2000).map(function (l) {
      var m = /^(.*?)\s*[,;:\t]\s*(\d+(?:\.\d+)?)$/.exec(l);
      if (m && m[1] && +m[2] <= 100) return { name: m[1].slice(0, 80), skill: +m[2] };
      return { name: l.slice(0, 80), skill: null };
    });
  }
  function teamCount(mode, num, n) { return mode === "per" ? Math.ceil(n / Math.max(1, num)) : num; }
  function makeTeams(people, k, balance, rng) {
    var arr = shuffle(people.slice(), rng), teams = [];
    for (var i = 0; i < k; i++) teams.push({ members: [], total: 0 });
    var useSkill = balance && people.some(function (p) { return p.skill != null; });
    if (!useSkill) { arr.forEach(function (p, i) { teams[i % k].members.push(p); }); }
    else {
      // People without a skill count as the average, so they spread evenly too.
      var known = people.filter(function (p) { return p.skill != null; }), avg = known.reduce(function (a, p) { return a + p.skill; }, 0) / known.length;
      var sk = function (p) { return p.skill != null ? p.skill : avg; };
      arr.sort(function (a, b) { return sk(b) - sk(a); }); // stable: equal skills keep their shuffled order
      arr.forEach(function (p) {
        var minC = Math.min.apply(null, teams.map(function (t) { return t.members.length; }));
        var open = teams.filter(function (t) { return t.members.length === minC; });
        var minT = Math.min.apply(null, open.map(function (t) { return t.total; }));
        var best = open.filter(function (t) { return Math.abs(t.total - minT) < 1e-9; });
        var t = best[rng(best.length)];
        t.members.push(p); t.total += sk(p);
      });
    }
    teams.forEach(function (t) { t.total = t.members.reduce(function (a, p) { return a + (p.skill || 0); }, 0); });
    return teams;
  }
  function teamName(i, style, custom) {
    if (style === "custom" && custom[i]) return custom[i];
    if (style === "colors" || style === "animals") { var l = NAMES[style]; return (style === "colors" ? "Team " : "") + l[i % l.length] + (i >= l.length ? " " + (Math.floor(i / l.length) + 1) : ""); }
    if (style === "letters") return "Team " + (i < 26 ? String.fromCharCode(65 + i) : i + 1);
    return "Team " + (i + 1);
  }
  function asText(teams) {
    return teams.map(function (t) {
      return t.name + " (" + t.members.length + ")\n" + t.members.map(function (p) { return "- " + p.name; }).join("\n");
    }).join("\n\n") + "\n";
  }

  // ---------- UI ----------
  var mode = S3.store("tm.mode") === "per" ? "per" : "teams", result = null;
  function settings() { S3.store("tm.settings", { names: $("#names").value, num: $("#num").value, naming: $("#naming").value, custom: $("#custom").value, balance: $("#balance").checked }); }
  function updateCount() {
    var p = parsePeople($("#names").value), withSkill = p.filter(function (x) { return x.skill != null; }).length;
    $("#count").textContent = p.length + " people" + (withSkill ? " · " + withSkill + " with skill" : "");
  }
  function setMode(v) {
    mode = v; S3.store("tm.mode", v);
    $$("#mode button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === v)); });
    $("#numLabel").firstChild.textContent = v === "per" ? "People per team" : "Teams";
    $("#num").min = v === "per" ? 1 : 2;
  }
  function make() {
    var people = parsePeople($("#names").value), num = parseInt($("#num").value, 10);
    if (people.length < 2) { S3.toast("Add at least two people", "error"); $("#names").focus(); return; }
    if (!(num >= (mode === "per" ? 1 : 2))) { S3.toast(mode === "per" ? "People per team must be 1 or more" : "Make at least 2 teams", "error"); return; }
    var k = teamCount(mode, num, people.length);
    if (k > people.length) { S3.toast("There are only " + people.length + " people for " + k + " teams", "error"); return; }
    if (k < 2) { S3.toast("That makes only one team. Lower the people per team.", "error"); return; }
    var custom = $("#custom").value.split(/\r?\n/).map(function (s) { return s.trim().slice(0, 60); }).filter(Boolean);
    var teams = makeTeams(people, k, $("#balance").checked, randInt);
    teams.forEach(function (t, i) { t.name = teamName(i, $("#naming").value, custom); });
    result = teams; render(); settings(); $("#reroll").disabled = false; S3.done();
  }
  function render() {
    var box = $("#teams"); box.innerHTML = "";
    $("#empty").hidden = !!result;
    if (!result) { $("#summary").textContent = ""; return; }
    var skilled = result.some(function (t) { return t.members.some(function (p) { return p.skill != null; }); });
    result.forEach(function (t, i) {
      var card = S3.h("div", { "class": "team" }, [
        S3.h("h3", null, [S3.h("span", { dir: "auto", text: t.name }), S3.h("small", { text: t.members.length + (skilled ? " · skill " + Math.round(t.total * 10) / 10 : "") })]),
        S3.h("ol", null, t.members.map(function (p) { return S3.h("li", { dir: "auto" }, [p.name, p.skill != null ? S3.h("span", { "class": "sk", text: "★" + p.skill }) : null]); }))
      ]);
      card.style.setProperty("--tc", PALETTE[i % PALETTE.length]);
      card.style.animationDelay = i * 50 + "ms";
      box.appendChild(card);
    });
    var n = result.reduce(function (a, t) { return a + t.members.length; }, 0);
    $("#summary").textContent = n + " people in " + result.length + " teams";
  }

  $$("#mode button").forEach(function (b) { b.addEventListener("click", function () { setMode(b.dataset.v); }); });
  $("#naming").addEventListener("change", function () { $("#customWrap").hidden = $("#naming").value !== "custom"; settings(); });
  $("#names").addEventListener("input", S3.debounce(function () { updateCount(); settings(); }, 200));
  $("#make").addEventListener("click", make);
  $("#reroll").addEventListener("click", make);
  $("#clear").addEventListener("click", function () { $("#names").value = ""; updateCount(); settings(); $("#names").focus(); });
  $("#copy").addEventListener("click", function () { if (result) S3.copy(asText(result)); else S3.toast("Make teams first", "error"); });
  $("#save").addEventListener("click", function () { if (result) { S3.download(asText(result), "teams.txt", "text/plain"); S3.done(); } else S3.toast("Make teams first", "error"); });
  $("#print").addEventListener("click", function () { if (result) window.print(); else S3.toast("Make teams first", "error"); });
  document.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); make(); } });

  var s = S3.store("tm.settings") || {};
  $("#names").value = typeof s.names === "string" ? s.names : "";
  if (s.num) $("#num").value = s.num;
  if (s.naming && $('#naming option[value="' + s.naming + '"]')) $("#naming").value = s.naming;
  if (typeof s.custom === "string") $("#custom").value = s.custom;
  if (typeof s.balance === "boolean") $("#balance").checked = s.balance;
  $("#customWrap").hidden = $("#naming").value !== "custom";
  setMode(mode); updateCount(); render();

  window.S3_DEMO = function () {
    $("#names").value = ["Ali, 5", "Sara, 4", "Omar, 3", "Lina, 5", "Yousef, 2", "Noor, 4", "Kareem, 3", "Huda, 2", "Zaid, 1", "Maya, 4", "Rami, 3", "Dana, 1"].join("\n");
    setMode("teams"); $("#num").value = 3; $("#naming").value = "animals"; $("#customWrap").hidden = true; $("#balance").checked = true;
    updateCount(); make();
  };

  window.S3_SELFTEST = function () {
    var p = parsePeople("Ali, 4\nSara:2\n Omar \n\nLina 5\nPlayer;10\nNo, 500");
    var a = p.length === 6 && p[0].skill === 4 && p[1].name === "Sara" && p[1].skill === 2 && p[2].skill === null && p[3].name === "Lina 5" && p[4].skill === 10 && p[5].skill === null;
    var ppl = "ABCDEFGHIJ".split("").map(function (c) { return { name: c, skill: null }; });
    var t = makeTeams(ppl, 3, false, randInt), sizes = t.map(function (x) { return x.members.length; }).sort().join();
    var all = t.reduce(function (a, x) { return a.concat(x.members.map(function (m) { return m.name; })); }, []).sort().join("");
    var b = sizes === "3,3,4" && all === "ABCDEFGHIJ" && teamCount("per", 4, 10) === 3 && teamCount("teams", 4, 10) === 4;
    var skilled = [5, 5, 4, 4, 3, 3, 2, 2, 1, 1].map(function (s, i) { return { name: "p" + i, skill: s }; });
    var c = true;
    for (var r = 0; r < 20; r++) { var bt = makeTeams(skilled, 2, true, randInt); if (bt[0].total !== 15 || bt[1].total !== 15 || bt[0].members.length !== 5) c = false; }
    var sh = shuffle([1, 2, 3, 4, 5], function (n) { return n - 1; }).join() === "1,2,3,4,5"; // rng picks j = i every time: identity
    var calls = 0, src = [0xFFFFFFFF, 9], d = uniformFrom(5, function () { calls++; return src.shift(); }) === 4 && calls === 2;
    var e = teamName(0, "colors", []) === "Team Red" && teamName(1, "letters", []) === "Team B" && teamName(0, "custom", ["Stars"]) === "Stars" && teamName(2, "custom", ["Stars"]) === "Team 3";
    var txt = asText([{ name: "Team 1", members: [{ name: "Ali" }, { name: "Sara" }] }]) === "Team 1 (2)\n- Ali\n- Sara\n";
    return a && b && c && sh && d && e && txt;
  };
})();
