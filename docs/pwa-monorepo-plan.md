# Restructure for multi-platform + build a PWA MVP

> Saved plan — start a fresh session and say "implement docs/pwa-monorepo-plan.md" to begin.

## Context

The app is currently an iOS-only SwiftUI app (~5,000 LOC, no dependencies, SwiftData
persistence, CoreBluetooth, bundled JSON catalogs). The goal is to prepare the project
for a future where iOS, Android, and a PWA all exist — and, concretely, to build a PWA now.

Key decisions:

- **Motivation:** future-proofing/optionality, *not* a rewrite. The native iOS app
  stays untouched and keeps shipping. The PWA is **additive**.
- **Hard constraint:** Web Bluetooth does **not** work in Safari or any normal iOS
  browser. It works in desktop Chrome/Edge, Android Chrome, and — on iPhone — only
  inside third-party BLE browsers like **Bluefy**/WebBLE. So "iOS PWA that lights the
  board" requires opening the site in Bluefy. Acceptable for personal use; deferred.
- **Web Bluetooth also requires a secure context** (HTTPS or `localhost`). MVP is
  developed/tested on **desktop Chrome over `localhost`**; phone hosting decided later.
- **Repo layout:** full monorepo split — `ios/`, `web/`, `shared/`.
- **PWA stack:** Vite + React + TypeScript.
- **MVP scope:** connect to the board over Web Bluetooth → build a problem on a
  tappable 11×12 grid → light it up / clear. No catalog, logbook, editor persistence,
  or multi-board UI yet.
- **Board target:** Mini MoonBoard 2025 (11 cols × 12 rows, 40°), but with board
  geometry held in a small **data-driven config object** so 18-row boards drop in later.
- **Swift:** not refactored — only moved into `ios/`. Portable knowledge captured in a
  written spec instead.

## Outcome

A working PWA the user can open in desktop Chrome, connect to their DIY MoonBoard LED
controller, place holds on a grid, and light them — plus a clean monorepo and a written
protocol/data spec that makes any future Android/PWA/Capacitor work cheap.

---

## Step 0 — Work on a dedicated branch

All of this happens off `main`.

```
git switch -c feat/pwa-monorepo
```

Commit or stash the in-progress `LogbookView.swift` change on `main` first so the tree
is clean for the `git mv` operations. Open a PR when the MVP works.

## Step 1 — Restructure the repo (monorepo split)

Move, don't rewrite. Use `git mv` so history is preserved.

Target layout:

```
board-app/
├── ios/                      # moved: MoonBoardLED/ + MoonBoardLED.xcodeproj/
├── web/                      # new: Vite + React + TS PWA
├── shared/                   # new: protocol + data spec (docs, not shared binaries)
│   └── spec/
│       ├── ble-protocol.md
│       ├── led-geometry.md
│       └── data-model.md
├── docs/  scripts/  catalog-data/   # unchanged
├── CONTEXT.md  README.md
```

- `git mv MoonBoardLED ios/MoonBoardLED` and `git mv MoonBoardLED.xcodeproj
  ios/MoonBoardLED.xcodeproj`. Because both move **together**, their relative paths are
  preserved and the file-synchronized Xcode group should still resolve.
- **Verify the iOS build after the move** (the one real risk):
  ```
  xcodebuild -project ios/MoonBoardLED.xcodeproj -scheme MoonBoardLED \
    -destination 'generic/platform=iOS Simulator' -configuration Debug \
    build CODE_SIGNING_ALLOWED=NO
  ```
  If paths broke, fix references in `project.pbxproj` (or revert and keep iOS at root).
- Update path references in `README.md` / `CONTEXT.md` / `.claude` that point at the
  old `MoonBoardLED/` location.

## Step 2 — Write the shared spec (`shared/spec/`)

Extract portable knowledge from the Swift source (read-only) into markdown.

- **`ble-protocol.md`** — from `ios/MoonBoardLED/BLE/MoonBoardBLEManager.swift`:
  - Nordic UART Service UUID `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`; write (RX) char
    `6E400002-B5A3-F393-E0A9-E50E24DCCA9E`.
  - Message grammar: `l#` + comma-joined `<letter><ledIndex>` + `#`. Letters
    `S`/`L`/`R`/`M`/`E` (start/left/right/match/end → green/violet/blue/pink/red).
    Clear = `l##`. Single-LED calibration = `l#P<n>#`.
  - **20-byte chunking + write-without-response flow control** — the critical gotcha:
    modern MTU reports ~180 but the firmware char stores only 20 bytes/write and
    silently truncates, so every message must be split into ≤20-byte writes.
- **`led-geometry.md`** — from `ios/MoonBoardLED/Board/BoardGeometry.swift`: serpentine
  formula (`base = col*rows`; even col `base+(row-1)`, odd col `base+(rows-row)`;
  `flipped` → `total-1-led`), plus the reverse mapping.
- **`data-model.md`** — from `ios/MoonBoardLED/Models/HoldType.swift`: `HoldType` roles,
  `HoldAssignment {col 0–10, row 1–12, type}`, board config shape (columns, rows,
  angle, flipped).

## Step 3 — Scaffold the PWA (`web/`)

- `npm create vite@latest web -- --template react-ts` (from repo root).
- Add `vite-plugin-pwa` for the installable-PWA manifest + service worker.
- Baseline structure:
  ```
  web/src/
  ├── ble/moonboard.ts        # Web Bluetooth port of the protocol (Step 4)
  ├── board/geometry.ts       # ledIndex() port
  ├── board/config.ts         # data-driven board defs; mini2025 = {cols:11, rows:12, angle:40}
  ├── types.ts                # HoldType, HoldAssignment (TS mirror of the spec)
  ├── components/BoardGrid.tsx
  ├── components/ConnectBar.tsx
  └── App.tsx
  ```

## Step 4 — Port the core logic to TypeScript

Faithful reimplementation from the spec (separate reimplementation, no shared binary):

- **`geometry.ts`**: `ledIndex(col, row, rows, flipped)` — direct port of the Swift
  serpentine math. Board config from `config.ts` (`mini2025`).
- **`types.ts`**: `HoldType` union + `protocolLetter`/`color` maps; `HoldAssignment`.
  Include the beta-collapse rule (`left`/`right`/`match` → blue when beta off); MVP
  defaults beta off, so the grid cycles start/move/end.
- **`moonboard.ts`** — Web Bluetooth client:
  - `requestDevice({ filters: [{ services: [NUS_SERVICE] }] })`, connect GATT, get
    service + RX characteristic.
  - `buildMessage(holds, {rows, flipped, showBeta})` → same string as Swift `message()`.
  - `write(message)`: ASCII-encode, split into ≤20-byte chunks, send each via
    `characteristic.writeValueWithoutResponse(chunk)` **awaited sequentially** (the web
    equivalent of CoreBluetooth's flow-controlled queue — awaiting each provides
    back-pressure).
  - `clear()` → `l##`. Surface connection-state to React.

## Step 5 — MVP UI

- **`ConnectBar`**: "Connect" (must be a user gesture — Web Bluetooth requirement),
  shows state + device name, Disconnect.
- **`BoardGrid`**: 11×12 tappable grid; tapping cycles empty → start → move → end →
  empty. Plain functional grid for MVP (board-photo overlay is later polish). Colors
  mirror `HoldType`.
- **`App`**: holds state; "Light up" sends current holds; "Clear" sends `l##`. Optional:
  debounced live-send on each tap (mirror the iOS 90 ms live preview).

## Step 6 — Verify end-to-end

- `cd web && npm run dev`, open in **desktop Chrome** (`localhost` = secure context).
- Confirm the BLE device picker appears and connects to the board.
- Place holds, Light up → verify correct LEDs (validates the TS geometry port against
  Swift). Clear → all off.
- Sanity-check `xcodebuild` (Step 1) still passes for iOS.
- Phone hosting (GitHub Pages + Bluefy) is out of scope for this pass.

## Non-goals (deferred)

- Rewriting/refactoring the Swift app.
- Catalog, logbook, grade pyramid, editor persistence, favorites in the PWA.
- Multi-board UI, angle selection, hold-set art.
- Cross-platform framework adoption (Flutter/RN/KMP/Capacitor).
- Phone hosting / HTTPS deploy / installable-on-iPhone flow.
- Sharing compiled code between iOS and web (spec-only sharing by design).
