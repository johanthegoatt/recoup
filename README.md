# Recoup

Don't miss a return window.

Recoup keeps a short list of the things you've bought and works out the **last day you can take each one back**. It counts down the days, lines the list up so the ones running out of time sit on top, and knows the return rights the law gives you on top of whatever the shop's policy says. You can drop any item's last day straight into your calendar.

Live: **[recoup.johanthegoat.xyz](https://recoup.johanthegoat.xyz)**

## Why

Return windows are short and getting shorter. A Salesforce review of 350 retailers put the average at 30 days in the US and 14 in Europe, and most UK shops sit at 28 to 30 days. Miss the window and the money's gone. People lose receipts, forget when they bought something, and don't know that the law often gives them longer than the sign at the till.

Recoup fixes the "when is the last day?" part: type what you bought and when, pick the window (or let your legal right set it), and it does the counting.

## What it does

- **Counts down every return window** and sorts by what closes first, so the urgent ones are always on top.
- **Knows your rights.** A short shop window can't take away a legal right, so Recoup uses the longer of the two:
  - **UK, faulty:** 30-day short-term right to reject for a full refund (Consumer Rights Act 2015, s.22).
  - **UK and EU, bought online:** at least 14 days to change your mind (Consumer Contracts Regulations 2013; EU Consumer Rights Directive 2011/83/EU).
  - **US:** no federal right, so it follows the shop's policy.
- **Flags what can't go back.** Mark a clearance or "final sale" item and Recoup shows it as non-returnable instead of counting down a window it doesn't have, so it never sits on the list pretending you can still take it back.
- **Shows the real refund.** Many shops keep a restocking fee on returns (commonly 10-15% on opened electronics and large items). Type what you paid and the fee, and Recoup shows what you'd actually get back, not the sticker price.
- **Adds to your calendar.** One tap downloads an `.ics` with the last day and a reminder the day before.
- **Stays on your device.** The list lives in your browser. Nothing is uploaded.
- **Fetch**, a dog who keeps an eye on the dates, points out what's closing soon, and gives a tip when you tap him.

## How the dates are worked out

Everything is counted in whole days from the day you got the item, so the time of day never changes the answer. The deadline is the purchase day plus the number of days you have, which is the longer of the shop's window and any legal right for your region and reason (faulty vs change of mind, in store vs online).

The quick-pick windows (14, 28, 30, 60, 90 days) are typical shop policies, not the law. Use the exact number from your own receipt when you have it. Recoup is a guide, not legal advice.

## Run it

It's plain HTML, CSS and JavaScript with no build step.

```bash
# serve the folder any way you like, e.g.
npx serve .
```

Tests cover the date and rights logic:

```bash
npm test   # runs node --test
```

## Layout

- `src/engine.js` - all the date and rights logic, as pure functions (no page code).
- `src/app.js` - the form, the list, filters, the example and the calendar export.
- `src/fetch.js` - Fetch the dog.
- `test/engine.test.js` - tests for the engine.

## Sources

- Salesforce return-window review (US 30 days, EU 14), reported by Digital Commerce 360.
- UK Consumer Rights Act 2015, section 22 (short-term right to reject).
- UK Consumer Contracts Regulations 2013 (14-day cancellation on distance sales).
- EU Consumer Rights Directive 2011/83/EU (14-day right of withdrawal).

## Licence

MIT.
