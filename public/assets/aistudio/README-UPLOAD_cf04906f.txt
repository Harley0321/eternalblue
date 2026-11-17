PROFIT & DISCOUNT UPDATE (v21) - no stored data changed; only how profit is worked out on screen.
- The Senior/PWD discount is now taken off the eligible items only when computing profit (before, it was spread over every item, which overstated profit on eligible items and understated it on others). Sale totals and receipts are unchanged.
- Profit ranking (ABC) uses the same method, so it adds up to the Profit card.
- "Discounts Given" now shows its parts: SC/PWD and Wholesale.
Cache name v21.

SALES UPDATE (v20) - no sale, product or setting is changed; only how Sales is shown and calculated on screen.
- Much faster: all-time view with 3,600 sales went from ~370 ms to ~15 ms. The list shows 100 sales at a time with a "Show more" button.
- Fixed the trend arrow: Today / Last 7 days are compared with the same elapsed time of the previous period, not a full day (it used to show a false drop in the morning).
- Fixed the Sales-by-Hour bars not drawing on some screens.
- Profit card now says how many sold items have no capital and are not counted.
- New periods: This month and Last month.
- Z-Read asks for confirmation first (it adds 1 to the Z counter and cannot be undone).
- Z-Read / X-Read: voided sales now appear below NET SALES as "not counted" so the math reads clearly.
Cache name v20.

READABILITY UPDATE (v19): the Retail/Wholesale hint and the wholesale notes on basket lines are now black and bold. No data changed. Cache name v19.

SCANNER UPGRADE (v18) - no products, sales, held orders or settings are changed. One new small key (omnimart_ph_scanprefs_v1) remembers only the Multi ON/OFF choice.
- Scan list inside the scanner: shows basket count and total, the last scanned items with - / + buttons, "Undo last" and a Checkout button, so you never leave the camera.
- Different sounds: high beep = added, mid tone = barcode not in your products, low double buzz = out of stock or expired (also vibrates).
- Pinch to zoom and tap-to-focus (with a focus ring). The Zoom button still works.
- "Too dark" hint with a pulsing Flash button when the light is poor.
- Camera recovers by itself if another app takes it, the picture freezes, or the app returns from the background (screen stays awake again too).
- Photo button: take or pick a picture of a barcode if live scanning is blocked or the light is bad.
- Hardware scanners / typed codes that are not in your products now show a warning instead of nothing.
- Same item must leave the view for about 1.5 sec before it counts again (use + in the list for more).
- Fixed: the v17 security policy could block the WebAssembly scanner (iPhone/iPad) and the Tailwind CDN. It now allows them.
After upload: Settings > Check for Updates (cache v18). Keep the same web address.

SECURITY UPDATE (v17) - no products, sales, held orders or settings are changed, moved or reset. Same storage keys.
- Manager PIN is now stored as a salted hash, not plain text. Your current PIN keeps working and is upgraded automatically the first time you enter it.
- Wrong PIN tries are limited: 5 wrong tries lock PIN entry for 30 sec, then longer (max 15 min).
- New PINs cannot be easy ones (1234, 0000, 1111, 123456...). If your current PIN is easy, Settings shows a warning to change it.
- No default PIN any more: a device with no PIN asks you to create one.
- Backups no longer contain the PIN, and restoring a backup never replaces the PIN on the device. Restore also rejects damaged files.
- Settings locks itself after 5 minutes of no touch.
- Fixed a hole where a crafted product ID / receipt number in a restored file could run code from the buttons.
- Sales CSV export is protected against Excel formula injection.
- Added a content security policy, a _headers file (upload it with the other files) and the same headers in the generated Worker.
- Service worker only touches this site and the known library hosts (cache name v17).
After upload: Settings > Check for Updates. Keep the same web address so the saved data stays visible.

SENIOR / PWD DISCOUNT UPDATE (v16) - no existing data is changed.
- The 5% now applies only to items marked as basic necessities / prime commodities, not the whole basket.
- NEW Stock > "SC/PWD Items" screen: tick which items qualify, then Save. Until you save, the app uses a suggestion based on
  the item name (e.g. rice, canned fish, milk, bread, noodles, coffee, cooking oil, soap = yes; soft drinks, chips, biscuits = no).
  Please review this list once - the suggestion is only a guess.
- The product form has a matching checkbox. The flag is saved on a product only when you save that product or the review screen.
- Discount limit per sale (default P125): Settings > Inventory & Scanner. The weekly total across visits is NOT tracked.
- The Senior/PWD ID number is required at checkout when a discount is given; it is printed on the receipt and saved on that sale.
- The basket shows a warning when fewer than 4 kinds of eligible items are bought (warning only, it does not block the sale).
- Sales without a Senior/PWD discount are saved exactly as before. Old sales are not changed.
Confirm the current rules with DTI or your accountant: https://www.dti.gov.ph

CALCULATION ACCURACY UPDATE (v15) - no data is changed, migrated or reset. Same storage keys, same fields.
- All peso maths now runs in whole centavos: basket totals, wholesale savings, Senior/PWD discount, cash change, receipts.
  (Old code could be 1-2 centavos off in about 1 of every 1,000 baskets and stored change such as 0.09999999999999432.)
- A sale is blocked if the basket quantity is more than the stock now on hand (old code sold it and silently set stock to 0).
- Cash tendered is checked to the centavo; nonsense values are refused. Change is stored exactly.
- A weight that rounds to 0 kg (e.g. 0.0004) can no longer add a free line.
- Profit no longer counts items that have no capital as 100% profit (it only counts items with known capital).
- Product form: price must be above zero; capital/wholesale/stock cannot be negative; prices are saved to the centavo.
- Stock value, capital in stock, reorder cost and voided totals are summed without rounding drift.
- Voiding a sale adds stock back as a number even if an old record stored stock as text.
Products, sales, held orders and settings already on your devices are not touched. Old receipts are not recalculated.

OMNIMART POS - OFFLINE AI ASSISTANT UPDATE (static hosting, no server needed)

UPLOAD to your static host, replacing the old files at the SAME address you use now:
  index.html, sw.js, manifest.json, icon.svg, icon-192.png, icon-512.png

YOUR DATA: products, sales, held orders and settings are stored on each device under the same keys as before.
Nothing is migrated, reset or overwritten. The assistant only reads them and creates no storage of its own.
IMPORTANT: keep the same web address. A different address shows an empty app (data is per address).
Tip: Settings > Download Backup on each device before updating.

ASSISTANT (v3, English + Tagalog optimized): fuzzy product search (typos like "mlio", "cocacola"), follow-ups ("yesterday?"), compare, slow movers, busiest hours, per-product sales, smart suggestion buttons.
Understands English and Tagalog: sales today/yesterday/week/month, low stock and reorder, expiring items,
best sellers, top profit items, price/stock of a product, inventory value, voided sales.

AFTER UPLOAD: open the app, then Settings > Check for Updates (cache name is now v16).

WHAT'S NEW IN THE ASSISTANT (v3):
- Answers in the language you type: English, Tagalog or Taglish (e.g. "magkano benta ngayon", "ilan pa stock ng itlog").
  Chips and follow-up buttons switch language too.
- Understands everyday Tagalog and shorthand: kahapon, ngayong linggo/buwan, nakaraang 7 araw, "3 araw", kita, tubo, paubos, paso na,
  hindi mabenta, pinaka-busy na oras, mgkano, ngyon, pls, etc.
- Product names in Tagalog (itlog, asukal, bigas, manok, baboy, gatas, kape...) and typos ("mlio", "cocacola") find the right item.
- Small talk (hello, salamat, thanks, ok) and a clearer message when a product is not found.
- Extra: daily average for 7/30-day sales, any "N days" period, "wala na ba ang coke?" style stock questions.

PRICING UPDATE (v13): Retail / Wholesale is back and chosen by the cashier - nothing switches to wholesale automatically.
- Price switch above the product grid sets the price type for items you add next; each basket line also has its own Retail / Wholesale buttons.
- Wholesale is only applied when the item reaches its Wholesale Min Qty, has a real wholesale discount, and the wholesale price is not below capital. Otherwise the line is charged retail (the basket tells you why).
- Totals are rounded to the centavo per line, matching the receipt. Stored products, sales, held orders and settings are unchanged (same keys and fields).
