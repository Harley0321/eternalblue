# EternalBlue POS (Web / React)

Offline-first Philippine Supermarket & Sari-Sari Point of Sale, Inventory, Barcode Scanner, Operations & Suki Ledger, and Sales Analytics application built with **React**, **TypeScript**, **Vite**, **Tailwind CSS**, **ZXing (`@zxing/browser`)**, **QRCode**, and **Web Crypto API**.

## Core Features
- **Point of Sale (POS)**: Search & barcode scan checkout (live camera, photo, manual entry, ZXing fallback, and continuous multi-item scanning), category filter chips, Retail & Wholesale price tiers with below-capital guard, PH SC/PWD 5% discount with configurable weekly cap, Hold/Recall orders, Web Audio API scanner beep, and multi-method checkout (Cash with quick bills, GCash / QR Ph dynamic CRC-16 EMVCo QR, Card, Split, and Utang).
- **Inventory & Audit**: Clickable Stock Health KPIs (All, Low, Out, Fast-Low, Expiring), Batch Receive & Physical Cycle Count, Stock Movement Log, Product Add/Edit with EAN-13 generator, and Quick Stock Adjustment.
- **Operations & Suki (`Ops & Suki`)**: Suki Customer & Utang Ledger with SMS reminders, Bulk-to-Tingi Repack Rules with weighted-average capital calculation, Shift & Cash Drawer (`Gastos` / `Float` / `Drop`), GCash/Maya/E-Load/Bills Pay fee logger, and Thermal Receipt formatting (58mm/80mm) & Shelf Label CSV export.
- **Sales Analytics & Security**: Net Revenue & Profit KPIs, 7-day daily sales trend, PH Cash Denomination Counter, Void Receipt with stock restoration, PBKDF2-HMAC-SHA256 Manager PIN lock, hash-chained security audit log, JSON backup export/restore, and offline bilingual (EN / Tagalog) Store AI.
- **Resilient Local Persistence**: Browser `localStorage` persistence with primary + shadow (`__prev`) recovery, corrupt backup preservation, pinned store identity, a visible warning when device storage rejects a save, and a setting to request persistent browser storage. PWA updates wait for the user to apply them so an active sale is not unexpectedly interrupted.

## Scripts
```bash
npm install
npm run dev      # Starts Vite dev server on http://0.0.0.0:3000
npm run lint     # Runs TypeScript type checking (tsc --noEmit)
npm test         # Runs POS calculations and device-isolation tests
npm run build    # Builds production bundle into dist/
```

## Android APK updates
When a version change reaches `main` (or a `v*` tag is pushed), GitHub Actions builds an APK artifact. It publishes a GitHub Release only when all four signing secrets are configured, so Android can update the existing app:

- `ANDROID_KEYSTORE_BASE64`: Base64-encoded original signing keystore.
- `ANDROID_KEYSTORE_PASSWORD`: Keystore password.
- `ANDROID_KEY_ALIAS`: Signing key alias.
- `ANDROID_KEY_PASSWORD`: Signing key password.

Without those secrets, Actions builds a debug-signed APK artifact and skips GitHub Release publishing. Debug APKs may require uninstalling the previous app and cannot guarantee in-place updates across builds.

On desktop, the app checks GitHub Releases on launch and when it returns to the foreground. Android requires the user to confirm APK installation on the device; it cannot silently install updates.

Manual release checks, APK downloads, and the PWA update prompt are hidden on mobile and tablet devices. The offline service worker remains enabled for app-shell caching.
