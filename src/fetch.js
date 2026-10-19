// Fetch, the little dog who keeps an eye on your return dates. Fetch watches
// your pointer (or the box you're typing in on a phone), gives a tip when
// tapped, looks worried when a window is about to close, wags when everything
// has plenty of time, and tosses a paper receipt about if you tap five times
// fast. Everything Fetch says goes through the bubble's live region, so a
// screen reader hears it too.
(function () {
  "use strict";
  var btn = document.getElementById("fetch");
  var bubble = document.getElementById("fetch-bubble");
  var dock = document.getElementById("fetch-dock");
  var hide = document.getElementById("fetch-hide");
  if (!btn) {
    window.Fetch = { context: function () {}, react: function () {}, say: function () {} };
    return;
  }

  var still = matchMedia("(prefers-reduced-motion: reduce)");
  var baseMood = "sleepy", tipKey = "empty";
  var flashing = false, flashTimer = null, bubbleTimer = null, tapTimes = [], tipIndex = {};
  var greeted = false, cheered = false;

  var TIPS = {
    empty: [
      "Hi, I'm Fetch! Add something you bought and I'll tell you the last day to take it back.",
      "Not sure how long the shop gives you? Tap a window button, or type the days from your receipt.",
      "Bought it online in the UK or EU? Tick that and you get at least 14 days to change your mind.",
      "Tap Try an example to see how the list works."
    ],
    some: [
      "The ones with a red edge are nearly out of time. Work down from the top.",
      "If it's faulty, say so. In the UK that's a 30-day right, whatever the shop's sign says.",
      "Tap Add to calendar on any item and I'll put the last day in your phone."
    ],
    worried: [
      "One of these is closing soon. The top of the list is the one to deal with first.",
      "Still in time? Don't leave it. Shops are quick to say the window has passed.",
      "Keep the receipt or the order email with you when you go back."
    ],
    fresh: [
      "Nice, everything's got time. I'll bark when one gets close.",
      "All good for now. I'm keeping watch."
    ]
  };

  function setMood(m) { btn.setAttribute("data-mood", m); }

  function say(text, ms) {
    if (dock.classList.contains("tucked")) return;
    bubble.textContent = text;
    bubble.classList.remove("pop");
    void bubble.offsetWidth;
    bubble.classList.add("pop");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { bubble.textContent = ""; }, ms || 7000);
  }

  function flash(m, ms) {
    setMood(m);
    flashing = true;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { flashing = false; setMood(baseMood); }, ms || 1400);
  }

  function play(cls) {
    if (still.matches) return;
    btn.classList.remove("hop", "wag");
    void btn.offsetWidth;
    btn.classList.add(cls);
  }
  btn.addEventListener("animationend", function () { btn.classList.remove("hop", "wag"); });

  // Called by the app whenever the list changes. s is the engine summary.
  function context(s) {
    var had = cheered;
    if (!s || s.total === 0) { tipKey = "empty"; baseMood = "sleepy"; cheered = false; }
    else if (s.closed > 0 || s.soon > 0) { tipKey = "worried"; baseMood = "worried"; cheered = false; }
    else { tipKey = "fresh"; baseMood = "happy"; }

    if (!flashing) setMood(baseMood);

    if (tipKey === "fresh" && !had && s && s.total > 0) {
      cheered = true;
      play("wag");
      flash("party", 1500);
      say("All of these have time to spare. I'll keep watch.");
    }
    if (!greeted) {
      greeted = true;
      setTimeout(function () {
        if (!bubble.textContent && baseMood === "sleepy") say(TIPS.empty[0], 9000);
      }, 900);
    }
  }

  function nextTip() {
    var list = TIPS[tipKey] || TIPS.some;
    var i = tipIndex[tipKey] || 0;
    tipIndex[tipKey] = (i + 1) % list.length;
    return list[i];
  }

  btn.addEventListener("click", function () {
    if (dock.classList.contains("tucked")) {
      dock.classList.remove("tucked");
      remember(false);
      say("I'm back! Tap me any time for a tip.");
      play("hop");
      return;
    }
    var now = Date.now();
    tapTimes = tapTimes.filter(function (t) { return now - t < 1600; });
    tapTimes.push(now);
    if (tapTimes.length >= 5) {
      tapTimes = [];
      play("wag");
      flash("party", 1200);
      toss(10);
      say("Fetch! Go on then.");
      return;
    }
    play("hop");
    if (baseMood === "sleepy") flash("happy", 1500);
    say(nextTip());
  });

  hide.addEventListener("click", function () {
    dock.classList.add("tucked");
    bubble.textContent = "";
    remember(true);
  });

  function remember(tucked) {
    try { localStorage.setItem("recoup.fetchTucked", tucked ? "1" : ""); } catch (e) {}
  }
  try { if (localStorage.getItem("recoup.fetchTucked")) dock.classList.add("tucked"); } catch (e) {}

  // Eyes follow the pointer, a few pixels at most.
  var pupils = btn.querySelectorAll(".f-pupil");
  var target = null, frame = 0;
  function look() {
    frame = 0;
    if (!target) return;
    var r = btn.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height * 0.42;
    var dx = target.x - cx, dy = target.y - cy;
    var d = Math.hypot(dx, dy) || 1;
    var reach = Math.min(1, d / 200);
    var x = (dx / d) * 3 * reach, y = (dy / d) * 3 * reach;
    pupils.forEach(function (p) { p.style.transform = "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px)"; });
  }
  window.addEventListener("pointermove", function (ev) {
    target = { x: ev.clientX, y: ev.clientY };
    if (!frame) frame = requestAnimationFrame(look);
  }, { passive: true });
  document.addEventListener("focusin", function (ev) {
    var r = ev.target.getBoundingClientRect && ev.target.getBoundingClientRect();
    if (!r || ev.target === btn) return;
    target = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    if (!frame) frame = requestAnimationFrame(look);
  });

  (function blink() {
    setTimeout(function () {
      if (baseMood !== "sleepy" && !document.hidden) {
        btn.classList.add("blink");
        setTimeout(function () { btn.classList.remove("blink"); }, 140);
      }
      blink();
    }, 2600 + Math.random() * 3800);
  })();

  // A few paper receipts flutter out from Fetch.
  function toss(n) {
    if (still.matches) return;
    var r = btn.getBoundingClientRect();
    for (var i = 0; i < n; i++) {
      var s = document.createElement("span");
      s.className = "scrap";
      s.textContent = "🧾";
      s.style.left = r.left + r.width * (0.2 + Math.random() * 0.6) + "px";
      s.style.top = r.top + "px";
      s.style.fontSize = (12 + Math.random() * 10) + "px";
      document.body.appendChild(s);
      var dx = (Math.random() - 0.5) * 160, dy = 120 + Math.random() * 180;
      var a = s.animate([
        { transform: "translate(0,0) rotate(0)", opacity: 1 },
        { transform: "translate(" + dx + "px," + dy + "px) rotate(260deg)", opacity: 0 }
      ], { duration: 1500 + Math.random() * 800, easing: "ease-in" });
      a.onfinish = (function (node) { return function () { node.remove(); }; })(s);
    }
  }

  var lastFocus = "";
  function react(what) {
    var k = String(what);
    if (k.indexOf("focus:") === 0) {
      if (k === lastFocus) return;
      lastFocus = k;
      if (k === "focus:faulty") say("If the item's faulty, pick that. The law gives you longer than a change-of-mind return.", 5000);
      if (k === "focus:online") say("Tick this for anything bought online. In the UK and EU that adds a 14-day right to change your mind.", 5000);
      return;
    }
    switch (k) {
      case "example": play("hop"); say("Here's a few buys on the go. See how the red ones sit at the top?"); break;
      case "added": play("hop"); if (baseMood !== "worried") flash("happy", 1200); say("On the list. I've slotted it in by the last day to take it back."); break;
      case "added-soon": play("hop"); flash("worried", 1500); say("Added, and that one's close. I've put it near the top."); break;
      case "done": play("hop"); flash("party", 1200); toss(4); say("Sorted. One less to chase."); break;
      case "calendar": say("Saved. Open that file and the last day lands in your calendar."); break;
      case "cleared": say("Cleared the closed ones. Tidier now."); break;
    }
  }

  window.Fetch = { react: react, context: context, say: say };
})();
