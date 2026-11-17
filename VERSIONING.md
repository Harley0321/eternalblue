# OmniMart PH POS — Version Control & Safe Rollback Guide

**Current Stable Release:** `v2.0.0-stable` (`2.0.0`)  
**Release Date:** `2026-11-17`

---

## 1. Existing Data Preservation Guarantee

Code updates, Git rollbacks, and in-app configuration rollbacks **never erase, overwrite, or destructively migrate** existing store data stored on mobile phones or tablets.

### Protected Legacy `localStorage` Keys (Unchanged)
| Key | Purpose |
| --- | --- |
| `omnimart_ph_products_v1` | Product catalog, barcodes, prices, capital, stock levels, expiry, SC/PWD flags |
| `omnimart_ph_sales_v1` | Completed and voided receipt records |
| `omnimart_ph_held_v1` | Parked / held customer orders |
| `omnimart_ph_settings_v1` | Store profile, receipt settings, inventory thresholds, PIN hash |
| `omnimart_ph_pinlock_v1` | PIN lockout rate-limit state |
| `omnimart_ph_scanprefs_v1` | Camera scanner continuous multi-scan preference |

### Strictly Additive Keys (Never Mutate Legacy Keys)
| Key | Purpose |
| --- | --- |
| `omnimart_ph_stocklog_v1` | Audit log of manual stock adjustments (restock, spoilage, count correction) |
| `omnimart_ph_config_history_v1` | Timestamped configuration revision snapshots for instant config rollback |

---

## 2. Tracked System Files & Configurations

Git tracks all application source files, build configs, and PWA assets:
- **App Entry & Metadata:** `index.html`, `metadata.json`, `package.json`, `tsconfig.json`, `vite.config.ts`, `src/version.ts`
- **Core Logic & Tests:** `src/types.ts`, `src/utils/posMath.ts`, `src/utils/posMath.test.ts`, `src/utils/pinSecurity.ts`, `src/utils/assistantEngine.ts`, `src/utils/storage.ts`, `src/utils/categoryIcons.ts`
- **Hooks & Styling:** `src/hooks/useOnlineStatus.ts`, `src/hooks/usePWAInstall.ts`, `src/index.css`
- **UI Views & Modals:** `src/App.tsx`, `src/main.tsx`, `src/components/*`
- **PWA Icons:** `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`

Ignored build/runtime artifacts (`.gitignore`): `node_modules/`, `dist/`, `build/`, `coverage/`, `.env*` (except `.env.example`), `*.log`, `.playwright-cli/`, and temporary screenshots.

---

## 3. Tracking New Updates in Git

Before making changes:
```bash
git status
```

After editing & verifying (`npx tsx --test src/utils/posMath.test.ts && npm run lint && npm run build`):
```bash
git add -A
git commit -m "feat: describe your change concisely"
```

When ready to mark a new stable release:
```bash
git tag -a v2.1.0-stable -m "Release v2.1.0-stable: summary of verified improvements"
```

Inspect history & diffs anytime:
```bash
git log --oneline --decorate -n 20
git diff v2.0.0-stable..HEAD
```

---

## 4. Rolling Back Safely (Without Affecting Device Data)

### Option A: In-App Configuration Rollback (No Code Redeploy Needed)
For store configuration changes (store name, receipt width `80mm`/`58mm`, low-stock threshold, expiry warning days, reorder lead/safety days, SC/PWD cap, beep/vibrate):
1. Open **Settings** (enter Manager PIN).
2. Scroll to **System Version & Config Rollback**.
3. Click **Rollback Config** on any prior snapshot or manual checkpoint.
4. Only configuration values are restored; **products, sales receipts, held orders, stock logs, and Manager PIN remain untouched**.

### Option B: Git Code Rollback (Revert or Checkout Stable Tag)
Because `localStorage` lives in the device browser and is completely decoupled from compiled static assets in `dist/`, rolling back the codebase never touches existing mobile/tablet data:

- **Undo the latest commit cleanly (safe shared history):**
  ```bash
  git revert HEAD
  npm run build
  ```
- **Revert to the documented `v2.0.0-stable` release:**
  ```bash
  git checkout -b rollback/v2.0.0-stable v2.0.0-stable
  npm install
  npm run build
  ```
- **Restore a single system file from `v2.0.0-stable`:**
  ```bash
  git checkout v2.0.0-stable -- src/components/PosView.tsx
  npm run build
  ```

---

## 5. Recommended Pre-Update Device Backup

Before deploying major updates to mobile/tablet terminals, operators can also export a device snapshot under **Settings → Backup & Restore → Download Backup JSON** (Manager PIN is excluded from JSON exports for security, and **Merge Missing Only** restores items/receipts without overwriting newer local records).
