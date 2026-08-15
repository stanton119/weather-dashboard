# Carbon Intensity Metric — Design

Date: 2026-08-15

## Overview

Add a `carbon_intensity` metric to the AeroTemp weather dashboard, sourcing data from the UK National Grid Carbon Intensity API (`https://api.carbonintensity.org.uk`) via the approach demonstrated in the standalone `carbon-intensity/app/main.html` reference app. It integrates as a new metric button in the existing sidebar/chart system, feeding four toggleable series lines.

## Data Source

Four series are fetched in parallel alongside the BBC weather call on every postcode submit:

| Series | Endpoint |
|---|---|
| Regional forecast | `/regional/intensity/{date}/fw48h/postcode/{postcode}` |
| National forecast | `/intensity/{date}/fw48h` |
| Regional historic | `/regional/intensity/{date}/pt24h/postcode/{postcode}` |
| National historic | `/intensity/{date}/pt24h` |

- `{date}` is today's ISO timestamp; `{postcode}` is the outcode as used elsewhere in the app.
- Units: gCO₂/kWh.
- Timeline coverage: past 24h (historic) through next 48h (forecast), half-hourly intervals.

## Fetch & Processing

- A new `fetchCarbonIntensity(postcode)` function runs `Promise.all` over the four endpoints, preserving the existing show-loading/show-error flow but decoupled from the weather fetch (a carbon failure does not block weather rendering).
- Each series is normalised to `{ timestamp, value }` and merged onto one shared sorted half-hourly timeline, then grouped by calendar date into a `carbonData` structure that mirrors the existing `forecastData` day-grouping shape (`{ index, dateStr, formattedDate, reports[], visible }`).
- Each report carries all four series values (`regional_forecast`, `national_forecast`, `regional_historic`, `national_historic`), so one timeline serves all four lines.
- On fetch failure: `carbonData = []` and the error banner is shown only while `carbon_intensity` is the active metric.

## Metric Integration

- New `METRICS.carbon_intensity` entry: `label: 'Carbon Intensity'`, `unit: ' gCO₂/kWh'`, `yAxisLabel: 'Carbon Intensity (gCO₂/kWh)'`.
- New sidebar metric button with a leaf/eco icon (`data-metric="carbon_intensity"`).
- Works with existing `syncParamsFromURL` / `updateURLParams` via `metric=carbon_intensity`.

## Chart Rendering

- `getChartDatasets` / `renderChart` gain a carbon-specific branch.
- Four series lines, each with a fixed color:
  - Regional forecast
  - National forecast
  - Regional historic
  - National historic
- **Sequence mode**: continuous half-hourly timeline, past-24h → +48h.
- **Overlay mode**: shared half-hourly axis (48 labels: 00:00–23:30), one line per day per series; day cards toggle days on/off as normal.
- Custom tooltip (`handleCustomTooltip`) gains a carbon branch listing all four values at the hovered timestamp.
- Y-axis tick callback appends the metric unit via the existing mechanism.

## Series Visibility

- New global `carbonSeriesVisible` (array of 4 booleans, default all true) controlling which of the four lines render.
- Toggled by a small **series legend** (four chips: Regional F, National F, Regional H, National H) rendered in the chart controls area, visible only while the carbon metric is active.
- Existing Show All / Hide All buttons also apply to carbon series when active.
- Persisted to URL as a comma-separated param (`series=1,0,1,1`), read on load.

## Day Cards

- Same rendering path as weather: `renderDayCards` utilises `getDayMetricRange`, which gains a carbon branch showing min–max gCO₂/kWh for the day.
- Range slider caps to the number of carbon days (~3) while carbon is active.

## Insights & Info Box

- While `carbon_intensity` is active, the weather-specific insights grid (Warmest Peak, Peak Indoor RH, Max Wind Gust, Mold Risk) and the psychrometrics info box are hidden; the chart card expands to use the reclaimed space.
- Insights (`calculateInsights`) are not run for carbon.

## Error Handling

- Carbon fetch failures: handled independently; weather still renders; error banner shown only for the carbon metric.
- Show All / Hide All and day toggling behave identically to weather.

## Testing

- Manual: load app, switch to Carbon Intensity metric, verify four lines render in both overlay and sequence modes, chips toggle lines, day cards and range slider work, and URL params preserve state.
- Run `npm run dev` and open `http://localhost:8080`.