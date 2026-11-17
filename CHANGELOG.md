# Changelog

All notable system updates and configuration changes for **OmniMart PH POS** are documented here.

## [2.3.0] (`v2.3.0-stable`) — 2026-11-17

### Upgraded & Optimized (Stock Intelligence & Operations)
- **30-Day Sales Velocity, Days of Cover & Interactive KPIs (`src/utils/posMath.ts`, `InventoryView.tsx`)**: Added O(N) Map-indexed velocity & days-of-cover calculations (`computeProductVelocities`, `computeStockHealthSummary`), clickable KPI drill-down filters (Missing Capital, Below Capital, Fast-Low Cover, Dead Stock, Low Stock, Out of Stock), and new cover/velocity/value sorting plus Est. Potential Gross Profit.
- **Batch Receive & Physical Shelf Cycle Count (`BatchStockModal.tsx`, `applyBatchStockUpdates`)**: Added a unified dual-mode batch workflow (`Batch Receive +Qty` and `Physical Audit = Count`) with barcode/name search, +/- steppers, supplier/DR note, optional weighted-average cost blending (`computeWeightedAverageCapital`), and atomic `StockLogEntry` generation.
- **Stock History Ledger & Safe CSV Import (`StockLogModal.tsx`, `CsvStockImportModal.tsx`)**: Surfaced searchable/filterable `Stock Movement History` directly in the Stock toolbar and added RFC-4180 CSV Import with BOM/quoted-comma parsing and row-by-row `Update`/`New`/`Skip` preview (`Add New + Update Matched` or `Add New Only`).
- **Quick Adjustments, Reorder Receiving & Product Pricing Helpers (`StockAdjustModal.tsx`, `ReorderModal.tsx`, `ProductModal.tsx`)**: Added `= Set Count` physical count mode, quick unit quantity chips, weighted-avg capital blending, one-click `Receive All in Batch` inside Reorder Suggestions, valid EAN-13 store barcode generation, and `+15%`–`+30%` markup presets.

### Preserved
- All mobile/tablet `localStorage` data (`omnimart_ph_products_v1`, `omnimart_ph_sales_v1`, `omnimart_ph_held_v1`, `omnimart_ph_settings_v1`, `omnimart_ph_pinlock_v1`, `omnimart_ph_scanprefs_v1`) remains 100% untouched.

## [2.2.0] (`v2.2.0-stable`) — 2026-11-17

### Upgraded & Optimized
- **Off-Main-Thread ZXing-C++ WASM Web Worker (`src/workers/barcodeWorker.ts`)**: Upgraded to the latest `zxing-wasm` (`ZXing-C++ 3.1.7` compiled WebAssembly) with `zxing_reader.wasm` bundled locally (`?url` import + Workbox precaching) for instant offline decoding and zero external CDN reliance.
- **Hybrid Hardware + WASM Scanner Engine (`src/utils/scannerEngine.ts`)**: Pairs OS/hardware `BarcodeDetector` acceleration with zero-copy `Transferable` Web Worker scanning (`ROI` fast center-crop cycles + periodic full-frame denoised/downscaled passes + inverted-reflectance 1D/2D fallback) and automatic HTML canvas fallback.
- **Upgraded Camera & Scan UI (`BarcodeScannerModal.tsx`)**: Pre-warms WASM engine on idle, requests `1080p` continuous-autofocus/exposure, selects the primary rear lens over ultra-wide/macro sensors with a Switch Camera toggle, renders a live emerald corner-polygon detection overlay, and decouples camera lifecycle from cart updates so continuous multi-scan never restarts the video stream.
- **Expanded Barcode Rules & Hardware Wedge (`src/utils/posMath.ts`, `src/App.tsx`)**: Added GS1 UPC-E -> UPC-A expansion (`expandUpcE`), normalized 2D symbology validation (`QRCode`, `DataMatrix`, `DataBar`), single-submit manual barcode entry (`evaluateScanCandidate`), and GS1 GTIN extraction + fast-burst `Tab` suffix support for USB/Bluetooth wedge scanners.

### Preserved
- All mobile/tablet `localStorage` data (`omnimart_ph_products_v1`, `omnimart_ph_sales_v1`, `omnimart_ph_held_v1`, `omnimart_ph_settings_v1`, `omnimart_ph_pinlock_v1`, `omnimart_ph_scanprefs_v1`) remains 100% untouched.

## [2.1.0] — 2026-11-17

### Added
- **Daily Sales Trend Chart (`SalesView`)**: Added a responsive `recharts` `AreaChart` card displaying rolling last-7-days net sales performance (centavo-accurate aggregation via `computeLast7DaysNetSales` & `summarize7DayTrend`, excluding voided receipts) with 7-day total, daily average, peak day highlight, and custom peso tooltip.
- **Unit Tests**: Added `computeLast7DaysNetSales` and `summarize7DayTrend` test coverage in `src/utils/posMath.test.ts`.

### Preserved
- All mobile/tablet `localStorage` keys and receipt data remain 100% untouched.

## [2.0.0] (`v2.0.0-stable`) — 2026-11-17

### Added
- **Modular React + TypeScript + Vite PWA Architecture** with offline Workbox caching (`vite-plugin-pwa`) including bundled barcode WASM assets.
- **POS Checkout & Split Payment**: Retail/Wholesale tier toggle with below-capital safety guard, kg decimal weight modal, Senior/PWD 5% discount on eligible basic necessities with configurable cap and required ID validation, Cash/GCash/Card/Split payment, custom-labeled Hold/Recall orders, and `80mm`/`58mm` thermal receipt preview + copy text.
- **Barcode Scanner**: Native `BarcodeDetector`, bundled `barcode-detector` WASM ponyfill, `html5-qrcode` fallback, photo upload scanning, torch toggle, pinch/button zoom, tap-to-focus, low-light prompt, multi-scan session strip (`-`/`+`/Undo/Checkout), and hardware keyboard-wedge support.
- **Stock & Analytics**: 6 inventory KPIs (incl. GMROI 30d), Quick Stock Adjustment modal (`± Stock`) with additive audit log (`omnimart_ph_stocklog_v1`), Reorder Suggestions calculator, SC/PWD bulk eligibility review, Sales period comparisons, Hourly/Daily charts, ABC profit ranking, PIN-protected Void with stock restoration, X-Read & Z-Read, and CSV exports.
- **Security & Offline Analyst**: Salted PBKDF2-SHA256 Manager PIN hashing (auto-upgrades legacy plain-text PINs on unlock), 5-attempt exponential lockout, 5-minute Settings auto-lock, and on-device English + Tagalog/Taglish `OfflineAssistant`.
- **Configuration Version Control & Rollback**: Additive `omnimart_ph_config_history_v1` tracking settings changes and manual checkpoints with one-click config rollback in Settings, plus Git repository tracking and `VERSIONING.md`.

### Preserved (100% Backward-Compatible)
- All existing `localStorage` keys (`omnimart_ph_products_v1`, `omnimart_ph_sales_v1`, `omnimart_ph_held_v1`, `omnimart_ph_settings_v1`, `omnimart_ph_pinlock_v1`, `omnimart_ph_scanprefs_v1`) and `omnimart-ph-pos` JSON backup format remain intact.
