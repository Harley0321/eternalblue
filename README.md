# EternalBlue POS (Android)

Native Android Point of Sale, Inventory, Store Operations, and Sales Analytics application rewritten from the EternalBlue POS web PWA in **Kotlin**, **Jetpack Compose**, and **Material Design 3**.

## Features Ported

- **Point of Sale (`POS`)**: Fast SKU grid & search, `5*code` quantity-multiplier and `qty@price` barcode entry, retail/wholesale tier auto-switching, weight-based (`kg`) item entry, basket hold/recall, and quick checkout.
- **Checkout & Receipts**: Cash, GCash, Maya, Card, Bank Transfer, and Utang split/payment flows; EMVCo / PH QR payload rendering; Senior Citizen / PWD 20% discount & VAT-exemption handling; receipt preview, Android print dialog, and Bluetooth ESC/POS thermal printing.
- **Barcode & QR Scanning**: CameraX live preview + ML Kit barcode scanning, torch toggle, Rapid Scan continuous mode, and Photo Picker image decoding (`ActivityResultContracts.PickVisualMedia`).
- **Inventory Management**: Product CRUD, stock adjustments, batch stock updates, CSV import, low-stock / out-of-stock / expiry alerts, stock audit logs, SC/PWD review, and reorder suggestions.
- **Store Operations (`Store Ops`)**: Shift & cash drawer management, Suki customer loyalty & Utang ledger tracking, repack rules/conversions, and digital services logging.
- **Sales Analytics**: Daily/date-range summaries, X/Z reading reports, void-and-restore workflow, and JSON/CSV export via Android Share Sheet.
- **Offline Store Assistant**: On-device rule-based Store Pulse & quick-action assistant in English and Tagalog.
- **Security & Settings**: Salted PIN hashing, lockout protection, biometric unlock (`androidx.biometric`), HMAC-chained security audit logs, and store configuration history stored offline in SQLite.

## Architecture

- **UI**: Jetpack Compose + Material 3 (`WindowWidthSizeClass` adaptive phone & tablet layouts)
- **State**: `PosViewModel` with `StateFlow` + `collectAsStateWithLifecycle()`
- **Persistence**: Offline-first SQLite (`PosDatabaseHelper`) + `kotlinx.serialization`
- **Hardware**: CameraX, ML Kit Barcode Scanning, ZXing QR generation/decoding, Android `PrintManager`, Bluetooth ESC/POS, and `BiometricPrompt`

## Known Limitations / TODOs

- Bluetooth ESC/POS printing targets paired classic SPP receipt printers; USB OTG thermal printers are not directly wired (use Android System Print for USB/Wi-Fi printers).
- Multi-device Customer Display pairing sync operates locally in-app rather than via browser `BroadcastChannel` tabs.
