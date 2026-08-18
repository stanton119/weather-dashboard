# Carbon Forecast Loading Spinner — Design

Date: 2026-08-18

## Overview

When the Carbon Intensity metric is active, the four carbon intensity API calls take 1-2s to resolve, leaving the chart card empty/stale during that window. Add an inline loading spinner overlaid on the chart card, shown while the carbon forecast is being fetched, so the user sees that something is happening.

## Current Behavior

- `fetchCarbonIntensity(postcode)` runs four parallel requests (`Promise.all`) on every postcode submit and on startup.
- Unlike `fetchForecast`, which drives the full-screen `loadingOverlay` via `showLoading()`, the carbon fetch has no loading indicator.
- `updateDashboard()` returns early when `visibleData.length === 0`, so switching to (or landing on) the carbon metric while the fetch is in flight leaves the chart area empty for the duration of the fetch, then updates once data arrives.

## Design

### Markup

Add a static loading overlay inside `.chart-container` in `index.html`:

```html
<div id="chartLoadingOverlay" class="chart-loading-overlay">
  <div class="spinner"></div>
  <div class="chart-loading-text">Loading carbon forecast...</div>
</div>
```

The existing `.spinner` style is reused.

### CSS

In `style.css`:

- `.chart-container` already has `position: relative`, so the overlay can anchor to it directly.
- New `.chart-loading-overlay`:
  - Absolutely positioned to fill `.chart-container`.
  - Centered flex layout (spinner + caption).
  - Semi-transparent backdrop matching the app's dark theme (e.g. `rgba(8, 11, 17, 0.6)`).
  - Default `opacity: 0; pointer-events: none;` with a `transition`.
  - `.visible` class sets `opacity: 1; pointer-events: all;`.
- New `.chart-loading-text` caption, reusing the existing `--text-secondary` colour.

### JavaScript

In `app.js`:

- New global `let carbonLoading = false;`.
- Cache the overlay element alongside the existing element lookups.
- In `fetchCarbonIntensity`: set `carbonLoading = true` on entry; clear it in a `finally` block (covers success, failure, and early abort), then toggle the overlay.
- In `updateDashboard`'s carbon branch: toggle the overlay's `visible` class based on `carbonLoading` (shown while loading, hidden once data arrives). The existing early-return when `visibleData.length === 0` keeps the overlay visible while the fetch is pending.
- Error flow: `finally` clears the flag/hides the spinner; the existing carbon error banner (`showError`) still displays the message.

## Behavior Notes

- Spinner is state-driven, so switching to the Carbon Intensity metric while a fetch is already in flight also shows it.
- The overlay only covers the chart card; the rest of the dashboard (sidebar, header, day cards) stays interactive.
- No changes to the weather metric's full-screen loading overlay.

## Testing

- Manual: enter a postcode, switch to Carbon Intensity before the fetch completes and verify the spinner shows over the chart and disappears when data renders.
- Reload the page with the carbon metric active — spinner shows during the initial fetch.
- Trigger a carbon failure (e.g. invalid postcode) and verify the spinner clears and the error banner appears.
- Run `npm run dev` and open `http://localhost:8080`.