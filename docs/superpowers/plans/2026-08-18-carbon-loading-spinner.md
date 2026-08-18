# Carbon Forecast Loading Spinner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an inline loading spinner over the chart card while the Carbon Intensity forecast is being fetched, so the 1-2s fetch delay gives visible feedback.

**Architecture:** Add a static loading overlay inside `.chart-container` in `index.html`, styled in `style.css` to absolutely-position over the chart. A new `carbonLoading` boolean global is set `true` when `fetchCarbonIntensity` starts and cleared in a `finally` block; `updateDashboard` toggles the overlay's `visible` class via the existing per-metric branch. State-driven, so switching to the carbon metric mid-fetch also shows the spinner.

**Tech Stack:** Vanilla JS, static site (HTML + CSS + JS), Chart.js via CDN. No test framework — verify manually in the browser.

## Global Constraints

- Overlay element id: `chartLoadingOverlay`. Caption text: `Loading carbon forecast...`.
- Existing `.spinner` CSS is reused as-is (do not duplicate the spinner animation).
- `carbonLoading` global: `let carbonLoading = false;` — only `true` while a carbon fetch is in flight.
- Existing weather metric behaviour must be unchanged — the spinner only appears for `isCarbonMetric()`.
- Do not add comments to code.
- No test framework exists; verify manually in the browser as each task specifies.
- Existing full-screen `loadingOverlay` (used by `fetchForecast`) is unchanged.

---

### Task 1: Add the chart loading overlay markup

**Files:**
- Modify: `index.html` (`chart-container` block, currently lines 197-200)

**Interfaces:**
- Consumes: existing `.chart-container` div inside the chart card.
- Produces: `div#chartLoadingOverlay.chart-loading-overlay` (inside `.chart-container`) containing a `.spinner` and a `.chart-loading-text` caption. Referenced by CSS Task 2 and JS Task 3.

- [ ] **Step 1: Add the overlay div**

In `index.html`, inside `.chart-container` — before the `<canvas id="forecastChart"></canvas>` line (currently line 198) — add:

```html
<div id="chartLoadingOverlay" class="chart-loading-overlay">
  <div class="spinner"></div>
  <div class="chart-loading-text">Loading carbon forecast...</div>
</div>
```

The resulting block:

```html
<div class="chart-container">
  <div id="chartLoadingOverlay" class="chart-loading-overlay">
    <div class="spinner"></div>
    <div class="chart-loading-text">Loading carbon forecast...</div>
  </div>
  <canvas id="forecastChart"></canvas>
</div>
```

- [ ] **Step 2: Verify markup**

Run: `npm run dev` and open `http://localhost:8080`.
Expected: page loads with no visible change (overlay is `opacity: 0` until CSS exists).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add chart loading overlay markup"
```

---

### Task 2: Style the chart loading overlay

**Files:**
- Modify: `style.css` (add after the `.loading-text` rule, currently around line 830)

**Interfaces:**
- Consumes: `div#chartLoadingOverlay.chart-loading-overlay` and the existing `.spinner` (both from Task 1).
- Produces: `.chart-loading-overlay` (absolute, centred, hidden by default, `.visible` shows it) and `.chart-loading-text`. Referenced by JS Task 3 via the `.visible` class.

- [ ] **Step 1: Add the CSS rules**

In `style.css`, directly after the `.loading-text` rule (currently lines 825-830), add:

```css
.chart-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(8, 11, 17, 0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  z-index: 5;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
}

.chart-loading-overlay.visible {
  opacity: 1;
  pointer-events: all;
}

.chart-loading-overlay .spinner {
  width: 40px;
  height: 40px;
}

.chart-loading-text {
  margin-top: 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
}
```

Note: `.chart-container` already has `position: relative` (style.css:462-466), so the absolute overlay anchors to it. The `.spinner` size override keeps it proportional inside the smaller overlay.

- [ ] **Step 2: Verify styles**

Run: `npm run dev` and open `http://localhost:8080`.
Expected: temporarily add the `visible` class to the overlay via browser dev tools — the spinner and caption appear centred over the (blank) chart card area; removing the class hides it. Remove the temporary class afterwards.

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "feat: style chart loading overlay"
```

---

### Task 3: Wire the carbon loading state

**Files:**
- Modify: `app.js:55` (DOM element lookups), `app.js:331-356` (`fetchCarbonIntensity`), `app.js:509-541` (`updateDashboard`)

**Interfaces:**
- Consumes: `div#chartLoadingOverlay` (Task 1) and its `.visible` class (Task 2).
- Produces: `let carbonLoading` boolean global; `function setChartLoading(show)` — toggles the overlay's `visible` class (no-op if the element is missing). `setChartLoading` is called from `updateDashboard` and not consumed elsewhere.

- [ ] **Step 1: Add the global and element reference**

Near the other DOM element lookups (app.js:55, after `const loadingOverlay = ...`), add:

```js
const chartLoadingOverlay = document.getElementById('chartLoadingOverlay');
```

Near the other carbon globals (app.js:33-35, next to `let carbonData = []`), add:

```js
let carbonLoading = false;
```

- [ ] **Step 2: Add the toggle helper**

After the existing `hideError()` function (app.js:502-504), add:

```js
function setChartLoading(show) {
  if (chartLoadingOverlay) {
    chartLoadingOverlay.classList.toggle('visible', show);
  }
}
```

- [ ] **Step 3: Set the flag in `fetchCarbonIntensity`**

In `fetchCarbonIntensity` (app.js:331-356), set the flag before the `try` and clear it in a `finally`. The try/catch becomes:

```js
  carbonLoading = true;
  try {
    const seriesResults = await Promise.all(urls.map(u =>
      fetch(u.url).then(res => {
        if (!res.ok) throw new Error('Carbon intensity request failed');
        return res.json();
      }).then(json => ({ key: u.key, points: normalizeCarbonSeries(json) }))
    ));
    buildCarbonData(seriesResults);
    if (isCarbonMetric()) updateDashboard();
  } catch (err) {
    console.error(err);
    carbonData = [];
    if (isCarbonMetric()) showError('Unable to load Carbon Intensity data for this postcode.');
  } finally {
    carbonLoading = false;
    setChartLoading(false);
  }
```

- [ ] **Step 4: Toggle the overlay in `updateDashboard`**

In `updateDashboard`, after the `if (isCarbonMetric()) { ... } else { ... }` branch and immediately before the `const visibleData = getVisibleForecastData();` line (currently app.js:540), add:

```js
  setChartLoading(isCarbonMetric() && carbonLoading);
```

This shows the overlay only when the carbon metric is active and a fetch is still pending (including the case where a postcode was submitted while viewing the carbon metric, or the user switches to carbon mid-fetch). When data arrives, `carbonLoading` is `false` so the overlay hides; when the user switches to a weather metric mid-fetch, the overlay hides too. The existing early-return (`if (visibleData.length === 0) return;`) leaves the overlay on screen while data is pending.

- [ ] **Step 5: Verify behaviour**

Run: `npm run dev` and open `http://localhost:8080`.

1. Reload the page with `?metric=carbon_intensity` in the URL (or click Carbon Intensity in the sidebar immediately after load) — the spinner shows over the chart within a moment and disappears once carbon data renders.
2. Enter a new postcode while the carbon metric is active — the spinner re-appears during the 1-2s fetch, then hides.
3. Switch to a weather metric (e.g. Temperature) mid-fetch — the spinner is not visible for weather metrics.
4. Enter an invalid postcode while carbon is active — the spinner clears and the error banner appears.

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "feat: show chart loading spinner while carbon forecast loads"
```

---

### Task 4: Full end-to-end verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: features from Tasks 1-3.

- [ ] **Step 1: Verify all scenarios**

Run: `npm run dev` and open `http://localhost:8080`.

- Initial weather load: full-screen overlay still works exactly as before (opacity dims the page, spinner + "Fetching weather forecast data...", disappears when weather data renders).
- Click Carbon Intensity before the carbon fetch completes after a fresh page load: inline spinner over the chart card until data renders.
- Submit a new postcode while carbon is active: spinner returns during fetch, then disappears.
- Switch away to Temperature mid-carbon-fetch: no inline spinner on weather metrics.
- Invalid postcode while carbon active: spinner clears, red error banner shows "Unable to load Carbon Intensity data for this postcode."
- Chart still interactive (tooltip, overlay/sequence toggle, series chips, Show All / Hide All) after data loads — the overlay is gone and does not block clicks.

- [ ] **Step 2: Confirm git state**

Run: `git status` and `git log --oneline -5`.
Expected: three feature commits from Tasks 1-3 present, working tree clean.