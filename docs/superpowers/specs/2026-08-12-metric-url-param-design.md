# Metric URL Param Design

## Goal

Persist the selected weather forecast type (metric) in the URL so that refreshing the page or sharing a link restores the same metric.

## Context

The dashboard already syncs `postCode`, `indoorTemp`, `days`, and `chartMode` between the URL and app state via `syncParamsFromURL()` and `updateURLParams()` in `app.js`. The active metric is stored in `activeMetric` and selected via `.metric-btn` buttons, but it is not currently part of the URL.

## Approach

Follow the existing URL-sync pattern. Param name: `metric`. Values are the existing `METRICS` keys (e.g. `outside_temp`, `inside_humidity`).

## Changes

### 1. `syncParamsFromURL()` (app.js:126)

- Read `metric` from the URL.
- If present and a valid key of `METRICS`, set `activeMetric`.
- Only update the `.metric-btn` active states when a valid `metric` param is present (HTML default is already `outside_temp`).

### 2. `updateURLParams()` (app.js:171)

- Add `params.set('metric', activeMetric)`.

### 3. Metric button handler (app.js:967-976)

- Call `updateURLParams()` after setting `activeMetric`.

## Validation

- None (static site, no test framework present).
- Manual verification: select a metric, confirm URL contains `metric=<value>`, refresh, confirm the same metric stays selected.

## Out of Scope

- Chart mode toggle already handled.
- Any other new URL params.