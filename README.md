# Tarnol Filling Station ERP

Static web app (GitHub Pages) + Firebase (Auth + Firestore). No server, no build step.

## What is automatic
- **Meter readings → everything.** Opening reading is pulled from the previous closing; litres, amount, cash, credit, bank, wallet, short/excess are calculated.
- **FIFO costing.** Each purchase is a batch. Every sale/oil sale/loss consumes the oldest batch first. Stock value, cost of goods sold, gross profit per shift/day/period are re-computed from the full ledger on every change, so back-dated purchases or edits re-flow automatically. A purchase entered *after* a sale that outran stock automatically absorbs that shortfall.
- Customer & supplier ledgers, cash / bank / wallet book, day book, salary & advances, P&L, dashboard, low/negative stock warnings.

## Set-up (about 10 minutes)
1. **Firebase**: console.firebase.google.com → Add project → *Build → Firestore Database* → Create (production mode) → *Build → Authentication → Sign-in method → Email/Password → Enable* → add your users under *Users*.
2. *Project settings → Your apps → Web (</>)* → copy the config into `js/firebase-config.js`.
3. *Firestore → Rules* → paste `firestore.rules`, put **your allowed e-mail addresses** in the list, Publish. (This is what keeps strangers out – do not skip.)
4. **GitHub**: create a repo, upload all files (keep `.nojekyll`), *Settings → Pages → Deploy from branch → main / root*.
5. Firebase *Authentication → Settings → Authorized domains* → add `YOURNAME.github.io`.
6. Open the site, sign in, go to **Settings → Load Tarnol starter data** (nozzles, items, customers, employees, opening oil stock from your Excel), set opening cash, then enter purchases (opening fuel stock = a purchase with supplier `OPENING`).

Without a Firebase key the app runs in **demo mode** (data only in your browser) – handy for trying it.

## Daily routine
Daily Entry (closing readings, oil, credit sales, bank/wallet) → Save. Enter purchases, expenses, receipts, supplier payments as they happen. Use Stock → *dip check* to post tank gain/loss.

## Notes / assumptions
- Testing litres are entered as a positive number and deducted from sale (they go back to the tank).
- Credit sales are part of the shift’s sales; customer incentive/litre reduces revenue and the customer’s balance.
- Owner drawings are not treated as expenses. Salaries count as expense; advances do not.
- Opening oil stock is loaded at cost 0 – edit those purchases (supplier OPENING) to set a real cost.
- Firestore keeps an offline cache, so the app keeps working briefly without internet and syncs later.

## Offline use
- The app is an installable PWA (browser menu → *Install app* / *Add to Home screen*). After the **first online visit** it opens with no internet.
- Firestore offline cache: you can keep entering shifts, purchases, expenses etc. offline; they save on the device and sync automatically when the internet returns (header shows “○ offline”). Stay signed in – you cannot sign in for the first time offline.
- Keep the same browser/device for offline entry. Two devices editing the same shift offline: the last one to sync wins.
- When you upload a new version to GitHub, change `VERSION` in `sw.js` (e.g. `tarnol-v2`) so devices refresh their cached copy.

## Opening the app
- `index.html` now works by double-clicking (demo mode, data in that browser only). For real use with Firebase, open it from your GitHub Pages address – sign-in and the offline install do not work from a `file://` page.
- The app runs from `js/app.bundle.js`. If you edit any other `.js` file, run `./build.sh` (needs Node.js) to rebuild it, and bump `VERSION` in `sw.js`.

## Charts & Sales P&L
- **Dashboard** and **Day Book** have charts (works offline, no external library). Dashboard has Daily / Weekly / Monthly / Yearly tabs: sales vs profit, litres per fuel, cost structure, margin %, sales mix, payment split, profit per fuel and per oil, expenses, top customer balances.
- **Sales P&L (by product)**: PETROL, DIESEL and every oil item one by one – litres, average sale rate, average FIFO cost, sales, FIFO cost, profit, margin, profit per unit, plus the FIFO cost layers used and a by-employee view. Presets: today / week / month / year / custom dates.
