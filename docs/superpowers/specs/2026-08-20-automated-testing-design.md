# Automated Testing Infrastructure — Design

Date: 2026-08-20

## Overview

The project currently has no automated tests and no CI: `.github/workflows` is empty, `package.json` has only a `dev` script, and all logic lives in a 1398-line monolith `app.js` that touches the DOM at module load and loads Chart.js/Lucide from CDN. Add automated testing: unit tests for the pure calculation logic, Playwright browser tests for the core UI flows, and a GitHub Actions workflow that runs both on push to main and pull requests.

## Approach

Approach A (chosen): create a new `weather.js` module that dual-exposes the pure functions — it defines the same global function names `app.js` already calls (classic `<script>` loading, so `app.js` keeps working) and also `export`s them for Node imports. Unit tests use Node's built-in `node:test` runner (zero new dependencies for unit testing). Playwright handles E2E. GitHub Actions provides CI.

## Section 1 — Architecture & file layout

```
weather.js          New: pure calculation/extraction functions (no DOM)
app.js              Existing: minus the code moved to weather.js; calls the same global names
index.html          One new <script src="weather.js"> line, before app.js
test/
  unit/             Node built-in node:test specs (*.test.mjs)
  e2e/              Playwright specs
  fixtures/         Sample API payloads used by unit tests (deterministic, no network)
playwright.config.js   Overrides the fetch guard/skip behaviour as needed
.github/workflows/test.yml
```

`weather.js` defines the same global function names it already has (`saturatePressure`, `calculateIndoorHumidity`, `getDayColor`, ...) so `app.js` continues calling them identically — the only change in `app.js` is deleting the moved functions. For Node, the same file additionally `export`s them, giving unit tests direct imports.

## Section 2 — Refactor scope

### Move as-is (pure, no DOM/state)

- `saturatePressure`, `calculateIndoorHumidity`
- `getDayColor`, `isTodayDateStr`, `formatDateLabel`, `getWeatherIcon`
- `normalizeCarbonSeries`, `buildCarbonData`
- `getDayMetricRange`

The shared constants these functions depend on move with them (they are pure): `TIMELINE_COLORS` (used by `getDayColor`), `METRICS` and `CARBON_SERIES` (used by `getDayMetricRange` and others). `weather.js` defines them under the same global names so remaining `app.js` references keep resolving.

### Move with a tiny signature change (parameterize what is currently a global)

- `processForecastData(data)` → `processForecastData(data, indoorTemp)`: drops the `activeIndoorTemp` global read and now **returns** the processed array. app.js assigns `forecastData = processForecastData(data, activeIndoorTemp)`.
- New helper `computeInsights(visibleData)` extracted from `calculateInsights` — returns `{ peakTemp, peakTempTime, peakWind, peakIndoorRH, moldSustainedHours, totalHours, moldRisk, ... }`; `calculateInsights` in app.js renders that result into the DOM (mold-risk thresholds become unit-testable)

### Stays in app.js (DOM coupled)

Everything touching `document`, Chart.js instances, fetch, URL state, event listeners, and the state globals (`activePostcode`, `activeIndoorTemp`, `carbonSeriesVisible`, etc.).

Net effect on `app.js`: removed functions plus two call-site tweaks (`processForecastData(...)` with `activeIndoorTemp`, and the `calculateInsights` body swap to render `computeInsights(...)`). Behavior is identical; the E2E suite verifies after the move.

## Section 3 — Unit tests (node:test)

`npm test` runs `node --test test/unit/`. Zero new dependencies for unit testing.

- `test/unit/psychrometrics.test.mjs` — `calculateIndoorHumidity` / `saturatePressure`: known-value sanity checks (20°C in ≈ 20°C/50% RH → ≈50% → round-trip through the formula), clamping at 0/100, null-input handling (returns `null`)
- `test/unit/forecast.test.mjs` — `processForecastData` with a small fixture: correct grouping by `localDate`, sorting by hour, indoor humidity computed, summary min/max used, fallback to computed min/max, `'--'` when no temps exist
- `test/unit/carbon.test.mjs` — `normalizeCarbonSeries` (nested `data.data` shape, null intensity handling), `buildCarbonData` (timestamps bucketed, four series merged)
- `test/unit/insights.test.mjs` — `computeInsights`: peak detection, wind direction suffix, mold-risk HIGH/MEDIUM/LOW thresholds, empty-data edge case
- `test/unit/utils.test.mjs` — `getDayColor` (hue interpolation at start/end), `formatDateLabel`, `isTodayDateStr`, `getWeatherIcon`

Fixtures live in `test/fixtures/` and are deterministic. Tests assert exact outputs for known inputs.

## Section 4 — Playwright E2E

`@playwright/test` added as a devDependency. One spec file `test/e2e/dashboard.spec.mjs`. Config starts a local `http-server` (webServer, port 8080), chromium-only, with retries enabled in CI.

Scenarios (live BBC API, graceful skip):

- **Loads & renders:** page loads at `/?postCode=KT4`, a `<canvas>` for the chart appears, no console errors
- **Core interactions:** submit a postcode via the form → `#activeLocation` updates and the URL gains `?postCode=...`; switch metric (e.g. wind speed) → `#metricTitle` text and chart datasets update; toggle a day card → the corresponding dataset line is hidden/shown
- **Error state:** a postcode that returns no data → `#errorBanner` becomes visible

**Live-API guard:** tests wait on the BBC API response with a generous timeout; if the network call never resolves (offline / API down), tests call `test.skip()` rather than fail. No test depends on specific forecast values.

## Section 5 — CI workflow (.github/workflows/test.yml)

- **Trigger:** `pull_request` and `push` to `main`
- **Job:** `ubuntu-latest`, Node 20
- **Steps:**
  1. checkout
  2. `npm ci` (a `package-lock.json` is committed on setup)
  3. Unit tests: `npm test`
  4. Playwright bundle: `npx playwright install --with-deps chromium`
  5. E2E: `npm run test:e2e` (skips gracefully if the BBC API is unreachable from runners)
- Fail-fast on any test failure. No README badge unless requested.

### package.json scripts

```
"test": "node --test test/unit/",
"test:e2e": "playwright test",
"test:all": "npm test && npm run test:e2e"
```

Only dependency change: `@playwright/test` devDependency + committed `package-lock.json`. Unit deps stay zero.

## Testing the test infrastructure

- Run `npm test` — unit specs pass against fixtures.
- Run `npm run test:e2e` locally — passes with a reachable BBC API; skips when unreachable.
- Push to a branch and open a PR (or push to main) — GitHub Actions runs both suites.
- Confirm the current app behavior is unchanged by running the E2E suite and eyeballing `npm run dev`.