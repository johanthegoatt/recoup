"use strict";
var test = require("node:test");
var assert = require("node:assert");
var R = require("../src/engine.js");

var DAY = R.DAY;
// A fixed "now" so the tests never depend on the real clock.
var NOW = new Date("2026-06-15T09:00:00").getTime();

function daysAgo(n) {
  return new Date("2026-06-15T09:00:00").getTime() - n * DAY;
}

test("effective days is the shop window when no legal floor beats it", function () {
  var item = { region: "US", kind: "change", windowDays: 30, boughtAt: daysAgo(0) };
  assert.strictEqual(R.effectiveDays(item), 30);
  assert.strictEqual(R.rightsWin(item), false);
});

test("UK online change of mind gets at least the 14-day cooling-off right", function () {
  // Shop offers only 7 days, but the law gives 14 on an online order.
  var item = { region: "UK", kind: "change", online: true, windowDays: 7, boughtAt: daysAgo(0) };
  assert.strictEqual(R.effectiveDays(item), 14);
  assert.strictEqual(R.rightsWin(item), true);
});

test("a longer shop window beats the legal floor", function () {
  var item = { region: "UK", kind: "change", online: true, windowDays: 30, boughtAt: daysAgo(0) };
  assert.strictEqual(R.effectiveDays(item), 30);
  assert.strictEqual(R.rightsWin(item), false);
});

test("UK faulty goods get the 30-day right to reject even with no shop window", function () {
  var item = { region: "UK", kind: "faulty", boughtAt: daysAgo(0) };
  assert.strictEqual(R.effectiveDays(item), 30);
  assert.strictEqual(R.rightsWin(item), true);
});

test("US has no legal floor, so a change of mind needs a shop window", function () {
  var item = { region: "US", kind: "change", online: true, boughtAt: daysAgo(0) };
  assert.strictEqual(R.rightsFloor(item), 0);
  assert.strictEqual(R.effectiveDays(item), null);
  assert.strictEqual(R.lastDay(item), null);
  assert.strictEqual(R.phrase(item, NOW), "No return date yet");
});

test("cooling-off only applies online, not to an in-store change of mind", function () {
  var item = { region: "UK", kind: "change", online: false, windowDays: 7, boughtAt: daysAgo(0) };
  assert.strictEqual(R.effectiveDays(item), 7);
});

test("last day and days left count whole days from the purchase day", function () {
  var item = { region: "US", kind: "change", windowDays: 30, boughtAt: daysAgo(10) };
  assert.strictEqual(R.daysLeft(item, NOW), 20);
  assert.strictEqual(R.phrase(item, NOW), "20 days left");
});

test("the day the window closes reads as the last day today", function () {
  var item = { region: "US", kind: "change", windowDays: 30, boughtAt: daysAgo(30) };
  assert.strictEqual(R.daysLeft(item, NOW), 0);
  assert.strictEqual(R.phrase(item, NOW), "Last day is today");
  assert.strictEqual(R.bucket(item, NOW), "now");
});

test("a passed window is closed and says how long ago", function () {
  var item = { region: "US", kind: "change", windowDays: 30, boughtAt: daysAgo(33) };
  assert.strictEqual(R.daysLeft(item, NOW), -3);
  assert.strictEqual(R.bucket(item, NOW), "closed");
  assert.strictEqual(R.phrase(item, NOW), "Closed 3 days ago");
});

test("buckets split now, soon and open", function () {
  var now = { region: "US", windowDays: 30, boughtAt: daysAgo(28) };   // 2 left
  var soon = { region: "US", windowDays: 30, boughtAt: daysAgo(25) };  // 5 left
  var open = { region: "US", windowDays: 30, boughtAt: daysAgo(10) };  // 20 left
  assert.strictEqual(R.bucket(now, NOW), "now");
  assert.strictEqual(R.bucket(soon, NOW), "soon");
  assert.strictEqual(R.bucket(open, NOW), "open");
});

test("rank puts closed first, then soonest, undated last", function () {
  var items = [
    { id: "open", region: "US", windowDays: 90, boughtAt: daysAgo(10) },  // 80 left
    { id: "closed", region: "US", windowDays: 14, boughtAt: daysAgo(20) }, // -6
    { id: "undated", region: "US", kind: "change", boughtAt: daysAgo(1) },
    { id: "now", region: "US", windowDays: 30, boughtAt: daysAgo(29) }     // 1 left
  ];
  var order = R.rank(items, NOW).map(function (i) { return i.id; });
  assert.deepStrictEqual(order, ["closed", "now", "open", "undated"]);
});

test("summary counts close and closed windows", function () {
  var items = [
    { region: "US", windowDays: 30, boughtAt: daysAgo(29) }, // 1 left  -> soon count
    { region: "US", windowDays: 30, boughtAt: daysAgo(25) }, // 5 left  -> soon count
    { region: "US", windowDays: 30, boughtAt: daysAgo(40) }, // closed
    { region: "US", windowDays: 90, boughtAt: daysAgo(1) }   // plenty
  ];
  var s = R.summary(items, NOW);
  assert.strictEqual(s.total, 4);
  assert.strictEqual(s.soon, 2);
  assert.strictEqual(s.closed, 1);
});

test("an unknown region falls back to US rules", function () {
  var item = { region: "ZZ", kind: "faulty", boughtAt: daysAgo(0) };
  assert.strictEqual(R.rightsFloor(item), 0);
});

// Extended holiday return windows.
test("a November gift at a holiday shop is returnable into the new year", function () {
  // Bought 20 Nov 2025 at Amazon (14-day shop window), holiday deadline 31 Jan 2026.
  var nov = new Date("2025-11-20T10:00:00").getTime();
  var item = { region: "US", kind: "change", windowDays: 14, boughtAt: nov, holiday: "amazon" };
  var by = R.lastDay(item);
  var d = new Date(by);
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getMonth(), 0); // January
  assert.strictEqual(d.getDate(), 31);
  assert.strictEqual(R.holidayWins(item), true);
});

test("the holiday window only applies inside the shop's dates", function () {
  var sep = new Date("2025-09-15T10:00:00").getTime(); // before Amazon's 1 Nov start
  var item = { region: "US", kind: "change", windowDays: 30, boughtAt: sep, holiday: "amazon" };
  assert.strictEqual(R.holidayDeadline(item), null);
  assert.strictEqual(R.holidayWins(item), false);
  // Falls back to the ordinary 30-day window.
  assert.strictEqual(R.lastDay(item), R.startOfDay(sep) + 30 * DAY);
});

test("the later of the shop window and the holiday deadline wins", function () {
  // Bought 28 Dec 2025 at Walmart with a long 90-day shop window.
  var dec = new Date("2025-12-28T10:00:00").getTime();
  var item = { region: "US", kind: "change", windowDays: 90, boughtAt: dec, holiday: "walmart" };
  var normal = R.startOfDay(dec) + 90 * DAY;     // ~ 28 Mar 2026
  var holiday = R.holidayDeadline(item);         // 31 Jan 2026
  assert.ok(normal > holiday);
  assert.strictEqual(R.lastDay(item), normal);   // the longer window is kept
  assert.strictEqual(R.holidayWins(item), false);
});

test("Best Buy's shorter holiday deadline is honoured", function () {
  var dec = new Date("2025-12-10T10:00:00").getTime();
  var item = { region: "US", kind: "change", windowDays: 15, boughtAt: dec, holiday: "bestbuy" };
  var d = new Date(R.holidayDeadline(item));
  assert.strictEqual(d.getDate(), 15);
  assert.strictEqual(d.getMonth(), 0);
});

test("a final-sale item is flagged, not given a countdown", function () {
  var it = { finalSale: true, windowDays: 30, boughtAt: Date.now() };
  assert.strictEqual(R.isReturnable(it), false);
  assert.strictEqual(R.bucket(it), "final");
  assert.strictEqual(R.daysLeft(it), null);
  assert.strictEqual(R.phrase(it), "Final sale, can't be returned");
});

test("summary counts final-sale items on their own", function () {
  var now = Date.now();
  var items = [
    { finalSale: true },
    { windowDays: 30, boughtAt: now },
    { windowDays: 1, boughtAt: now - 5 * R.DAY } // closed
  ];
  var s = R.summary(items, now);
  assert.strictEqual(s.final, 1);
  assert.strictEqual(s.closed, 1);
});

test("a percent restocking fee comes off the refund", function () {
  var f = R.restockingFee({ price: "200", restockPct: "15" });
  assert.strictEqual(f.amount, 30);
  assert.strictEqual(f.refund, 170);
});

test("a flat restocking fee comes off the refund", function () {
  var f = R.restockingFee({ price: "80", restockFee: "20" });
  assert.strictEqual(f.amount, 20);
  assert.strictEqual(f.refund, 60);
});

test("a restocking fee never keeps more than was paid", function () {
  var f = R.restockingFee({ price: "50", restockFee: "90" });
  assert.strictEqual(f.amount, 50);
  assert.strictEqual(f.refund, 0);
});

test("no restocking fields means no fee", function () {
  assert.strictEqual(R.restockingFee({ price: "40" }), null);
});

test("an online window runs from the delivery day, not the order day", function () {
  var DAY = R.DAY;
  var bought = R.startOfDay(Date.now());
  var delivered = R.startOfDay(Date.now() + 7 * DAY); // arrived a week later
  var item = { boughtAt: bought, deliveredAt: delivered, online: true, windowDays: 30, kind: "change", region: "UK" };
  assert.strictEqual(R.lastDay(item), delivered + 30 * DAY);
  assert.strictEqual(R.deliveryAnchored(item), true);
});

test("the legal cooling-off floor is also counted from delivery", function () {
  var DAY = R.DAY;
  var bought = R.startOfDay(Date.now());
  var delivered = R.startOfDay(Date.now() + 5 * DAY);
  // No shop window given; UK online change-of-mind right is 14 days from receipt.
  var item = { boughtAt: bought, deliveredAt: delivered, online: true, kind: "change", region: "UK" };
  assert.strictEqual(R.lastDay(item), delivered + 14 * DAY);
});

test("an in-store purchase still counts from the day bought", function () {
  var DAY = R.DAY;
  var bought = R.startOfDay(Date.now());
  var item = { boughtAt: bought, deliveredAt: R.startOfDay(Date.now() + 7 * DAY), online: false, windowDays: 30, kind: "change", region: "US" };
  assert.strictEqual(R.windowStart(item), bought);
  assert.strictEqual(R.lastDay(item), bought + 30 * DAY);
  assert.strictEqual(R.deliveryAnchored(item), false);
});

test("an online order with no delivery date falls back to the order day", function () {
  var DAY = R.DAY;
  var bought = R.startOfDay(Date.now());
  var item = { boughtAt: bought, online: true, windowDays: 28, kind: "change", region: "EU" };
  assert.strictEqual(R.lastDay(item), bought + 28 * DAY);
  assert.strictEqual(R.deliveryAnchored(item), false);
});

test("a faulty return waives the restocking fee and refunds in full", function () {
  // The shop lists a 15% fee, but a faulty item gets the whole price back.
  var f = R.restockingFee({ price: "200", restockPct: "15", kind: "faulty" });
  assert.strictEqual(f.waived, true);
  assert.strictEqual(f.amount, 0);
  assert.strictEqual(f.refund, 200);
  assert.strictEqual(f.pct, 15); // still reported, so you see what's waived

  // A flat fee is waived too, and with no price it still flags the waiver.
  var g = R.restockingFee({ price: "80", restockFee: "20", kind: "faulty" });
  assert.strictEqual(g.waived, true);
  assert.strictEqual(g.refund, 80);
  var h = R.restockingFee({ restockPct: "10", kind: "faulty" });
  assert.strictEqual(h.waived, true);
  assert.strictEqual(h.refund, null);
});

test("a change-of-mind return still has the restocking fee taken off", function () {
  var f = R.restockingFee({ price: "200", restockPct: "15", kind: "change" });
  assert.ok(!f.waived);
  assert.strictEqual(f.amount, 30);
  assert.strictEqual(f.refund, 170);
});
