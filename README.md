# EternalBlue POS (Android)

Offline-first Philippine Supermarket & Sari-Sari Point of Sale, Inventory, Barcode Scanner, Operations & Suki Ledger, and Sales Analytics application built with **Kotlin**, **Jetpack Compose (Material 3)**, **SQLite**, **CameraX + ML Kit**, and **ZXing**.

## Core Features
- **Point of Sale (POS)**: Search & barcode scan checkout, category filter chips, Retail & Wholesale price tiers with below-capital guard, PH SC/PWD 5% discount with configurable weekly cap, Hold/Recall orders, and multi-method checkout (Cash with quick bills, GCash / QR Ph dynamic CRC-16 EMVCo QR, Card, Split, and Utang).
- **Inventory & Audit**: Clickable Stock Health KPIs (All, Low, Out, Fast-Low, Expiring), Batch Receive & Physical Cycle Count, Stock Movement Log, Product Add/Edit with EAN-13 generator, and Quick Stock Adjustment.
- **Operations & Suki (`Ops & Suki`)**: Suki Customer & Utang Ledger with SMS reminders, Bulk-to-Tingi Repack Rules with weighted-average capital calculation, Shift & Cash Drawer (`Gastos` / `Float` / `Drop`), GCash/Maya/E-Load/Bills Pay fee logger, and Thermal Receipt / Shelf Label CSV export.
- **Sales Analytics & Security**: Net Revenue & Profit KPIs, 7-day daily sales trend, PH Cash Denomination Counter, Void Receipt with stock restoration, PBKDF2-HMAC-SHA256 Manager PIN lock, hash-chained security audit log, JSON backup export, and offline bilingual (EN / Tagalog) Store AI.

## Build
```bash
gradle assembleDebug
```
Output APK: `app/build/outputs/apk/debug/app-debug.apk`
