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

  // Extended holiday return windows. Big shops stretch the clock for things
  // bought in the run-up to the holidays, so a gift bought in November can go
  // back well into the new year. Each entry is the shop's published 2025 policy:
  // the dates it covers (month, day) and the day returns are due by, in the
  // January after. Figures from each retailer's 2025 holiday return notice.
  var HOLIDAY = {
    amazon:  { label: "Amazon",   from: [11, 1],  to: [12, 31], by: [1, 31], note: "Apple-brand items are due by 15 January." },
    walmart: { label: "Walmart",  from: [10, 1],  to: [12, 31], by: [1, 31], note: "" },
    macys:   { label: "Macy's",   from: [10, 6],  to: [12, 31], by: [1, 31], note: "" },
    target:  { label: "Target",   from: [11, 1],  to: [12, 24], by: [1, 24], note: "Phones and Apple items get 14 days, due by 9 January." },
    bestbuy: { label: "Best Buy", from: [10, 31], to: [12, 31], by: [1, 15], note: "Third-party Marketplace items are not included." }
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

  // A money or percent value: allows decimals, unlike the whole-day num above.
  function numMoney(x) {
    if (x == null || x === "") return null;
    var n = typeof x === "number" ? x : parseFloat(String(x).replace(/[^0-9.]/g, ""));
    return isFinite(n) && n >= 0 ? n : null;
  }
  function round2(n) { return Math.round(n * 100) / 100; }

  // Some things just can't go back: clearance, "final sale", opened software,
  // pierced jewellery, underwear, perishables. When an item is marked final
  // sale there's no window to count, so it's flagged rather than given a date.
  function isReturnable(item) { return !(item && item.finalSale); }

  // Many shops keep a slice of the refund as a restocking fee (commonly 10-15%
  // on opened electronics and large items). Given the price and either a
  // percent or a flat fee, this works out what's kept and what actually comes
  // back, so the refund you see is the real one, not the sticker price.
  function restockingFee(item) {
    if (!item) return null;
    var price = numMoney(item.price);
    var pct = numMoney(item.restockPct);
    var flat = numMoney(item.restockFee);
    if (pct == null && flat == null) return null;
    // A faulty item is entitled to a full refund with no restocking fee taken
    // off (UK Consumer Rights Act 2015 s.20; the near-universal US and EU
    // practice too). So a fee the shop would otherwise charge is waived, and
    // the rate is still reported so you can see what you're not being charged.
    if (item.kind === "faulty") {
      return { pct: pct, flat: flat != null ? round2(flat) : null, amount: 0,
        refund: price == null ? null : round2(price), waived: true };
    }
    if (price == null) {
      // No price given: still report the rate so it isn't a surprise.
      return { pct: pct, amount: flat != null ? round2(flat) : null, refund: null };
    }
    var amount = pct != null ? price * pct / 100 : flat;
    amount = Math.min(amount, price); // never keep more than was paid
    return { pct: pct, amount: round2(amount), refund: round2(price - amount) };
  }

  // Price adjustment (price protection). Lots of shops refund the difference if
  // something you bought drops in price soon after, a separate thing from
  // returning it: you keep the item and get money back. Common windows are 7
  // days (Walmart), 14 days (Express, Gap, Old Navy) and up to 30 (Backcountry),
  // and the clock runs from the purchase day, not delivery. Given the price you
  // paid, the price now and the shop's adjustment window, this says whether
  // you're still in time and what you'd get back. Price-adjustment windows run
  // separately from the return window, so a closed return can still be in time
  // for a price drop. Returns null when there isn't enough to work it out.
  function priceAdjustment(item, now) {
    if (!item) return null;
    var days = num(item.priceAdjustDays);
    var paid = numMoney(item.price);
    var nowPrice = numMoney(item.nowPrice);
    if (days == null || paid == null || nowPrice == null || item.boughtAt == null) return null;
    var start = startOfDay(item.boughtAt);
    var by = start + days * DAY;
    var left = Math.round((by - startOfDay(now == null ? Date.now() : now)) / DAY);
    var drop = paid - nowPrice;
    var inTime = left >= 0;
    var dropped = drop > 0;
    return {
      paid: round2(paid),
      now: round2(nowPrice),
      drop: round2(Math.max(0, drop)),
      days: days,
      lastDay: by,
      daysLeft: left,
      inTime: inTime,
      eligible: dropped && inTime,
      reason: !dropped ? "no-drop" : !inTime ? "expired" : "ok",
      saving: dropped && inTime ? round2(drop) : 0
    };
  }

  // The day the return clock runs from. For an online or distance order the
  // window (and the legal cooling-off right) starts the day the goods are
  // received, not the day you ordered, so a parcel that took a week to arrive
  // still gives you the full window from delivery. UK Consumer Contracts
  // Regulations 2013 reg.30: the cancellation period ends 14 days after the day
  // the goods come into the consumer's possession; the EU Consumer Rights
  // Directive art.9 is the same. In a shop, the clock runs from the day bought.
  function windowStart(item) {
    if (item && item.online && item.deliveredAt != null) {
      var d = startOfDay(item.deliveredAt);
      if (isFinite(d)) return d;
    }
    return item && item.boughtAt != null ? startOfDay(item.boughtAt) : null;
  }

  // True when a delivery date is what the window is counted from, i.e. an
  // online order whose delivery day is later than its order day. Used to show
  // a "counted from delivery" note so the extra days aren't a surprise.
  function deliveryAnchored(item) {
    if (!item || !item.online || item.deliveredAt == null || item.boughtAt == null) return false;
    return startOfDay(item.deliveredAt) > startOfDay(item.boughtAt);
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

  // The extended holiday deadline for this item, or null. Only applies when the
  // shop is one with a holiday policy and the purchase date falls inside the
  // dates that policy covers. Returns a midnight stamp in the following January.
  function holidayDeadline(item) {
    var h = item && item.holiday && HOLIDAY[item.holiday];
    if (!h || item.boughtAt == null) return null;
    var d = new Date(item.boughtAt);
    var md = (d.getMonth() + 1) * 100 + d.getDate();
    if (md < h.from[0] * 100 + h.from[1] || md > h.to[0] * 100 + h.to[1]) return null;
    return startOfDay(new Date(d.getFullYear() + 1, h.by[0] - 1, h.by[1]).getTime());
  }

  // The last day you can still take it back: the later of the normal window
  // (day you got it plus the days you have) and any holiday deadline. Returns a
  // midnight stamp, or null if there's no window at all.
  function lastDay(item) {
    var days = effectiveDays(item);
    var start = windowStart(item);
    var normal = (days != null && start != null) ? start + days * DAY : null;
    var hol = holidayDeadline(item);
    if (normal == null) return hol;
    if (hol == null) return normal;
    return Math.max(normal, hol);
  }

  // True when the holiday deadline is what's giving you the extra time, i.e. it
  // lands later than the shop's ordinary window. Used to show a holiday note.
  function holidayWins(item) {
    var hol = holidayDeadline(item);
    if (hol == null) return false;
    var days = effectiveDays(item);
    var start = windowStart(item);
    var normal = (days != null && start != null) ? start + days * DAY : null;
    return normal == null || hol > normal;
  }

  // Whole days from today until the last day. 0 means today is the last day,
  // negative means the window has already closed.
  function daysLeft(item, now) {
    // Final-sale items have no window, so there's nothing to count down.
    if (!isReturnable(item)) return null;
    var by = lastDay(item);
    if (by == null) return null;
    return Math.round((by - startOfDay(now == null ? Date.now() : now)) / DAY);
  }

  // Buckets the list is grouped and coloured by.
  function bucket(item, now) {
    if (!isReturnable(item)) return "final";
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
    var soon = 0, closed = 0, final = 0;
    items.forEach(function (it) {
      var b = bucket(it, now);
      if (b === "closed") closed++;
      else if (b === "final") final++;
      else if (b === "now" || b === "soon") soon++;
    });
    return { total: items.length, soon: soon, closed: closed, final: final };
  }

  // Plain words for "how long left", for the page and screen readers.
  function phrase(item, now) {
    if (!isReturnable(item)) return "Final sale, can't be returned";
    var d = daysLeft(item, now);
    if (d == null) return "No return date yet";
    if (d < 0) return d === -1 ? "Closed yesterday" : "Closed " + (-d) + " days ago";
    if (d === 0) return "Last day is today";
    if (d === 1) return "Last day is tomorrow";
    return d + " days left";
  }

  // The statutory cooling-off cancellation for an online change-of-mind return
  // (UK Consumer Contracts Regulations 2013; EU Consumer Rights Directive).
  // Inside the cooling-off window the trader cannot charge a restocking or admin
  // fee, and must refund the original STANDARD delivery charge (not a premium
  // upgrade); you only pay to post it back. After you tell them you're
  // cancelling, you then have a further 14 days to send the goods back
  // (reg.35), so the outer send-back date is 14 days past the last cancel day.
  // Returns null when the item isn't an online change-of-mind return in a region
  // with a cooling-off right (so a faulty item or a US order is left to the
  // other rules).
  function coolingOff(item, now) {
    if (!item || !item.online || item.kind === "faulty") return null;
    var floor = (RIGHTS[region(item)] || {}).coolingOff || 0;
    if (!floor) return null;
    var start = windowStart(item);
    if (start == null) return null;

    var nowD = startOfDay(now == null ? Date.now() : now);
    var cancelBy = start + floor * DAY;              // last day to cancel
    var within = nowD <= cancelBy;
    var daysToCancel = Math.round((cancelBy - nowD) / DAY);
    var sendBackBy = cancelBy + floor * DAY;         // outer bound: cancel late, return within 14

    var paidDelivery = numMoney(item.deliveryPaid);
    var standard = numMoney(item.deliveryStandard);
    var deliveryRefund = 0;
    if (within && paidDelivery != null) {
      deliveryRefund = standard != null ? Math.min(paidDelivery, standard) : paidDelivery;
    }

    var rf = restockingFee(item);
    var shopFee = rf && rf.amount != null ? rf.amount : 0;
    var feeUnlawful = within && shopFee > 0;         // can't be charged inside the window
    var price = numMoney(item.price);
    var goodsRefund = price == null ? null : (within ? price : (rf && rf.refund != null ? rf.refund : price));
    var refund = goodsRefund == null ? null : round2(goodsRefund + deliveryRefund);

    return {
      region: region(item), floor: floor, within: within,
      cancelBy: cancelBy, daysToCancel: daysToCancel, sendBackBy: sendBackBy,
      deliveryRefund: round2(deliveryRefund), feeUnlawful: feeUnlawful,
      shopFee: round2(shopFee),
      goodsRefund: goodsRefund == null ? null : round2(goodsRefund),
      refund: refund
    };
  }

  return {
    DAY: DAY,
    presets: PRESETS,
    rights: RIGHTS,
    coolingOff: coolingOff,
    holiday: HOLIDAY,
    startOfDay: startOfDay,
    windowStart: windowStart,
    deliveryAnchored: deliveryAnchored,
    rightsFloor: rightsFloor,
    effectiveDays: effectiveDays,
    rightsWin: rightsWin,
    holidayDeadline: holidayDeadline,
    holidayWins: holidayWins,
    lastDay: lastDay,
    daysLeft: daysLeft,
    bucket: bucket,
    rank: rank,
    summary: summary,
    phrase: phrase,
    isReturnable: isReturnable,
    restockingFee: restockingFee,
    priceAdjustment: priceAdjustment
  };
});
