# Security Summary

**Reviewed Files**: 22
**Issues Resolved**: 8

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Host Allowlist for Updates | `app/src/main/java/com/example/MainActivity.kt` | 597 | GitHub Release APK downloads issue 302 redirects to both `release-assets.githubusercontent.com` and `objects.githubusercontent.com`, causing legitimate updates redirecting through `objects.githubusercontent.com` to fail host validation. | Medium | Fixed | Added `objects.githubusercontent.com` to `isTrustedUpdateHost` alongside `github.com` and `release-assets.githubusercontent.com`, with strict HTTPS, port 443, and null user-info checks across every redirect hop, plus Android Safe Browsing enabled. |
| Unsafe URL Handling | `src/hardware/deviceBridge.ts` | 201 | `openExternalUrl` and `triggerRemoteDownload` accepted arbitrary strings into `<a href>` navigation without validating URL schemes. | Medium | Fixed | Added `isSafeHttpUrl` check (`src/domain/posValidation.ts`) so only `http:` and `https:` URLs are opened or downloaded, and gated Settings APK download anchors on `isSafeHttpUrl`. |
| PIN Hashing & Weak PIN Policy | `src/security/securityManager.ts` | 90 | Tampering with stored `adminPinIter` could downgrade PBKDF2 work factor below 100,000 iterations, and sequences like `0123`, `9876`, `654321`, or repeated digits were permitted. | Medium | Fixed | Enforced `MIN_PBKDF2_ITER = 100_000` in `verifyPin`, expanded `WEAK_PINS`, and blocked repeated-digit PINs in `isPinWeak`. |
| Backup Import Sanitization | `src/domain/posValidation.ts` | 603 | Restoring a JSON backup directly trusted nested objects, numeric fields, repository strings, and retained prior device repack logs or modal states. | Medium | Fixed | Implemented `sanitizeBackupPayload` to strip `__proto__`/`constructor`/`prototype` keys, validate product/sales/settings/operations records, clamp negative numbers, validate `githubRepo`, strip imported PIN credentials, and reset active cart and open modals upon restore. |
| PIN Gate on Sensitive Settings Actions | `src/state/PosContext.tsx` | 1808 | `applyDefaultWholesaleMinQtyToAll` and `factoryResetAll` could be invoked programmatically without checking whether `settingsUnlocked` was active when a Manager PIN was configured. | Medium | Fixed | Added explicit PIN lock checks (`hasPin && !st.settingsUnlocked`) before mutating all SKUs or wiping store data. |
| Checkout & Recall Stock Validation | `src/state/PosContext.tsx` | 1005 | `completeCheckout`, `recallHeldOrder`, `addToCart`, and `updateCartQty` could process stale prices/quantities, oversell fractional stock, lose an active cart on recall, or mutate quantities on deleted SKUs. | Medium | Fixed | Added `validateCartStockForCheckout` (milli-unit stock verification), `reconcileCartWithProducts` across held recalls and product edits/deletions, live SKU checks in `addToCart`/`updateCartQty`, and auto-parking for non-empty carts before recall. |
| Negative & Invalid Inventory Adjustments | `src/modals/InventoryBatchModals.tsx` | 20 | Batch stock receive mode allowed negative quantities to deduct stock under a receive entry and allowed submitting empty batches, while Stock Adjust permitted zero-delta adds/deductions. | Low | Fixed | Disallowed negative numbers (and `<= 0` in Receive/Add/Deduct modes) with clear inline validation messages and disabled submit states. |
| Receipt Sequence Overflow & Form Reset Glitches | `src/domain/posMath.ts` | 366 | Prefixed receipt numbers like `OR-2026-0005` concatenated all digits (`20260005`) and forms in Operations tabs cleared inputs even when validation failed. | Low | Fixed | Updated `nextReceiptNo` to parse trailing digits and prevent collisions, ensured Operations forms preserve inputs on error (`boolean` return checks), reset Checkout/Scanner modal state cleanly on reopen/close, and enforced non-negative numeric bounds across UI forms. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Per-Device Data Isolation | `src/data/posRepository.ts` | Each terminal scopes storage keys with an isolated device prefix (`ebpos_<deviceId>_`) with explicit confirmation before cross-device backup restore. |
| Signed APK Verification | `app/src/main/java/com/example/MainActivity.kt` | Verifies archive package name, monotonic version code, SHA-256 digest (when provided in manifest), and matching signing certificate against the installed package before launching Android's package installer. |
| Manager PIN Lockout & Audit Log | `src/state/PosContext.tsx` | Failed PIN entries trigger exponential lockout delays and append hash-chained `SecurityLogEntry` audit records via Web Crypto SHA-256. |
| WebView Surface Hardening | `app/src/main/java/com/example/MainActivity.kt` | Disables `file://` access (`allowFileAccess = false`), blocks mixed HTTP/HTTPS content (`MIXED_CONTENT_NEVER_ALLOW`), restricts internal app assets via `WebViewAssetLoader`, and keeps `allowContentAccess = true` scoped to user-chosen file/camera intents. |

## PoC Verification

### Unsafe External URL Handling in Device Bridge
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsafe URL Scheme Handling |
| Impact | Medium |
| Affected File | `src/hardware/deviceBridge.ts:201` |
| Test Scenario | `DeviceBridge.openExternalUrl('javascript:alert(1)')` |

#### How It Was Fixed
Added `isSafeHttpUrl` in `src/domain/posValidation.ts` using the standard `URL` parser to permit only `http:` and `https:` protocols, and enforced it at both `DeviceBridge.openExternalUrl` and `DeviceBridge.triggerRemoteDownload` as well as in `SettingsScreen.tsx` APK download anchors.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `'javascript:alert(1)'` is passed to `DeviceBridge.openExternalUrl` | Entry point receives string |
| 2 | `if (!isSafeHttpUrl(url)) return;` at `src/hardware/deviceBridge.ts:202` parses scheme via `new URL(trimmed)` | Scheme `'javascript:'` fails `http:` / `https:` check |
| 3 | Function returns immediately without invoking native bridge or creating anchor | **Handled Safely** |

#### Conclusion
**Fix Verified** - Non-HTTP(S) URLs are rejected before any DOM navigation or native Android intent is triggered.

### PBKDF2 Iteration Downgrade & Weak PIN Check
#### Summary
| Field | Value |
|---|---|
| Issue Type | Weak Credential Verification Parameters |
| Impact | Medium |
| Affected File | `src/security/securityManager.ts:90` |
| Test Scenario | `SecurityManager.verifyPin('849271', hash, salt, 1000)` and `SecurityManager.isPinWeak('9999')` |

#### How It Was Fixed
Enforced `MIN_PBKDF2_ITER = 100_000` and `MAX_PBKDF2_ITER = 1_000_000` bounds inside `SecurityManager.verifyPin` so tampered iteration counts cannot verify, and expanded weak/repeated-digit rejection in `SecurityManager.isPinWeak`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Caller invokes `SecurityManager.verifyPin` with `iterations = 1000` | Enters iteration bounds guard |
| 2 | `if (!Number.isSafeInteger(iter) || iter < MIN_PBKDF2_ITER || iter > MAX_PBKDF2_ITER) return false;` at `src/security/securityManager.ts:101` | Rejects `1000 < 100_000` before `crypto.subtle.deriveBits` runs |
| 3 | `verifyPin` returns `false` and caller logs failed attempt | **Handled Safely** |

#### Conclusion
**Fix Verified** - Tampered low iteration counts fail authentication immediately, and repeated/sequential PINs are blocked at setup.

### Oversold Fractional Stock & Stale Held Cart Checkout
#### Summary
| Field | Value |
|---|---|
| Issue Type | Inventory Integrity & Input Validation |
| Impact | Medium |
| Affected File | `src/state/PosContext.tsx:1006` |
| Test Scenario | Attempting checkout with `qty: 2.501` against `stock: 2.5`, or recalling a held cart containing a deleted or reduced-stock SKU |

#### How It Was Fixed
Added `validateCartStockForCheckout` using exact milli-unit comparison (`PosMath.toMilli`) inside `completeCheckout`, paired with `reconcileCartWithProducts` across `recallHeldOrder`, `saveProduct`, and `deleteProduct`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Cart line (`qty: 2.501`) reaches `completeCheckout` | Passes initial empty-cart guard |
| 2 | `validateCartStockForCheckout(st.cart, map)` at `src/state/PosContext.tsx:1006` compares `PosMath.toMilli(2.501)` (`2501`) against `PosMath.toMilli(2.5)` (`2500`) | Returns `{ ok: false, error: ... }` |
| 3 | Checkout aborts before deducting inventory, awarding loyalty points, or saving a sale | **Handled Safely** |

#### Conclusion
**Fix Verified** - Carts cannot oversell stock or check out deleted items even when inventory changes while orders are held.

### Malformed Backup Payload & Prototype Key Injection
#### Summary
| Field | Value |
|---|---|
| Issue Type | Untrusted JSON Import Parsing |
| Impact | Medium |
| Affected File | `src/domain/posValidation.ts:603` |
| Test Scenario | Importing a backup JSON containing `__proto__`, negative prices/caps, `javascript:`/invalid `githubRepo`, and injected `adminPinHash` |

#### How It Was Fixed
Created `sanitizeBackupPayload` to recursively strip `__proto__`, `constructor`, and `prototype` keys, enforce valid schema types and non-negative numeric bounds, validate `githubRepo`, and clear imported PIN credentials so the active device's PIN vault cannot be overwritten.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Malicious JSON enters `importBackupJson` at `src/state/PosContext.tsx:2094` | Passed to `sanitizeBackupPayload(rawJson)` |
| 2 | `stripForbiddenKeys` removes forbidden object keys; `sanitizeProduct` and `sanitizeSettings` clamp numbers and force `adminPinHash: null` | Sanitized payload returned |
| 3 | Restored state merges sanitized settings while preserving local PIN hash/salt/iterations and clearing active cart/modals | **Handled Safely** |

#### Conclusion
**Fix Verified** - Corrupted or malicious backup files cannot inject unsafe settings, corrupt numeric fields, or overwrite the terminal PIN.
