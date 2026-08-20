# Automated Testing Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unit tests (Node `node:test`), Playwright browser tests, and a GitHub Actions CI workflow so every change is verified automatically.

**Architecture:** Extract the pure calculation/processing logic from the 1398-line `app.js` monolith into a new `weather.js` ES module that dual-exposes — it assigns globals via `Object.assign(window, ...)` (so classic-script `app.js` keeps resolving the same names it already uses) and `export`s for Node imports. Unit tests run with Node's built-in runner (zero dependencies). Playwright drives a local `http-server` for E2E. CI runs both on push to main and on PRs.

**Tech Stack:** Node 20 (`node:test`, `node --test`), plain ESM `weather.js`, Playwright `@playwright/test` (chromium), GitHub Actions.

**Design spec:** `docs/superpowers/specs/2026-08-20-automated-testing-design.md`

## Global Constraints

- `npm test` must run with zero new dependencies (only Node's built-in `node:test`).
- `app.js` stays a classic script (no `import`) and keeps working with the same global function names.
- Behavior must be byte-for-byte identical to current `app.js` — the E2E suite and a manual `npm run dev` smoke verify this after the refactor.
- `processForecastData` and `buildCarbonData` must **return** their arrays; `app.js` owns the `forecastData`/`carbonData` state globals.
- Preserve existing code comments when moving code (minimal diff).
- Only new dependency is dev-only `@playwright/test`.
- E2E tests must `test.skip` (never fail) when the live BBC API is unreachable.
- package.json gets `"type": "module"` (needed so Node treats `weather.js` as ESM). Adding it does not affect the browser; `app.js` is never imported in Node.

---

### Task 1: Extract pure leaf functions into `weather.js` (psychrometrics + utils)

**Files:**
- Create: `weather.js`
- Modify: `app.js` (delete moved blocks), `index.html:281` (add module script before app.js), `package.json` (`"type": "module"`, add `test` script)
- Test: `test/unit/psychrometrics.test.mjs`, `test/unit/utils.test.mjs`

**Interfaces:**
- Consumes: nothing new (these are the existing `app.js` functions, moved verbatim).
- Produces: `weather.js` exports `saturatePressure(temp)`, `calculateIndoorHumidity(outsideTemp, outsideHumidity, indoorTemp)`, `getDayColor(index, total, opacity=1)`, `isTodayDateStr(dateStr)`, `formatDateLabel(dateStr)`, `getWeatherIcon(text)`, `getDayMetricRange(day, metric)`, and constants `CARBON_SERIES`, `METRICS`, `TIMELINE_COLORS`. Also assigns all of the above onto `window` so `app.js` keeps calling them as bare globals.

- [ ] **Step 1: Set up ESM + test script**

Edit `package.json`:
- Add `"type": "module"` after the `"description"` line.
- Replace the `"scripts"` block with:
```json
"scripts": {
  "dev": "npx -y http-server -p 8080 -o",
  "test": "node --test test/unit/",
  "test:e2e": "playwright test",
  "test:all": "npm test && npm run test:e2e"
}
```

- [ ] **Step 2: Write the failing unit tests**

Create `test/unit/psychrometrics.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saturatePressure, calculateIndoorHumidity } from '../../weather.js';

test('saturatePressure is monotonic and positive', () => {
  const low = saturatePressure(0);
  const mid = saturatePressure(20);
  const high = saturatePressure(40);
  assert.ok(low > 0 && mid > low && high > mid);
});

test('calculateIndoorHumidity with identical indoor/outdoor temp preserves outside RH', () => {
  // At equal temps the ratio of saturation pressures is 1, so RH_in ≈ RH_out.
  const result = calculateIndoorHumidity(20, 50, 20);
  assert.ok(Math.abs(result - 50) < 0.5);
});

test('calculateIndoorHumidity clamps to 0..100', () => {
  assert.ok(calculateIndoorHumidity(0, 99, 40) <= 100);
  assert.ok(calculateIndoorHumidity(-5, 5, 20) >= 0);
});

test('calculateIndoorHumidity returns null for null inputs', () => {
  assert.equal(calculateIndoorHumidity(null, 50, 20), null);
  assert.equal(calculateIndoorHumidity(20, null, 20), null);
  assert.equal(calculateIndoorHumidity(20, 50, null), null);
});

test('calculateIndoorHumidity round-trips a typical UK winter night', () => {
  // 5°C outside at 90% RH, 21°C inside → inside RH lower because warm air holds more moisture.
  const result = calculateIndoorHumidity(5, 90, 21);
  assert.ok(result > 0 && result < 90);
});
```

Create `test/unit/utils.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDayColor, isTodayDateStr, formatDateLabel, getWeatherIcon, getDayMetricRange } from '../../weather.js';

test('getDayColor interpolates start hue (now) to end hue (future)', () => {
  assert.match(getDayColor(0, 7), /^hsla\(205,/);
  assert.match(getDayColor(6, 7), /^hsla\(280,/);
});

test('getDayColor handles a single day without dividing by zero', () => {
  assert.doesNotThrow(() => getDayColor(0, 1));
});

test('isTodayDateStr matches the current local date string', () => {
  const d = new Date();
  const today = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  assert.equal(isTodayDateStr(today), true);
  assert.equal(isTodayDateStr('2099-01-01'), false);
});

test('formatDateLabel formats an ISO date and falls back for garbage', () => {
  assert.equal(formatDateLabel('not-a-date'), 'not-a-date');
  assert.ok(formatDateLabel('2026-08-20').length > 0);
});

test('getWeatherIcon maps weather text', () => {
  assert.equal(getWeatherIcon('Sunny intervals'), '☀️');
  assert.equal(getWeatherIcon('Light rain'), '🌧️');
  assert.equal(getWeatherIcon('Cloudy'), '☁️');
  assert.equal(getWeatherIcon('Heavy snow'), '❄️');
  assert.equal(getWeatherIcon('Thunder possible'), '⛈️');
  assert.equal(getWeatherIcon('Unknown vogon weather'), '⛅');
});

test('getDayMetricRange computes min/max for a metric', () => {
  const day = {
    reports: [
      { outside_temp: 18, inside_humidity: 55, wind_speed: 12, precip_prob: 20 },
      { outside_temp: 22, inside_humidity: 61, wind_speed: 8, precip_prob: 0 }
    ]
  };
  assert.match(getDayMetricRange(day, 'outside_temp'), /22.*18/m);
  assert.match(getDayMetricRange(day, 'outside_temp'), /°<span/);
  assert.equal(getDayMetricRange(day, 'inside_humidity').includes('%'), true);
});

test('getDayMetricRange returns -- for empty reports', () => {
  assert.equal(getDayMetricRange({ reports: [] }, 'outside_temp'), '--');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` / cannot find module `../../weather.js` (and the package.json changes above are prerequisites for import syntax to work).

- [ ] **Step 4: Create `weather.js` with the leaf functions**

Create `weather.js` containing (moved verbatim from `app.js`, preserving comments, keeping the `formatDateLabel`/`isTodayDateStr` bodies identical, and replacing the global `TIMELINE_COLORS` reference inside `getDayColor` with the module-scope constant):
```js
// Shared pure constants and calculations, extracted from app.js.
// Loaded as an ES module in the browser (see index.html) and importable in Node for unit tests.

export const CARBON_SERIES = [
  { key: 'regional_forecast', label: 'Regional Forecast', short: 'Regional F', color: '#34d399', dash: [] },
  { key: 'national_forecast', label: 'National Forecast', short: 'National F', color: '#60a5fa', dash: [] },
  { key: 'regional_historic', label: 'Regional Historic', short: 'Regional H', color: '#a78bfa', dash: [4, 4] },
  { key: 'national_historic', label: 'National Historic', short: 'National H', color: '#fbbf24', dash: [4, 4] }
];

export const METRICS = {
  outside_temp: {
    label: 'Outside Temperature',
    unit: '°C',
    yAxisLabel: 'Temperature (°C)',
    getValue: (report) => report.outside_temp
  },
  inside_humidity: {
    label: 'Indoor Relative Humidity',
    unit: '%',
    yAxisLabel: 'Indoor Relative Humidity (%)',
    getValue: (report) => report.inside_humidity
  },
  outside_humidity: {
    label: 'Outside Relative Humidity',
    unit: '%',
    yAxisLabel: 'Outside Relative Humidity (%)',
    getValue: (report) => report.outside_humidity
  },
  feels_like: {
    label: 'Feels Like Temperature',
    unit: '°C',
    yAxisLabel: 'Apparent Temp (°C)',
    getValue: (report) => report.feels_like
  },
  wind_speed: {
    label: 'Wind Speed',
    unit: ' km/h',
    yAxisLabel: 'Wind Speed (km/h)',
    getValue: (report) => report.wind_speed
  },
  precip_prob: {
    label: 'Precipitation Probability',
    unit: '%',
    yAxisLabel: 'Chance of Rain (%)',
    getValue: (report) => report.precip_prob
  },
  carbon_intensity: {
    label: 'Carbon Intensity',
    unit: ' gCO₂/kWh',
    yAxisLabel: 'Carbon Intensity (gCO₂/kWh)',
    getValue: (report) => report.regional_forecast ?? report.regional_historic
  }
};

// Consistent color scale for the timeline (Now -> Future)
export const TIMELINE_COLORS = {
  startHue: 205, // Sky Blue (Now)
  endHue: 280    // Purple (Future)
};

/**
 * Psychrometric calculations for relative humidity
 * Saturate vapor pressure is calculated via Magnus-Tetens formula.
 */
export function saturatePressure(temp) {
  return 6.122 * Math.exp((17.62 * temp) / (243.12 + temp));
}

export function calculateIndoorHumidity(outsideTemp, outsideHumidity, indoorTemp) {
  if (outsideTemp === null || outsideHumidity === null || indoorTemp === null) return null;
  const pSatOutside = saturatePressure(outsideTemp);
  const pSatInside = saturatePressure(indoorTemp);
  // Calculate relative humidity inside (assuming moisture level is similar to outdoors)
  const insideRH = (indoorTemp + 273.15) * outsideHumidity * pSatOutside / ((outsideTemp + 273.15) * pSatInside);
  return Math.min(100, Math.max(0, Math.round(insideRH * 10) / 10));
}

/**
 * Generate beautiful sequential color scale for days in forecast
 * Now (Today) is Sky Blue, transitioning to Purple for Future.
 */
export function getDayColor(index, total, opacity = 1) {
  const startHue = TIMELINE_COLORS.startHue;
  const endHue = TIMELINE_COLORS.endHue;
  const hue = startHue + (index / Math.max(1, total - 1)) * (endHue - startHue);
  return `hsla(${hue}, 85%, 60%, ${opacity})`;
}

export function isTodayDateStr(dateStr) {
  const d = new Date();
  const today = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  return dateStr === today;
}

export function formatDateLabel(dateStr) {
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj)) return dateStr;
  return dateObj.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function getWeatherIcon(text) {
  const desc = text.toLowerCase();
  if (desc.includes('sun') || desc.includes('clear')) return '☀️';
  if (desc.includes('rain') || desc.includes('drizzle') || desc.includes('shower')) return '🌧️';
  if (desc.includes('snow') || desc.includes('sleet') || desc.includes('hail')) return '❄️';
  if (desc.includes('thunder')) return '⛈️';
  if (desc.includes('cloud') || desc.includes('overcast')) return '☁️';
  if (desc.includes('mist') || desc.includes('fog')) return '🌫️';
  return '⛅';
}

export function getDayMetricRange(day, metric) {
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
  const metricConfig = METRICS[metric];
  const values = day.reports
    .map(r => metricConfig.getValue(r))
    .filter(val => val !== null && val !== undefined);
  if (values.length === 0) return '--';
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (metric === 'outside_temp' || metric === 'feels_like') {
    return `<span class="day-temp-max">${Math.round(max)}°</span> <span class="day-temp-min">${Math.round(min)}°</span>`;
  } else if (metric === 'inside_humidity' || metric === 'outside_humidity') {
    return `<span class="day-temp-max">${Math.round(max)}%</span> <span class="day-temp-min">${Math.round(min)}%</span>`;
  } else if (metric === 'wind_speed') {
    return `<span class="day-temp-max">${Math.round(max)}</span> <span class="day-temp-min" style="font-size: 10px;">km/h</span>`;
  } else if (metric === 'precip_prob') {
    return `<span class="day-temp-max">${Math.round(max)}%</span> <span class="day-temp-min" style="font-size: 10px;">rain</span>`;
  }
  return `<span class="day-temp-max">${Math.round(max)}</span> <span class="day-temp-min">${Math.round(min)}</span>`;
}

// Expose as globals for classic-script app.js, which resolves these names bare.
if (typeof window !== 'undefined') {
  Object.assign(window, {
    CARBON_SERIES,
    METRICS,
    TIMELINE_COLORS,
    saturatePressure,
    calculateIndoorHumidity,
    getDayColor,
    isTodayDateStr,
    formatDateLabel,
    getWeatherIcon,
    getDayMetricRange
  });
}
```

- [ ] **Step 5: Wire `weather.js` into the page and strip the moved code from `app.js`**

In `index.html`, replace line 281 (`<script src="app.js"></script>`) with:
```html
  <script type="module" src="weather.js"></script>
  <script src="app.js"></script>
```

In `app.js`, delete these blocks (they are now globals provided by `weather.js`; note `app.js` still references these names bare throughout — those references keep resolving):
- Lines 26-31 (`const CARBON_SERIES = [...]`)
- Lines 73-116 (`const METRICS = {...}`)
- Lines 119-122 (`const TIMELINE_COLORS = {...}`)
- Lines 128-139 (`saturatePressure`, `calculateIndoorHumidity`)
- Lines 141-151 (`getDayColor`)
- Lines 240-250 (`isTodayDateStr`, `formatDateLabel`)
- Lines 577-609 (`getDayMetricRange`)
- Lines 696-705 (`getWeatherIcon`)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (all psychrometrics + utils specs).

- [ ] **Step 7: Sanity-check the browser still works**

Run: `npm run dev`, open `http://localhost:8080`, confirm the chart loads, metrics render, and the console has no errors.

- [ ] **Step 8: Commit**

```bash
git add weather.js test/unit index.html app.js package.json
git commit -m "refactor: extract pure calculations into weather.js module"
```

---

### Task 2: Extract forecast & carbon processing (return values, no DOM)

**Files:**
- Modify: `weather.js` (append 3 functions), `app.js` (update `fetchForecast`, `fetchCarbonIntensity`; add `syncRangeSliderLimits`; delete moved blocks)
- Test: `test/unit/forecast.test.mjs`, `test/unit/carbon.test.mjs`

**Interfaces:**
- Consumes: from Task 1 — `calculateIndoorHumidity`, `formatDateLabel` (module scope inside `weather.js`).
- Produces: `weather.js` additionally exports `normalizeCarbonSeries(payload)` → `[{timestamp, value}]`, `buildCarbonData(seriesResults)` → day objects array (same shape `app.js` previously stored in `carbonData`), `processForecastData(data, indoorTemp)` → day objects array (same shape as `forecastData`). `app.js` assigns the results into its `carbonData`/`forecastData` globals and a new helper `syncRangeSliderLimits()` recreates the slider side-effects previously inside `processForecastData`.

- [ ] **Step 1: Write the failing unit tests**

Create `test/unit/forecast.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processForecastData } from '../../weather.js';

const payload = {
  forecasts: [
    {
      summary: { report: { localDate: '2026-08-20', maxTempC: 24, minTempC: 14, weatherTypeText: 'Sunny' } },
      detailed: {
        reports: [
          { localDate: '2026-08-20', timeslot: '09:00', temperatureC: 16, humidity: 80, feelsLikeTemperatureC: 15, windSpeedKph: 12, windDirectionAbbreviation: 'WSW', precipitationProbabilityInPercent: 10, weatherTypeText: 'Sunny' },
          { localDate: '2026-08-20', timeslot: '15:00', temperatureC: 22, humidity: 50, feelsLikeTemperatureC: 21, windSpeedKph: 18, windDirectionAbbreviation: 'SW', precipitationProbabilityInPercent: 5, weatherTypeText: 'Sunny' }
        ]
      }
    },
    {
      summary: { report: { localDate: '2026-08-21' } },
      detailed: {
        reports: [
          { localDate: '2026-08-21', timeslot: '12:00', temperatureC: 19, humidity: 65, feelsLikeTemperatureC: 18, windSpeedKph: 10, windDirectionAbbreviation: 'W', precipitationProbabilityInPercent: 20, weatherTypeText: 'Cloudy' }
        ]
      }
    }
  ]
};

test('processForecastData groups by localDate and sorts reports by hour', () => {
  const days = processForecastData(payload, 21);
  assert.equal(days.length, 2);
  assert.deepEqual(days.map(d => d.dateStr), ['2026-08-20', '2026-08-21']);
  assert.deepEqual(days[0].reports.map(r => r.hour), [9, 15]);
});

test('processForecastData computes inside_humidity from the indoorTemp argument', () => {
  const days = processForecastData(payload, 21);
  const first = days[0].reports[0];
  assert.equal(typeof first.inside_humidity, 'number');
  assert.ok(first.inside_humidity > 0 && first.inside_humidity < 100);
});

test('processForecastData uses summary max/min when present', () => {
  const days = processForecastData(payload, 21);
  assert.equal(days[0].maxTemp, 24);
  assert.equal(days[0].minTemp, 14);
});

test('processForecastData falls back to computed temps and -- when none exist', () => {
  const days = processForecastData(payload, 21);
  assert.equal(days[1].maxTemp, 19);
  assert.equal(days[1].minTemp, 19);
  const noTempPayload = {
    forecasts: [{
      summary: {},
      detailed: {
        reports: [{ localDate: '2026-08-22', timeslot: '09:00' }]
      }
    }]
  };
  const noTemp = processForecastData(noTempPayload, 21);
  assert.equal(noTemp.length, 1);
  assert.equal(noTemp[0].maxTemp, '--');
  assert.equal(noTemp[0].minTemp, '--');
});

test('processForecastData returns an empty array when there are no hourly reports', () => {
  const empty = processForecastData({ forecasts: [{ summary: { report: { localDate: '2026-08-20' } }, detailed: { reports: [] } }] }, 21);
  assert.deepEqual(empty, []);
});
```

Create `test/unit/carbon.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCarbonSeries, buildCarbonData, formatDateLabel } from '../../weather.js';

test('normalizeCarbonSeries prefers forecast intensity over actual', () => {
  const payload = {
    data: [
      { intensity: { forecast: 120, actual: 90 }, from: '2026-08-20T00:00:00Z' },
      { intensity: { actual: 75 }, from: '2026-08-20T00:30:00Z' },
      { intensity: {}, from: '2026-08-20T01:00:00Z' }
    ]
  };
  const points = normalizeCarbonSeries(payload);
  assert.equal(points.length, 3);
  assert.equal(points[0].value, 120);
  assert.equal(points[1].value, 75);
  assert.equal(points[2].value, null);
  assert.equal(typeof points[0].timestamp, 'number');
});

test('buildCarbonData merges four series into timestamp-keyed reports with valid localDate', () => {
  const t0 = new Date('2026-08-20T10:00:00+01:00').getTime();
  const seriesResults = [
    { key: 'regional_forecast', points: [{ timestamp: t0, value: 100 }] },
    { key: 'national_forecast', points: [{ timestamp: t0, value: 90 }] },
    { key: 'regional_historic', points: [{ timestamp: t0, value: 80 }] },
    { key: 'national_historic', points: [{ timestamp: t0, value: 70 }] },
    { key: 'regional_forecast', points: [{ timestamp: t0, value: null }] }
  ];
  const days = buildCarbonData(seriesResults);
  assert.equal(days.length, 1);
  const report = days[0].reports[0];
  assert.equal(report.regional_forecast, 100);
  assert.equal(report.national_forecast, 90);
  assert.equal(report.regional_historic, 80);
  assert.equal(report.national_historic, 70);
  assert.equal(typeof days[0].formattedDate, 'string');
  assert.ok(days[0].formattedDate.length > 0);
  assert.equal(days[0].formattedDate, formatDateLabel(report.localDate));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — imports of `normalizeCarbonSeries`, `buildCarbonData`, `processForecastData` are undefined.

- [ ] **Step 3: Append the three functions to `weather.js`**

Append to `weather.js` (before the `if (typeof window !== 'undefined')` block or after it — either works, but keep the global exposure ordered so new names are included):

```js
export function normalizeCarbonSeries(payload) {
  const raw = payload.data || [];
  const items = Array.isArray(raw) ? raw : (raw.data || []);
  return items.map(el => {
    const intensity = el.intensity || {};
    const value = (typeof intensity.forecast !== 'undefined' ? intensity.forecast : intensity.actual) ?? null;
    return { timestamp: new Date(el.from).getTime(), value };
  });
}

export function buildCarbonData(seriesResults) {
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
  return Object.keys(byDate).sort().map((dateStr, index) => ({
    index,
    dateStr,
    formattedDate: formatDateLabel(dateStr),
    weatherText: 'carbon',
    reports: byDate[dateStr],
    visible: true
  }));
}

export function processForecastData(data, indoorTemp) {
  const forecasts = data.forecasts || [];
  const reportsByDate = {};
  const summaryByDate = {};
  forecasts.forEach(dayObj => {
    const summaryReport = (dayObj.summary && dayObj.summary.report) || {};
    if (summaryReport.localDate) summaryByDate[summaryReport.localDate] = summaryReport;
    const detailed = dayObj.detailed || {};
    const reports = detailed.reports || [];
    reports.forEach(r => {
      if (!r.localDate) return;
      if (!reportsByDate[r.localDate]) reportsByDate[r.localDate] = [];
      reportsByDate[r.localDate].push(r);
    });
  });
  const sortedDates = Object.keys(reportsByDate).sort();
  return sortedDates.map((dateStr, index) => {
    const reportsForDate = reportsByDate[dateStr];
    const parsedReports = reportsForDate.map(r => {
      const outside_temp = r.temperatureC;
      const outside_humidity = r.humidity;
      const inside_humidity = calculateIndoorHumidity(outside_temp, outside_humidity, indoorTemp);
      return {
        hour: parseInt(r.timeslot.split(':')[0]),
        timeslot: r.timeslot,
        localDate: r.localDate,
        outside_temp,
        outside_humidity,
        inside_humidity,
        feels_like: r.feelsLikeTemperatureC,
        wind_speed: r.windSpeedKph,
        wind_direction: r.windDirectionAbbreviation,
        precip_prob: r.precipitationProbabilityInPercent,
        weather_text: r.weatherTypeText || 'Unknown'
      };
    }).sort((a, b) => a.hour - b.hour);
    const summaryReport = summaryByDate[dateStr] || {};
    const temps = parsedReports.map(r => r.outside_temp).filter(t => t !== null && t !== undefined);
    const maxTemp = summaryReport.maxTempC !== null && summaryReport.maxTempC !== undefined ?
      summaryReport.maxTempC : (temps.length ? Math.max(...temps) : '--');
    const minTemp = summaryReport.minTempC !== null && summaryReport.minTempC !== undefined ?
      summaryReport.minTempC : (temps.length ? Math.min(...temps) : '--');
    const midIndex = Math.floor(parsedReports.length / 2);
    const weatherText = summaryReport.weatherTypeText ||
      (parsedReports[midIndex] && parsedReports[midIndex].weather_text) || 'Cloudy';
    return {
      index,
      dateStr,
      formattedDate: formatDateLabel(dateStr),
      maxTemp,
      minTemp,
      weatherText,
      reports: parsedReports,
      visible: true
    };
  });
}
```

Update the `Object.assign(window, ...)` block inside `weather.js` to also include `normalizeCarbonSeries`, `buildCarbonData`, `processForecastData`.

- [ ] **Step 4: Update `app.js` call sites**

In `app.js`:

1. Delete the moved blocks:
   - Lines 283-291 (`normalizeCarbonSeries`)
   - Lines 293-331 (`buildCarbonData`) — **note:** the original ends by writing `carbonData = ...`; the version in `weather.js` returns instead.
   - Lines 392-480 (`processForecastData`) — **note:** the original wrote `forecastData`, touched `rangeSlider`, and called `updateRangeBadge()`; the version in `weather.js` only returns the array.

2. In `fetchForecast` (around line 269), replace `processForecastData(data);` with:
```js
forecastData = processForecastData(data, activeIndoorTemp);
syncRangeSliderLimits();
```

3. Add this helper just above `fetchForecast` (replaces the slider side-effects that used to live at the end of `processForecastData`):
```js
function syncRangeSliderLimits() {
  const totalDays = forecastData.length;
  if (rangeSlider) {
    rangeSlider.max = totalDays;
    if (forecastDaysLimit > totalDays) {
      forecastDaysLimit = totalDays;
    }
    rangeSlider.value = forecastDaysLimit;
  }
  updateRangeBadge();
}
```

4. In `fetchCarbonIntensity`, replace `buildCarbonData(seriesResults);` with:
```js
carbonData = buildCarbonData(seriesResults);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (forecast + carbon specs plus the Task 1 specs).

- [ ] **Step 6: Sanity-check the browser still works**

Run: `npm run dev`, open `http://localhost:8080`. Confirm the chart renders with day cards, the forecast range slider max matches the returned day count, and the Carbon Intensity metric renders when selected.

- [ ] **Step 7: Commit**

```bash
git add weather.js app.js test/unit
git commit -m "refactor: make forecast/carbon processing pure and return data"
```

---

### Task 3: Extract `computeInsights` and render it from `app.js`

**Files:**
- Modify: `weather.js` (append `computeInsights`), `app.js` (replace `calculateInsights` body)
- Test: `test/unit/insights.test.mjs`

**Interfaces:**
- Consumes: from Task 1 — `getVisibleForecastData` is **not** used here; `app.js` passes the visible data array in.
- Produces: `weather.js` exports `computeInsights(visibleData)` → `{ peakTemp, peakTempTime, peakIndoorRH, peakIndoorRHTime, peakWind, peakWindTime, moldSustainedHours, totalHours, moldPercentage, moldRisk }`. Input `visibleData` is an array of day objects each shaped `{ formattedDate, reports: [{ outside_temp, inside_humidity, wind_speed, wind_direction, timeslot }] }`. `moldRisk` is `'HIGH' | 'MEDIUM' | 'LOW' | null` (null when no indoor-RH reports).

- [ ] **Step 1: Write the failing unit tests**

Create `test/unit/insights.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeInsights } from '../../weather.js';

function day(formattedDate, reports) {
  return { formattedDate, reports };
}

const demo = [
  day('Wed 20 Aug', [
    { outside_temp: 14, inside_humidity: 55, wind_speed: 20, wind_direction: 'SW', timeslot: '09:00' },
    { outside_temp: 18, inside_humidity: 62, wind_speed: 30, wind_direction: 'W', timeslot: '15:00' }
  ]),
  day('Thu 21 Aug', [
    { outside_temp: 16, inside_humidity: 68, wind_speed: 25, wind_direction: 'N', timeslot: '12:00' }
  ])
];

test('computeInsights finds warmest peak, indoor RH peak, and wind peak', () => {
  const s = computeInsights(demo);
  assert.equal(s.peakTemp, 18);
  assert.equal(s.peakTempTime, 'Wed 20 Aug @ 15:00');
  assert.equal(s.peakIndoorRH, 68);
  assert.equal(s.peakIndoorRHTime, 'Thu 21 Aug @ 12:00');
  assert.equal(s.peakWind, 30);
  assert.equal(s.peakWindTime, 'Wed 20 Aug @ 15:00 (W)');
  assert.equal(s.totalHours, 3);
  assert.equal(s.moldSustainedHours, 2);
});

test('computeInsights labels HIGH mold risk', () => {
  const s = computeInsights([
    day('Wed 20 Aug', [
      { outside_temp: 15, inside_humidity: 80, wind_speed: 10, wind_direction: 'SW', timeslot: '00:00' },
      { outside_temp: 15, inside_humidity: 80, wind_speed: 10, wind_direction: 'SW', timeslot: '06:00' },
      { outside_temp: 15, inside_humidity: 80, wind_speed: 10, wind_direction: 'SW', timeslot: '12:00' },
      { outside_temp: 15, inside_humidity: 80, wind_speed: 10, wind_direction: 'SW', timeslot: '18:00' },
      { outside_temp: 15, inside_humidity: 80, wind_speed: 10, wind_direction: 'SW', timeslot: '23:00' }
    ])
  ]);
  assert.equal(s.moldRisk, 'HIGH');
  assert.ok(s.moldPercentage > 50);
});

test('computeInsights labels LOW mold risk below thresholds', () => {
  const s = computeInsights([
    day('Wed 20 Aug', [
      { outside_temp: 15, inside_humidity: 50, wind_speed: 10, wind_direction: 'SW', timeslot: '00:00' }
    ])
  ]);
  assert.equal(s.moldRisk, 'LOW');
});

test('computeInsights returns null moldRisk with no indoor RH and handles empty input', () => {
  assert.equal(computeInsights([]).moldRisk, null);
  const noRH = computeInsights([
    day('Wed 20 Aug', [
      { outside_temp: 15, inside_humidity: null, wind_speed: 10, wind_direction: 'SW', timeslot: '00:00' }
    ])
  ]);
  assert.equal(noRH.peakIndoorRH, -Infinity);
  assert.equal(noRH.moldRisk, null);
  assert.equal(noRH.peakWind, 10);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `computeInsights` is undefined.

- [ ] **Step 3: Append `computeInsights` to `weather.js`**

```js
export function computeInsights(visibleData) {
  let peakTemp = -Infinity;
  let peakTempTime = '';
  let peakIndoorRH = -Infinity;
  let peakIndoorRHTime = '';
  let peakWind = -Infinity;
  let peakWindTime = '';
  let moldSustainedHours = 0;
  let totalHours = 0;
  visibleData.forEach(day => {
    day.reports.forEach(r => {
      totalHours++;
      if (r.outside_temp !== null && r.outside_temp > peakTemp) {
        peakTemp = r.outside_temp;
        peakTempTime = `${day.formattedDate} @ ${r.timeslot}`;
      }
      if (r.inside_humidity !== null && r.inside_humidity > peakIndoorRH) {
        peakIndoorRH = r.inside_humidity;
        peakIndoorRHTime = `${day.formattedDate} @ ${r.timeslot}`;
      }
      if (r.wind_speed !== null && r.wind_speed > peakWind) {
        peakWind = r.wind_speed;
        peakWindTime = `${day.formattedDate} @ ${r.timeslot} (${r.wind_direction})`;
      }
      if (r.inside_humidity !== null && r.inside_humidity > 60) {
        moldSustainedHours++;
      }
    });
  });
  const moldPercentage = totalHours ? (moldSustainedHours / totalHours) * 100 : 0;
  let moldRisk = null;
  if (peakIndoorRH !== -Infinity) {
    if (peakIndoorRH > 70 && moldPercentage > 15) {
      moldRisk = 'HIGH';
    } else if (peakIndoorRH > 60 && moldPercentage > 5) {
      moldRisk = 'MEDIUM';
    } else {
      moldRisk = 'LOW';
    }
  }
  return {
    peakTemp,
    peakTempTime,
    peakIndoorRH,
    peakIndoorRHTime,
    peakWind,
    peakWindTime,
    moldSustainedHours,
    totalHours,
    moldPercentage,
    moldRisk
  };
}
```

Add `computeInsights` to the `Object.assign(window, ...)` block.

- [ ] **Step 4: Replace the body of `calculateInsights` in `app.js`**

Replace the entire `calculateInsights()` function (currently app.js:1153-1227) with:
```js
function calculateInsights() {
  const insights = computeInsights(getVisibleForecastData());

  if (insights.peakTemp !== -Infinity) {
    valWarmest.textContent = `${insights.peakTemp}°C`;
    descWarmest.textContent = insights.peakTempTime;
  }

  if (insights.peakIndoorRH !== -Infinity) {
    valMaxIndoorRH.textContent = `${insights.peakIndoorRH}%`;
    descMaxIndoorRH.textContent = insights.peakIndoorRHTime;
  }

  if (insights.moldRisk !== null) {
    valMoldRisk.textContent = insights.moldRisk;
    valMoldRisk.style.color = insights.moldRisk === 'HIGH'
      ? 'var(--danger-color)'
      : insights.moldRisk === 'MEDIUM' ? 'var(--warning-color)' : 'var(--success-color)';
    descMoldRisk.textContent = (insights.moldRisk === 'HIGH' || insights.moldRisk === 'MEDIUM')
      ? `RH > 60% for ${Math.round(insights.moldPercentage)}% of forecast`
      : 'Indoor humidity is safe';
  }

  if (insights.peakWind !== -Infinity) {
    valWind.textContent = `${insights.peakWind} km/h`;
    descWind.textContent = insights.peakWindTime;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (all unit specs, including insights).

- [ ] **Step 6: Sanity-check the browser still works**

Run: `npm run dev`, open `http://localhost:8080`. Confirm the four insight cards populate identically to before (Warmest Peak, Peak Indoor RH, Max Wind Gust, Mold Risk).

- [ ] **Step 7: Commit**

```bash
git add weather.js app.js test/unit
git commit -m "refactor: extract computeInsights calculation from app.js"
```

---

### Task 4: Playwright E2E tests

**Files:**
- Modify: `package.json` (`test:e2e` script already added in Task 1)
- Create: `playwright.config.mjs`, `test/e2e/helpers.mjs`, `test/e2e/dashboard.spec.mjs`
- Modify: `.gitignore` (ignore Playwright artifacts)

**Interfaces:**
- Consumes: the running app (Task 1-3 refactor must be in place); `@playwright/test` installed.
- Produces: `npm run test:e2e` boots `http-server` on 8080, runs the chromium spec, and skips tests gracefully when the live BBC API is unreachable.

- [ ] **Step 1: Install Playwright and the chromium browser**

Run: `npm install --save-dev @playwright/test`
Run: `npx playwright install chromium`

- [ ] **Step 2: Create the Playwright config**

Create `playwright.config.mjs`:
```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8080',
    headless: true
  },
  webServer: {
    command: 'npx http-server -p 8080 -c-1',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
```

- [ ] **Step 3: Create the API helper with graceful skip**

Create `test/e2e/helpers.mjs`:
```js
export function forecastResponse(page, postcodePath) {
  return page.waitForResponse(
    (r) =>
      r.url().includes('weather-broker-cdn') &&
      r.url().toLowerCase().includes(postcodePath.toLowerCase()),
    { timeout: 25000 }
  );
}
```

- [ ] **Step 4: Create the spec**

Create `test/e2e/dashboard.spec.mjs`:
```js
import { test, expect } from '@playwright/test';
import { forecastResponse } from './helpers.mjs';

const skipIfUnreachable = (resp) =>
  test.skip(!resp || resp.status() >= 400, 'BBC weather API unreachable');

test('loads, renders the chart, and has no console errors', async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  const respPromise = forecastResponse(page, 'kt4');
  await page.goto('/?postCode=KT4');
  const resp = await respPromise.catch(() => null);
  skipIfUnreachable(resp);

  await expect(page.locator('#forecastChart')).toBeVisible();
  await expect(page.locator('.day-card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('submitting a postcode updates the location and URL', async ({ page }) => {
  await page.goto('/');

  const respPromise = forecastResponse(page, 'sw1a');
  await page.fill('#postcodeInput', 'SW1A');
  await page.click('button[type="submit"]');
  const resp = await respPromise.catch(() => null);
  skipIfUnreachable(resp);

  await expect(page).toHaveURL(/postCode=SW1A/);
  await expect(page.locator('#activeLocation')).toHaveText('SW1A');
});

test('switching metric updates the title and reloads the chart', async ({ page }) => {
  const respPromise = forecastResponse(page, 'kt4');
  await page.goto('/?postCode=KT4');
  const resp = await respPromise.catch(() => null);
  skipIfUnreachable(resp);

  await page.click('.metric-btn[data-metric="wind_speed"]');
  await expect(page.locator('#metricTitle')).toHaveText('Wind Speed Forecast');
});

test('clicking a day card toggles its active state', async ({ page }) => {
  const respPromise = forecastResponse(page, 'kt4');
  await page.goto('/?postCode=KT4');
  const resp = await respPromise.catch(() => null);
  skipIfUnreachable(resp);

  const firstCard = page.locator('.day-card').first();
  await expect(firstCard).toHaveClass(/active/);
  await firstCard.click();
  await expect(firstCard).not.toHaveClass(/active/);
});

test('shows the error banner for an invalid postcode', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const respPromise = forecastResponse(page, 'zzzzzz');
  await page.fill('#postcodeInput', 'ZZZZZZ');
  await page.click('button[type="submit"]');
  const resp = await respPromise.catch(() => null);
  if (!resp || resp.status() < 400) {
    test.skip(true, 'API returned data for invalid postcode; cannot exercise error path');
    return;
  }

  await expect(page.locator('#errorBanner')).toBeVisible();
});
```

- [ ] **Step 5: Ignore Playwright artifacts**

Append to `.gitignore`:
```
test-results/
playwright-report/
```

- [ ] **Step 6: Run the E2E suite**

Run: `npm run test:e2e`
Expected: PASS (or SKIP for each test if the BBC API is unreachable). The webServer boots `http-server` on 8080 automatically.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json playwright.config.mjs test/e2e .gitignore
git commit -m "test: add Playwright E2E dashboard specs"
```

---

### Task 5: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/test.yml`

**Interfaces:**
- Consumes: Task 1 scripts (`test`, `test:e2e`), committed `package-lock.json` (from Task 4's npm install).
- Produces: CI gate that runs unit + E2E on push to `main` and on PRs.

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/test.yml`:
```yaml
name: Test

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Unit tests
        run: npm test

      - name: Install Playwright browser
        run: npx playwright install --with-deps chromium

      - name: E2E tests
        run: npm run test:e2e
```

- [ ] **Step 2: Verify the workflow file is valid YAML**

Run: `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/test.yml"); puts "valid YAML"'`
Expected: prints `valid YAML` (macOS ships Ruby; no new dependency). The full behaviour is verified by a real GitHub Actions run on a PR.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: add test workflow for main and pull requests"
```

---

### Task 6: Full verification + docs

**Files:**
- Modify: `README.md` (add a Testing section)

**Interfaces:**
- Consumes: every prior task.

- [ ] **Step 1: Run the full suite locally**

Run: `npm test`
Expected: all unit tests PASS.
Run: `npm run test:e2e`
Expected: PASS or graceful SKIP.

- [ ] **Step 2: Manual smoke check**

Run: `npm run dev` and open `http://localhost:8080`. Verify: default forecast loads, all 6 metric buttons work, mode toggle (Overlay/Sequence), day-card toggle, range slider, indoor temp panel, insights cards populate.

- [ ] **Step 3: Update README**

Append a `## Testing` section:
```markdown
## Testing

- **Unit tests** (Node built-in runner, zero dependencies): `npm test`
- **Browser E2E tests** (Playwright, chromium): `npm run test:e2e`
- **Both**: `npm run test:all`

E2E tests hit the live BBC weather API and skip (never fail) when it is unreachable. CI runs on push to `main` and on pull requests (see `.github/workflows/test.yml`).
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document test commands"
```