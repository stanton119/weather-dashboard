# Carbon Intensity Metric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `carbon_intensity` metric to the AeroTemp dashboard that fetches four Carbon Intensity API series (regional/national × forecast/historic) and renders them as toggleable lines in the existing Chart.js chart, alongside the normal weather metrics.

**Architecture:** Extend the existing metric system. On every postcode submit, `fetchCarbonIntensity()` runs all four documented endpoints in parallel (independent of the BBC weather fetch), normalises each to `{timestamp, value}`, merges them onto one shared sorted half-hourly timeline, and groups them into `carbonData` mirroring the existing `forecastData` day shape. `getVisibleForecastData()` returns `carbonData` while the carbon metric is active, so day cards, range slider and chart reuse the existing pipeline. A `CARBON_SERIES` config describes the four lines; a `carbonSeriesVisible` array drives a series-legend chip UI and a `series` URL param.

**Tech Stack:** Vanilla JS, static site (HTML + CSS + JS), Chart.js via CDN. No test framework — verify manually in the browser.

## Global Constraints

- New metric key: `carbon_intensity`. New globals: `CARBON_SERIES`, `carbonData`, `carbonSeriesVisible`.
- Data source: `https://api.carbonintensity.org.uk` (free UK National Grid API, no key).
- Series keys MUST be exactly `regional_forecast`, `national_forecast`, `regional_historic`, `national_historic`; units gCO₂/kWh.
- Existing weather behaviour must be unchanged — all carbon branching is keyed off `isCarbonMetric()` (`activeMetric === 'carbon_intensity'`).
- URL param key for series visibility: `series` (comma-separated `1`/`0`). Existing params (`postCode`, `indoorTemp`, `days`, `chartMode`, `metric`) unchanged.
- Do not add comments to code.
- No test framework exists; verify manually in the browser as each task specifies.

---

### Task 1: Add Carbon Intensity metric button, series-legend container and section ids to the markup

**Files:**
- Modify: `index.html` (sidebar metrics grid, chart-card-header, summary-grid, info-box)

**Interfaces:**
- Consumes: existing metric-button pattern (`button.metric-btn[data-metric]`).
- Produces: `button.metric-btn[data-metric="carbon_intensity"]` (sidebar); `#carbonSeriesLegend` (inside `.chart-controls`); `id="summaryGrid"` on the insights `.summary-grid`; `id="psychroInfo"` on the psychrometrics `.info-box`. These ids are referenced by CSS Task 2 and JS Tasks 3-6.

- [ ] **Step 1: Add the Carbon Intensity metric button**

In `index.html` inside the `.metrics-grid` (after the Precipitation button, currently lines 119-125), add:

```html
<button type="button" class="metric-btn" data-metric="carbon_intensity">
  <i data-lucide="leaf"></i>
  <div>
    <div style="font-weight: 600;">Carbon Intensity</div>
    <div style="font-size: 11px; opacity: 0.7;">Forecasted gCO₂/kWh</div>
  </div>
</button>
```

- [ ] **Step 2: Add the series-legend container**

In `index.html` inside `.chart-controls` (the div containing the segmented control and the Show All / Hide All buttons, lines 175-186), add this as the last child:

```html
<div id="carbonSeriesLegend" class="carbon-series-legend"></div>
```

- [ ] **Step 3: Add ids to the insights grid and info box**

Change the opening tag of the insights grid (line 209) from:

```html
<div class="summary-grid">
```
to:
```html
<div class="summary-grid" id="summaryGrid">
```

Change the opening tag of the psychrometrics info box (line 256) from:

```html
<div class="glass-card info-box">
```
to:
```html
<div class="glass-card info-box" id="psychroInfo">
```

- [ ] **Step 4: Manually verify the DOM**

Serve the repo root (`python3 -m http.server`), open the page, open DevTools:
- The metrics grid has a "Carbon Intensity" button with a leaf icon.
- `#carbonSeriesLegend` exists inside `.chart-controls` and is empty.
- `#summaryGrid` and `#psychroInfo` ids exist.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add carbon intensity metric markup"
```

### Task 2: Style the carbon series legend

**Files:**
- Modify: `style.css` (after the `.btn-secondary` block, around line 519-539)

**Interfaces:**
- Consumes: `#carbonSeriesLegend` container and `.chart-controls` from Task 1.
- Produces: `.carbon-series-legend` hidden by default, flex-row when given `visible` class; `.series-chip` pill buttons with an active state driven by a `--series-color` CSS variable. Consumed by JS Task 4 (`renderCarbonSeriesLegend`).

- [ ] **Step 1: Add the legend and chip styles**

Append after the `.btn-secondary` rules (style.css:519-539):

```css
.carbon-series-legend {
  display: none;
  gap: 8px;
  flex-wrap: wrap;
}

.carbon-series-legend.visible {
  display: flex;
}

.series-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 5px 10px;
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.series-chip:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.series-chip.active {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  border-color: var(--series-color);
}

.series-chip-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--series-color);
  flex-shrink: 0;
}
```

- [ ] **Step 2: Manually verify styling**

With the page served, in DevTools add the `visible` class to `#carbonSeriesLegend`, append a static chip (`<button class="series-chip active" style="--series-color:#34d399;"><span class="series-chip-dot"></span>Regional F</button>`), and confirm the chip renders with a colored dot, clean spacing, and no layout breakage in `.chart-controls`.

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "feat: style carbon series legend"
```

### Task 3: Carbon data layer

**Files:**
- Modify: `app.js` (globals near line 17, `getVisibleForecastData` lines 237-239, add `fetchCarbonIntensity` after `fetchForecast`, wire into submit handler line 936 and `startApp` line 1030)

**Interfaces:**
- Consumes: `formatDateLabel(dateStr)` (app.js:204), existing `showError`/`hideError`/`updateDashboard`.
- Produces:
  - `const isCarbonMetric()` — `() => activeMetric === 'carbon_intensity'`.
  - `const CARBON_SERIES` — array of `{ key, label, short, color, dash }` (order matters; used by Tasks 4, 5, 6).
  - `let carbonData` — array of day objects `{ index, dateStr, formattedDate, weatherText: 'carbon', reports, visible }` where each report is `{ timestamp, localDate, timeslot, halfHour, regional_forecast, national_forecast, regional_historic, national_historic }` with `null` for series not covering that slot.
  - `async function fetchCarbonIntensity(postcode)` — sets `carbonData`; on failure sets `carbonData = []` and, if carbon is active, calls `showError(...)`; if carbon is active and data loaded, calls `updateDashboard()`.
  - Modified `getVisibleForecastData()` — returns `carbonData` when carbon is active.

- [ ] **Step 1: Add globals and helpers after the `HOURS` constant**

After `const HOURS = ...` (app.js:17), add:

```js
const HALF_HOUR_LABELS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = (i % 2) * 30;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

const CARBON_SERIES = [
  { key: 'regional_forecast', label: 'Regional Forecast', short: 'Regional F', color: '#34d399', dash: [] },
  { key: 'national_forecast', label: 'National Forecast', short: 'National F', color: '#60a5fa', dash: [] },
  { key: 'regional_historic', label: 'Regional Historic', short: 'Regional H', color: '#a78bfa', dash: [4, 4] },
  { key: 'national_historic', label: 'National Historic', short: 'National H', color: '#fbbf24', dash: [4, 4] }
];

let carbonData = [];
let carbonSeriesVisible = [true, true, true, true];
let carbonSequenceReports = [];

function isCarbonMetric() {
  return activeMetric === 'carbon_intensity';
}
```

- [ ] **Step 2: Change `getVisibleForecastData` to route by metric**

Replace the body of `getVisibleForecastData` (app.js:237-239):

```js
function getVisibleForecastData() {
  return (isCarbonMetric() ? carbonData : forecastData).slice(0, forecastDaysLimit);
}
```

- [ ] **Step 3: Add the carbon fetch and processing functions**

Add these functions after `fetchForecast` (app.js:235):

```js
function normalizeCarbonSeries(payload) {
  const items = payload.data || [];
  return items.map(el => {
    const intensity = el.intensity || {};
    const value = (typeof intensity.forecast !== 'undefined' ? intensity.forecast : intensity.actual) ?? null;
    return { timestamp: new Date(el.from).getTime(), value };
  });
}

function buildCarbonData(seriesResults) {
  const byTime = new Map();
  seriesResults.forEach(entry => {
    entry.points.forEach(p => {
      if (p.value === null || p.value === undefined) return;
      const d = new Date(p.timestamp);
      const localDate = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
      if (!byTime.has(p.timestamp)) {
        byTime.set(p.timestamp, {
          timestamp: p.timestamp,
          localDate,
          timeslot: d.toTimeString().slice(0, 5),
          halfHour: Math.floor((d.getHours() * 60 + d.getMinutes()) / 30),
          regional_forecast: null,
          national_forecast: null,
          regional_historic: null,
          national_historic: null
        });
      }
      byTime.get(p.timestamp)[entry.key] = p.value;
    });
  });

  const reports = Array.from(byTime.values()).sort((a, b) => a.timestamp - b.timestamp);
  const byDate = {};
  reports.forEach(r => {
    if (!byDate[r.localDate]) byDate[r.localDate] = [];
    byDate[r.localDate].push(r);
  });

  carbonData = Object.keys(byDate).sort().map((dateStr, index) => ({
    index,
    dateStr,
    formattedDate: formatDateLabel(dateStr),
    weatherText: 'carbon',
    reports: byDate[dateStr],
    visible: true
  }));
}

async function fetchCarbonIntensity(postcode) {
  const clean = postcode.split(' ')[0].trim();
  const today = new Date().toISOString();
  const base = 'https://api.carbonintensity.org.uk';
  const urls = [
    { key: 'regional_forecast', url: `${base}/regional/intensity/${today}/fw48h/postcode/${clean}` },
    { key: 'national_forecast', url: `${base}/intensity/${today}/fw48h` },
    { key: 'regional_historic', url: `${base}/regional/intensity/${today}/pt24h/postcode/${clean}` },
    { key: 'national_historic', url: `${base}/intensity/${today}/pt24h` }
  ];

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
  }
}
```

- [ ] **Step 4: Wire the carbon fetch into submit and initial load**

In the form submit handler (app.js:936), after `fetchForecast(activePostcode);`, add:

```js
    fetchCarbonIntensity(activePostcode);
```

In `startApp` (app.js:1030), after `fetchForecast(activePostcode);`, add:

```js
  fetchCarbonIntensity(activePostcode);
```

- [ ] **Step 5: Manually verify the network calls**

Serve the repo root, open DevTools → Network, and confirm that on load (and on each postcode submit) four requests are issued to `api.carbonintensity.org.uk` (two `/intensity/...` and two `/regional/intensity/...`) and that `carbonData` in the console is an array of 3 day objects with `reports` containing all four series keys.

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "feat: fetch and merge carbon intensity data"
```

### Task 4: Metric entry, series legend UI, URL param, insights hiding and slider cap

**Files:**
- Modify: `app.js` (`METRICS` lines 49-86, `syncParamsFromURL` lines 126-179, `updateURLParams` lines 190-199, `updateDashboard` lines 371-390, Show All / Hide All handlers lines 1001-1011)

**Interfaces:**
- Consumes: `CARBON_SERIES`, `isCarbonMetric`, `carbonSeriesVisible` from Task 3; `#carbonSeriesLegend`, `#summaryGrid`, `#psychroInfo` from Task 1; `renderChart`, `updateURLParams`, `renderDayCards` existing functions.
- Produces: `METRICS.carbon_intensity`; `renderCarbonSeriesLegend()` (builds chips into `#carbonSeriesLegend`, toggling handled inline); `series` URL param read/write; carbon-aware Show All / Hide All; hiding of `#summaryGrid`/`#psychroInfo` and slider cap while carbon active.

- [ ] **Step 1: Add the metric definition**

In `METRICS` after the `precip_prob` entry (app.js:80-85), add:

```js
  carbon_intensity: {
    label: 'Carbon Intensity',
    unit: ' gCO₂/kWh',
    yAxisLabel: 'Carbon Intensity (gCO₂/kWh)',
    getValue: (report) => report.regional_forecast ?? report.regional_historic
  }
```

- [ ] **Step 2: Read the `series` URL param**

In `syncParamsFromURL`, after the existing `mt` metric block (app.js:145-148), add:

```js
  const sc = params.get('series');
  if (sc) {
    const parts = sc.split(',');
    carbonSeriesVisible = carbonSeriesVisible.map((v, i) => parts[i] !== '0');
  }
```

- [ ] **Step 3: Write the `series` URL param**

In `updateURLParams` (app.js:190-199), after `params.set('metric', activeMetric);`, add:

```js
  params.set('series', carbonSeriesVisible.map(v => (v ? '1' : '0')).join(','));
```

- [ ] **Step 4: Add the series legend renderer and carbon-aware Show All / Hide All**

Add this function after `updateRangeBadge` (app.js:245):

```js
function renderCarbonSeriesLegend() {
  const el = document.getElementById('carbonSeriesLegend');
  if (!el) return;
  el.innerHTML = '';
  CARBON_SERIES.forEach((s, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'series-chip' + (carbonSeriesVisible[i] ? ' active' : '');
    chip.style.setProperty('--series-color', s.color);
    chip.innerHTML = `<span class="series-chip-dot"></span>${s.short}`;
    chip.addEventListener('click', () => {
      carbonSeriesVisible[i] = !carbonSeriesVisible[i];
      chip.classList.toggle('active', carbonSeriesVisible[i]);
      updateURLParams();
      renderChart();
    });
    el.appendChild(chip);
  });
}
```

Replace the two existing handlers (app.js:1001-1011) with carbon-aware versions:

```js
  document.getElementById('btnSelectAll').addEventListener('click', () => {
    if (isCarbonMetric()) {
      carbonSeriesVisible = carbonSeriesVisible.map(() => true);
      renderCarbonSeriesLegend();
      renderChart();
      return;
    }
    getVisibleForecastData().forEach(day => day.visible = true);
    document.querySelectorAll('.day-card').forEach(card => card.classList.add('active'));
    updateChartVisibility();
  });

  document.getElementById('btnDeselectAll').addEventListener('click', () => {
    if (isCarbonMetric()) {
      carbonSeriesVisible = carbonSeriesVisible.map(() => false);
      renderCarbonSeriesLegend();
      renderChart();
      return;
    }
    getVisibleForecastData().forEach(day => day.visible = false);
    document.querySelectorAll('.day-card').forEach(card => card.classList.remove('active'));
    updateChartVisibility();
  });
```

- [ ] **Step 5: Make `updateDashboard` carbon-aware**

At the top of `updateDashboard` (before the `const visibleData = getVisibleForecastData();` line and its `if (visibleData.length === 0) return;` guard, app.js:371-373), add a carbon branch so the UI toggles immediately even before carbon data finishes loading:

```js
  if (isCarbonMetric()) {
    renderCarbonSeriesLegend();
    const legendEl = document.getElementById('carbonSeriesLegend');
    if (legendEl) legendEl.classList.add('visible');
    document.querySelector('.color-legend') && (document.querySelector('.color-legend').style.display = 'none');
    const summaryGrid = document.getElementById('summaryGrid');
    const psychroInfo = document.getElementById('psychroInfo');
    if (summaryGrid) summaryGrid.style.display = 'none';
    if (psychroInfo) psychroInfo.style.display = 'none';
    if (rangeSlider && carbonData.length) {
      rangeSlider.max = carbonData.length;
      if (forecastDaysLimit > carbonData.length) forecastDaysLimit = carbonData.length;
      rangeSlider.value = forecastDaysLimit;
      updateRangeBadge();
    }
  } else {
    const legendEl = document.getElementById('carbonSeriesLegend');
    if (legendEl) legendEl.classList.remove('visible');
    document.querySelector('.color-legend') && (document.querySelector('.color-legend').style.display = '');
    const summaryGrid = document.getElementById('summaryGrid');
    const psychroInfo = document.getElementById('psychroInfo');
    if (summaryGrid) summaryGrid.style.display = '';
    if (psychroInfo) psychroInfo.style.display = '';
    if (rangeSlider && forecastData.length) {
      rangeSlider.max = forecastData.length;
      if (forecastDaysLimit > forecastData.length) forecastDaysLimit = forecastData.length;
      rangeSlider.value = forecastDaysLimit;
      updateRangeBadge();
    }
  }
```

In `updateDashboard` (app.js:371-390), also guard the final `calculateInsights();` call (the "Render subcomponents" block) so it does not run against carbon data:

```js
  renderDayCards();
  renderChart();
  if (!isCarbonMetric()) calculateInsights();
```

- [ ] **Step 6: Manually verify sidebar, legend and URL state**

Serve the repo root and verify:
- Click "Carbon Intensity": `#carbonSeriesLegend` appears with 4 chips; `#summaryGrid` and `#psychroInfo` are hidden; the range slider caps at 3.
- Click each chip: the corresponding class toggles and the URL `series` param updates.
- Show All / Hide All toggle all chips when carbon is active.
- Click a weather metric again: legend hides, insights/info return, slider restores to the weather day count.
- Reload with `...&metric=carbon_intensity&series=1,0,1,0`: chips for national forecast and national historic are inactive on load.

- [ ] **Step 7: Commit**

```bash
git add app.js
git commit -m "feat: carbon metric state, series legend, and insights hiding"
```

### Task 5: Carbon-aware day cards

**Files:**
- Modify: `app.js` (`getDayMetricRange` lines 395-417, `renderDayCards` line 445)

**Interfaces:**
- Consumes: `CARBON_SERIES`, `isCarbonMetric` from Task 3.
- Produces: carbon branch in `getDayMetricRange` showing a per-day max gCO₂/kWh; a leaf emoji instead of a weather icon on carbon day cards.

- [ ] **Step 1: Add the carbon branch to `getDayMetricRange`**

At the top of `getDayMetricRange` (before `const metricConfig = METRICS[metric];`, app.js:397), add:

```js
  if (metric === 'carbon_intensity') {
    const vals = [];
    day.reports.forEach(r => {
      CARBON_SERIES.forEach(s => {
        if (r[s.key] !== null && r[s.key] !== undefined) vals.push(r[s.key]);
      });
    });
    if (vals.length === 0) return '--';
    return `<span class="day-temp-max">${Math.round(Math.max(...vals))}</span> <span class="day-temp-min">${Math.round(Math.min(...vals))} gCO₂/kWh</span>`;
  }
```

- [ ] **Step 2: Use a leaf icon on carbon day cards**

In `renderDayCards`, replace the icon line (app.js:445):

```js
    const icon = getWeatherIcon(day.weatherText);
```
with:
```js
    const icon = isCarbonMetric() ? '🍃' : getWeatherIcon(day.weatherText);
```

- [ ] **Step 3: Manually verify day cards**

Serve the repo root, switch to Carbon Intensity, and verify:
- ~3 day cards appear (past-24h day, today, tomorrow), each labelled "Today" or its weekday, showing a leaf icon and a `NNN gCO₂/kWh` max value.
- Clicking a card toggles it and (in overlay and sequence modes) updates the chart.
- Switching back to a weather metric restores the weather day cards and emoji icons.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: carbon-aware day cards"
```

### Task 6: Carbon chart rendering and tooltip

**Files:**
- Modify: `app.js` (`getChartDatasets` lines 518-597, `getSequenceLabels` region, `renderChart` lines 602-679, `updateChartVisibility` lines 681-692, `updateChartLineStyle` lines 694-709, `handleCustomTooltip` lines 714-840)

**Interfaces:**
- Consumes: `HALF_HOUR_LABELS`, `CARBON_SERIES`, `isCarbonMetric`, `carbonSeriesVisible`, `carbonData`, `carbonSequenceReports` from Task 3.
- Produces: carbon branches in `getChartDatasets` (sequence + overlay), `renderChart` (labels + x-tick callback), `updateChartVisibility` (re-render for carbon), `updateChartLineStyle` (no-op for carbon), `handleCustomTooltip` (carbon series values).

- [ ] **Step 1: Add the carbon branches to `getChartDatasets`**

Replace the entire `getChartDatasets` function (app.js:518-597) with a version that adds two carbon branches at the top and leaves the weather sequence/overlay logic exactly as it is:

```js
function getChartDatasets() {
  const metricConfig = METRICS[activeMetric];
  const visibleData = getVisibleForecastData();

  if (isCarbonMetric() && activeChartMode === 'sequence') {
    carbonSequenceReports = [];
    const labels = [];
    visibleData.forEach(day => {
      if (!day.visible) return;
      day.reports.forEach(r => {
        labels.push(`${day.formattedDate} ${r.timeslot}`);
        carbonSequenceReports.push({ day, report: r });
      });
    });

    const datasets = CARBON_SERIES.map((s, si) => ({
      label: s.label,
      data: carbonSequenceReports.map(item => item.report[s.key]),
      borderColor: s.color,
      backgroundColor: 'transparent',
      borderDash: s.dash,
      borderWidth: 2,
      tension: 0.3,
      spanGaps: true,
      hidden: !carbonSeriesVisible[si],
      pointRadius: 0,
      pointHoverRadius: 5,
      pointBackgroundColor: s.color
    }));

    return { labels, datasets };
  }

  if (isCarbonMetric()) {
    const datasets = [];
    visibleData.forEach(day => {
      CARBON_SERIES.forEach((s, si) => {
        const arr = Array(48).fill(null);
        day.reports.forEach(r => {
          if (r[s.key] !== null && r[s.key] !== undefined) arr[r.halfHour] = r[s.key];
        });
        datasets.push({
          label: `${day.formattedDate} · ${s.short}`,
          data: arr,
          borderColor: s.color,
          backgroundColor: 'transparent',
          borderDash: s.dash,
          borderWidth: 2,
          tension: 0.3,
          spanGaps: true,
          hidden: !day.visible || !carbonSeriesVisible[si],
          pointRadius: 0,
          pointHoverRadius: 5,
          pointBackgroundColor: s.color
        });
      });
    });

    return { labels: HALF_HOUR_LABELS, datasets };
  }

  if (activeChartMode === 'sequence') {
    const dataArray = [];
    visibleData.forEach(day => {
      if (!day.visible) return;
      day.reports.forEach(report => {
        dataArray.push(metricConfig.getValue(report));
      });
    });

    return [{
      label: `${metricConfig.label} Sequence`,
      data: dataArray,
      borderColor: function(context) {
        const chart = context.chart;
        const {ctx, chartArea} = chart;
        if (!chartArea) return null;
        const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
        gradient.addColorStop(0, `hsla(${TIMELINE_COLORS.startHue}, 85%, 60%, 1)`);
        gradient.addColorStop(1, `hsla(${TIMELINE_COLORS.endHue}, 85%, 60%, 1)`);
        return gradient;
      },
      backgroundColor: 'transparent',
      borderWidth: 3,
      tension: 0.35,
      spanGaps: true,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: '#ffffff',
      pointHoverBorderWidth: 2
    }];
  } else {
    return visibleData.map((day, i) => {
      const dataArray = Array(24).fill(null);
      day.reports.forEach(report => {
        dataArray[report.hour] = metricConfig.getValue(report);
      });

      let colorOpacity = 0.8;
      let borderWidth = 2;

      if (highlightedDayIndex !== null) {
        if (highlightedDayIndex === i) {
          colorOpacity = 1.0;
          borderWidth = 4;
        } else {
          colorOpacity = 0.15;
          borderWidth = 1.5;
        }
      }

      const lineColor = getDayColor(i, visibleData.length, colorOpacity);

      return {
        label: day.formattedDate,
        data: dataArray,
        borderColor: lineColor,
        backgroundColor: 'transparent',
        borderWidth: borderWidth,
        tension: 0.35,
        spanGaps: true,
        hidden: !day.visible,
        pointBackgroundColor: lineColor,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#ffffff',
        pointHoverBorderColor: lineColor,
        pointHoverBorderWidth: 2,
        pointRadius: (context) => {
          return context.dataset.hidden ? 0 : 2;
        }
      };
    });
  }
}
```

The two carbon branches return `{ labels, datasets }` objects; the weather branches return arrays as before, so `renderChart` (Step 2) distinguishes them via `isCarbonMetric()`.

- [ ] **Step 2: Update `renderChart` to consume the new return shape**

In `renderChart`, replace the config construction (app.js:609-617) so the labels and tick callback come from the dataset-builder result. Replace:

```js
  if (chartInstance) {
    chartInstance.destroy();
  }
  
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: activeChartMode === 'sequence' ? getSequenceLabels() : HOURS,
      datasets: datasets
    },
```

with:

```js
  if (chartInstance) {
    chartInstance.destroy();
  }

  const isCarbon = isCarbonMetric();
  const built = isCarbon ? datasets : null;

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: built ? built.labels : (activeChartMode === 'sequence' ? getSequenceLabels() : HOURS),
      datasets: built ? built.datasets : datasets
    },
```

Then replace the x-axis tick `callback` (app.js:647-658) with a carbon-aware version:

```js
            callback: function(val, index) {
              const label = this.getLabelForValue(val);
              if (activeChartMode === 'sequence') {
                if (isCarbon && label) {
                  return label.endsWith(':00') ? label.substring(label.length - 5) : '';
                }
                if (label && label.endsWith('12:00')) return label.split(' ')[0];
                return '';
              } else {
                if (isCarbon) return index % 4 === 0 ? label : '';
                return index % 3 === 0 ? label : '';
              }
            }
```

- [ ] **Step 3: Update `updateChartVisibility` and `updateChartLineStyle`**

In `updateChartVisibility` (app.js:681-692), make carbon re-render fully on day toggle:

```js
function updateChartVisibility() {
  if (!chartInstance) return;
  if (isCarbonMetric() || activeChartMode === 'sequence') {
    renderChart();
  } else {
    const visibleData = getVisibleForecastData();
    visibleData.forEach((day, i) => {
      chartInstance.setDatasetVisibility(i, day.visible);
    });
    chartInstance.update('none');
  }
}
```

In `updateChartLineStyle` (app.js:694-709), early-return for carbon so the hover-highlight logic does not recolor series lines:

```js
function updateChartLineStyle() {
  if (!chartInstance) return;
  if (isCarbonMetric() || activeChartMode === 'sequence') return;
```

- [ ] **Step 4: Add the carbon branch to `handleCustomTooltip`**

At the top of `handleCustomTooltip`, after the `const hourIndex = dataPoints[0].dataIndex;` line (app.js:726), insert a carbon branch:

```js
  if (activeMetric === 'carbon_intensity') {
    if (activeChartMode === 'sequence') {
      const item = carbonSequenceReports[hourIndex];
      if (!item) return;
      const { day, report } = item;
      let rows = '';
      CARBON_SERIES.forEach(s => {
        const v = report[s.key];
        if (v !== null && v !== undefined) {
          rows += `<div class="tooltip-row" style="color: ${s.color};"><span>${s.label}</span><span class="tooltip-value">${Math.round(v)} gCO₂/kWh</span></div>`;
        }
      });
      html = `
        <div class="tooltip-header">
          <span>${day.formattedDate}</span>
          <span>${report.timeslot}</span>
        </div>
        ${rows}
      `;
    } else {
      html = `<div class="tooltip-header"><span>Time: ${HALF_HOUR_LABELS[hourIndex]}</span></div>`;
      const visibleData = getVisibleForecastData();
      visibleData.forEach(day => {
        if (!day.visible) return;
        const report = day.reports.find(r => r.halfHour === hourIndex);
        if (!report) return;
        CARBON_SERIES.forEach(s => {
          const v = report[s.key];
          if (v !== null && v !== undefined) {
            html += `
              <div class="tooltip-row" style="color: ${s.color};">
                <span class="tooltip-label">${day.formattedDate} ${s.short}</span>
                <span class="tooltip-value">${Math.round(v)} gCO₂/kWh</span>
              </div>
            `;
          }
        });
      });
    }
    customTooltip.innerHTML = html;
    const position = context.chart.canvas.getBoundingClientRect();
    const tooltipWidth = customTooltip.offsetWidth || 160;
    const caretAbsLeft = position.left + tooltipModel.caretX;
    const gap = 15;
    let left;
    if (caretAbsLeft + gap + tooltipWidth > window.innerWidth) {
      left = caretAbsLeft - tooltipWidth - gap;
    } else {
      left = caretAbsLeft + gap;
    }
    left = Math.max(8, left);
    customTooltip.style.opacity = 1;
    customTooltip.style.left = left + window.pageXOffset + 'px';
    customTooltip.style.top = position.top + window.pageYOffset + tooltipModel.caretY - 20 + 'px';
    return;
  }
```

- [ ] **Step 5: Manually verify the full feature**

Serve the repo root and verify:
- Carbon Intensity metric in **overlay** mode: 48-slot x-axis, four series lines (solid = forecasts, dashed = historic), day cards toggle days, chips toggle series, Show All / Hide All work.
- **Sequence** mode: continuous half-hourly timeline spanning past-24h → +48h; day cards and chips toggle correctly.
- Hovering shows the custom tooltip with all present series values for that timestamp, correctly clamped within the viewport (test on a narrow window).
- URL `series`/`metric` params persist on reload.
- All weather metrics still render exactly as before (no regression in overlay/sequence modes, day cards, insights, tooltips).

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "feat: render carbon intensity chart and tooltip"
```