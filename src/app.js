// Recoup page wiring: the form, the saved list, the filters, the example and
// the calendar export. All the date logic lives in engine.js; this file only
// moves it on and off the screen and remembers the list in this browser.
(function () {
  "use strict";
  var R = window.Recoup;
  var F = window.Fetch || { react: function () {}, context: function () {} };

  var form = document.getElementById("form");
  var nameEl = document.getElementById("name");
  var shopEl = document.getElementById("shop");
  var dateEl = document.getElementById("date");
  var regionEl = document.getElementById("region");
  var windowEl = document.getElementById("window");
  var onlineEl = document.getElementById("online");
  var deliveredEl = document.getElementById("delivered");
  var deliveredWrap = document.getElementById("delivered-wrap");
  var holidayEl = document.getElementById("holiday");
  var priceEl = document.getElementById("price");
  var restockEl = document.getElementById("restock");
  var finalEl = document.getElementById("final");
  var chipsEl = document.getElementById("chips");
  var keepsEl = document.getElementById("keeps");
  var exampleBtn = document.getElementById("example");
  var listEl = document.getElementById("list");
  var emptyEl = document.getElementById("empty");
  var countEl = document.getElementById("count");
  var filtersEl = document.getElementById("filters");
  var clearBtn = document.getElementById("clear-closed");

  var KEY = "recoup.items";
  var items = load();
  var view = "all";

  // ---- storage ----
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
  }

  // ---- form helpers ----
  function todayStr() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mm + "-" + dd;
  }
  function parseDate(str) {
    if (!str) return null;
    var p = str.split("-");
    if (p.length !== 3) return null;
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  function kind() {
    var r = form.querySelector('input[name="kind"]:checked');
    return r ? r.value : "change";
  }
  function windowDays() {
    var v = windowEl.value.trim();
    if (v === "") return null;
    var n = parseInt(v, 10);
    return isFinite(n) && n >= 0 ? n : null;
  }

  // Build an item object from whatever is in the form right now.
  function draft() {
    return {
      id: "x",
      name: nameEl.value.trim(),
      shop: shopEl.value.trim(),
      boughtAt: parseDate(dateEl.value),
      region: regionEl.value,
      kind: kind(),
      windowDays: windowDays(),
      online: !!onlineEl.checked,
      deliveredAt: deliveredEl && deliveredEl.value ? parseDate(deliveredEl.value) : null,
      holiday: holidayEl && holidayEl.value ? holidayEl.value : null,
      price: priceEl ? priceEl.value.trim() : "",
      restockPct: restockEl ? restockEl.value.trim() : "",
      finalSale: finalEl ? !!finalEl.checked : false
    };
  }

  // Fill the holiday-shop dropdown from the engine's table.
  function buildHoliday() {
    if (!holidayEl) return;
    Object.keys(R.holiday).forEach(function (key) {
      var o = document.createElement("option");
      o.value = key;
      o.textContent = R.holiday[key].label;
      holidayEl.appendChild(o);
    });
    holidayEl.addEventListener("change", preview);
  }

  // ---- the quick-pick day chips ----
  function buildChips() {
    R.presets.forEach(function (n) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = n + " days";
      b.setAttribute("data-days", n);
      b.addEventListener("click", function () {
        windowEl.value = n;
        syncChips();
        preview();
      });
      chipsEl.appendChild(b);
    });
  }
  function syncChips() {
    var v = windowEl.value.trim();
    [].forEach.call(chipsEl.children, function (b) {
      b.classList.toggle("on", b.getAttribute("data-days") === v);
    });
  }

  // The live line under the form: the last day, the days left, and a note when
  // the law is what gives you the deadline rather than the shop.
  function preview() {
    var it = draft();
    if (it.boughtAt == null && !it.finalSale) { keepsEl.textContent = ""; return; }
    if (!R.isReturnable(it)) {
      keepsEl.innerHTML = "Final sale, so there's no window to count. Keeping it on the list is just a reminder you can't take it back.";
      return;
    }
    var by = R.lastDay(it);
    if (by == null) {
      keepsEl.innerHTML = "Pick how long the shop gives you, or your legal right will set it.";
      return;
    }
    var txt = "Last day to take it back: <strong>" + fmtDate(by) + "</strong> (" + R.phrase(it) + ").";
    var fee = R.restockingFee(it);
    if (fee && fee.refund != null) {
      txt += ' <span class="right">A ' + (fee.pct != null ? fee.pct + "% restocking fee" : "restocking fee") +
        " keeps " + money(fee.amount) + ", so you'd get back about " + money(fee.refund) + ".</span>";
    }
    if (R.holidayWins(it)) {
      var note = R.holiday[it.holiday] && R.holiday[it.holiday].note;
      txt += ' <span class="right">' + R.holiday[it.holiday].label + "'s holiday window gives you until then." + (note ? " " + note : "") + "</span>";
    } else if (R.rightsWin(it)) {
      txt += ' <span class="right">That\'s your legal right, longer than the shop\'s window.</span>';
    }
    keepsEl.innerHTML = txt;
  }

  function fmtDate(ms) {
    try {
      return new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    } catch (e) { return new Date(ms).toDateString(); }
  }

  // ---- the list ----
  function visible() {
    var ranked = R.rank(items);
    if (view === "all") return ranked;
    return ranked.filter(function (it) {
      var b = R.bucket(it);
      if (view === "soon") return b === "now" || b === "soon";
      if (view === "open") return b === "open" || b === "now" || b === "soon";
      if (view === "closed") return b === "closed";
      return true;
    });
  }

  function render() {
    var rows = visible();
    listEl.innerHTML = "";
    rows.forEach(function (it) { listEl.appendChild(row(it)); });

    emptyEl.classList.toggle("hidden", items.length !== 0);
    if (items.length && rows.length === 0) {
      emptyEl.classList.remove("hidden");
      emptyEl.querySelector("p").textContent = "Nothing in this view.";
    } else {
      emptyEl.querySelector("p").textContent = "Nothing on the list yet. Add something you bought and I'll keep an eye on the last day to take it back.";
    }

    var s = R.summary(items);
    var bits = [];
    if (s.total) bits.push(s.total + (s.total === 1 ? " item" : " items"));
    if (s.soon) bits.push(s.soon + " closing soon");
    if (s.closed) bits.push(s.closed + " closed");
    if (s.final) bits.push(s.final + " final sale");
    countEl.textContent = bits.join(" · ");

    var anyClosed = items.some(function (it) { return R.bucket(it) === "closed"; });
    clearBtn.classList.toggle("hidden", !anyClosed);

    F.context(s);
  }

  function row(it) {
    var li = document.createElement("li");
    var b = R.bucket(it);
    li.className = "item b-" + b + " i-" + b;

    var main = document.createElement("div");
    main.className = "i-main";
    var name = document.createElement("div");
    name.className = "i-name";
    name.textContent = it.name || "Something";
    var sub = document.createElement("div");
    sub.className = "i-sub";
    sub.textContent = subLine(it);
    main.appendChild(name);
    main.appendChild(sub);

    var right = document.createElement("div");
    right.className = "i-right";
    var left = document.createElement("div");
    left.className = "i-left";
    left.textContent = R.phrase(it);
    var acts = document.createElement("div");
    acts.className = "i-acts";

    if (R.lastDay(it) != null) {
      var cal = document.createElement("button");
      cal.type = "button";
      cal.className = "i-cal";
      cal.textContent = "Add to calendar";
      cal.addEventListener("click", function () { exportIcs(it); F.react("calendar"); });
      acts.appendChild(cal);
    }
    var done = document.createElement("button");
    done.type = "button";
    done.className = "i-done";
    done.textContent = "Done";
    done.setAttribute("aria-label", "Mark " + (it.name || "item") + " dealt with and remove it");
    done.addEventListener("click", function () { remove(it.id, "done"); });
    acts.appendChild(done);

    var del = document.createElement("button");
    del.type = "button";
    del.className = "i-del";
    del.innerHTML = "&times;";
    del.setAttribute("aria-label", "Remove " + (it.name || "item"));
    del.addEventListener("click", function () { remove(it.id, null); });
    acts.appendChild(del);

    right.appendChild(left);
    right.appendChild(acts);
    li.appendChild(main);
    li.appendChild(right);
    return li;
  }

  function money(n) {
    try { return n.toLocaleString(undefined, { maximumFractionDigits: 2 }); }
    catch (e) { return String(n); }
  }
  function subLine(it) {
    var parts = [];
    if (it.shop) parts.push(it.shop);
    if (it.finalSale) parts.push("final sale");
    else parts.push(it.kind === "faulty" ? "faulty" : "change of mind");
    if (R.deliveryAnchored(it)) parts.push("from delivery " + fmtShort(it.deliveredAt));
    else if (it.boughtAt != null) parts.push("bought " + fmtShort(it.boughtAt));
    if (!it.finalSale && R.holidayWins(it)) parts.push("holiday window");
    else if (!it.finalSale && R.rightsWin(it)) parts.push("legal right");
    var fee = R.restockingFee(it);
    if (!it.finalSale && fee && fee.refund != null) parts.push("get back ~" + money(fee.refund) + " after " + (fee.pct != null ? fee.pct + "% fee" : "fee"));
    return parts.join(" · ");
  }
  function fmtShort(ms) {
    try { return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" }); }
    catch (e) { return new Date(ms).toDateString(); }
  }

  function remove(id, reaction) {
    items = items.filter(function (it) { return it.id !== id; });
    save();
    if (reaction) F.react(reaction);
    render();
  }

  // ---- calendar export (.ics) ----
  function pad(n) { return String(n).padStart(2, "0"); }
  function icsDate(ms) {
    var d = new Date(ms);
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  }
  function icsStamp() {
    var d = new Date();
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" +
      pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
  }
  function esc(s) { return String(s).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n"); }

  function exportIcs(it) {
    var by = R.lastDay(it);
    if (by == null) return;
    var end = by + R.DAY; // all-day events end on the next day
    var title = "Return by: " + (it.name || "item") + (it.shop ? " (" + it.shop + ")" : "");
    var desc = "Last day to return " + (it.name || "this") +
      (it.shop ? " to " + it.shop : "") + ". " +
      (it.kind === "faulty" ? "Faulty item." : "Change of mind.") +
      (R.rightsWin(it) ? " This date is your legal right." : "") +
      " Bring your receipt or order email.";
    var uid = "recoup-" + it.id + "@johanthegoat.xyz";
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Recoup//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:" + uid,
      "DTSTAMP:" + icsStamp(),
      "DTSTART;VALUE=DATE:" + icsDate(by),
      "DTEND;VALUE=DATE:" + icsDate(end),
      "SUMMARY:" + esc(title),
      "DESCRIPTION:" + esc(desc),
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      "DESCRIPTION:" + esc(title),
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR"
    ];
    var blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "return-" + slug(it.name || "item") + ".ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item"; }

  // ---- events ----
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var it = draft();
    if (!it.name) { nameEl.focus(); return; }
    if (it.boughtAt == null) { dateEl.focus(); return; }
    it.id = String(Date.now()) + Math.random().toString(16).slice(2, 6);
    items.push(it);
    save();
    var soon = R.bucket(it) === "now" || R.bucket(it) === "soon" || R.bucket(it) === "closed";
    render();
    F.react(soon ? "added-soon" : "added");
    // Keep the shop, region and date; clear the item name for the next one.
    nameEl.value = "";
    nameEl.focus();
    preview();
  });

  ["input", "change"].forEach(function (ev) {
    form.addEventListener(ev, function (e) {
      if (e.target === windowEl) syncChips();
      // The delivery date only matters for an online order, so only show it then.
      if (e.target === onlineEl && deliveredWrap) {
        deliveredWrap.hidden = !onlineEl.checked;
        if (!onlineEl.checked && deliveredEl) deliveredEl.value = "";
      }
      if (e.target === windowEl || e.target === dateEl || e.target === regionEl ||
          e.target === onlineEl || e.target === deliveredEl || e.target === priceEl ||
          e.target === restockEl || e.target === finalEl || e.target.name === "kind") preview();
    });
  });

  onlineEl.addEventListener("focus", function () { F.react("focus:online"); });
  form.querySelectorAll('input[name="kind"]').forEach(function (r) {
    r.addEventListener("focus", function () { if (r.value === "faulty") F.react("focus:faulty"); });
  });

  filtersEl.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    view = b.getAttribute("data-view");
    [].forEach.call(filtersEl.children, function (x) { x.classList.toggle("on", x === b); });
    render();
  });

  clearBtn.addEventListener("click", function () {
    items = items.filter(function (it) { return R.bucket(it) !== "closed"; });
    save();
    F.react("cleared");
    render();
  });

  exampleBtn.addEventListener("click", function () {
    var now = Date.now();
    function ago(d) { return now - d * R.DAY; }
    var seed = [
      { name: "Running shoes", shop: "SportsDirect", region: "UK", kind: "change", windowDays: 28, online: false, boughtAt: ago(26) },
      { name: "Bluetooth speaker", shop: "Amazon", region: "UK", kind: "change", windowDays: 30, online: true, boughtAt: ago(3) },
      { name: "Kettle (stopped working)", shop: "Argos", region: "UK", kind: "faulty", windowDays: null, online: false, boughtAt: ago(12) },
      { name: "Winter coat", shop: "Macy's", region: "US", kind: "change", windowDays: 30, online: false, boughtAt: ago(40) }
    ];
    seed.forEach(function (s) {
      s.id = String(now++) + Math.random().toString(16).slice(2, 6);
      items.push(s);
    });
    save();
    view = "all";
    [].forEach.call(filtersEl.children, function (x) { x.classList.toggle("on", x.getAttribute("data-view") === "all"); });
    render();
    F.react("example");
  });

  // ---- start ----
  buildChips();
  buildHoliday();
  dateEl.value = todayStr();
  dateEl.max = todayStr();
  render();
})();
