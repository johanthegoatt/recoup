// Recoup engine: when is the last day you can take something back.
//
// You give it what you bought, the shop, the day you got it, and how long
// that shop lets you return things. Recoup works out the last day to take it
// back and how many days are left, then lines everything up by what runs out
// first. It also knows the return rights the law gives you on top of the
// shop's own policy, so a short shop window can't take a legal right away.
//
// Everything is counted in whole days from the day you got the item, so the
// time of day never changes the answer. Pure functions, no page code, so the
// site and `node --test` run exactly the same logic.
//
// Rights figures (change-of-mind cooling-off and the right to reject a faulty
// item) come from the published consumer law of each region:
//   UK  - Consumer Rights Act 2015 s.22 (30-day short-term right to reject a
//         faulty item) and the Consumer Contracts Regulations 2013 (14-day
//         cancellation right on most online/distance orders).
//   EU  - Consumer Rights Directive 2011/83/EU (14-day right of withdrawal on
//         distance sales). No EU-wide fixed window for faulty goods.
//   US  - no federal right to return; change-of-mind and faulty returns are
//         the shop's own policy, so the floor is zero.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Recoup = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DAY = 86400000; // ms in a day

  // Common shop return windows, in days, for the quick-pick buttons. These are
  // typical policy lengths, not the law: a Salesforce review of 350 retailers
  // put the US average at 30 days and Europe at 14, and most UK shops sit at
  // 28-30. People can always type the exact number from their own receipt.
  var PRESETS = [14, 28, 30, 60, 90];

  // Return rights the law gives on top of any shop policy, in days from the
  // day you got the item. coolingOff applies to a change-of-mind return on an
  // order made online or at a distance; rejectFaulty applies when the item is
  // faulty. null means "no fixed legal window here, the shop policy stands".
  var RIGHTS = {
    UK: { coolingOff: 14, rejectFaulty: 30, label: "UK" },
    EU: { coolingOff: 14, rejectFaulty: null, label: "EU" },
    US: { coolingOff: 0, rejectFaulty: 0, label: "US" }
  };

  function startOfDay(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  }

  function num(x) {
    var n = typeof x === "number" ? x : parseInt(x, 10);
    return isFinite(n) && n >= 0 ? n : null;
  }

  function region(item) {
    var r = item && item.region;
    return RIGHTS[r] ? r : "US";
  }

  // The legal floor, in days, for this item: the fewest days the law gives you
  // regardless of what the shop's policy says. Faulty uses the right to reject;
  // a change of mind uses the cooling-off right, but only when bought online.
  // Returns null when there is no fixed legal window for that case.
  function rightsFloor(item) {
    var r = RIGHTS[region(item)];
    if (item && item.kind === "faulty") return r.rejectFaulty;
    if (item && item.online) return r.coolingOff;
    return 0;
  }

  // How many days you really have: the longer of the shop's window and the
  // legal floor. If neither is known, returns null so the item shows "no date".
  function effectiveDays(item) {
    var shop = num(item && item.windowDays);
    var floor = rightsFloor(item);
    var best = null;
    if (shop != null) best = shop;
    // A floor of 0 means the law gives no window here, so it adds nothing.
    if (floor != null && floor > 0) best = best == null ? floor : Math.max(best, floor);
    return best;
  }

  // True when the legal floor is what's giving you the deadline, i.e. the law
  // beats the shop's own policy. Used to show a "your legal right" note.
  function rightsWin(item) {
    var shop = num(item && item.windowDays);
    var floor = rightsFloor(item);
    if (floor == null || floor === 0) return false;
    return shop == null || floor > shop;
  }

  // The last day you can still take it back: the day you got it plus the days
  // you have. Returns a midnight stamp, or null if there's no window at all.
  function lastDay(item) {
    var days = effectiveDays(item);
    if (days == null || item.boughtAt == null) return null;
    return startOfDay(item.boughtAt) + days * DAY;
  }

  // Whole days from today until the last day. 0 means today is the last day,
  // negative means the window has already closed.
  function daysLeft(item, now) {
    var by = lastDay(item);
    if (by == null) return null;
    return Math.round((by - startOfDay(now == null ? Date.now() : now)) / DAY);
  }

  // Four buckets the list is grouped and coloured by.
  function bucket(item, now) {
    var d = daysLeft(item, now);
    if (d == null) return "unknown";
    if (d < 0) return "closed";
    if (d <= 2) return "now";   // today, tomorrow or the day after
    if (d <= 6) return "soon";
    return "open";
  }

  // Sort a copy so the one that runs out first is on top. Items whose window
  // has closed stay at the very top (decide on those first); undated sink.
  function rank(items, now) {
    return items.slice().sort(function (a, b) {
      var da = daysLeft(a, now), db = daysLeft(b, now);
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });
  }

  // A short count for the mascot and the summary line: how many are still open
  // but close (within six days), and how many windows have already closed.
  function summary(items, now) {
    var soon = 0, closed = 0;
    items.forEach(function (it) {
      var b = bucket(it, now);
      if (b === "closed") closed++;
      else if (b === "now" || b === "soon") soon++;
    });
    return { total: items.length, soon: soon, closed: closed };
  }

  // Plain words for "how long left", for the page and screen readers.
  function phrase(item, now) {
    var d = daysLeft(item, now);
    if (d == null) return "No return date yet";
    if (d < 0) return d === -1 ? "Closed yesterday" : "Closed " + (-d) + " days ago";
    if (d === 0) return "Last day is today";
    if (d === 1) return "Last day is tomorrow";
    return d + " days left";
  }

  return {
    DAY: DAY,
    presets: PRESETS,
    rights: RIGHTS,
    startOfDay: startOfDay,
    rightsFloor: rightsFloor,
    effectiveDays: effectiveDays,
    rightsWin: rightsWin,
    lastDay: lastDay,
    daysLeft: daysLeft,
    bucket: bucket,
    rank: rank,
    summary: summary,
    phrase: phrase
  };
});
